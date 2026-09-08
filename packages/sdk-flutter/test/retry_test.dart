import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:traceiq_flutter/src/runtime.dart';

void main() {
  test('classifies network response statuses', () {
    for (final status in <int>[408, 429, 500, 502, 503, 504]) {
      expect(RetryPolicy.isRetryableStatus(status), isTrue, reason: '$status');
    }
    for (final status in <int>[400, 401, 403, 404, 422]) {
      expect(RetryPolicy.isRetryableStatus(status), isFalse, reason: '$status');
    }
  });

  test('backoff grows and jitter stays within 250ms', () {
    final policy = RetryPolicy(random: Random(1));
    for (var retry = 1; retry <= 5; retry++) {
      final delay = policy.delayFor(retry).inMilliseconds;
      final base = 1000 * (1 << (retry - 1));
      expect(delay, inInclusiveRange(base, base + 250));
    }
  });

  test('Retry-After overrides exponential delay', () {
    expect(RetryPolicy().delayFor(3, retryAfter: const Duration(seconds: 12)),
        const Duration(seconds: 12));
  });
}
