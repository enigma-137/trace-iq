<?php

declare(strict_types=1);

namespace TraceIQ;

/**
 * TraceIQ server-side client for PHP.
 *
 * Events are queued and flushed in batches to the `/v1/events/batch` endpoint,
 * so callers never block on the network for every single event.
 *
 *     use TraceIQ\Client;
 *
 *     $traceiq = new Client(
 *         projectId: "proj_...",
 *         writeKey: "trq_...",          // keep server keys secret
 *     );
 *
 *     $traceiq->capture(
 *         event: "payout_succeeded",
 *         userId: "user_123",
 *         properties: ["amount" => 50000, "currency" => "NGN"],
 *     );
 *
 *     $traceiq->identify("user_123", traits: ["email" => "a@b.com", "kyc_tier" => 2]);
 *     $traceiq->group("org_9", userId: "user_123", traits: ["plan" => "growth"]);
 *     $traceiq->log('error', 'Payout provider timed out', ['provider' => 'stripe']);
 *
 *     if ($traceiq->isFeatureEnabled('new-payouts', 'user_123')) {
 *         // ...
 *     }
 *
 *     $traceiq->shutdown(); // flush before a short-lived process exits
 *
 * PHP has no portable background threads, so flushing is synchronous: the client
 * flushes automatically once `flushAt` events are queued and again on shutdown
 * (registered automatically). `flushInterval` is accepted for parity with the
 * Python/Rust SDKs and reserved for a future async transport.
 */
class Client
{
    private const DEFAULT_ENDPOINT = 'http://localhost:4000';
    private const BATCH_URL_PATH = '/v1/events/batch';
    private const LOGS_URL_PATH = '/v1/logs/batch';
    private const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'];
    private const MAX_LOG_BATCH = 100; // API limit per /v1/logs/batch request
    private const MAX_QUEUED_LOGS = 1000;
    private const MAX_BACKOFF_MS = 30_000;

    private readonly string $endpoint;
    private readonly int $flushAt;
    private readonly int $maxRetries;
    private readonly float $timeout;
    private readonly bool $debug;
    private readonly ?\Closure $onError;

    /** @var list<array<string, mixed>> */
    private array $queue = [];

    /** @var list<array<string, mixed>> */
    private array $logQueue = [];

    private bool $shutdown = false;

    public function __construct(
        private readonly string $projectId,
        private readonly string $writeKey,
        ?string $endpoint = null,
        int $flushAt = 20,
        float $flushInterval = 10.0,
        int $maxRetries = 3,
        float $timeout = 10.0,
        bool $debug = false,
        ?callable $onError = null,
        private readonly string $serviceName = 'server',
        private readonly string $environment = 'production',
    ) {
        if ($projectId === '') {
            throw new \InvalidArgumentException('TraceIQ: project_id is required.');
        }
        if ($writeKey === '') {
            throw new \InvalidArgumentException('TraceIQ: write_key is required.');
        }

        $this->endpoint = rtrim($endpoint ?? self::DEFAULT_ENDPOINT, '/');
        $this->flushAt = max(1, $flushAt);
        $this->maxRetries = max(0, $maxRetries);
        $this->timeout = $timeout;
        $this->debug = $debug;
        $this->onError = $onError === null ? null : \Closure::fromCallable($onError);

        // Ignored for now; kept for parity with the Python/Rust SDKs.
        unset($flushInterval);

        register_shutdown_function([$this, 'shutdown']);
    }

    // -- public API ---------------------------------------------------------

    /**
     * Track a server-side event.
     *
     * @param string $event        Event name, e.g. "payout_succeeded".
     * @param string|null $userId  The identified user this event belongs to.
     * @param string|null $anonymousId Anonymous identifier when there is no user yet.
     * @param array<string, mixed> $properties Arbitrary event properties.
     * @param array<string, mixed> $context Extra context (server, request id, ...).
     * @param \DateTimeInterface|string|null $timestamp ISO-8601 timestamp; defaults to now.
     */
    public function capture(
        string $event,
        ?string $userId = null,
        ?string $anonymousId = null,
        array $properties = [],
        array $context = [],
        \DateTimeInterface|string|null $timestamp = null,
    ): void {
        if ($event === '') {
            $this->debug('capture() called without an event name; ignored.');
            return;
        }
        $this->enqueue([
            'eventName' => $event,
            'userId' => $userId,
            'anonymousId' => $anonymousId,
            'properties' => $properties,
            'context' => $context,
            'timestamp' => $this->toIso($timestamp),
        ]);
    }

    /**
     * Create or update a user profile.
     *
     * Emits a `$identify` event. Traits are stored as `properties.traits`.
     *
     * @param string $userId The user to identify.
     * @param array<string, mixed> $traits User traits.
     * @param \DateTimeInterface|string|null $timestamp ISO-8601 timestamp; defaults to now.
     */
    public function identify(
        string $userId,
        array $traits = [],
        \DateTimeInterface|string|null $timestamp = null,
    ): void {
        $this->enqueue([
            'eventName' => '$identify',
            'userId' => $userId,
            'anonymousId' => null,
            'properties' => ['traits' => $traits],
            'context' => [],
            'timestamp' => $this->toIso($timestamp),
        ]);
    }

    /**
     * Associate a user with an organization / account.
     *
     * Emits a `$group` event.
     *
     * @param string $organizationId The organization to associate the user with.
     * @param string|null $userId The user to associate (optional, but recommended).
     * @param string|null $anonymousId Anonymous identifier when there is no user yet.
     * @param array<string, mixed> $traits Group traits.
     * @param \DateTimeInterface|string|null $timestamp ISO-8601 timestamp; defaults to now.
     */
    public function group(
        string $organizationId,
        ?string $userId = null,
        ?string $anonymousId = null,
        array $traits = [],
        \DateTimeInterface|string|null $timestamp = null,
    ): void {
        $this->enqueue([
            'eventName' => '$group',
            'userId' => $userId,
            'anonymousId' => $anonymousId,
            'properties' => ['organizationId' => $organizationId, 'traits' => $traits],
            'context' => [],
            'timestamp' => $this->toIso($timestamp),
        ]);
    }

    /**
     * Send a structured log line to TraceIQ Logs. Reserved attribute keys:
     * `service` (overrides the service name), `userId`, and `error` (a \Throwable
     * whose class, message and stack are attached). Other keys become metadata.
     *
     * @param string $level One of debug, info, warn, error, fatal (others become info).
     * @param array<string, mixed> $attributes
     */
    public function log(string $level, string $message, array $attributes = []): void
    {
        if (trim($message) === '') {
            return;
        }
        if ($this->shutdown) {
            $this->debug('client is shut down; log ignored.');
            return;
        }
        $service = $attributes['service'] ?? null;
        $userId = $attributes['userId'] ?? null;
        $error = $attributes['error'] ?? null;
        unset($attributes['service'], $attributes['userId'], $attributes['error']);

        $entry = [
            'level' => in_array($level, self::LOG_LEVELS, true) ? $level : 'info',
            'message' => mb_substr($message, 0, 4000),
            'timestamp' => $this->toIso(null),
            'service' => is_string($service) && $service !== '' ? $service : $this->serviceName,
            'environment' => $this->environment,
        ];
        if (is_string($userId) && $userId !== '') {
            $entry['distinctId'] = $userId;
        }
        if ($attributes !== []) {
            $entry['metadata'] = $attributes;
        }
        if ($error instanceof \Throwable) {
            $entry['errorDetails'] = [
                'name' => $error::class,
                'message' => $error->getMessage(),
                'stack' => $error->getTraceAsString(),
            ];
        }

        $this->logQueue[] = $entry;
        // Bounded so an unreachable API can't grow memory without limit; oldest go first.
        if (count($this->logQueue) > self::MAX_QUEUED_LOGS) {
            array_splice($this->logQueue, 0, count($this->logQueue) - self::MAX_QUEUED_LOGS);
        }
        if (count($this->logQueue) >= $this->flushAt) {
            $this->flush();
        }
    }

    /**
     * Evaluate every feature flag for a user. Makes one synchronous request.
     * On any error the arrays are empty, so callers fall back to their defaults.
     *
     * @param array<string, mixed> $properties
     * @return array{flags: array<string, bool>, payloads: array<string, mixed>, details: array<string, mixed>}
     */
    public function evaluateFlags(string $distinctId, array $properties = [], ?string $environment = null): array
    {
        $empty = ['flags' => [], 'payloads' => [], 'details' => []];
        $payload = ['projectId' => $this->projectId, 'distinctId' => $distinctId, 'properties' => (object) $properties];
        if ($environment !== null) {
            $payload['environment'] = $environment;
        }
        try {
            [$status, $body] = $this->post('/v1/flags/evaluate', $this->encode($payload));
        } catch (\Throwable $error) {
            $this->handleError(new \RuntimeException('TraceIQ flag evaluation failed: ' . $error->getMessage()));
            return $empty;
        }
        $data = $status >= 200 && $status < 300 ? json_decode($body, true) : null;
        if (!is_array($data)) {
            $this->debug("evaluateFlags failed with {$status}");
            return $empty;
        }
        return [
            'flags' => is_array($data['flags'] ?? null) ? $data['flags'] : [],
            'payloads' => is_array($data['payloads'] ?? null) ? $data['payloads'] : [],
            'details' => is_array($data['details'] ?? null) ? $data['details'] : [],
        ];
    }

    /**
     * Whether flag `$key` is on for this user, or `$default` if flags can't be evaluated.
     * Records an exposure (a second synchronous request) unless `$trackExposure` is false.
     *
     * @param array<string, mixed> $properties
     */
    public function isFeatureEnabled(
        string $key,
        string $distinctId,
        bool $default = false,
        array $properties = [],
        ?string $environment = null,
        bool $trackExposure = true,
    ): bool {
        $flags = $this->evaluateFlags($distinctId, $properties, $environment)['flags'];
        $enabled = (bool) ($flags[$key] ?? $default);
        if ($trackExposure) {
            $this->trackFlagExposure($key, $distinctId, $enabled, $environment, $properties);
        }
        return $enabled;
    }

    /**
     * The remote-config payload of flag `$key` when it is on, else `$default`.
     *
     * @param array<string, mixed> $properties
     */
    public function getFeatureFlagPayload(
        string $key,
        string $distinctId,
        mixed $default = null,
        array $properties = [],
        ?string $environment = null,
        bool $trackExposure = true,
    ): mixed {
        $result = $this->evaluateFlags($distinctId, $properties, $environment);
        $enabled = ($result['flags'][$key] ?? null) === true;
        if ($trackExposure) {
            $this->trackFlagExposure($key, $distinctId, $enabled, $environment, $properties);
        }
        return $enabled ? ($result['payloads'][$key] ?? $default) : $default;
    }

    /**
     * Record that a user saw a flag's value. Best-effort: failures are only logged in debug mode.
     *
     * @param array<string, mixed> $properties
     */
    public function trackFlagExposure(
        string $key,
        string $distinctId,
        bool $enabled,
        ?string $environment = null,
        array $properties = [],
    ): void {
        try {
            $this->post('/v1/flags/exposure', $this->encode([
                'projectId' => $this->projectId,
                'flagKey' => $key,
                'distinctId' => $distinctId,
                'enabled' => $enabled,
                'environment' => $environment ?? $this->environment,
                'properties' => (object) $properties,
            ]));
        } catch (\Throwable $error) {
            $this->debug('trackFlagExposure failed: ' . $error->getMessage());
        }
    }

    /**
     * Send everything queued right now (blocks until sent).
     */
    public function flush(): void
    {
        while ($this->queue !== []) {
            $batch = array_splice($this->queue, 0, $this->flushAt);
            $this->sendBatchPayload($batch);
        }
        while ($this->logQueue !== []) {
            $logs = array_splice($this->logQueue, 0, self::MAX_LOG_BATCH);
            $this->deliver(
                $this->encode(['projectId' => $this->projectId, 'logs' => $logs]),
                fn (string $body): int => $this->post(self::LOGS_URL_PATH, $body)[0],
            );
        }
    }

    /**
     * Flush and mark the client shut down. This is called automatically on
     * request shutdown, so explicit calls are only needed when you want to
     * guarantee delivery before continuing.
     */
    public function shutdown(): void
    {
        if ($this->shutdown) {
            return;
        }
        $this->shutdown = true;
        $this->flush();
    }

    // -- internals ----------------------------------------------------------

    /**
     * @param array<string, mixed> $event
     */
    private function enqueue(array $event): void
    {
        if ($this->shutdown) {
            $this->debug('client is shut down; event ignored.');
            return;
        }
        $this->queue[] = $event;
        if (count($this->queue) >= $this->flushAt) {
            $this->flush();
        }
    }

    /**
     * @param list<array<string, mixed>> $batch
     */
    private function sendBatchPayload(array $batch): void
    {
        $this->deliver(
            $this->encode(['projectId' => $this->projectId, 'batch' => $batch]),
            fn (string $body): int => $this->sendBatch($body),
        );
    }

    /**
     * Send a body with retry: 429, 5xx and network errors back off exponentially.
     *
     * @param \Closure(string): int $send Returns the HTTP status, or 0 on a network error.
     */
    private function deliver(string $body, \Closure $send): void
    {
        $attempt = 0;
        while (true) {
            $attempt++;
            $status = $send($body);

            if ($status >= 200 && $status < 300) {
                return;
            }
            if ($status >= 100 && $status < 500 && $status !== 429) {
                $this->handleError(new \RuntimeException("TraceIQ batch rejected with {$status}."));
                return;
            }
            if ($attempt > $this->maxRetries) {
                $this->handleError(new \RuntimeException("TraceIQ batch failed with {$status}."));
                return;
            }
            $backoffMs = min(1000 * (2 ** ($attempt - 1)), self::MAX_BACKOFF_MS);
            usleep((int) ($backoffMs * 1000));
        }
    }

    /**
     * POST a batch payload and return the HTTP status code.
     *
     * Returns 0 on network/timeout/DNS errors. Overridable for tests.
     */
    protected function sendBatch(string $body): int
    {
        return $this->post(self::BATCH_URL_PATH, $body)[0];
    }

    /**
     * POST a JSON body to an API path once and return `[status, responseBody]`.
     *
     * The status is 0 on network/timeout/DNS errors. Overridable for tests.
     *
     * @return array{0: int, 1: string}
     */
    protected function post(string $path, string $body): array
    {
        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: application/json\r\n"
                    . "x-traceiq-write-key: {$this->writeKey}\r\n"
                    . 'Content-Length: ' . strlen($body) . "\r\n",
                'content' => $body,
                'timeout' => $this->timeout,
                'ignore_errors' => true,
            ],
        ]);

        $stream = @fopen($this->endpoint . $path, 'rb', false, $context);
        if ($stream === false) {
            return [0, ''];
        }
        $response = (string) stream_get_contents($stream);
        $meta = stream_get_meta_data($stream);
        fclose($stream);

        $headers = $meta['wrapper_data'] ?? null;
        if (!is_array($headers)) {
            return [0, ''];
        }
        // Redirects add earlier status lines; the last one is the final response.
        $status = 0;
        foreach ($headers as $line) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', (string) $line, $matches) === 1) {
                $status = (int) $matches[1];
            }
        }
        return [$status, $response];
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function encode(array $payload): string
    {
        return json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }

    private function handleError(\RuntimeException $error): void
    {
        $this->debug($error->getMessage());
        if ($this->onError !== null) {
            ($this->onError)($error);
        }
    }

    private function toIso(\DateTimeInterface|string|null $timestamp): string
    {
        if ($timestamp instanceof \DateTimeInterface) {
            return $timestamp->format('Y-m-d\TH:i:s.v\Z');
        }
        if (is_string($timestamp) && $timestamp !== '') {
            return $timestamp;
        }
        return gmdate('Y-m-d\TH:i:s.v\Z');
    }

    private function debug(string $message): void
    {
        if ($this->debug) {
            fwrite(STDERR, "[traceiq] {$message}" . PHP_EOL);
        }
    }
}
