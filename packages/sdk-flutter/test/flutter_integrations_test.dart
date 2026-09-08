import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:traceiq_flutter/src/client.dart';
import 'package:traceiq_flutter/src/config.dart';
import 'package:traceiq_flutter/src/error_tracking.dart';
import 'package:traceiq_flutter/src/lifecycle.dart';
import 'package:traceiq_flutter/src/navigator_observer.dart';
import 'package:traceiq_flutter/src/storage.dart';

import 'test_support.dart';

TraceIQClient integrationClient({FakeClock? clock}) => TraceIQClient(
      config: TraceIQConfig(
        projectId: 'p', apiKey: 'k', flushInterval: const Duration(hours: 1),
        sessionTimeout: const Duration(minutes: 30),
      ),
      storage: MemoryTraceIQStorage(), transport: FakeTransport(),
      clock: clock ?? FakeClock(), uuid: FakeUuid(), metadataProvider: () async => <String, Object?>{},
    );

void main() {
  testWidgets('flush interval sends a queued event', (tester) async {
    final transport = FakeTransport();
    final client = TraceIQClient(
      config: TraceIQConfig(
        projectId: 'p', apiKey: 'k', flushInterval: const Duration(milliseconds: 10),
      ),
      storage: MemoryTraceIQStorage(), transport: transport,
      clock: FakeClock(), uuid: FakeUuid(), metadataProvider: () async => <String, Object?>{},
    );
    await client.initialize();
    await client.track('timer');
    await tester.pump(const Duration(milliseconds: 11));
    expect(transport.batches, hasLength(1));
    await client.dispose();
  });

  testWidgets('navigator observer records push, pop, replace and ignores null/duplicates', (tester) async {
    final screens = <String>[];
    final observer = TraceIQNavigatorObserver(screenTracker: (name) async => screens.add(name));
    final navigatorKey = GlobalKey<NavigatorState>();
    await tester.pumpWidget(MaterialApp(
      navigatorKey: navigatorKey,
      navigatorObservers: <NavigatorObserver>[observer],
      routes: <String, WidgetBuilder>{
        '/': (_) => const SizedBox(),
        '/one': (_) => const SizedBox(),
        '/two': (_) => const SizedBox(),
      },
    ));
    navigatorKey.currentState!.pushNamed('/one');
    await tester.pumpAndSettle();
    navigatorKey.currentState!.pushNamed('/one');
    await tester.pumpAndSettle();
    navigatorKey.currentState!.pop();
    await tester.pumpAndSettle();
    navigatorKey.currentState!.pushReplacementNamed('/two');
    await tester.pumpAndSettle();
    navigatorKey.currentState!.push(MaterialPageRoute<void>(builder: (_) => const SizedBox()));
    await tester.pumpAndSettle();
    expect(screens, <String>['/', '/one', '/two']);
  });

  testWidgets('lifecycle pause flushes and timeout resume rotates session', (tester) async {
    final clock = FakeClock();
    final transport = FakeTransport();
    final client = TraceIQClient(
      config: TraceIQConfig(projectId: 'p', apiKey: 'k', flushInterval: const Duration(hours: 1)),
      storage: MemoryTraceIQStorage(), transport: transport, clock: clock, uuid: FakeUuid(),
      metadataProvider: () async => <String, Object?>{},
    );
    await client.initialize();
    await client.track('pending');
    final firstSession = client.sessionId;
    final observer = TraceIQLifecycleObserver(client)..register()..register();
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump();
    expect(transport.batches, hasLength(1));
    clock.advance(const Duration(minutes: 31));
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    expect(client.sessionId, isNot(firstSession));
    observer.unregister();
    observer.unregister();
    await client.dispose();
  });

  testWidgets('automatic Flutter error capture retains existing handler and uninstalls safely', (tester) async {
    final client = integrationClient();
    await client.initialize();
    var previousCalls = 0;
    final original = FlutterError.onError;
    FlutterError.onError = (_) => previousCalls++;
    final tracking = TraceIQErrorTracking(client)..install();
    FlutterError.onError!(FlutterErrorDetails(exception: StateError('captured')));
    await tester.pump();
    expect(previousCalls, 1);
    expect(client.queuedEventCount, 1);
    tracking.uninstall();
    expect(FlutterError.onError, isNotNull);
    FlutterError.onError = original;
    await client.setTrackingEnabled(false);
    await client.dispose();
  });
}
