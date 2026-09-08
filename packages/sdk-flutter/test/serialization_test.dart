import 'package:flutter_test/flutter_test.dart';
import 'package:traceiq_flutter/src/event.dart';
import 'package:traceiq_flutter/src/json_value.dart';

void main() {
  test('normalizes every supported JSON value', () {
    final value = normalizeProperties(<String, Object?>{
      'string': 'x', 'int': 1, 'double': 1.5, 'bool': true, 'null': null,
      'list': <Object?>[1, 'x'], 'map': <String, Object?>{'ok': false},
      'date': DateTime.utc(2026, 1, 2, 3, 4, 5),
    });
    expect(value['date'], '2026-01-02T03:04:05.000Z');
  });

  test('rejects unsupported objects and non-string map keys', () {
    expect(() => normalizeJsonValue(Object()), throwsArgumentError);
    expect(() => normalizeJsonValue(<Object, Object?>{1: 'x'}), throwsArgumentError);
  });

  test('rejects NaN and infinities', () {
    expect(() => normalizeJsonValue(double.nan), throwsArgumentError);
    expect(() => normalizeJsonValue(double.infinity), throwsArgumentError);
    expect(() => normalizeJsonValue(double.negativeInfinity), throwsArgumentError);
  });

  test('event round trips without exposing queue id to ingestion', () {
    final event = TraceIQEvent(
      queueId: 'q1', eventName: 'checkout', timestamp: DateTime.utc(2026),
      anonymousId: 'anon', userId: 'user', sessionId: 'session',
      properties: <String, Object?>{'amount': 10}, context: <String, Object?>{},
      deviceInfo: <String, Object?>{'platform': 'android'},
    );
    expect(event.toIngestionJson(), isNot(contains('queueId')));
    final restored = TraceIQEvent.fromStorageJson(event.toStorageJson());
    expect(restored.toStorageJson(), event.toStorageJson());
  });
}
