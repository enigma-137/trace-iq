import 'dart:async';

import 'package:flutter/widgets.dart';

import '../traceiq_flutter.dart';

/// A navigator observer that emits `$page` events for named routes.
///
/// Add one instance to `MaterialApp.navigatorObservers`. Declarative routers
/// should call [TraceIQ.screen] from their route-change callback instead.
final class TraceIQNavigatorObserver extends NavigatorObserver {
  /// Creates an observer. [screenTracker] supports isolated navigation tests;
  /// applications normally omit it and use the global [TraceIQ] facade.
  TraceIQNavigatorObserver({Future<void> Function(String)? screenTracker})
      : _screenTracker = screenTracker;

  final Future<void> Function(String)? _screenTracker;
  String? _lastName;

  void _record(Route<dynamic>? route) {
    if (_screenTracker == null && !TraceIQ.automaticScreenTracking) return;
    final name = route?.settings.name?.trim();
    if (name == null || name.isEmpty || name == _lastName) return;
    _lastName = name;
    unawaited((_screenTracker ?? TraceIQ.screen)(name));
  }

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) => _record(route);

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) => _record(previousRoute);

  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) => _record(newRoute);
}
