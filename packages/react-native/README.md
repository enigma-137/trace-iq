# traceiq-react-native

TraceIQ SDK for React Native and Expo. Tracks screens and events with device info,
persists the anonymous id across launches, batches events, and flushes when the app
backgrounds (so nothing is lost when users leave).

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
| `group({ organizationId, traits? })` | Associate the user with an account. |
| `reset()` | Clear the user + rotate the anonymous id (on logout). |
| `flush()` / `shutdown()` | Send now / stop timers and flush. |

## Behavior

- Events are queued and flushed by size (`flushAt`), on a timer (`flushIntervalMs`),
  and when the app goes to the background (`flushOnBackground`, default on).
- Device info (`platform`, `os`, `osVersion`, `deviceType`, `appVersion`) is attached
  automatically from `Platform`.
- Delivery is at-most-once; failed batches (after `maxRetries`) are dropped and reported
  via `onError`. A persistent offline queue is a planned enhancement.
