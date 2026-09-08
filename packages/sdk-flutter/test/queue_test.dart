import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:traceiq_flutter/src/event.dart';
import 'package:traceiq_flutter/src/queue.dart';
import 'package:traceiq_flutter/src/storage.dart';

TraceIQEvent event(String id) => TraceIQEvent(
  queueId: id, eventName: id, timestamp: DateTime.utc(2026), anonymousId: 'a',
  sessionId: 's', properties: <String, Object?>{}, context: <String, Object?>{},
  deviceInfo: <String, Object?>{},
);

void main() {
  test('preserves order across persistence and restoration', () async {
    final storage = MemoryTraceIQStorage();
    final queue = PersistentEventQueue(storage: storage, maxSize: 5);
    await queue.add(event('one'));
    await queue.add(event('two'));
    final restored = PersistentEventQueue(storage: storage, maxSize: 5);
    await restored.restore();
    expect(restored.peek(5).map((e) => e.queueId), <String>['one', 'two']);
  });

  test('drops oldest event deterministically on overflow', () async {
    final queue = PersistentEventQueue(storage: MemoryTraceIQStorage(), maxSize: 2);
    await queue.add(event('one'));
    await queue.add(event('two'));
    await queue.add(event('three'));
    expect(queue.peek(5).map((e) => e.queueId), <String>['two', 'three']);
  });

  test('removes only acknowledged ids', () async {
    final queue = PersistentEventQueue(storage: MemoryTraceIQStorage(), maxSize: 5);
    await queue.add(event('one'));
    await queue.add(event('two'));
    await queue.removeIds(<String>['one']);
    expect(queue.peek(5).single.queueId, 'two');
  });

  test('drops malformed entries but restores valid neighbors', () async {
    final storage = MemoryTraceIQStorage();
    storage.values[PersistentEventQueue.defaultStorageKey] = jsonEncode(<Object?>[
      event('one').toStorageJson(), <String, Object?>{'bad': true}, event('two').toStorageJson(),
    ]);
    final queue = PersistentEventQueue(storage: storage, maxSize: 5);
    await queue.restore();
    expect(queue.length, 2);
  });

  test('discards corrupt queue', () async {
    final storage = MemoryTraceIQStorage();
    storage.values[PersistentEventQueue.defaultStorageKey] = '{bad';
    final queue = PersistentEventQueue(storage: storage, maxSize: 5);
    await queue.restore();
    expect(queue.isEmpty, isTrue);
  });
}
