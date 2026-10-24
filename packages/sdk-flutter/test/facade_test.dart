import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';
import 'package:traceiq_flutter/traceiq_flutter.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    SharedPreferencesAsyncPlatform.instance = InMemorySharedPreferencesAsync.empty();
    await TraceIQ.shutdown();
  });

  tearDown(() => TraceIQ.shutdown());

  test('methods fail clearly before initialization', () {
    expect(() => TraceIQ.track('event'), throwsStateError);
  });

  test('concurrent repeated initialization shares one active facade', () async {
    await Future.wait(<Future<void>>[
      TraceIQ.initialize(projectId: 'p', apiKey: 'k', automaticErrorTracking: false),
      TraceIQ.initialize(projectId: 'p', apiKey: 'k', automaticErrorTracking: false),
      TraceIQ.initialize(projectId: 'p', apiKey: 'k', automaticErrorTracking: false),
    ]);
    expect(TraceIQ.isTrackingEnabled, isTrue);
    await TraceIQ.setTrackingEnabled(false);
    expect(TraceIQ.isTrackingEnabled, isFalse);
  });

  test('facade validates configuration early', () async {
    await expectLater(
      TraceIQ.initialize(projectId: 'p', apiKey: '', automaticErrorTracking: false),
      throwsArgumentError,
    );
  });
}
