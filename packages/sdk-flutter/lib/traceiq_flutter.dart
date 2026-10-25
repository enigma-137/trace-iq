library;

import 'dart:ui' show Offset, Size;

import 'package:flutter/foundation.dart' show ValueListenable;

import 'src/client.dart';
import 'src/config.dart';
import 'src/error_tracking.dart';
import 'src/lifecycle.dart';
import 'src/replay.dart';
import 'src/storage.dart';
import 'src/transport.dart';

export 'src/config.dart' show TraceIQConfig;
export 'src/navigator_observer.dart' show TraceIQNavigatorObserver;
export 'src/replay.dart' show TraceIQReplayKind, TraceIQReplayNode;
export 'src/replay_widgets.dart' show TraceIQReplayScreen, TraceIQReplayRegion;

/// Static facade for the TraceIQ Flutter SDK.
abstract final class TraceIQ {
  static TraceIQClient? _client;
  static Future<void>? _initializing;
  static TraceIQLifecycleObserver? _lifecycle;
  static TraceIQErrorTracking? _errors;

  /// Initializes TraceIQ and restores identity, consent, and queued events.
  ///
  /// [apiKey] is the project's publishable write key. The ingestion backend
  /// also requires [projectId], matching every existing TraceIQ SDK.
  static Future<void> initialize({
    required String projectId,
    required String apiKey,
    String apiUrl = 'http://localhost:4000',
    bool debug = false,
    bool automaticScreenTracking = true,
    bool automaticErrorTracking = true,
    int batchSize = 20,
    Duration flushInterval = const Duration(seconds: 10),
    Duration requestTimeout = const Duration(seconds: 10),
    int maxRetryCount = 3,
    int maxQueueSize = 1000,
    Duration sessionTimeout = const Duration(minutes: 30),
    bool trackingEnabled = true,
    bool replayEnabled = false,
    String environment = 'production',
    String serviceName = 'mobile-app',
    bool autoTrackFlagExposures = true,
  }) {
    if (_client != null) return Future<void>.value();
    return _initializing ??= _initialize(
      projectId: projectId,
      apiKey: apiKey,
      apiUrl: apiUrl,
      debug: debug,
      automaticScreenTracking: automaticScreenTracking,
      automaticErrorTracking: automaticErrorTracking,
      batchSize: batchSize,
      flushInterval: flushInterval,
      requestTimeout: requestTimeout,
      maxRetryCount: maxRetryCount,
      maxQueueSize: maxQueueSize,
      sessionTimeout: sessionTimeout,
      trackingEnabled: trackingEnabled,
      replayEnabled: replayEnabled,
      environment: environment,
      serviceName: serviceName,
      autoTrackFlagExposures: autoTrackFlagExposures,
    ).whenComplete(() => _initializing = null);
  }

  static Future<void> _initialize({
    required String projectId,
    required String apiKey,
    required String apiUrl,
    required bool debug,
    required bool automaticScreenTracking,
    required bool automaticErrorTracking,
    required int batchSize,
    required Duration flushInterval,
    required Duration requestTimeout,
    required int maxRetryCount,
    required int maxQueueSize,
    required Duration sessionTimeout,
    required bool trackingEnabled,
    required bool replayEnabled,
    required String environment,
    required String serviceName,
    required bool autoTrackFlagExposures,
  }) async {
    final config = TraceIQConfig(
      projectId: projectId,
      apiKey: apiKey,
      apiUrl: apiUrl,
      debug: debug,
      automaticScreenTracking: automaticScreenTracking,
      automaticErrorTracking: automaticErrorTracking,
      batchSize: batchSize,
      flushInterval: flushInterval,
      requestTimeout: requestTimeout,
      maxRetryCount: maxRetryCount,
      maxQueueSize: maxQueueSize,
      sessionTimeout: sessionTimeout,
      trackingEnabled: trackingEnabled,
      replayEnabled: replayEnabled,
      environment: environment,
      serviceName: serviceName,
      autoTrackFlagExposures: autoTrackFlagExposures,
    );
    final storage = SharedPreferencesTraceIQStorage.create();
    final client = TraceIQClient(
      config: config,
      storage: storage,
      transport: HttpTraceIQTransport(config),
    );
    await client.initialize();
    _client = client;
    _lifecycle = TraceIQLifecycleObserver(client)..register();
    if (automaticErrorTracking) _errors = TraceIQErrorTracking(client)..install();
  }

  /// Whether tracking is currently enabled.
  static bool get isTrackingEnabled => _client?.isTrackingEnabled ?? false;
  static bool get isReplayRecording => _client?.isReplayRecording ?? false;
  static ValueListenable<bool> get replayRecording => _required.replayRecording;

  /// Whether navigator observers should record named routes.
  static bool get automaticScreenTracking =>
      _client?.config.automaticScreenTracking ?? false;

  /// Queues a named analytics event.
  static Future<void> track(String eventName, {Map<String, Object?>? properties}) =>
      _required.track(eventName, properties: properties);

  /// Associates subsequent events with [userId] and emits `$identify`.
  static Future<void> identify(String userId, {Map<String, Object?>? traits}) =>
      _required.identify(userId, traits: traits);

  /// Tells TraceIQ that [previousId] and [userId] are the same person, so their
  /// events and profiles can be merged into [userId]. [previousId] defaults to the
  /// current user (or anonymous) ID; [identify] already links the anonymous ID.
  static Future<void> alias(String userId, {String? previousId}) =>
      _required.alias(userId, previousId: previousId);

  /// Queues a `$page` screen event.
  static Future<void> screen(String name, {Map<String, Object?>? properties}) =>
      _required.screen(name, properties: properties);

  /// Queues a revenue event. Negative and zero values are accepted; dashboards
  /// interpret them as refunds/adjustments and zero-value transactions.
  static Future<void> revenue({
    required num amount,
    required String currency,
    Map<String, Object?>? properties,
  }) =>
      _required.revenue(amount: amount, currency: currency, properties: properties);

  /// Captures an exception as a `$exception` event.
  static Future<void> captureException(
    Object error,
    StackTrace? stackTrace, {
    Map<String, Object?>? properties,
  }) =>
      _required.captureException(error, stackTrace, properties: properties);

  /// Clears user identity and rotates anonymous and session IDs. Also clears
  /// loaded feature flags.
  static Future<void> reset() => _required.reset();

  /// Queues a structured log line for TraceIQ Logs, tagged with the session and user.
  static void log(
    String level,
    String message, {
    Map<String, Object?>? attributes,
    Object? error,
    StackTrace? stackTrace,
    String? service,
  }) =>
      _required.log(level, message,
          attributes: attributes, error: error, stackTrace: stackTrace, service: service);

  /// Fetches and caches feature flags for the current user. Call after
  /// [initialize] and again after [identify] or [reset].
  static Future<bool> loadFeatureFlags({Map<String, Object?>? properties}) =>
      _required.loadFeatureFlags(properties: properties);

  /// Whether a loaded flag is on; [defaultValue] until flags have loaded.
  static bool isFeatureEnabled(String key, {bool defaultValue = false}) =>
      _client?.isFeatureEnabled(key, defaultValue: defaultValue) ?? defaultValue;

  /// The loaded remote-config payload of a flag that is on, else [defaultValue].
  static Object? getFeatureFlagPayload(String key, {Object? defaultValue}) =>
      _client?.getFeatureFlagPayload(key, defaultValue: defaultValue) ?? defaultValue;

  /// Records a flag exposure yourself (the reads above do it unless disabled).
  static void recordFlagExposure(String key) => _client?.recordFlagExposure(key);

  /// Enables or disables collection. Disabling immediately clears queued events.
  static Future<void> setTrackingEnabled(bool enabled) =>
      _required.setTrackingEnabled(enabled);

  /// Consent must come from the host app; it is never inferred from tracking.
  static Future<void> grantReplayConsent() => _required.grantReplayConsent();
  static void revokeReplayConsent() => _client?.revokeReplayConsent();
  static void recordReplaySnapshot(String screen, Size viewport, List<TraceIQReplayNode> nodes) =>
      _required.recordReplaySnapshot(screen, viewport, nodes);
  static void clearReplaySnapshot() => _client?.clearReplaySnapshot();
  static void recordReplayTap(Offset point) => _required.recordReplayTap(point);
  static void recordReplayScroll(Offset point, Offset delta) => _required.recordReplayScroll(point, delta);
  static Future<void> flushReplay() => _required.flushReplay();
  static Future<void> completeReplay() => _required.completeReplay();

  /// Attempts to deliver all events currently in the persistent queue.
  static Future<void> flush() => _required.flush();

  /// Flushes, removes Flutter hooks, stops timers, and releases HTTP resources.
  static Future<void> shutdown() async {
    final initializing = _initializing;
    if (initializing != null) await initializing;
    final client = _client;
    if (client == null) return;
    _errors?.uninstall();
    _lifecycle?.unregister();
    await client.dispose();
    _errors = null;
    _lifecycle = null;
    _client = null;
  }

  static TraceIQClient get _required =>
      _client ?? (throw StateError('Call TraceIQ.initialize() first.'));
}
