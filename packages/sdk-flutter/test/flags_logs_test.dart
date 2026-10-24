import 'package:flutter_test/flutter_test.dart';
import 'package:traceiq_flutter/src/client.dart';
import 'package:traceiq_flutter/src/config.dart';
import 'package:traceiq_flutter/src/storage.dart';
import 'package:traceiq_flutter/src/transport.dart';

import 'test_support.dart';

TraceIQClient makeClient(FakeTransport transport, {int retries = 0, int batchSize = 20}) => TraceIQClient(
  config: TraceIQConfig(
    projectId: 'project', apiKey: 'write-key', batchSize: batchSize, maxQueueSize: 100,
    maxRetryCount: retries, flushInterval: const Duration(hours: 1), environment: 'staging',
  ),
  storage: MemoryTraceIQStorage(), transport: transport,
  clock: FakeClock(), uuid: FakeUuid(),
  metadataProvider: () async => <String, Object?>{'platform': 'test'},
);

const evaluation = TraceIQJsonResponse(statusCode: 200, body: <String, Object?>{
  'flags': <String, Object?>{'new-wallet': true, 'beta': false},
  'payloads': <String, Object?>{'new-wallet': <String, Object?>{'limit': 5}},
  'details': <String, Object?>{
    'new-wallet': <String, Object?>{'enabled': true, 'reason': 'rollout', 'revision': 3},
  },
});

void main() {
  test('flags load, read synchronously and record one exposure per value', () async {
    final transport = FakeTransport()
      ..onPost = (path, body) => path == '/v1/flags/evaluate' ? evaluation : const TraceIQJsonResponse(statusCode: 202);
    final client = makeClient(transport);
    await client.initialize();

    expect(client.isFeatureEnabled('new-wallet', defaultValue: true), isTrue);
    expect(client.isFeatureEnabled('new-wallet'), isFalse);
    expect(transport.posts, isEmpty);

    expect(await client.loadFeatureFlags(properties: <String, Object?>{'plan': 'pro'}), isTrue);
    final request = transport.posts.single;
    expect(request.path, '/v1/flags/evaluate');
    expect(request.body['distinctId'], client.anonymousId);
    expect(request.body['environment'], 'staging');
    expect(request.body['properties'], <String, Object?>{'plan': 'pro'});

    expect(client.isFeatureEnabled('new-wallet'), isTrue);
    expect(client.isFeatureEnabled('new-wallet'), isTrue);
    expect(client.isFeatureEnabled('beta'), isFalse);
    expect(client.getFeatureFlagPayload('new-wallet'), <String, Object?>{'limit': 5});
    expect(client.getFeatureFlagPayload('beta', defaultValue: 'off'), 'off');
    await Future<void>.delayed(Duration.zero); // let fire-and-forget exposures run

    final exposures = transport.posts.where((post) => post.path == '/v1/flags/exposure').toList();
    expect(exposures.map((post) => post.body['flagKey']), <String>['new-wallet', 'beta']);
    expect(exposures.first.body['enabled'], isTrue);
    expect(exposures.first.body['revision'], 3);
    expect(exposures.first.body['evaluationReason'], 'rollout');
    await client.dispose();
  });

  test('a failed flag load keeps defaults and reset clears loaded flags', () async {
    final failing = FakeTransport()..onPost = (path, body) => const TraceIQJsonResponse(statusCode: 503);
    final failingClient = makeClient(failing);
    await failingClient.initialize();
    expect(await failingClient.loadFeatureFlags(), isFalse);
    expect(failingClient.isFeatureEnabled('anything', defaultValue: true), isTrue);
    await failingClient.dispose();

    final transport = FakeTransport()..onPost = (path, body) => evaluation;
    final client = makeClient(transport);
    await client.initialize();
    await client.loadFeatureFlags();
    expect(client.isFeatureEnabled('new-wallet'), isTrue);
    await client.reset();
    expect(client.featureFlagsLoaded, isFalse);
    expect(client.isFeatureEnabled('new-wallet'), isFalse);
    await client.dispose();
  });

  test('log lines flush to /v1/logs/batch with session and user', () async {
    final transport = FakeTransport();
    final client = makeClient(transport);
    await client.initialize();
    await client.identify('user_1');
    client.log('error', 'Transfer failed',
        attributes: <String, Object?>{'provider': 'paystack'}, error: StateError('timeout'));
    client.log('loud', 'unknown levels become info', service: 'wallet');
    client.log('info', '   ');
    expect(client.queuedLogCount, 2);
    await client.flush();

    final logs = transport.posts.single;
    expect(logs.path, '/v1/logs/batch');
    final lines = (logs.body['logs'] as List<Object?>).cast<Map<String, Object?>>();
    expect(lines, hasLength(2));
    expect(lines.first['level'], 'error');
    expect(lines.first['service'], 'mobile-app');
    expect(lines.first['environment'], 'staging');
    expect(lines.first['distinctId'], 'user_1');
    expect(lines.first['sessionId'], client.sessionId);
    expect(lines.first['metadata'], <String, Object?>{'provider': 'paystack'});
    expect((lines.first['errorDetails'] as Map<String, Object?>)['name'], 'StateError');
    expect(lines.last['level'], 'info');
    expect(lines.last['service'], 'wallet');
    expect(client.queuedLogCount, 0);
    await client.dispose();
  });

  test('retryable log failures keep lines for the next flush', () async {
    var status = 503;
    final transport = FakeTransport()..onPost = (path, body) => TraceIQJsonResponse(statusCode: status);
    final client = makeClient(transport, retries: 1);
    await client.initialize();
    client.log('warn', 'low balance');
    await client.flush();
    expect(transport.posts, hasLength(2));
    expect(client.queuedLogCount, 1);

    status = 202;
    await client.flush();
    expect(client.queuedLogCount, 0);
    await client.dispose();
  });

  test('disabling tracking drops queued logs and stops new ones', () async {
    final transport = FakeTransport();
    final client = makeClient(transport);
    await client.initialize();
    client.log('info', 'before opt-out');
    await client.setTrackingEnabled(false);
    client.log('info', 'after opt-out');
    expect(client.queuedLogCount, 0);
    await client.dispose();
  });
}
