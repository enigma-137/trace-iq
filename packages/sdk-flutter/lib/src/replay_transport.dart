import 'dart:convert';

import 'package:http/http.dart' as http;

import 'config.dart';

abstract interface class TraceIQReplayTransport {
  Future<Map<String, Object?>> config();
  Future<Map<String, Object?>> authorize(Map<String, Object?> body);
  Future<void> chunk(Map<String, Object?> body, String token);
  Future<void> complete(Map<String, Object?> body, String token);
  void cancelPending();
  void close();
}

/// Uses one short-lived HTTP client per request so consent revocation can abort
/// uploads without closing the analytics transport or preventing future grants.
final class HttpTraceIQReplayTransport implements TraceIQReplayTransport {
  HttpTraceIQReplayTransport(this._config, {http.Client Function()? clientFactory})
      : _clientFactory = clientFactory ?? http.Client.new;

  final TraceIQConfig _config;
  final http.Client Function() _clientFactory;
  final Set<http.Client> _active = <http.Client>{};
  bool _closed = false;
  String get _base => '${_config.apiUrl.replaceFirst(RegExp(r'/+$'), '')}/v1/replays';

  @override
  Future<Map<String, Object?>> config() async => _request(
        Uri.parse('$_base/config').replace(queryParameters: <String, String>{'projectId': _config.projectId}),
        'GET', null, null,
      );

  @override
  Future<Map<String, Object?>> authorize(Map<String, Object?> body) =>
      _request(Uri.parse('$_base/authorize'), 'POST', body, null);

  @override
  Future<void> chunk(Map<String, Object?> body, String token) async {
    await _request(Uri.parse('$_base/chunks'), 'POST', body, token);
  }

  @override
  Future<void> complete(Map<String, Object?> body, String token) async {
    await _request(Uri.parse('$_base/complete'), 'POST', body, token);
  }

  Future<Map<String, Object?>> _request(
    Uri uri, String method, Map<String, Object?>? body, String? token,
  ) async {
    if (_closed) throw StateError('Replay transport is closed.');
    final client = _clientFactory();
    _active.add(client);
    try {
      final request = http.Request(method, uri);
      request.headers['content-type'] = 'application/json';
      request.headers[token == null ? 'x-traceiq-write-key' : 'x-traceiq-replay-token'] = token ?? _config.apiKey;
      if (body != null) request.body = jsonEncode(body);
      final streamed = await client.send(request).timeout(_config.requestTimeout);
      final response = await http.Response.fromStream(streamed).timeout(_config.requestTimeout);
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw StateError('Replay request rejected with HTTP ${response.statusCode}.');
      }
      final decoded = jsonDecode(response.body);
      if (decoded is! Map<Object?, Object?>) throw const FormatException('Invalid Replay response.');
      return Map<String, Object?>.from(decoded);
    } finally {
      _active.remove(client);
      client.close();
    }
  }

  @override
  void cancelPending() {
    for (final client in _active.toList()) {
      client.close();
    }
    _active.clear();
  }

  @override
  void close() {
    _closed = true;
    cancelPending();
  }
}
