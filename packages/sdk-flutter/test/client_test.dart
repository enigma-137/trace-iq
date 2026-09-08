import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:traceiq_flutter/src/client.dart';
import 'package:traceiq_flutter/src/config.dart';
import 'package:traceiq_flutter/src/storage.dart';
import 'package:traceiq_flutter/src/transport.dart';

import 'test_support.dart';

TraceIQClient makeClient({
  MemoryTraceIQStorage? storage,
  FakeTransport? transport,
  FakeClock? clock,
  FakeUuid? uuid,
  int batchSize = 20,
  int maxQueueSize = 100,
  int retries = 0,
  bool trackingEnabled = true,
}) => TraceIQClient(
  config: TraceIQConfig(
    projectId: 'project', apiKey: 'write-key', batchSize: batchSize,
    maxQueueSize: maxQueueSize, maxRetryCount: retries,
    flushInterval: const Duration(hours: 1), trackingEnabled: trackingEnabled,
  ),
  storage: storage ?? MemoryTraceIQStorage(), transport: transport ?? FakeTransport(),
  clock: clock ?? FakeClock(), uuid: uuid ?? FakeUuid(),
  metadataProvider: () async => <String, Object?>{'platform': 'test'},
);

void main() {
  test('initialization creates and persists UUID-quality anonymous identity', () async {
    final storage = MemoryTraceIQStorage();
    final client = makeClient(storage: storage);
    await client.initialize();
    expect(client.anonymousId, matches(RegExp(r'^[0-9a-f-]{36}$')));
    final first = client.anonymousId;
    await client.dispose();
    final restarted = makeClient(storage: storage);
    await restarted.initialize();
    expect(restarted.anonymousId, first);
    await restarted.dispose();
  });

  test('basic event contains timestamp, anonymous id, session and SDK metadata', () async {
    final transport = FakeTransport();
    final client = makeClient(transport: transport);
    await client.initialize();
    await client.track('product_viewed', properties: <String, Object?>{'id': '123'});
    await client.flush();
    final event = transport.batches.single.single.toIngestionJson();
    expect(event['eventName'], 'product_viewed');
    expect(event['anonymousId'], isNotEmpty);
    expect(event['sessionId'], isNotEmpty);
    expect(event['timestamp'], '2026-01-01T00:00:00.000Z');
    expect((event['context'] as Map<Object?, Object?>)['sdk'],
        <String, Object?>{'name': 'traceiq_flutter', 'version': '0.1.0'});
    await client.dispose();
  });

  test('identify persists user and sends canonical identify event with anonymous id', () async {
    final storage = MemoryTraceIQStorage();
    final transport = FakeTransport();
    final client = makeClient(storage: storage, transport: transport);
    await client.initialize();
    await client.identify('user_123', traits: <String, Object?>{'plan': 'pro'});
    await client.track('after_login');
    await client.flush();
    final events = transport.batches.single;
    expect(events.first.eventName, r'$identify');
    expect(events.first.properties, <String, Object?>{'traits': <String, Object?>{'plan': 'pro'}});
    expect(events.first.userId, 'user_123');
    expect(events.first.anonymousId, isNotEmpty);
    expect(events.last.userId, 'user_123');
    await client.dispose();

    final restarted = makeClient(storage: storage);
    await restarted.initialize();
    expect(restarted.userId, 'user_123');
    await restarted.dispose();
  });

  test('repeated identify and switching users is predictable', () async {
    final transport = FakeTransport();
    final client = makeClient(transport: transport);
    await client.initialize();
    await client.identify('a');
    await client.identify('a', traits: <String, Object?>{'tier': 1});
    await client.identify('b');
    await client.flush();
    expect(transport.batches.single.map((e) => e.userId), <String?>['a', 'a', 'b']);
    await client.dispose();
  });

  test('reset rotates identity and session without leaking old user', () async {
    final transport = FakeTransport();
    final client = makeClient(transport: transport);
    await client.initialize();
    await client.identify('user-a', traits: <String, Object?>{'secret': 'a'});
    await client.flush();
    final oldAnonymous = client.anonymousId;
    final oldSession = client.sessionId;
    await client.reset();
    expect(client.userId, isNull);
    expect(client.anonymousId, isNot(oldAnonymous));
    expect(client.sessionId, isNot(oldSession));
    await client.track('logged_out');
    await client.flush();
    final event = transport.batches.last.single;
    expect(event.userId, isNull);
    expect(event.properties, isNot(contains('secret')));
    await client.dispose();
  });

  test('events share a session and timeout on resume rotates it', () async {
    final clock = FakeClock();
    final client = makeClient(clock: clock);
    await client.initialize();
    final first = client.sessionId;
    await client.track('a');
    await client.track('b');
    expect(client.sessionId, first);
    client.onResume();
    expect(client.sessionId, first);
    await client.onBackground();
    clock.advance(const Duration(minutes: 31));
    client.onResume();
    expect(client.sessionId, isNot(first));
    await client.dispose();
  });

  test('a recreated client starts a fresh session', () async {
    final storage = MemoryTraceIQStorage();
    final uuid = FakeUuid();
    final first = makeClient(storage: storage, uuid: uuid);
    await first.initialize();
    final session = first.sessionId;
    await first.dispose();
    final restarted = makeClient(storage: storage, uuid: uuid);
    await restarted.initialize();
    expect(restarted.sessionId, isNot(session));
    await restarted.dispose();
  });

  test('failed retryable flush preserves queue; success clears it', () async {
    final transport = FakeTransport(<Object>[
      const TransportResponse(statusCode: 500),
      const TransportResponse(statusCode: 200),
    ]);
    final client = makeClient(transport: transport);
    await client.initialize();
    await client.track('offline');
    await client.flush();
    expect(client.queuedEventCount, 1);
    await client.flush();
    expect(client.queuedEventCount, 0);
    await client.dispose();
  });

  test('network failures and 429 retry up to cap with increasing delays', () async {
    final clock = FakeClock();
    final transport = FakeTransport(<Object>[
      Exception('network'),
      const TransportResponse(statusCode: 429),
      const TransportResponse(statusCode: 200),
    ]);
    final client = makeClient(transport: transport, clock: clock, retries: 2);
    await client.initialize();
    await client.track('retry');
    await client.flush();
    expect(transport.batches, hasLength(3));
    expect(clock.delays, hasLength(2));
    expect(clock.delays[1], greaterThan(clock.delays[0]));
    expect(client.queuedEventCount, 0);
    await client.dispose();
  });

  test('retry count is capped and exhausted event remains persisted', () async {
    final transport = FakeTransport(<Object>[
      const TransportResponse(statusCode: 503),
      const TransportResponse(statusCode: 504),
    ]);
    final client = makeClient(transport: transport, retries: 1);
    await client.initialize();
    await client.track('retry');
    await client.flush();
    expect(transport.batches, hasLength(2));
    expect(client.queuedEventCount, 1);
    await client.setTrackingEnabled(false);
    await client.dispose();
  });

  test('permanent failure discards poison batch without retries', () async {
    final transport = FakeTransport(<Object>[const TransportResponse(statusCode: 400)]);
    final client = makeClient(transport: transport, retries: 3);
    await client.initialize();
    await client.track('bad');
    await client.flush();
    expect(client.queuedEventCount, 0);
    expect(transport.batches, hasLength(1));
    await client.dispose();
  });

  test('batch limit produces ordered multiple requests', () async {
    final transport = FakeTransport();
    final client = makeClient(transport: transport, batchSize: 2);
    await client.initialize();
    await Future.wait(<Future<void>>[client.track('a'), client.track('b'), client.track('c')]);
    await client.flush();
    expect(transport.batches.expand((e) => e).map((e) => e.eventName), <String>['a', 'b', 'c']);
    expect(transport.batches.every((batch) => batch.length <= 2), isTrue);
    await client.dispose();
  });

  test('concurrent flush calls do not duplicate delivery', () async {
    final transport = FakeTransport();
    final client = makeClient(transport: transport);
    await client.initialize();
    await client.track('once');
    await Future.wait(<Future<void>>[client.flush(), client.flush(), client.flush()]);
    expect(transport.batches, hasLength(1));
    await client.dispose();
  });

  test('privacy opt-out clears queue, ignores events, and persists', () async {
    final storage = MemoryTraceIQStorage();
    final transport = FakeTransport();
    final client = makeClient(storage: storage, transport: transport);
    await client.initialize();
    await client.track('before');
    await client.setTrackingEnabled(false);
    expect(client.queuedEventCount, 0);
    await client.track('ignored');
    await client.flush();
    expect(transport.batches, isEmpty);
    await client.dispose();
    final restarted = makeClient(storage: storage);
    await restarted.initialize();
    expect(restarted.isTrackingEnabled, isFalse);
    await restarted.setTrackingEnabled(true);
    expect(restarted.isTrackingEnabled, isTrue);
    await restarted.dispose();
  });

  test('screen, revenue and exception use canonical reserved events', () async {
    final transport = FakeTransport();
    final client = makeClient(transport: transport);
    await client.initialize();
    await client.screen('Checkout', properties: <String, Object?>{'step': 2});
    await client.revenue(amount: -35, currency: 'ngn', properties: <String, Object?>{'refund': true});
    await client.captureException(StateError('boom'), StackTrace.fromString('trace'));
    await client.flush();
    final events = transport.batches.single;
    expect(events[0].eventName, r'$page');
    expect(events[0].properties, containsPair('name', 'Checkout'));
    expect(events[1].properties, containsPair('currency', 'NGN'));
    expect(events[1].properties, containsPair('amount', -35));
    expect(events[2].eventName, r'$exception');
    expect(events[2].properties, containsPair('screen', 'Checkout'));
    expect(events[2].properties['stack'], 'trace');
    await client.dispose();
  });

  test('zero revenue and exception without stack are accepted', () async {
    final transport = FakeTransport();
    final client = makeClient(transport: transport);
    await client.initialize();
    await client.revenue(amount: 0, currency: 'USD');
    await client.captureException('failure', null);
    await client.flush();
    final events = transport.batches.single;
    expect(events.first.properties['amount'], 0);
    expect(events.last.properties, isNot(contains('stack')));
    await client.dispose();
  });

  test('validates names, user, revenue and malformed properties', () async {
    final client = makeClient();
    await client.initialize();
    await expectLater(client.track(''), throwsArgumentError);
    await expectLater(client.identify(' '), throwsArgumentError);
    expect(() => client.revenue(amount: double.nan, currency: 'USD'), throwsArgumentError);
    expect(() => client.revenue(amount: double.infinity, currency: 'USD'), throwsArgumentError);
    expect(() => client.revenue(amount: 1, currency: 'US'), throwsArgumentError);
    await expectLater(client.track('bad', properties: <String, Object?>{'x': Object()}), throwsArgumentError);
    expect(client.queuedEventCount, 0);
    await client.dispose();
  });
}
