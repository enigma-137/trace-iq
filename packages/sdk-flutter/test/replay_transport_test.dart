import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:traceiq_flutter/src/config.dart';
import 'package:traceiq_flutter/src/replay_transport.dart';

void main() {
  test('Replay transport uses write key for config/grant and token for chunks/completion', () async {
    final requests = <http.Request>[];
    final transport = HttpTraceIQReplayTransport(
      TraceIQConfig(projectId: 'proj_test', apiKey: 'write-key', apiUrl: 'https://api.example.test'),
      clientFactory: () => MockClient((request) async {
        requests.add(request);
        if (request.url.path.endsWith('/config')) {
          return http.Response('{"enabled":true,"flowTriggerEventNames":[]}', 200);
        }
        if (request.url.path.endsWith('/authorize')) {
          return http.Response('{"token":"grant","replayId":"rpl_test","expiresAt":"2030-01-01T00:00:00Z"}', 200);
        }
        return http.Response('{"accepted":true}', 200);
      }),
    );
    await transport.config();
    await transport.authorize(<String, Object?>{'projectId': 'proj_test', 'recordingFormat': 'mobile-structural-v1'});
    await transport.chunk(<String, Object?>{'projectId': 'proj_test', 'sequence': 0}, 'grant');
    await transport.complete(<String, Object?>{'projectId': 'proj_test'}, 'grant');
    expect(requests.map((request) => request.url.path), <String>[
      '/v1/replays/config', '/v1/replays/authorize', '/v1/replays/chunks', '/v1/replays/complete',
    ]);
    expect(requests.first.url.queryParameters['projectId'], 'proj_test');
    expect(requests[0].headers['x-traceiq-write-key'], 'write-key');
    expect(requests[1].headers['x-traceiq-write-key'], 'write-key');
    expect(requests[2].headers['x-traceiq-replay-token'], 'grant');
    expect(requests[3].headers['x-traceiq-replay-token'], 'grant');
    expect(jsonDecode(requests[1].body), containsPair('recordingFormat', 'mobile-structural-v1'));
    transport.close();
  });
}
