import 'package:flutter_test/flutter_test.dart';
import 'package:traceiq_flutter/traceiq_flutter.dart';

void main() {
  group('TraceIQConfig', () {
    test('has production-safe batching defaults', () {
      final config = TraceIQConfig(projectId: 'project', apiKey: 'key');
      expect(config.batchSize, 20);
      expect(config.flushInterval, const Duration(seconds: 10));
      expect(config.debug, isFalse);
      expect(config.maxQueueSize, 1000);
    });

    for (final value in <String>['', '   ']) {
      test('rejects empty project id "$value"', () {
        expect(() => TraceIQConfig(projectId: value, apiKey: 'key'), throwsArgumentError);
      });
      test('rejects empty API key "$value"', () {
        expect(() => TraceIQConfig(projectId: 'p', apiKey: value), throwsArgumentError);
      });
    }

    test('rejects malformed URL', () {
      expect(() => TraceIQConfig(projectId: 'p', apiKey: 'k', apiUrl: 'example.com'), throwsArgumentError);
    });

    test('accepts HTTP for explicit local development', () {
      expect(TraceIQConfig(projectId: 'p', apiKey: 'k').batchUri.toString(),
          'http://localhost:4000/v1/events/batch');
    });

    test('rejects invalid batch sizes', () {
      expect(() => TraceIQConfig(projectId: 'p', apiKey: 'k', batchSize: 0), throwsRangeError);
      expect(() => TraceIQConfig(projectId: 'p', apiKey: 'k', batchSize: 501), throwsRangeError);
    });

    test('rejects non-positive durations and retries', () {
      expect(() => TraceIQConfig(projectId: 'p', apiKey: 'k', flushInterval: Duration.zero), throwsArgumentError);
      expect(() => TraceIQConfig(projectId: 'p', apiKey: 'k', requestTimeout: Duration.zero), throwsArgumentError);
      expect(() => TraceIQConfig(projectId: 'p', apiKey: 'k', maxRetryCount: -1), throwsRangeError);
    });

    test('accepts custom config', () {
      final config = TraceIQConfig(
        projectId: 'p', apiKey: 'k', apiUrl: 'https://api.example.test/', batchSize: 7,
        flushInterval: const Duration(seconds: 2), debug: true, maxQueueSize: 40,
      );
      expect(config.batchUri.toString(), 'https://api.example.test/v1/events/batch');
      expect(config.batchSize, 7);
      expect(config.debug, isTrue);
    });
  });
}
