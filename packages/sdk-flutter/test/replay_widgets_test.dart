import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:traceiq_flutter/traceiq_flutter.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('opt-in wrappers render normally while replay is disabled', (tester) async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await TraceIQ.initialize(projectId: 'p', apiKey: 'k', automaticErrorTracking: false);
    await tester.pumpWidget(const Directionality(
      textDirection: TextDirection.ltr,
      child: TraceIQReplayScreen(
        screen: 'Checkout',
        child: TraceIQReplayRegion(
          id: 1, kind: TraceIQReplayKind.blocked,
          child: SizedBox(width: 100, height: 50),
        ),
      ),
    ));
    expect(find.byType(TraceIQReplayRegion), findsOneWidget);
    expect(TraceIQ.isReplayRecording, isFalse);
    await tester.pumpWidget(const SizedBox.shrink());
    await TraceIQ.shutdown();
  });
}
