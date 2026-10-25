# traceiq_flutter

Production-oriented TraceIQ analytics for Flutter on Android, iOS, web, macOS,
Windows, and Linux. The SDK queues work off the UI path, persists undelivered
events, batches requests, retries temporary failures, and manages anonymous
identity and sessions automatically.

## Installation

```yaml
dependencies:
  traceiq_flutter: ^0.1.0
```

## Initialize

The TraceIQ ingestion contract requires both the project ID and its publishable
write key. In this package the write key is named `apiKey`.

```dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await TraceIQ.initialize(
    projectId: 'YOUR_PROJECT_ID',
    apiKey: 'YOUR_PROJECT_WRITE_KEY',
    apiUrl: 'https://your-traceiq-api.example.com',
  );
  runApp(const MyApp());
}
```

The default URL is `http://localhost:4000` for compatibility with the other
TraceIQ SDKs and local development. Set an HTTPS URL in released applications.
Calling `initialize` again is safe and keeps the first active configuration.

## Track events

```dart
await TraceIQ.track('product_viewed', properties: {
  'product_id': '123',
  'price': 4500,
  'available_at': DateTime.now(), // normalized to UTC ISO-8601
});
```

Values may be strings, finite numbers, booleans, null, `DateTime`, lists, and
string-keyed maps containing those types. Unsupported objects, NaN, infinity,
blank event names, and non-string map keys throw `ArgumentError` before queueing.

## Identify users and log out

```dart
await TraceIQ.identify('user_123', traits: {'name': 'Emmanuel', 'plan': 'pro'});
// On logout:
await TraceIQ.reset();
```

`identify` emits the canonical `$identify` event with traits in
`properties.traits`. The persistent anonymous ID remains on identify events so
the backend can stitch pre-login activity. `reset` clears user ID and traits,
rotates the anonymous ID, and starts a new session. Already queued events retain
the identity captured when they occurred; later events cannot inherit it.

`alias(userId, previousId: ...)` links another ID for the same person (for
example a guest ID) to `userId` with a `$alias` event. `previousId` defaults to
the current user or anonymous ID.

## Screen tracking

Track explicitly:

```dart
await TraceIQ.screen('Checkout', properties: {'step': 2});
```

Or install the named-route observer:

```dart
MaterialApp(
  navigatorObservers: [TraceIQNavigatorObserver()],
);
```

It handles push, pop, and replace, ignores null/blank route names, and suppresses
consecutive duplicate names. Router API, `go_router`, and `auto_route` do not
always drive a Navigator observer; call `TraceIQ.screen` from their route-change
callback. Set `automaticScreenTracking: false` to disable observer events.

## Revenue

```dart
await TraceIQ.revenue(
  amount: 3500,
  currency: 'NGN',
  properties: {'product': 'Premium'},
);
```

Currency must be a three-letter alphabetic code. Zero is accepted. Negative
values are accepted for refunds/adjustments. TraceIQ revenue dashboards use the
numeric `amount` property, matching existing SDK semantics.

## Error tracking

```dart
try {
  await checkout();
} catch (error, stackTrace) {
  await TraceIQ.captureException(error, stackTrace, properties: {'step': 'pay'});
}
```

Automatic capture is enabled by default for `FlutterError.onError` and
`PlatformDispatcher.instance.onError`. Existing application handlers are retained
and called after TraceIQ queues the exception. Disable it with
`automaticErrorTracking: false`. The SDK cannot capture errors handled entirely
inside a zone or framework unless the app calls `captureException`.

## Logs

```dart
TraceIQ.log('error', 'Transfer failed',
    attributes: {'provider': 'paystack'}, error: error, stackTrace: stackTrace);
```

`level` is `debug`, `info`, `warn`, `error` or `fatal`. Lines are tagged with the
session and user, kept in memory (up to `maxQueueSize`), and sent to TraceIQ Logs
with each flush. Unlike events, they are not persisted across app restarts.

## Feature flags

```dart
await TraceIQ.loadFeatureFlags(properties: {'plan': 'pro'});
if (TraceIQ.isFeatureEnabled('new-wallet')) {
  // ...
}
final limits = TraceIQ.getFeatureFlagPayload('wallet-limits', defaultValue: {});
```

Call `loadFeatureFlags` after `initialize` and again after `identify` or `reset`
(`reset` clears loaded flags). Until flags load, reads return their default.
Reading a flag records one exposure per value unless
`autoTrackFlagExposures: false`; call `TraceIQ.recordFlagExposure(key)` to record
one yourself.

## Flush, lifecycle, and offline delivery

```dart
await TraceIQ.flush();
```

Events flush at `batchSize`, on `flushInterval`, on explicit `flush`, and when the
app backgrounds. One flush owns a queued event at a time, so overlapping calls do
not duplicate it. Successful batches are removed. Network errors, timeouts,
HTTP 408, 429, and 5xx use capped exponential backoff with jitter; `Retry-After`
is honored. After retries are exhausted the events remain persisted for a later
flush/restart. Other 4xx batches are discarded because retrying cannot repair
them. The backend validates each event independently; local validation prevents
malformed SDK events from poisoning a batch.

Background flushes are best-effort because mobile and browser runtimes can suspend
networking immediately; persistence is the fallback and the next launch retries.

The persistent queue preserves order and defaults to 1,000 events. On overflow,
the oldest event is dropped. Stable metadata is collected once per initialization.
Sessions are intentionally process-scoped: a new app launch gets a new session,
while foregrounding within `sessionTimeout` keeps the current one.

## Privacy

```dart
await TraceIQ.setTrackingEnabled(false);
print(TraceIQ.isTrackingEnabled); // false
await TraceIQ.setTrackingEnabled(true);
```

Opt-out is persisted. Disabling tracking immediately clears queued events and
ignores new analytics/error/screen events. Configuration and anonymous identity
remain so the SDK can resume if consent is granted later. Consent UI is the
application’s responsibility.

## Mobile session replay (iOS and Android)

Replay is off by default and uses the content-free `mobile-structural-v1` format,
not rrweb, screenshots, or native video. Enable it and grant explicit consent
from your app's privacy flow. The project also needs Replay enabled and a
selected funnel. Recording starts only after a funnel first-step event is
accepted by the API and the server grants an upload token; a queued or rejected
event cannot start it.

```dart
await TraceIQ.initialize(
  projectId: 'proj_...', apiKey: 'trq_...',
  apiUrl: 'https://api.example.com', replayEnabled: true,
);
await TraceIQ.grantReplayConsent(); // only after your own consent decision

// In the Checkout widget tree:
TraceIQReplayScreen(
  screen: 'Checkout', // static slug, never user data
  child: Column(children: [
    TraceIQReplayRegion(
      id: 1, kind: TraceIQReplayKind.control, child: CheckoutButton(),
    ),
    TraceIQReplayRegion(
      id: 2, kind: TraceIQReplayKind.blocked, child: PaymentForm(),
    ),
  ]),
);

await TraceIQ.track('checkout_started'); // selected funnel's first step
```

Only explicitly marked regions become structural nodes. `blocked` and `input`
regions suppress touches and nested regions. Text, accessibility labels, input
values, images, child widget types, and arbitrary properties are never read or
serialized. Use positive IDs unique within a screen; ID 0 is reserved for the
screen box. Mark payment, credentials, personal data, embedded/native views, and
unknown third-party widgets as `blocked`. Unmarked views remain blank. You can
also provide safe geometry manually through `TraceIQ.recordReplaySnapshot`,
`recordReplayTap`, and `recordReplayScroll`.
The wrappers sample geometry on activation and rebuild; highly animated or
custom-rendered surfaces should use explicit safe snapshots where needed.

Call `TraceIQ.revokeReplayConsent()` when consent is withdrawn, or
`TraceIQ.reset()` on logout. Both immediately stop capture and discard unsent
replay chunks. The analytics queue remains persistent; replay chunks are
**memory-only** and background upload is best-effort. Flutter web/desktop are
excluded from this v1 recorder. The dashboard mobile player is a later step.

## Configuration

| Option | Default | Meaning |
| --- | --- | --- |
| `projectId` | required | TraceIQ project ID |
| `apiKey` | required | Publishable project write key |
| `apiUrl` | `http://localhost:4000` | TraceIQ API base URL |
| `debug` | `false` | Safe `[TraceIQ]` operational logs; never keys/payloads |
| `automaticScreenTracking` | `true` | Allow navigator observer events |
| `automaticErrorTracking` | `true` | Install chained Flutter error handlers |
| `batchSize` | `20` | Flush threshold, from 1 through backend maximum 500 |
| `flushInterval` | 10 seconds | Periodic flush interval |
| `requestTimeout` | 10 seconds | HTTP request timeout |
| `maxRetryCount` | `3` | Retries after the initial attempt |
| `maxQueueSize` | `1000` | Persistent event cap; must be at least batch size |
| `sessionTimeout` | 30 minutes | Background duration that rotates session ID |
| `trackingEnabled` | `true` | Initial state; persisted opt-out wins |
| `replayEnabled` | `false` | Opt in to iOS/Android structural replay; explicit consent is still required |
| `environment` | `production` | Environment for flag evaluation and log lines |
| `serviceName` | `mobile-app` | Service name stamped on log lines |
| `autoTrackFlagExposures` | `true` | Record an exposure when a flag is read |

Call `await TraceIQ.shutdown()` when a host can
explicitly tear down the SDK. It flushes, cancels timers, removes lifecycle/error
hooks, and closes its HTTP client.

## Wire contract

The SDK posts batches to `POST /v1/events/batch`, authenticates with
`x-traceiq-write-key`, and sends `{ "projectId": "...", "batch": [...] }`.
Screen, identify, and exception events use `$page`, `$identify`, and `$exception`.
There is no separate revenue endpoint; numeric `properties.amount` follows the
canonical ingestion/revenue contract.

## Platform notes

Storage uses `shared_preferences`; HTTP and UUID generation are pure Dart package
APIs. App package metadata is best-effort and omitted if unavailable. No hardware,
advertising, MAC, IMEI, or other invasive identifier is collected.
