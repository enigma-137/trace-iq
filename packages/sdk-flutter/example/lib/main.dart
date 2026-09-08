import 'package:flutter/material.dart';
import 'package:traceiq_flutter/traceiq_flutter.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await TraceIQ.initialize(
    projectId: 'YOUR_PROJECT_ID',
    apiKey: 'YOUR_PROJECT_WRITE_KEY',
  );
  runApp(const ExampleApp());
}

class ExampleApp extends StatelessWidget {
  const ExampleApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'TraceIQ example',
        navigatorObservers: <NavigatorObserver>[TraceIQNavigatorObserver()],
        home: const DemoPage(),
      );
}

class DemoPage extends StatelessWidget {
  const DemoPage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('TraceIQ Flutter')),
        body: ListView(
          padding: const EdgeInsets.all(24),
          children: <Widget>[
            ElevatedButton(onPressed: () => TraceIQ.identify('demo_user', traits: <String, Object?>{'plan': 'demo'}), child: const Text('Identify')),
            ElevatedButton(onPressed: () => TraceIQ.track('demo_button_pressed'), child: const Text('Track event')),
            ElevatedButton(onPressed: () => TraceIQ.screen('Demo details'), child: const Text('Track screen')),
            ElevatedButton(onPressed: () => TraceIQ.revenue(amount: 3500, currency: 'NGN'), child: const Text('Track revenue')),
            ElevatedButton(onPressed: () => TraceIQ.captureException(StateError('Harmless demo error'), StackTrace.current), child: const Text('Capture exception')),
            ElevatedButton(onPressed: TraceIQ.flush, child: const Text('Flush')),
            ElevatedButton(onPressed: TraceIQ.reset, child: const Text('Reset / logout')),
          ],
        ),
      );
}
