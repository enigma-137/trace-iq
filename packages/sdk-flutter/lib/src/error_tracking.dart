import 'dart:async';
import 'dart:ui';

import 'package:flutter/foundation.dart';

import 'client.dart';

final class TraceIQErrorTracking {
  TraceIQErrorTracking(this._client);
  final TraceIQClient _client;
  FlutterExceptionHandler? _previousFlutterHandler;
  ErrorCallback? _previousPlatformHandler;
  FlutterExceptionHandler? _flutterHandler;
  ErrorCallback? _platformHandler;
  bool _installed = false;
  bool _capturing = false;

  void install() {
    if (_installed) return;
    _installed = true;
    _previousFlutterHandler = FlutterError.onError;
    _previousPlatformHandler = PlatformDispatcher.instance.onError;
    _flutterHandler = (details) {
      unawaited(_capture(details.exception, details.stack));
      _previousFlutterHandler?.call(details);
    };
    _platformHandler = (error, stackTrace) {
      unawaited(_capture(error, stackTrace));
      return _previousPlatformHandler?.call(error, stackTrace) ?? false;
    };
    FlutterError.onError = _flutterHandler;
    PlatformDispatcher.instance.onError = _platformHandler;
  }

  void uninstall() {
    if (!_installed) return;
    if (identical(FlutterError.onError, _flutterHandler)) {
      FlutterError.onError = _previousFlutterHandler;
    }
    if (identical(PlatformDispatcher.instance.onError, _platformHandler)) {
      PlatformDispatcher.instance.onError = _previousPlatformHandler;
    }
    _installed = false;
  }

  Future<void> _capture(Object error, StackTrace? stackTrace) async {
    if (_capturing) return;
    _capturing = true;
    try {
      await _client.captureException(error, stackTrace, handled: false);
    } catch (_) {
      // Error reporting must never create a recursive unhandled error.
    } finally {
      _capturing = false;
    }
  }
}
