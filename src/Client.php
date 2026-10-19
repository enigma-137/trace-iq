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
    private const MAX_BACKOFF_MS = 30_000;

    private readonly string $endpoint;
    private readonly int $flushAt;
    private readonly int $maxRetries;
    private readonly float $timeout;
    private readonly bool $debug;
    private readonly ?\Closure $onError;

    /** @var list<array<string, mixed>> */
    private array $queue = [];

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
     * Send everything queued right now (blocks until sent).
     */
    public function flush(): void
    {
        while ($this->queue !== []) {
            $batch = array_splice($this->queue, 0, $this->flushAt);
            $this->sendBatchPayload($batch);
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
        $body = json_encode(
            ['projectId' => $this->projectId, 'batch' => $batch],
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR,
        );

        $attempt = 0;
        while (true) {
            $attempt++;
            $status = $this->sendBatch($body);

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

        $stream = @fopen($this->endpoint . self::BATCH_URL_PATH, 'rb', false, $context);
        if ($stream === false) {
            return 0;
        }
        stream_get_contents($stream);
        $meta = stream_get_meta_data($stream);
        fclose($stream);

        $headers = $meta['wrapper_data'] ?? null;
        if (!is_array($headers)) {
            return 0;
        }
        foreach ($headers as $line) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', (string) $line, $matches) === 1) {
                return (int) $matches[1];
            }
        }
        return 0;
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
