import 'dart:convert';

import 'event.dart';
import 'storage.dart';

final class PersistentEventQueue {
  PersistentEventQueue({
    required TraceIQStorage storage,
    required this.maxSize,
    this.storageKey = defaultStorageKey,
    void Function(String)? logger,
  })  : _storage = storage,
        _logger = logger;

  static const defaultStorageKey = 'traceiq.queue.v1';
  final TraceIQStorage _storage;
  final int maxSize;
  final String storageKey;
  final void Function(String)? _logger;
  final List<TraceIQEvent> _events = <TraceIQEvent>[];

  int get length => _events.length;
  bool get isEmpty => _events.isEmpty;

  Future<void> restore() async {
    _events.clear();
    final raw = await _storage.read(storageKey);
    if (raw == null) return;
    try {
      final values = jsonDecode(raw);
      if (values is! List<Object?>) {
        throw const FormatException('queue is not a list');
      }
      for (final value in values) {
        try {
          if (value is! Map<Object?, Object?>) {
            throw const FormatException('entry is not an object');
          }
          _events.add(TraceIQEvent.fromStorageJson(Map<String, Object?>.from(value)));
        } catch (_) {
          _logger?.call('Malformed local event dropped.');
        }
      }
      if (_events.length > maxSize) _events.removeRange(0, _events.length - maxSize);
      await _persist();
    } catch (_) {
      _logger?.call('Corrupt local queue discarded.');
      await clear();
    }
  }

  Future<void> add(TraceIQEvent event) async {
    _events.add(event);
    if (_events.length > maxSize) {
      _events.removeAt(0);
      _logger?.call('Queue limit reached; oldest event dropped.');
    }
    await _persist();
  }

  List<TraceIQEvent> peek(int count) => List<TraceIQEvent>.unmodifiable(_events.take(count));

  Future<void> removeIds(Iterable<String> ids) async {
    final idSet = ids.toSet();
    _events.removeWhere((event) => idSet.contains(event.queueId));
    await _persist();
  }

  Future<void> clear() async {
    _events.clear();
    await _storage.delete(storageKey);
  }

  Future<void> _persist() async => _storage.write(
        storageKey,
        jsonEncode(_events.map((event) => event.toStorageJson()).toList()),
      );
}
