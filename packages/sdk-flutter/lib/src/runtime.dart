import 'dart:math';

import 'package:uuid/uuid.dart';

abstract interface class TraceIQClock {
  DateTime now();
  Future<void> delay(Duration duration);
}

final class SystemTraceIQClock implements TraceIQClock {
  const SystemTraceIQClock();
  @override
  DateTime now() => DateTime.now().toUtc();
  @override
  Future<void> delay(Duration duration) => Future<void>.delayed(duration);
}

abstract interface class TraceIQUuidGenerator {
  String generate();
}

final class SystemTraceIQUuidGenerator implements TraceIQUuidGenerator {
  const SystemTraceIQUuidGenerator();
  @override
  String generate() => const Uuid().v4();
}

final class RetryPolicy {
  RetryPolicy({Random? random}) : _random = random ?? Random();
  final Random _random;

  static bool isRetryableStatus(int statusCode) =>
      statusCode == 408 || statusCode == 429 || statusCode >= 500;

  Duration delayFor(int retryNumber, {Duration? retryAfter}) {
    if (retryAfter != null && retryAfter > Duration.zero) return retryAfter;
    final exponent = (retryNumber.clamp(1, 6) as int) - 1;
    final baseMs = min(1000 * (1 << exponent), 30000);
    return Duration(milliseconds: baseMs + _random.nextInt(251));
  }
}
