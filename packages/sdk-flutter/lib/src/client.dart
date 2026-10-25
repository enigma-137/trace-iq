import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

import 'config.dart';
import 'device_info.dart';
import 'event.dart';
import 'json_value.dart';
import 'queue.dart';
import 'replay.dart';
import 'replay_transport.dart';
import 'runtime.dart';
import 'session.dart';
import 'storage.dart';
import 'transport.dart';

final class TraceIQClient {
  TraceIQClient({
    required this.config,
    required TraceIQStorage storage,
    required TraceIQTransport transport,
    TraceIQReplayTransport? replayTransport,
    String? replayPlatform,
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
        _sessions = SessionManager(clock: clock, uuid: uuid, timeout: config.sessionTimeout),
        _replay = config.replayEnabled ? MobileReplayRecorder(
          config: config, transport: replayTransport ?? HttpTraceIQReplayTransport(config),
          clock: clock, platform: replayPlatform,
        ) : null;

  static const _anonymousIdKeyBase = 'traceiq.anonymous_id';
  static const _userIdKeyBase = 'traceiq.user_id';
  static const _traitsKeyBase = 'traceiq.user_traits';
  static const _trackingKeyBase = 'traceiq.tracking_enabled';
  static const sdkVersion = '0.1.0';
  static const _logLevels = <String>{'debug', 'info', 'warn', 'error', 'fatal'};
  static const _maxLogBatch = 100; // API limit per /v1/logs/batch request

  final TraceIQConfig config;
  final TraceIQStorage _storage;
  final TraceIQTransport _transport;
  final TraceIQClock _clock;
  final TraceIQUuidGenerator _uuid;
  final RetryPolicy _retryPolicy;
  final Future<Map<String, Object?>> Function() _metadataProvider;
  final PersistentEventQueue _queue;
  final SessionManager _sessions;
  final MobileReplayRecorder? _replay;
  static final ValueNotifier<bool> _disabledReplay = ValueNotifier<bool>(false);

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
  final List<Map<String, Object?>> _logs = <Map<String, Object?>>[];
  Map<String, bool> _flags = <String, bool>{};
  Map<String, Object?> _flagPayloads = <String, Object?>{};
  Map<String, Object?> _flagDetails = <String, Object?>{};
  bool _flagsLoaded = false;
  final Set<String> _recordedExposures = <String>{};

  bool get isInitialized => _initialized;
  bool get isTrackingEnabled => _trackingEnabled;
  String? get anonymousId => _anonymousId;
  String? get userId => _userId;
  String get sessionId => _sessions.id;
  int get queuedEventCount => _queue.length;
  int get queuedLogCount => _logs.length;
  bool get featureFlagsLoaded => _flagsLoaded;
  bool get isReplayRecording => _replay?.isRecording ?? false;
  ValueListenable<bool> get replayRecording => _replay?.recording ?? _disabledReplay;
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
      if (_userId != cleanUserId) {
        _sessions.reset();
        _replay?.stop();
      }
      _userId = cleanUserId;
      await _storage.write(_userIdKey, cleanUserId);
      await _storage.write(_traitsKey, jsonEncode(cleanTraits));
      await _addEvent(r'$identify', <String, Object?>{'traits': cleanTraits});
    });
    _flushIfFull();
  }

  Future<void> alias(String userId, {String? previousId}) async {
    final cleanUserId = userId.trim();
    if (cleanUserId.isEmpty) throw ArgumentError.value(userId, 'userId', 'must not be empty');
    await _mutate(() async {
      _ensureUsable();
      if (!_trackingEnabled) return;
      final from = previousId?.trim() ?? _userId ?? _anonymousId!;
      if (from.isEmpty || from == cleanUserId) {
        _debug('alias() needs two different IDs; ignored.');
        return;
      }
      await _addEvent(r'$alias', <String, Object?>{'previousId': from}, userId: cleanUserId);
    });
    _flushIfFull();
  }

  Future<void> screen(String name, {Map<String, Object?>? properties}) async {
    final cleanName = name.trim();
    if (cleanName.isEmpty) throw ArgumentError.value(name, 'name', 'must not be empty');
    _currentScreen = cleanName;
    await _enqueue(r'$page', properties: <String, Object?>{'name': cleanName, ...?properties});
    _replay?.navigation(cleanName);
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
        _replay?.stop();
        _userId = null;
        _anonymousId = _uuid.generate();
        _sessions.reset();
        _currentScreen = null;
        await _storage.delete(_userIdKey);
        await _storage.delete(_traitsKey);
        await _storage.write(_anonymousIdKey, _anonymousId!);
        // Flags were evaluated for the previous user; reload them for the new one.
        _clearFlags();
        _debug('Identity and session reset.');
      });

  Future<void> setTrackingEnabled(bool enabled) => _mutate(() async {
        _ensureUsable();
        _trackingEnabled = enabled;
        if (!enabled) _replay?.revokeConsent();
        await _storage.write(_trackingKey, enabled.toString());
        if (!enabled) {
          await _queue.clear();
          _logs.clear();
        }
        _debug('Tracking ${enabled ? 'enabled' : 'disabled; queue cleared'}.');
      });

  Future<void> onBackground() async {
    _sessions.background();
    _replay?.background();
    await Future.wait(<Future<void>>[flush(), _replay?.flush() ?? Future<void>.value()]);
  }

  void onResume() {
    if (_sessions.resume()) _replay?.stop();
    _replay?.resume();
  }

  /// Queues a structured log line for TraceIQ Logs, tagged with the session and
  /// user. [level] is `debug`, `info`, `warn`, `error` or `fatal`; anything else
  /// is sent as `info`. Lines flush with events and are kept in memory only.
  void log(
    String level,
    String message, {
    Map<String, Object?>? attributes,
    Object? error,
    StackTrace? stackTrace,
    String? service,
  }) {
    _ensureUsable();
    if (!_trackingEnabled || message.trim().isEmpty) return;
    final metadata = normalizeProperties(attributes);
    _logs.add(<String, Object?>{
      'level': _logLevels.contains(level) ? level : 'info',
      'message': message.length > 4000 ? message.substring(0, 4000) : message,
      'timestamp': _clock.now().toUtc().toIso8601String(),
      'service': service ?? config.serviceName,
      'environment': config.environment,
      'sessionId': _sessions.id,
      'distinctId': _userId ?? _anonymousId,
      if (metadata.isNotEmpty) 'metadata': metadata,
      if (error != null)
        'errorDetails': <String, Object?>{
          'name': error.runtimeType.toString(),
          'message': error.toString(),
          if (stackTrace != null) 'stack': stackTrace.toString(),
        },
    });
    // Bounded so an offline device can't grow memory without limit; oldest go first.
    if (_logs.length > config.maxQueueSize) _logs.removeRange(0, _logs.length - config.maxQueueSize);
    if (_logs.length >= config.batchSize) unawaited(flush());
  }

  /// Fetches every feature flag for the current user and caches it. Call after
  /// [initialize] and again after [identify] or [reset]. Keeps the last known
  /// flags if the request fails. Returns whether fresh flags were loaded.
  Future<bool> loadFeatureFlags({Map<String, Object?>? properties}) async {
    _ensureUsable();
    final distinctId = _userId ?? _anonymousId!;
    final cleanProperties = normalizeProperties(properties);
    final TraceIQJsonResponse response;
    try {
      response = await _transport.post('/v1/flags/evaluate', <String, Object?>{
        'distinctId': distinctId,
        'environment': config.environment,
        if (cleanProperties.isNotEmpty) 'properties': cleanProperties,
      });
    } on Object catch (_) {
      _debug('Flag evaluation failed.');
      return false;
    }
    final body = response.body;
    if (!response.isSuccess || body is! Map<Object?, Object?>) {
      _debug('Flag evaluation failed with HTTP ${response.statusCode}.');
      return false;
    }
    // The user changed while the request was in flight; these flags are stale.
    if ((_userId ?? _anonymousId) != distinctId) return false;
    final flags = body['flags'];
    final payloads = body['payloads'];
    final details = body['details'];
    _flags = <String, bool>{
      if (flags is Map<Object?, Object?>)
        for (final entry in flags.entries)
          if (entry.key is String && entry.value is bool) entry.key as String: entry.value as bool,
    };
    _flagPayloads = <String, Object?>{
      if (payloads is Map<Object?, Object?>)
        for (final entry in payloads.entries)
          if (entry.key is String) entry.key as String: entry.value,
    };
    _flagDetails = <String, Object?>{
      if (details is Map<Object?, Object?>)
        for (final entry in details.entries)
          if (entry.key is String) entry.key as String: entry.value,
    };
    _flagsLoaded = true;
    return true;
  }

  /// Whether a loaded flag is on. Returns [defaultValue] until [loadFeatureFlags] succeeds.
  bool isFeatureEnabled(String key, {bool defaultValue = false}) {
    if (!_flagsLoaded) return defaultValue;
    final enabled = _flags[key] ?? defaultValue;
    if (config.autoTrackFlagExposures) recordFlagExposure(key);
    return enabled;
  }

  /// The loaded remote-config payload of a flag that is on, else [defaultValue].
  Object? getFeatureFlagPayload(String key, {Object? defaultValue}) {
    if (_flags[key] != true) return defaultValue;
    if (config.autoTrackFlagExposures) recordFlagExposure(key);
    return _flagPayloads[key] ?? defaultValue;
  }

  /// Records that the user saw a flag's value. Sent once per flag value and revision.
  void recordFlagExposure(String key) {
    if (!_initialized || _disposed || !_trackingEnabled) return;
    final enabled = _flags[key] == true;
    final detail = _flagDetails[key];
    final revision = detail is Map<Object?, Object?> ? detail['revision'] : null;
    final reason = detail is Map<Object?, Object?> ? detail['reason'] : null;
    final distinctId = _userId ?? _anonymousId!;
    final resolvedRevision = revision is int ? revision : 1;
    if (!_recordedExposures.add('$key:$distinctId:$resolvedRevision:${enabled ? 1 : 0}')) return;
    unawaited(_sendExposure(<String, Object?>{
      'flagKey': key,
      'distinctId': distinctId,
      'userId': _userId,
      'anonymousId': _anonymousId,
      'sessionId': _sessions.id,
      'enabled': enabled,
      'environment': config.environment,
      'revision': resolvedRevision,
      'evaluationReason': reason is String ? reason : (enabled ? 'sdk_enabled' : 'sdk_disabled'),
    }));
  }

  Future<void> _sendExposure(Map<String, Object?> body) async {
    try {
      await _transport.post('/v1/flags/exposure', body);
    } on Object catch (_) {
      _debug('Flag exposure failed.');
    }
  }

  void _clearFlags() {
    _flags = <String, bool>{};
    _flagPayloads = <String, Object?>{};
    _flagDetails = <String, Object?>{};
    _flagsLoaded = false;
    _recordedExposures.clear();
  }

  Future<void> grantReplayConsent() {
    _ensureUsable();
    if (!_trackingEnabled) return Future<void>.value();
    return _replay?.grantConsent() ?? Future<void>.value();
  }

  void revokeReplayConsent() => _replay?.revokeConsent();
  void recordReplaySnapshot(String screen, Size viewport, List<TraceIQReplayNode> nodes) =>
      _replay?.snapshot(screen, viewport, nodes);
  void clearReplaySnapshot() => _replay?.clearView();
  void recordReplayTap(Offset point) => _replay?.tap(point);
  void recordReplayScroll(Offset point, Offset delta) => _replay?.scroll(point, delta);
  Future<void> flushReplay() => _replay?.flush() ?? Future<void>.value();
  Future<void> completeReplay() => _replay?.complete() ?? Future<void>.value();

  Future<void> flush() {
    if (!_initialized || _disposed || !_trackingEnabled) return Future<void>.value();
    return _flushFuture ??= _flushAll().whenComplete(() => _flushFuture = null);
  }

  Future<void> _flushAll() async {
    _debug('Flush started.');
    while (true) {
      final batch = await _mutate(() async => _queue.peek(config.batchSize));
      if (batch.isEmpty) break;
      final response = await _sendWithRetry(batch);
      if (response == null) return;
      await _mutate(() => _queue.removeIds(batch.map((event) => event.queueId)));
      final accepted = response.acceptedEvents;
      if (response.isSuccess && accepted != null && accepted.length == batch.length && _trackingEnabled) {
        for (var index = 0; index < batch.length; index++) {
          final event = batch[index];
          if (accepted[index] && event.sessionId == _sessions.id &&
              event.anonymousId == _anonymousId && event.userId == _userId) {
            await _replay?.acceptedEvent(event);
          }
        }
      }
      _debug('Batch delivered.');
    }
    await _flushLogs();
  }

  Future<void> _flushLogs() async {
    while (_logs.isNotEmpty) {
      final batch = _logs.take(_maxLogBatch).toList(growable: false);
      final response = await _postWithRetry('/v1/logs/batch', <String, Object?>{'logs': batch});
      if (response == null) return; // Kept for the next flush.
      // Remove by identity: lines logged (or trimmed) during the request shift indexes.
      final sent = Set<Map<String, Object?>>.identity()..addAll(batch);
      _logs.removeWhere(sent.contains);
      if (!response.isSuccess) _debug('Permanent HTTP ${response.statusCode}; log batch discarded.');
    }
  }

  Future<TraceIQJsonResponse?> _postWithRetry(String path, Map<String, Object?> body) async {
    for (var attempt = 0; attempt <= config.maxRetryCount; attempt++) {
      if (!_trackingEnabled || _disposed) return null;
      try {
        final response = await _transport.post(path, body);
        if (response.isSuccess || !RetryPolicy.isRetryableStatus(response.statusCode)) return response;
        if (attempt == config.maxRetryCount) return null;
        await _clock.delay(_retryPolicy.delayFor(attempt + 1, retryAfter: response.retryAfter));
      } on Object catch (_) {
        if (attempt == config.maxRetryCount) return null;
        await _clock.delay(_retryPolicy.delayFor(attempt + 1));
      }
    }
    return null;
  }

  Future<TransportResponse?> _sendWithRetry(List<TraceIQEvent> batch) async {
    for (var attempt = 0; attempt <= config.maxRetryCount; attempt++) {
      if (!_trackingEnabled || _disposed) return null;
      try {
        final response = await _transport.send(batch);
        if (response.isSuccess) return response;
        if (!RetryPolicy.isRetryableStatus(response.statusCode)) {
          _debug('Permanent HTTP ${response.statusCode}; batch discarded.');
          return response;
        }
        if (attempt == config.maxRetryCount) return null;
        await _clock.delay(_retryPolicy.delayFor(attempt + 1, retryAfter: response.retryAfter));
      } on Object catch (_) {
        if (attempt == config.maxRetryCount) return null;
        await _clock.delay(_retryPolicy.delayFor(attempt + 1));
      }
    }
    return null;
  }

  Future<void> dispose() async {
    if (_disposed) return;
    _flushTimer?.cancel();
    await flush();
    await _replay?.complete();
    _disposed = true;
    _replay?.dispose();
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

  Future<void> _addEvent(String name, Map<String, Object?> properties, {String? userId}) async {
    await _queue.add(TraceIQEvent(
      queueId: _uuid.generate(),
      eventName: name,
      timestamp: _clock.now(),
      anonymousId: _anonymousId!,
      userId: userId ?? _userId,
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
