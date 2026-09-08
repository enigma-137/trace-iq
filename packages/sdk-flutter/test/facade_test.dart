import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:traceiq_flutter/traceiq_flutter.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
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
