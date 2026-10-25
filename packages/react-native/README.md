# traceiq-react-native

TraceIQ SDK for React Native and Expo. Tracks screens and events with device info,
persists the anonymous id across launches, batches events, and flushes when the app
backgrounds on a best-effort basis.

## Install

```bash
npm install traceiq-react-native
# optional, for anonymous-id persistence across launches:
npm install @react-native-async-storage/async-storage
```

`react` and `react-native` are peer dependencies (provided by your app). AsyncStorage
is optional — without it the SDK still works but the anonymous id resets each launch.

## Quickstart

```ts
import { traceiq } from 'traceiq-react-native';

traceiq.initialize({
  projectId: 'YOUR_PROJECT_ID',
  writeKey: 'YOUR_WRITE_KEY',
  endpoint: 'https://your-traceiq-api.example.com', // defaults to http://localhost:4000
  appVersion: '1.4.0'
});

// After login:
traceiq.identify({ userId: 'user_123', traits: { kyc_tier: 2 } });

// On each screen (or wire into your navigation container):
traceiq.screen('Wallet');

// Any event:
traceiq.capture({ event: 'transfer_started', properties: { amount: 5000, currency: 'NGN' } });

// On logout:
traceiq.reset();
```

## API

| Method | Purpose |
| --- | --- |
| `initialize(options)` | Configure the SDK. Call once at app start. |
| `screen(name, properties?)` | Track a screen view (sent as `$page`). |
| `capture({ event, properties?, timestamp? })` | Track an event. |
| `identify({ userId, traits? })` | Attach the current user to events. |
| `alias(userId, previousId?)` | Link another ID for the same person to `userId`. `previousId` defaults to the current ID. |
| `group({ organizationId, traits? })` | Associate the user with an account. |
| `reset()` | Clear the user + rotate the anonymous id (on logout). Also clears loaded feature flags. |
| `log(level, message, attributes?)` | Send a structured line to Logs, tagged with the session and user. `level` is `debug`, `info`, `warn`, `error` or `fatal`; pass `error` to attach an `Error`. |
| `loadFeatureFlags(properties?)` | Fetch and cache feature flags for the current user. Call after `initialize()` and again after `identify()` or `reset()`. |
| `isFeatureEnabled(key, defaultValue?)` | Whether a loaded flag is on. Returns `defaultValue` until flags have loaded. |
| `getFeatureFlagPayload(key, defaultValue?)` | A loaded flag's remote-config payload when it is on. |
| `recordFlagExposure(key)` | Record an exposure yourself (the two reads above do it unless `autoTrackFlagExposures: false`). |
| `flush()` / `shutdown()` | Send now / stop timers and flush. |
| `grantReplayConsent()` / `revokeReplayConsent()` | Explicitly allow or stop mobile replay. |
| `isReplayRecording` | Whether a mobile upload grant is active in the foreground. |
| `recordReplaySnapshot`, `recordReplayTap`, `recordReplayScroll` | Manual structural capture for custom views. |
| `flushReplay()` / `completeReplay()` | Upload pending chunks / finish the current replay. |

```ts
await traceiq.loadFeatureFlags();
if (traceiq.isFeatureEnabled('new-wallet')) {
  // ...
}

traceiq.log('error', 'Transfer failed', { provider: 'paystack', error });
```

`initialize()` also accepts `environment` (default `"production"`, used for flags and
logs), `serviceName` (default `"mobile-app"`, stamped on log lines) and
`autoTrackFlagExposures` (default `true`).

## Mobile session replay

This is an opt-in, content-free structural recorder for iOS and Android. It does not
use rrweb, screenshots, native screen capture, or an on-device replay database. It
works with React Native and Expo's JavaScript runtime. The project must have Replay
enabled and a selected funnel; the SDK waits for its first-step event to be
**accepted by the API** before requesting an upload grant. An HTTP-successful batch
with a rejected event does not activate recording. No view geometry is read before
that grant. Consent must be explicitly granted even if the project does not require
it. Revocation, logout, and session rotation stop capture and discard unsent chunks.

```tsx
import { createReplayComponents, traceiq } from 'traceiq-react-native';

traceiq.initialize({
  projectId: 'proj_...', writeKey: 'trq_...', endpoint: 'https://api.example.com',
  replay: { enabled: true }
});

// Call only after your app has obtained its own valid replay consent.
traceiq.grantReplayConsent();

// Create once at module scope. Region IDs must be unique positive integers per screen.
const { ReplayScreen, ReplayRegion } = createReplayComponents(traceiq);

function CheckoutScreen() {
  return (
    <ReplayScreen screen="Checkout">
      <ReplayRegion id={1} kind="control"><CheckoutButton /></ReplayRegion>
      <ReplayRegion id={2} kind="blocked"><PaymentForm /></ReplayRegion>
    </ReplayScreen>
  );
}

// This must match the first step of a selected Replay funnel.
traceiq.capture({ event: 'checkout_started' });
```

`ReplayScreen` captures the screen's dimensions and tap locations. Only explicitly
marked `ReplayRegion`s become nodes; unmarked views are blank. `blocked` and
`input` regions suppress interactions within their bounds and omit nested regions.
Use static screen slugs, not names containing personal data. Text, accessibility
labels, input values, children, styles, image bytes, and arbitrary props are never
serialized. For scroll gestures intercepted by custom controls, call
`recordReplayScroll(x, y, deltaX, deltaY)` with coordinates relative to the replay
screen; events outside opted-in safe regions are dropped. Native controls that
intercept touch events can use `recordReplayTap(x, y)` explicitly.

The SDK batches in memory and uploads only while the process is alive. A backgrounded
app may be suspended before its best-effort flush finishes; no replay bytes are
stored on disk. Analytics events still use their separate at-most-once queue.
The dashboard plays `mobile-structural-v1` as safe placeholder geometry with
touch, scroll, navigation, and lifecycle markers. It never reconstructs original
text or images. The Flutter SDK has a matching opt-in recorder.

## Behavior

- Events are queued and flushed by size (`flushAt`), on a timer (`flushIntervalMs`),
  and when the app goes to the background (`flushOnBackground`, default on).
- Device info (`platform`, `os`, `osVersion`, `deviceType`, `appVersion`) is attached
  automatically from `Platform`.
- Delivery is at-most-once; failed batches (after `maxRetries`) are dropped and reported
  via `onError`. A persistent offline queue is a planned enhancement.
