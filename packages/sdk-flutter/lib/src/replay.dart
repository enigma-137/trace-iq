import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

import 'config.dart';
import 'event.dart';
import 'replay_transport.dart';
import 'runtime.dart';

enum TraceIQReplayKind { box, text, image, icon, input, control, blocked }

/// A content-free, explicitly opted-in visual region. IDs are positive and
/// unique within a snapshot. [frame] uses screen-relative logical pixels.
final class TraceIQReplayNode {
  const TraceIQReplayNode({required this.id, required this.kind, required this.frame});
  final int id;
  final TraceIQReplayKind kind;
  final Rect frame;
}

final class MobileReplayRecorder {
  MobileReplayRecorder({
    required TraceIQConfig config,
    required TraceIQReplayTransport transport,
    required TraceIQClock clock,
    String? platform,
  })  : _config = config,
        _transport = transport,
        _clock = clock,
        _platform = platform == null ? _runtimePlatform()
            : (platform == 'ios' || platform == 'android' ? platform : null);

  static final RegExp _screenPattern = RegExp(r'^[A-Za-z][A-Za-z0-9_.:-]{0,79}$');
  final TraceIQConfig _config;
  final TraceIQReplayTransport _transport;
  final TraceIQClock _clock;
  final String? _platform;
  final ValueNotifier<bool> recording = ValueNotifier<bool>(false);

  bool _consent = false;
  bool _foreground = true;
  bool _authorizing = false;
  Future<void>? _loadingConfig;
  Map<String, Object?>? _serverConfig;
  TraceIQEvent? _identity;
  String? _token;
  String? _replayId;
  DateTime? _tokenExpiry;
  DateTime? _startedAt;
  Timer? _timer;
  int _epoch = 0;
  int _sequence = 0;
  int _eventBytes = 0;
  int _lastTimestamp = 0;
  List<Map<String, Object?>> _events = <Map<String, Object?>>[];
  Map<String, Object?>? _snapshot;
  Future<void> _uploadTail = Future<void>.value();
  Future<void>? _completion;

  bool get isRecording => recording.value && _foreground;

  Future<void> grantConsent() async {
    if (!_config.replayEnabled || _consent) return;
    _consent = true;
    _serverConfig = null;
    _loadingConfig = _fetchConfig();
    await _loadingConfig;
    _loadingConfig = null;
  }

  void revokeConsent() {
    _consent = false;
    stop();
  }

  void stop() {
    _epoch++;
    _transport.cancelPending();
    _timer?.cancel();
    _timer = null;
    _authorizing = false;
    _identity = null;
    _token = null;
    _replayId = null;
    _tokenExpiry = null;
    _startedAt = null;
    _sequence = 0;
    _eventBytes = 0;
    _lastTimestamp = 0;
    _events = <Map<String, Object?>>[];
    _snapshot = null;
    recording.value = false;
  }

  Future<void> acceptedEvent(TraceIQEvent event) async {
    if (!_config.replayEnabled || !_consent || _token != null || _authorizing || !_foreground || _platform == null) return;
    final epoch = _epoch;
    if (_loadingConfig != null) await _loadingConfig;
    if (_serverConfig == null && epoch == _epoch) {
      _loadingConfig = _fetchConfig();
      await _loadingConfig;
      _loadingConfig = null;
    }
    final settings = _serverConfig;
    final triggers = settings?['flowTriggerEventNames'];
    final rate = settings?['sampleRate'];
    if (epoch != _epoch || !_consent || settings?['enabled'] != true || triggers is! List<Object?> ||
        !triggers.contains(event.eventName) || rate is! num ||
        !sampleMobileReplaySession(event.sessionId, rate.toDouble()) || _authorizing || !_foreground) return;
    _authorizing = true;
    try {
      final grant = await _transport.authorize(_grantBody(event));
      if (epoch != _epoch || !_consent || !_foreground) return;
      final token = grant['token'];
      final replayId = grant['replayId'];
      final expiry = DateTime.tryParse(grant['expiresAt']?.toString() ?? '');
      if (token is! String || token.isEmpty || replayId is! String || expiry == null) {
        throw const FormatException('Incomplete Replay authorization.');
      }
      _token = token;
      _replayId = replayId;
      _tokenExpiry = expiry.toUtc();
      _identity = event;
      _startedAt = _clock.now();
      recording.value = true;
      _timer = Timer.periodic(const Duration(seconds: 5), (_) => unawaited(flush()));
    } on Object catch (error) {
      if (epoch == _epoch) _safeError(error);
    } finally {
      if (epoch == _epoch) _authorizing = false;
    }
  }

  void snapshot(String screen, Size viewport, List<TraceIQReplayNode> nodes) {
    if (!isRecording || !_screenPattern.hasMatch(screen) || nodes.length > 2000 ||
        !_dimension(viewport.width) || !_dimension(viewport.height)) return;
    final seen = <int>{};
    final clean = <Map<String, Object?>>[];
    for (final node in nodes) {
      if (node.id < 0 || !seen.add(node.id) || !_frame(node.frame)) return;
      clean.add(<String, Object?>{
        'id': node.id, 'kind': node.kind.name,
        'frame': _frameJson(node.frame),
      });
    }
    final event = <String, Object?>{
      'type': 'snapshot', 'timestamp': _timestamp(), 'screen': screen,
      'viewport': <String, Object?>{
        'width': viewport.width, 'height': viewport.height,
        'orientation': viewport.width > viewport.height ? 'landscape' : 'portrait',
      },
      'nodes': clean,
    };
    _snapshot = event;
    _append(event);
  }

  void clearView() => _snapshot = null;

  void tap(Offset point) {
    if (_safePoint(point)) _append(<String, Object?>{
      'type': 'tap', 'timestamp': _timestamp(), 'x': point.dx, 'y': point.dy,
    });
  }

  void scroll(Offset point, Offset delta) {
    if (_safePoint(point) && _coordinate(delta.dx) && _coordinate(delta.dy)) {
      _append(<String, Object?>{
        'type': 'scroll', 'timestamp': _timestamp(), 'x': point.dx, 'y': point.dy,
        'deltaX': delta.dx, 'deltaY': delta.dy,
      });
    }
  }

  void navigation(String screen) {
    if (isRecording && _snapshot != null && _screenPattern.hasMatch(screen)) {
      _append(<String, Object?>{'type': 'navigation', 'timestamp': _timestamp(), 'screen': screen});
    }
  }

  void background() {
    if (isRecording && _snapshot != null) {
      _append(<String, Object?>{'type': 'lifecycle', 'timestamp': _timestamp(), 'state': 'background'});
    }
    _snapshot = null;
    _foreground = false;
    recording.value = false;
    unawaited(flush());
  }

  void resume() {
    _foreground = true;
    if (_token != null) recording.value = true;
    if (isRecording && _snapshot != null) {
      _append(<String, Object?>{'type': 'lifecycle', 'timestamp': _timestamp(), 'state': 'foreground'});
    }
  }

  Future<void> flush() {
    if (_token == null || _identity == null) return Future<void>.value();
    if (_events.isEmpty) return _uploadTail;
    final events = _events;
    _events = <Map<String, Object?>>[];
    _eventBytes = 0;
    final sequence = _sequence++;
    final epoch = _epoch;
    final identity = _identity!;
    _uploadTail = _uploadTail.then((_) async {
      if (epoch != _epoch) return;
      try {
        final token = await _freshToken(epoch);
        if (token == null || epoch != _epoch) return;
        await _transport.chunk(<String, Object?>{
          ..._identityBody(identity), 'sequence': sequence,
          'events': <String, Object?>{
            'format': 'mobile-structural-v1', 'version': 1, 'runtime': 'flutter',
            'platform': _platform, 'sequence': sequence, 'events': events,
          },
        }, token);
      } on Object catch (error) {
        if (epoch == _epoch) { _safeError(error); stop(); }
      }
    });
    return _uploadTail;
  }

  Future<void> complete() => _completion ??= _complete().whenComplete(() => _completion = null);

  Future<void> _complete() async {
    await flush();
    final identity = _identity;
    if (identity == null) return;
    try {
      final token = await _freshToken(_epoch);
      if (token != null) await _transport.complete(<String, Object?>{
        ..._identityBody(identity), 'endedAt': _clock.now().toUtc().toIso8601String(),
      }, token);
    } on Object catch (error) {
      _safeError(error);
    } finally { stop(); }
  }

  void dispose() {
    stop();
    recording.dispose();
    _transport.close();
  }

  Future<void> _fetchConfig() async {
    final epoch = _epoch;
    try {
      final settings = await _transport.config();
      if (epoch == _epoch && _consent && settings['flowTriggerEventNames'] is List<Object?>) {
        _serverConfig = settings;
      }
    } on Object catch (error) { if (epoch == _epoch) _safeError(error); }
  }

  Future<String?> _freshToken(int epoch) async {
    final token = _token;
    final identity = _identity;
    if (token == null || identity == null) return null;
    if (_tokenExpiry != null && _clock.now().isBefore(_tokenExpiry!.subtract(const Duration(seconds: 30)))) return token;
    final grant = await _transport.authorize(<String, Object?>{
      ..._grantBody(identity), 'replayId': _replayId,
    });
    if (epoch != _epoch || !_consent || grant['replayId'] != _replayId || grant['token'] is! String) return null;
    _token = grant['token']! as String;
    _tokenExpiry = DateTime.tryParse(grant['expiresAt']?.toString() ?? '')?.toUtc();
    return _token;
  }

  Map<String, Object?> _identityBody(TraceIQEvent event) => <String, Object?>{
    'projectId': _config.projectId, 'sessionId': event.sessionId,
    'anonymousId': event.anonymousId, if (event.userId != null) 'userId': event.userId,
  };

  Map<String, Object?> _grantBody(TraceIQEvent event) => <String, Object?>{
    ..._identityBody(event), 'consentGranted': true, 'recordingFormat': 'mobile-structural-v1',
  };

  void _append(Map<String, Object?> event) {
    if (!isRecording || _snapshot == null || _sequence >= 3000) return;
    final timestamp = event['timestamp']! as int;
    _lastTimestamp = timestamp > _lastTimestamp ? timestamp : _lastTimestamp;
    event['timestamp'] = _lastTimestamp;
    if (_events.isEmpty && event['type'] != 'snapshot') {
      final prefix = <String, Object?>{..._snapshot!, 'timestamp': _lastTimestamp};
      _events.add(prefix);
      _eventBytes += jsonEncode(prefix).length;
    }
    _events.add(event);
    _eventBytes += jsonEncode(event).length;
    if (_events.length >= 100 || _eventBytes >= 350000) unawaited(flush());
    final maxSeconds = _serverConfig?['maxDurationSeconds'];
    if (_startedAt != null && _clock.now().difference(_startedAt!) >= Duration(seconds: maxSeconds is num ? maxSeconds.toInt() : 300)) {
      unawaited(complete());
    }
  }

  bool _safePoint(Offset point) {
    if (!isRecording || _snapshot == null || !_coordinate(point.dx) || !_coordinate(point.dy)) return false;
    final nodes = _snapshot!['nodes']! as List<Map<String, Object?>>;
    bool contains(Map<String, Object?> node) {
      final frame = node['frame']! as Map<String, Object?>;
      final x = frame['x']! as num, y = frame['y']! as num;
      return point.dx >= x && point.dy >= y && point.dx <= x + (frame['width']! as num) &&
          point.dy <= y + (frame['height']! as num);
    }
    if (nodes.any((node) => (node['kind'] == 'blocked' || node['kind'] == 'input') && contains(node))) return false;
    return nodes.any((node) => node['kind'] != 'box' && contains(node));
  }

  int _timestamp() => _clock.now().toUtc().millisecondsSinceEpoch;
  static bool _coordinate(double value) => value.isFinite && value >= -100000 && value <= 100000;
  static bool _dimension(double value) => value.isFinite && value >= 0 && value <= 100000;
  static bool _frame(Rect frame) => _coordinate(frame.left) && _coordinate(frame.top) &&
      _dimension(frame.width) && _dimension(frame.height);
  static Map<String, Object?> _frameJson(Rect frame) => <String, Object?>{
    'x': frame.left, 'y': frame.top, 'width': frame.width, 'height': frame.height,
  };

  void _safeError(Object error) {
    if (_config.debug) debugPrint('[TraceIQ] Mobile replay operation failed: ${error.runtimeType}.');
  }
}

String? _runtimePlatform() {
  if (kIsWeb) return null;
  return switch (defaultTargetPlatform) {
    TargetPlatform.iOS => 'ios',
    TargetPlatform.android => 'android',
    _ => null,
  };
}

bool sampleMobileReplaySession(String sessionId, double rate) {
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  var hash = 2166136261;
  for (final unit in sessionId.codeUnits) {
    hash = ((hash ^ unit) * 16777619) & 0xffffffff;
  }
  return hash / 0x100000000 < rate;
}
