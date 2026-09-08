import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';

import 'config.dart';
import 'device_info.dart';
import 'event.dart';
import 'json_value.dart';
import 'queue.dart';
import 'runtime.dart';
import 'session.dart';
import 'storage.dart';
import 'transport.dart';

final class TraceIQClient {
  TraceIQClient({
    required this.config,
    required TraceIQStorage storage,
    required TraceIQTransport transport,
    TraceIQClock clock = const SystemTraceIQClock(),
    TraceIQUuidGenerator uuid = const SystemTraceIQUuidGenerator(),
    RetryPolicy? retryPolicy,
    Future<Map<String, Object?>> Function()? metadataProvider,
  })  : _storage = storage,
        _transport = transport,
        _clock = clock,
        _uuid = uuid,
        _retryPolicy = retryPolicy ?? RetryPolicy(),
        _metadataProvider = metadataProvider ?? collectDeviceInfo,
        _queue = PersistentEventQueue(
          storage: storage,
          maxSize: config.maxQueueSize,
          storageKey: 'traceiq.queue.v1.${config.projectId}',
          logger: config.debug ? (message) => debugPrint('[TraceIQ] $message') : null,
        ),
        _sessions = SessionManager(clock: clock, uuid: uuid, timeout: config.sessionTimeout);

  static const _anonymousIdKeyBase = 'traceiq.anonymous_id';
  static const _userIdKeyBase = 'traceiq.user_id';
  static const _traitsKeyBase = 'traceiq.user_traits';
  static const _trackingKeyBase = 'traceiq.tracking_enabled';
  static const sdkVersion = '0.1.0';

  final TraceIQConfig config;
  final TraceIQStorage _storage;
  final TraceIQTransport _transport;
  final TraceIQClock _clock;
  final TraceIQUuidGenerator _uuid;
  final RetryPolicy _retryPolicy;
  final Future<Map<String, Object?>> Function() _metadataProvider;
  final PersistentEventQueue _queue;
  final SessionManager _sessions;

  Future<void> _mutationTail = Future<void>.value();
  Future<void>? _flushFuture;
  Timer? _flushTimer;
  String? _anonymousId;
  String? _userId;
  Map<String, Object?> _deviceInfo = <String, Object?>{};
  String? _currentScreen;
  bool _trackingEnabled = true;
  bool _initialized = false;
  bool _disposed = false;

  bool get isInitialized => _initialized;
  bool get isTrackingEnabled => _trackingEnabled;
  String? get anonymousId => _anonymousId;
  String? get userId => _userId;
  String get sessionId => _sessions.id;
  int get queuedEventCount => _queue.length;
  String get _anonymousIdKey => '$_anonymousIdKeyBase.${config.projectId}';
  String get _userIdKey => '$_userIdKeyBase.${config.projectId}';
  String get _traitsKey => '$_traitsKeyBase.${config.projectId}';
  String get _trackingKey => '$_trackingKeyBase.${config.projectId}';

  Future<void> initialize() async {
    if (_initialized) return;
    await _mutate(() async {
      if (_initialized) return;
      _anonymousId = await _storage.read(_anonymousIdKey);
      if (_anonymousId == null || _anonymousId!.isEmpty) {
        _anonymousId = _uuid.generate();
        await _storage.write(_anonymousIdKey, _anonymousId!);
      }
      _userId = await _storage.read(_userIdKey);
      final rawTraits = await _storage.read(_traitsKey);
      if (rawTraits != null) {
        try {
          Map<String, Object?>.from(
            jsonDecode(rawTraits) as Map<Object?, Object?>,
          );
        } catch (_) {
          await _storage.delete(_traitsKey);
        }
      }
      final tracking = await _storage.read(_trackingKey);
      _trackingEnabled = tracking == null ? config.trackingEnabled : tracking == 'true';
      await _queue.restore();
      _deviceInfo = await _metadataProvider();
      _initialized = true;
      _debug('SDK initialized.');
    });
    _flushTimer = Timer.periodic(config.flushInterval, (_) => unawaited(flush()));
  }

  Future<void> track(String eventName, {Map<String, Object?>? properties}) =>
      _enqueue(eventName, properties: properties);

  Future<void> identify(String userId, {Map<String, Object?>? traits}) async {
    final cleanUserId = userId.trim();
    if (cleanUserId.isEmpty) throw ArgumentError.value(userId, 'userId', 'must not be empty');
    final cleanTraits = normalizeProperties(traits);
    await _mutate(() async {
      _ensureUsable();
      if (!_trackingEnabled) return;
      _userId = cleanUserId;
      await _storage.write(_userIdKey, cleanUserId);
      await _storage.write(_traitsKey, jsonEncode(cleanTraits));
      await _addEvent(r'$identify', <String, Object?>{'traits': cleanTraits});
    });
    _flushIfFull();
  }

  Future<void> screen(String name, {Map<String, Object?>? properties}) async {
    final cleanName = name.trim();
    if (cleanName.isEmpty) throw ArgumentError.value(name, 'name', 'must not be empty');
    _currentScreen = cleanName;
    await _enqueue(r'$page', properties: <String, Object?>{'name': cleanName, ...?properties});
  }

  Future<void> revenue({
    required num amount,
    required String currency,
    Map<String, Object?>? properties,
  }) {
    final value = amount.toDouble();
    if (!value.isFinite) throw ArgumentError.value(amount, 'amount', 'must be finite');
    final code = currency.trim().toUpperCase();
    if (!RegExp(r'^[A-Z]{3}$').hasMatch(code)) {
      throw ArgumentError.value(currency, 'currency', 'must be a three-letter ISO code');
    }
    return _enqueue('revenue', properties: <String, Object?>{
      'amount': amount,
      'currency': code,
      ...?properties,
    });
  }

  Future<void> captureException(
    Object error,
    StackTrace? stackTrace, {
    Map<String, Object?>? properties,
    bool handled = true,
  }) =>
      _enqueue(r'$exception', properties: <String, Object?>{
        'type': error.runtimeType.toString(),
        'message': error.toString(),
        if (stackTrace != null) 'stack': stackTrace.toString(),
        'handled': handled,
        if (_currentScreen != null) 'screen': _currentScreen,
        ...?properties,
      });

  Future<void> reset() => _mutate(() async {
        _ensureUsable();
        _userId = null;
        _anonymousId = _uuid.generate();
        _sessions.reset();
        _currentScreen = null;
        await _storage.delete(_userIdKey);
        await _storage.delete(_traitsKey);
        await _storage.write(_anonymousIdKey, _anonymousId!);
        _debug('Identity and session reset.');
      });

  Future<void> setTrackingEnabled(bool enabled) => _mutate(() async {
        _ensureUsable();
        _trackingEnabled = enabled;
        await _storage.write(_trackingKey, enabled.toString());
        if (!enabled) await _queue.clear();
        _debug('Tracking ${enabled ? 'enabled' : 'disabled; queue cleared'}.');
      });

  Future<void> onBackground() async {
    _sessions.background();
    await flush();
  }

  void onResume() => _sessions.resume();

  Future<void> flush() {
    if (!_initialized || _disposed || !_trackingEnabled) return Future<void>.value();
    return _flushFuture ??= _flushAll().whenComplete(() => _flushFuture = null);
  }

  Future<void> _flushAll() async {
    _debug('Flush started.');
    while (true) {
      final batch = await _mutate(() async => _queue.peek(config.batchSize));
      if (batch.isEmpty) return;
      final delivered = await _sendWithRetry(batch);
      if (!delivered) return;
      await _mutate(() => _queue.removeIds(batch.map((event) => event.queueId)));
      _debug('Batch delivered.');
    }
  }

  Future<bool> _sendWithRetry(List<TraceIQEvent> batch) async {
    for (var attempt = 0; attempt <= config.maxRetryCount; attempt++) {
      if (!_trackingEnabled || _disposed) return false;
      try {
        final response = await _transport.send(batch);
        if (response.isSuccess) return true;
        if (!RetryPolicy.isRetryableStatus(response.statusCode)) {
          _debug('Permanent HTTP ${response.statusCode}; batch discarded.');
          return true;
        }
        if (attempt == config.maxRetryCount) return false;
        await _clock.delay(_retryPolicy.delayFor(attempt + 1, retryAfter: response.retryAfter));
      } on Object catch (_) {
        if (attempt == config.maxRetryCount) return false;
        await _clock.delay(_retryPolicy.delayFor(attempt + 1));
      }
    }
    return false;
  }

  Future<void> dispose() async {
    if (_disposed) return;
    _flushTimer?.cancel();
    await flush();
    _disposed = true;
    _transport.close();
  }

  Future<void> _enqueue(String eventName, {Map<String, Object?>? properties}) async {
    final cleanName = eventName.trim();
    if (cleanName.isEmpty) throw ArgumentError.value(eventName, 'eventName', 'must not be empty');
    final cleanProperties = normalizeProperties(properties);
    await _mutate(() async {
      _ensureUsable();
      if (!_trackingEnabled) return;
      await _addEvent(cleanName, cleanProperties);
    });
    _flushIfFull();
  }

  Future<void> _addEvent(String name, Map<String, Object?> properties) async {
    await _queue.add(TraceIQEvent(
      queueId: _uuid.generate(),
      eventName: name,
      timestamp: _clock.now(),
      anonymousId: _anonymousId!,
      userId: _userId,
      sessionId: _sessions.id,
      properties: properties,
      context: <String, Object?>{
        'sdk': const <String, Object?>{'name': 'traceiq_flutter', 'version': sdkVersion},
      },
      deviceInfo: _deviceInfo,
    ));
    _debug('Event queued.');
  }

  void _flushIfFull() {
    if (_queue.length >= config.batchSize) unawaited(flush());
  }

  Future<T> _mutate<T>(FutureOr<T> Function() action) {
    final completer = Completer<T>();
    _mutationTail = _mutationTail.then((_) async {
      try {
        completer.complete(await action());
      } on Object catch (error, stackTrace) {
        completer.completeError(error, stackTrace);
      }
    });
    return completer.future;
  }

  void _ensureUsable() {
    if (!_initialized) throw StateError('TraceIQ is not initialized.');
    if (_disposed) throw StateError('TraceIQ client is disposed.');
  }

  void _debug(String message) {
    if (config.debug) debugPrint('[TraceIQ] $message');
  }
}
