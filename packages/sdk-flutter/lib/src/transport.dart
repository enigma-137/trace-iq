import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'config.dart';
import 'event.dart';

final class TransportResponse {
  const TransportResponse({required this.statusCode, this.retryAfter});
  final int statusCode;
  final Duration? retryAfter;
  bool get isSuccess => statusCode >= 200 && statusCode < 300;
}

abstract interface class TraceIQTransport {
  Future<TransportResponse> send(List<TraceIQEvent> events);
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
    );
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

