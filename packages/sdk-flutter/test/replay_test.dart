import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:traceiq_flutter/src/client.dart';
import 'package:traceiq_flutter/src/config.dart';
import 'package:traceiq_flutter/src/replay.dart';
import 'package:traceiq_flutter/src/storage.dart';
import 'package:traceiq_flutter/src/transport.dart';

import 'test_support.dart';

TraceIQClient replayClient(FakeTransport analytics, FakeReplayTransport replay) => TraceIQClient(
  config: TraceIQConfig(
    projectId: 'project', apiKey: 'key', replayEnabled: true,
    flushInterval: const Duration(hours: 1),
  ),
  storage: MemoryTraceIQStorage(), transport: analytics, replayTransport: replay,
  replayPlatform: 'ios', clock: FakeClock(), uuid: FakeUuid(),
  metadataProvider: () async => <String, Object?>{},
);

void main() {
  test('sampling matches the API FNV-1a session decision', () {
    expect(sampleMobileReplaySession('abc', 0.10), isFalse);
    expect(sampleMobileReplaySession('abc', 0.11), isTrue);
  });

  test('no consent or a rejected batch event never starts replay', () async {
    final analytics = FakeTransport(<Object>[
      const TransportResponse(statusCode: 200, acceptedEvents: <bool>[false]),
      const TransportResponse(statusCode: 200, acceptedEvents: <bool>[false]),
    ]);
    final replay = FakeReplayTransport();
    final client = replayClient(analytics, replay);
    await client.initialize();
    client.recordReplaySnapshot('Before', const Size(100, 100), const <TraceIQReplayNode>[]);
    await client.track('checkout_started');
    await client.flush();
    expect(replay.configCalls, 0);
    await client.grantReplayConsent();
    await client.track('checkout_started');
    await client.flush();
    expect(replay.grants, isEmpty);
    await client.flushReplay();
    expect(replay.chunks, isEmpty);
    expect(client.isReplayRecording, isFalse);
    await client.dispose();
  });

  test('accepted trigger uses same session and emits content-free chunks', () async {
    final analytics = FakeTransport(<Object>[
      const TransportResponse(statusCode: 200, acceptedEvents: <bool>[true]),
    ]);
    final replay = FakeReplayTransport();
    final client = replayClient(analytics, replay);
    await client.initialize();
    await client.grantReplayConsent();
    await client.track('checkout_started');
    await client.flush();
    expect(client.isReplayRecording, isTrue);
    expect(replay.grants.single['sessionId'], analytics.batches.single.single.sessionId);
    expect(replay.grants.single['recordingFormat'], 'mobile-structural-v1');
    client.recordReplaySnapshot('Checkout', const Size(390, 844), const <TraceIQReplayNode>[
      TraceIQReplayNode(id: 0, kind: TraceIQReplayKind.box, frame: Rect.fromLTWH(0, 0, 390, 844)),
      TraceIQReplayNode(id: 1, kind: TraceIQReplayKind.control, frame: Rect.fromLTWH(0, 0, 100, 50)),
      TraceIQReplayNode(id: 2, kind: TraceIQReplayKind.blocked, frame: Rect.fromLTWH(100, 0, 100, 50)),
    ]);
    client.recordReplayTap(const Offset(120, 20));
    client.recordReplayTap(const Offset(20, 20));
    client.recordReplayScroll(const Offset(20, 20), const Offset(0, 12));
    await client.flushReplay();
    final chunk = replay.chunks.single['events']! as Map<String, Object?>;
    expect(chunk['format'], 'mobile-structural-v1');
    expect(chunk['runtime'], 'flutter');
    expect(chunk['platform'], 'ios');
    final events = chunk['events']! as List<Map<String, Object?>>;
    expect(events.map((event) => event['type']), <String>['snapshot', 'tap', 'scroll']);
    expect(jsonEncode(chunk), isNot(contains('secret')));
    await client.dispose();
  });

  test('each chunk starts with a snapshot and revocation drops pending events', () async {
    final analytics = FakeTransport(<Object>[
      const TransportResponse(statusCode: 200, acceptedEvents: <bool>[true]),
    ]);
    final replay = FakeReplayTransport();
    final client = replayClient(analytics, replay);
    await client.initialize();
    await client.grantReplayConsent();
    await client.track('checkout_started');
    await client.flush();
    client.recordReplaySnapshot('Checkout', const Size(390, 844), const <TraceIQReplayNode>[
      TraceIQReplayNode(id: 1, kind: TraceIQReplayKind.control, frame: Rect.fromLTWH(0, 0, 100, 50)),
    ]);
    await client.flushReplay();
    client.recordReplayTap(const Offset(20, 20));
    await client.flushReplay();
    expect(replay.chunks.map((chunk) => chunk['sequence']), <int>[0, 1]);
    expect(replay.chunks.every((chunk) =>
      ((chunk['events']! as Map<String, Object?>)['events']! as List<Map<String, Object?>>).first['type'] == 'snapshot'), isTrue);
    client.recordReplayTap(const Offset(20, 20));
    client.revokeReplayConsent();
    await client.flushReplay();
    expect(replay.chunks, hasLength(2));
    expect(replay.cancellations, greaterThan(0));
    await client.dispose();
  });

  test('logout rotates identity and discards unsent replay', () async {
    final analytics = FakeTransport(<Object>[
      const TransportResponse(statusCode: 200, acceptedEvents: <bool>[true]),
    ]);
    final replay = FakeReplayTransport();
    final client = replayClient(analytics, replay);
    await client.initialize();
    await client.grantReplayConsent();
    await client.track('checkout_started');
    await client.flush();
    final session = client.sessionId;
    client.recordReplaySnapshot('Checkout', const Size(390, 844), const <TraceIQReplayNode>[]);
    await client.reset();
    expect(client.sessionId, isNot(session));
    await client.flushReplay();
    expect(replay.chunks, isEmpty);
    await client.dispose();
  });

  test('accepted analytics from an earlier session cannot start a new replay', () async {
    final analytics = FakeTransport(<Object>[
      const TransportResponse(statusCode: 200, acceptedEvents: <bool>[true]),
    ]);
    final replay = FakeReplayTransport();
    final client = replayClient(analytics, replay);
    await client.initialize();
    await client.grantReplayConsent();
    await client.track('checkout_started');
    await client.reset();
    await client.flush();
    expect(replay.grants, isEmpty);
    await client.dispose();
  });
}
