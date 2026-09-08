/// Immutable configuration for a TraceIQ client.
final class TraceIQConfig {
  /// Creates and validates TraceIQ configuration.
  TraceIQConfig({
    required this.projectId,
    required this.apiKey,
    this.apiUrl = 'http://localhost:4000',
    this.debug = false,
    this.automaticScreenTracking = true,
    this.automaticErrorTracking = true,
    this.batchSize = 20,
    this.flushInterval = const Duration(seconds: 10),
    this.requestTimeout = const Duration(seconds: 10),
    this.maxRetryCount = 3,
    this.maxQueueSize = 1000,
    this.sessionTimeout = const Duration(minutes: 30),
    this.trackingEnabled = true,
  }) {
    if (projectId.trim().isEmpty) {
      throw ArgumentError.value(projectId, 'projectId', 'must not be empty');
    }
    if (apiKey.trim().isEmpty) {
      throw ArgumentError.value('', 'apiKey', 'must not be empty');
    }
    final uri = Uri.tryParse(apiUrl);
    if (uri == null || !uri.hasScheme || !uri.hasAuthority ||
        (uri.scheme != 'http' && uri.scheme != 'https')) {
      throw ArgumentError.value(apiUrl, 'apiUrl', 'must be an absolute HTTP(S) URL');
    }
    if (batchSize < 1 || batchSize > 500) {
      throw RangeError.range(batchSize, 1, 500, 'batchSize');
    }
    if (flushInterval <= Duration.zero) {
      throw ArgumentError.value(flushInterval, 'flushInterval', 'must be positive');
    }
    if (requestTimeout <= Duration.zero) {
      throw ArgumentError.value(requestTimeout, 'requestTimeout', 'must be positive');
    }
    if (maxRetryCount < 0) {
      throw RangeError.range(maxRetryCount, 0, null, 'maxRetryCount');
    }
    if (maxQueueSize < batchSize) {
      throw RangeError('maxQueueSize must be at least batchSize');
    }
    if (sessionTimeout <= Duration.zero) {
      throw ArgumentError.value(sessionTimeout, 'sessionTimeout', 'must be positive');
    }
  }

  /// TraceIQ project receiving events.
  final String projectId;

  /// Project write key sent in the `x-traceiq-write-key` header.
  final String apiKey;

  /// Base URL of the TraceIQ API.
  final String apiUrl;

  /// Enables safe diagnostic logging. Keys and payloads are never logged.
  final bool debug;

  /// Enables navigator-observer screen events when an observer is installed.
  final bool automaticScreenTracking;

  /// Captures uncaught Flutter and platform-dispatcher errors.
  final bool automaticErrorTracking;

  /// Number of queued events that triggers a flush (maximum 500).
  final int batchSize;

  /// Maximum delay between automatic flush attempts.
  final Duration flushInterval;

  /// Per-request timeout.
  final Duration requestTimeout;

  /// Number of retries after the initial request.
  final int maxRetryCount;

  /// Maximum persisted events. The oldest event is dropped on overflow.
  final int maxQueueSize;

  /// Background duration after which resume starts a new session.
  final Duration sessionTimeout;

  /// Initial tracking state. A persisted opt-out takes precedence.
  final bool trackingEnabled;

  /// Batch endpoint derived from [apiUrl].
  Uri get batchUri => Uri.parse('${apiUrl.replaceFirst(RegExp(r'/+$'), '')}/v1/events/batch');
}

