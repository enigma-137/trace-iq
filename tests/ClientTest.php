<?php

declare(strict_types=1);

namespace TraceIQ\Tests;

use PHPUnit\Framework\TestCase;
use TraceIQ\Client;

final class FakeClient extends Client
{
    /** @var list<string> */
    public array $sent = [];

    /** @var list<int> */
    private array $statuses;

    public function __construct(
        array $statuses = [200],
        ?callable $onError = null,
        int $flushAt = 2,
        int $maxRetries = 3,
    ) {
        $this->statuses = $statuses;
        parent::__construct(
            'proj_test',
            'key_test',
            flushAt: $flushAt,
            flushInterval: 0.0,
            maxRetries: $maxRetries,
            onError: $onError,
        );
    }

    protected function sendBatch(string $body): int
    {
        $this->sent[] = $body;
        $status = array_shift($this->statuses);
        return $status ?? 200;
    }
}

/** Records every post() and answers from a queue of [status, body] responses. */
final class HttpFakeClient extends Client
{
    /** @var list<array{path: string, body: array<string, mixed>}> */
    public array $requests = [];

    /** @param list<array{0: int, 1: string}> $responses */
    public function __construct(private array $responses = [], int $flushAt = 20)
    {
        parent::__construct('proj_test', 'key_test', flushAt: $flushAt, maxRetries: 0, serviceName: 'billing');
    }

    protected function post(string $path, string $body): array
    {
        $this->requests[] = ['path' => $path, 'body' => json_decode($body, true, flags: JSON_THROW_ON_ERROR)];
        return array_shift($this->responses) ?? [202, ''];
    }
}

final class ClientTest extends TestCase
{
    private function decode(string $body): array
    {
        return json_decode($body, true, flags: JSON_THROW_ON_ERROR);
    }

    public function testCaptureStaysQueuedBelowFlushAt(): void
    {
        $client = new FakeClient();
        $client->capture('e1', userId: 'user_1');
        $this->assertSame([], $client->sent, 'event should stay queued below flush_at');
    }

    public function testCaptureFlushesAtThreshold(): void
    {
        $client = new FakeClient();
        $client->capture('e1', userId: 'user_1');
        $client->capture('e2', userId: 'user_2');

        $this->assertCount(1, $client->sent, 'flush_at reached -> one batch sent');
        $body = $this->decode($client->sent[0]);
        $this->assertSame('proj_test', $body['projectId']);
        $this->assertCount(2, $body['batch']);
        $this->assertSame('e1', $body['batch'][0]['eventName']);
        $this->assertSame('user_1', $body['batch'][0]['userId']);
        $this->assertSame('e2', $body['batch'][1]['eventName']);
    }

    public function testIdentifyEmitsDollarEvent(): void
    {
        $client = new FakeClient();
        $client->identify('user_1', traits: ['email' => 'a@b.com']);
        $client->identify('user_2');

        $body = $this->decode($client->sent[0]);
        $this->assertSame('$identify', $body['batch'][0]['eventName']);
        $this->assertSame(['traits' => ['email' => 'a@b.com']], $body['batch'][0]['properties']);
    }

    public function testAliasEmitsDollarAliasAndIgnoresSelfAlias(): void
    {
        $client = new FakeClient();
        $client->alias('user_1', 'guest_1');
        $client->alias('user_1', 'user_1');
        $client->alias('user_2', 'guest_2');

        $body = $this->decode($client->sent[0]);
        $this->assertCount(2, $body['batch']);
        $this->assertSame('$alias', $body['batch'][0]['eventName']);
        $this->assertSame('user_1', $body['batch'][0]['userId']);
        $this->assertSame(['previousId' => 'guest_1'], $body['batch'][0]['properties']);
        $this->assertSame('user_2', $body['batch'][1]['userId']);
    }

    public function testGroupEmitsDollarGroup(): void
    {
        $client = new FakeClient();
        $client->group('org_1', userId: 'user_1');
        $client->group('org_2', userId: 'user_2');

        $body = $this->decode($client->sent[0]);
        $this->assertSame('$group', $body['batch'][0]['eventName']);
        $this->assertSame('org_1', $body['batch'][0]['properties']['organizationId']);
    }

    public function testEmptyEventNameIsIgnored(): void
    {
        $client = new FakeClient();
        $client->capture('');
        $client->capture('');
        $this->assertSame([], $client->sent);
    }

    public function testFlushDrainsQueue(): void
    {
        $client = new FakeClient(flushAt: 5);
        $client->capture('e1');
        $client->capture('e2');
        $client->flush();

        $this->assertCount(1, $client->sent);
        $this->assertCount(2, $this->decode($client->sent[0])['batch']);
    }

    public function testTimestampDefaultsToIsoNow(): void
    {
        $client = new FakeClient();
        $client->capture('e1');
        $client->capture('e2');

        $ts = $this->decode($client->sent[0])['batch'][0]['timestamp'];
        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/', $ts);
    }

    public function testOnErrorCalledWhenBatchRejected(): void
    {
        $called = [];
        $client = new FakeClient(
            statuses: [400],
            onError: function (\RuntimeException $error) use (&$called) {
                $called[] = $error->getMessage();
            },
        );
        $client->capture('e1');
        $client->capture('e2');

        $this->assertCount(1, $called);
        $this->assertSame('TraceIQ batch rejected with 400.', $called[0]);
    }

    public function testBatchDroppedWhenRetriesExhausted(): void
    {
        $called = [];
        $client = new FakeClient(
            statuses: [0],
            onError: function (\RuntimeException $error) use (&$called) {
                $called[] = $error->getMessage();
            },
            maxRetries: 0,
        );
        $client->capture('e1');
        $client->capture('e2');

        $this->assertCount(1, $client->sent);
        $this->assertSame('TraceIQ batch failed with 0.', $called[0]);
    }

    public function testLogsAreBatchedToTheLogsEndpoint(): void
    {
        $client = new HttpFakeClient();
        $client->log('error', 'Payout provider timed out', [
            'provider' => 'stripe',
            'userId' => 'user_1',
            'error' => new \RuntimeException('30s'),
        ]);
        $client->log('loud', 'unknown levels become info');
        $client->log('info', '   ');
        $client->flush();

        $this->assertCount(1, $client->requests);
        $this->assertSame('/v1/logs/batch', $client->requests[0]['path']);
        [$first, $second] = $client->requests[0]['body']['logs'];
        $this->assertSame('error', $first['level']);
        $this->assertSame('billing', $first['service']);
        $this->assertSame('user_1', $first['distinctId']);
        $this->assertSame(['provider' => 'stripe'], $first['metadata']);
        $this->assertSame('RuntimeException', $first['errorDetails']['name']);
        $this->assertSame('30s', $first['errorDetails']['message']);
        $this->assertSame('info', $second['level']);
    }

    public function testFeatureFlagsEvaluateAndTrackExposure(): void
    {
        $evaluation = [200, json_encode([
            'flags' => ['new-payouts' => true, 'beta' => false],
            'payloads' => ['new-payouts' => ['limit' => 5]],
        ])];
        $client = new HttpFakeClient([$evaluation, [202, ''], $evaluation, $evaluation]);

        $this->assertTrue($client->isFeatureEnabled('new-payouts', 'user_1', environment: 'staging'));
        $this->assertSame('/v1/flags/evaluate', $client->requests[0]['path']);
        $this->assertSame('user_1', $client->requests[0]['body']['distinctId']);
        $this->assertSame('/v1/flags/exposure', $client->requests[1]['path']);
        $this->assertSame('new-payouts', $client->requests[1]['body']['flagKey']);
        $this->assertTrue($client->requests[1]['body']['enabled']);
        $this->assertSame('staging', $client->requests[1]['body']['environment']);

        $this->assertSame(['limit' => 5], $client->getFeatureFlagPayload('new-payouts', 'user_1', trackExposure: false));
        $this->assertSame('off', $client->getFeatureFlagPayload('beta', 'user_1', default: 'off', trackExposure: false));
        $this->assertCount(4, $client->requests);
    }

    public function testFlagEvaluationFallsBackToDefaultOnFailure(): void
    {
        $client = new HttpFakeClient([[0, ''], [503, 'unavailable']]);
        $this->assertTrue($client->isFeatureEnabled('anything', 'user_1', default: true, trackExposure: false));
        $this->assertSame(['flags' => [], 'payloads' => [], 'details' => []], $client->evaluateFlags('user_1'));
    }
}
