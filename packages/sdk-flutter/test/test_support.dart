import 'dart:collection';

import 'package:traceiq_flutter/src/event.dart';
import 'package:traceiq_flutter/src/runtime.dart';
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
    return outcome as TransportResponse;
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
