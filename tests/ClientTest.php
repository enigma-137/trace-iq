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
}
