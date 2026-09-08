import 'dart:async';

import 'package:flutter/widgets.dart';

import 'client.dart';

final class TraceIQLifecycleObserver with WidgetsBindingObserver {
  TraceIQLifecycleObserver(this._client);
  final TraceIQClient _client;
  bool _registered = false;

  void register() {
    if (_registered) return;
    WidgetsBinding.instance.addObserver(this);
    _registered = true;
  }

  void unregister() {
    if (!_registered) return;
    WidgetsBinding.instance.removeObserver(this);
    _registered = false;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.resumed:
        _client.onResume();
        break;
      case AppLifecycleState.inactive:
        break;
      case AppLifecycleState.hidden:
      case AppLifecycleState.paused:
      case AppLifecycleState.detached:
        unawaited(_client.onBackground());
    }
  }
}
