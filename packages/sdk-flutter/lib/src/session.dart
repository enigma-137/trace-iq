import 'runtime.dart';

final class SessionManager {
  SessionManager({required TraceIQClock clock, required TraceIQUuidGenerator uuid, required this.timeout})
      : _clock = clock,
        _uuid = uuid,
        _sessionId = uuid.generate();

  final TraceIQClock _clock;
  final TraceIQUuidGenerator _uuid;
  final Duration timeout;
  String _sessionId;
  DateTime? _backgroundedAt;

  String get id => _sessionId;
  void background() => _backgroundedAt ??= _clock.now();
  bool resume() {
    final backgroundedAt = _backgroundedAt;
    _backgroundedAt = null;
    if (backgroundedAt != null && _clock.now().difference(backgroundedAt) >= timeout) {
      reset();
      return true;
    }
    return false;
  }
  void reset() {
    _sessionId = _uuid.generate();
    _backgroundedAt = null;
  }
}
