import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'config.dart';
import 'event.dart';

final class TransportResponse {
  const TransportResponse({required this.statusCode, this.retryAfter, this.acceptedEvents});
  final int statusCode;
  final Duration? retryAfter;
  /// Null if the server did not provide a valid per-event acknowledgement.
  final List<bool>? acceptedEvents;
  bool get isSuccess => statusCode >= 200 && statusCode < 300;
}

/// Response to a JSON request other than an event batch.
final class TraceIQJsonResponse {
  const TraceIQJsonResponse({required this.statusCode, this.body, this.retryAfter});
  final int statusCode;
  /// Decoded JSON body, or null if it was empty or not JSON.
  final Object? body;
  final Duration? retryAfter;
  bool get isSuccess => statusCode >= 200 && statusCode < 300;
}

abstract interface class TraceIQTransport {
  Future<TransportResponse> send(List<TraceIQEvent> events);

  /// POSTs [body] plus the project id as JSON to an API path such as `/v1/logs/batch`.
  Future<TraceIQJsonResponse> post(String path, Map<String, Object?> body);
  void close();
}

final class HttpTraceIQTransport implements TraceIQTransport {
  HttpTraceIQTransport(this._config, {http.Client? client}) : _client = client ?? http.Client();
  final TraceIQConfig _config;
  final http.Client _client;

  @override
  Future<TransportResponse> send(List<TraceIQEvent> events) async {
    final response = await _client
        .post(
          _config.batchUri,
          headers: <String, String>{
            'content-type': 'application/json',
            'x-traceiq-write-key': _config.apiKey,
          },
          body: jsonEncode(<String, Object?>{
            'projectId': _config.projectId,
            'batch': events.map((event) => event.toIngestionJson()).toList(),
          }),
        )
        .timeout(_config.requestTimeout);
    return TransportResponse(
      statusCode: response.statusCode,
      retryAfter: _parseRetryAfter(response.headers['retry-after']),
      acceptedEvents: _acceptedEvents(response.body, events.length),
    );
  }

  @override
  Future<TraceIQJsonResponse> post(String path, Map<String, Object?> body) async {
    final response = await _client
        .post(
          _config.endpoint(path),
          headers: <String, String>{
            'content-type': 'application/json',
            'x-traceiq-write-key': _config.apiKey,
          },
          body: jsonEncode(<String, Object?>{'projectId': _config.projectId, ...body}),
        )
        .timeout(_config.requestTimeout);
    Object? decoded;
    try {
      decoded = response.body.isEmpty ? null : jsonDecode(response.body);
    } on FormatException {
      decoded = null;
    }
    return TraceIQJsonResponse(
      statusCode: response.statusCode,
      body: decoded,
      retryAfter: _parseRetryAfter(response.headers['retry-after']),
    );
  }

  static List<bool>? _acceptedEvents(String body, int expectedLength) {
    try {
      final decoded = jsonDecode(body);
      if (decoded is! Map<Object?, Object?>) return null;
      final results = decoded['results'];
      if (results is! List<Object?> || results.length != expectedLength) return null;
      if (results.any((item) => item is! Map<Object?, Object?> || item['accepted'] is! bool)) return null;
      return results.map((item) => (item as Map<Object?, Object?>)['accepted'] == true).toList(growable: false);
    } on FormatException {
      return null;
    }
  }

  static Duration? _parseRetryAfter(String? value) {
    if (value == null) return null;
    final seconds = int.tryParse(value.trim());
    if (seconds != null && seconds >= 0) return Duration(seconds: seconds);
    final date = DateTime.tryParse(value);
    if (date == null) return null;
    final duration = date.toUtc().difference(DateTime.now().toUtc());
    return duration > Duration.zero ? duration : Duration.zero;
  }

  @override
  void close() => _client.close();
}
