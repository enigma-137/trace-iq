# @traceiq/node

Server-side TraceIQ SDK for Node.js (18+). Use it to capture **backend** events —
payments, payouts, settlements, background jobs — where the data is trustworthy and
carries the real numbers (e.g. a `amount` you can't spoof from the browser).

Events are queued and flushed in **batches** (by size or on a timer), so your request
handlers never block on the network.

## Install

```bash
npm install @traceiq/node
```

## Quickstart

```ts
import { TraceIQ } from '@traceiq/node';

const traceiq = new TraceIQ({
  projectId: 'YOUR_PROJECT_ID',
  writeKey: process.env.TRACEIQ_WRITE_KEY!, // keep server keys secret
  endpoint: 'https://your-traceiq-api.example.com' // defaults to http://localhost:4000
});

// A trustworthy revenue event, straight from your payments service:
traceiq.capture({
  event: 'payout_succeeded',
  userId: 'user_123',
  properties: { amount: 50000, currency: 'NGN', channel: 'bank_transfer' }
});

traceiq.identify({ userId: 'user_123', traits: { email: 'a@b.com', kyc_tier: 2 } });
traceiq.group({ userId: 'user_123', organizationId: 'org_9', traits: { plan: 'growth' } });

// Flush before a short-lived process (script, Lambda) exits:
await traceiq.shutdown();
```

## API

| Method | Purpose |
| --- | --- |
| `capture({ event, userId?, anonymousId?, properties?, context?, timestamp? })` | Track a server event. |
| `identify({ userId, traits?, timestamp? })` | Create/update a user profile. |
| `group({ organizationId, userId?, anonymousId?, traits?, timestamp? })` | Associate a user with an account. |
| `flush()` | Send everything queued now (returns a Promise). |
| `shutdown()` | Flush and stop the timer — call on process exit. |

## Options

| Option | Default | Notes |
| --- | --- | --- |
| `endpoint` | `http://localhost:4000` | TraceIQ API base URL. |
| `flushAt` | `20` | Flush once this many events are queued. |
| `flushIntervalMs` | `10000` | Timer flush; `0` disables it. |
| `maxRetries` | `3` | Network retries per batch (exponential backoff + jitter). |
| `timeoutMs` | `10000` | Per-request timeout. |
| `onError` | — | Called when a batch is dropped after exhausting retries. |
| `debug` | `false` | Log warnings to the console. |
| `fetchImpl` | global `fetch` | Inject a fetch (tests, or Node < 18 with a polyfill). |

## How it maps to ingestion

Under the hood the SDK POSTs to `POST /v1/events/batch` with your write key in the
`x-traceiq-write-key` header and a body of `{ projectId, batch: [...] }`. Each event
is validated independently — one malformed event fails only itself; the rest still land.

## Notes

- Delivery is at-most-once: if a batch fails after `maxRetries`, it is dropped and
  reported via `onError`. Long-running services can rely on the periodic flush; short
  scripts should `await traceiq.shutdown()`.
- `properties.amount` (a number) is what powers the Revenue/GTV and Sum/Average-of-amount
  metrics in the dashboard.
