import 'dart:collection';

import 'package:traceiq_flutter/src/event.dart';
import 'package:traceiq_flutter/src/runtime.dart';
import 'package:traceiq_flutter/src/replay_transport.dart';
import 'package:traceiq_flutter/src/transport.dart';

final class FakeTransport implements TraceIQTransport {
  FakeTransport([Iterable<Object>? outcomes]) : outcomes = Queue<Object>.of(outcomes ?? const <Object>[]);
  final Queue<Object> outcomes;
  final List<List<TraceIQEvent>> batches = <List<TraceIQEvent>>[];
  bool closed = false;

  @override
  Future<TransportResponse> send(List<TraceIQEvent> events) async {
    batches.add(List<TraceIQEvent>.of(events));
    if (outcomes.isEmpty) return const TransportResponse(statusCode: 200);
    final outcome = outcomes.removeFirst();
    if (outcome is! TransportResponse) throw outcome;
    return outcome;
  }

  @override
  void close() => closed = true;
}

final class FakeClock implements TraceIQClock {
  FakeClock([DateTime? now]) : value = now ?? DateTime.utc(2026, 1, 1);
  DateTime value;
  final List<Duration> delays = <Duration>[];
  @override
  Future<void> delay(Duration duration) async => delays.add(duration);
  @override
  DateTime now() => value;
  void advance(Duration duration) => value = value.add(duration);
}

final class FakeUuid implements TraceIQUuidGenerator {
  var count = 0;
  @override
  String generate() => '00000000-0000-4000-8000-${(++count).toString().padLeft(12, '0')}';
}

final class FakeReplayTransport implements TraceIQReplayTransport {
  Map<String, Object?> settings = <String, Object?>{
    'enabled': true, 'sampleRate': 1, 'maxDurationSeconds': 300,
    'flowTriggerEventNames': <String>['checkout_started'],
  };
  final List<Map<String, Object?>> grants = <Map<String, Object?>>[];
  final List<Map<String, Object?>> chunks = <Map<String, Object?>>[];
  final List<Map<String, Object?>> completions = <Map<String, Object?>>[];
  int configCalls = 0;
  int cancellations = 0;
  bool closed = false;

  @override
  Future<Map<String, Object?>> config() async { configCalls++; return settings; }
  @override
  Future<Map<String, Object?>> authorize(Map<String, Object?> body) async {
    grants.add(body);
    return <String, Object?>{
      'token': 'test-token', 'replayId': 'rpl_test',
      'expiresAt': DateTime.utc(2030).toIso8601String(),
    };
  }
  @override
  Future<void> chunk(Map<String, Object?> body, String token) async { chunks.add(body); }
  @override
  Future<void> complete(Map<String, Object?> body, String token) async { completions.add(body); }
  @override
  void cancelPending() { cancellations++; }
  @override
  void close() { closed = true; }
}
