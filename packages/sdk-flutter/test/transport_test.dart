import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:traceiq_flutter/src/config.dart';
import 'package:traceiq_flutter/src/event.dart';
import 'package:traceiq_flutter/src/transport.dart';

TraceIQEvent sampleEvent() => TraceIQEvent(
      queueId: 'local-only', eventName: 'purchase', timestamp: DateTime.utc(2026),
      anonymousId: 'anon', userId: 'user', sessionId: 'session',
      properties: <String, Object?>{'amount': 12},
      context: <String, Object?>{'sdk': <String, Object?>{'name': 'traceiq_flutter'}},
      deviceInfo: <String, Object?>{'platform': 'test'},
    );

void main() {
  test('posts exact backend batch contract and write-key header', () async {
    late http.Request captured;
    final mock = MockClient((request) async {
      captured = request;
      return http.Response('{"accepted":true}', 202);
    });
    final config = TraceIQConfig(
      projectId: 'project', apiKey: 'secret-key', apiUrl: 'https://api.example.test',
    );
    final response = await HttpTraceIQTransport(config, client: mock).send(<TraceIQEvent>[sampleEvent()]);
    expect(response.isSuccess, isTrue);
    expect(captured.url.toString(), 'https://api.example.test/v1/events/batch');
    expect(captured.headers['x-traceiq-write-key'], 'secret-key');
    final body = jsonDecode(captured.body) as Map<Object?, Object?>;
    expect(body['projectId'], 'project');
    final event = (body['batch'] as List<Object?>).single as Map<Object?, Object?>;
    expect(event['eventName'], 'purchase');
    expect(event, isNot(contains('queueId')));
  });

  test('parses numeric Retry-After', () async {
    final transport = HttpTraceIQTransport(
      TraceIQConfig(projectId: 'p', apiKey: 'k', apiUrl: 'https://api.example.test'),
      client: MockClient((_) async => http.Response('', 429, headers: <String, String>{'retry-after': '9'})),
    );
    final response = await transport.send(<TraceIQEvent>[sampleEvent()]);
    expect(response.statusCode, 429);
    expect(response.retryAfter, const Duration(seconds: 9));
  });

  test('request timeout is surfaced for retry handling', () async {
    final config = TraceIQConfig(
      projectId: 'p', apiKey: 'k', apiUrl: 'https://api.example.test',
      requestTimeout: const Duration(milliseconds: 1),
    );
    final transport = HttpTraceIQTransport(config, client: MockClient((_) async {
      await Future<void>.delayed(const Duration(milliseconds: 20));
      return http.Response('', 200);
    }));
    await expectLater(transport.send(<TraceIQEvent>[sampleEvent()]), throwsA(isA<Exception>()));
  });
}
