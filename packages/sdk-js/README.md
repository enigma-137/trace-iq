# TraceIQ JavaScript SDK

TraceIQ helps you capture product analytics, user events, feature-flag usage, and error signals from your web applications.

## Installation

```bash
npm install traceiq-sdk-js
```

## Session Replay

Replay is off by default. Enabling it in SDK code is only an opt-in request; the server-side project setting and entitlement remain authoritative. With consent required, rrweb is dynamically imported only after consent is granted.

```ts
traceiq.initialize({
  projectId: 'proj_...',
  writeKey: 'trq_...',
  replay: { enabled: true, requireConsent: true }
});

// Wire these primitives to your existing CMP or consent UI.
traceiq.grantReplayConsent();
traceiq.revokeReplayConsent();
```

Use `data-traceiq-mask` and `data-traceiq-block` for application-specific privacy controls. `data-traceiq-ignore` suppresses interaction events only; it is not a privacy control. All inputs and known credential/payment fields retain permanent conservative handling. Every iframe is blocked unless a reviewed same-origin iframe has `data-traceiq-allow-replay="true"`; cross-origin and detected authentication/payment frame content remains disabled. Revocation aborts in-flight requests and discards unsent replay events; previously committed chunks remain until retention or authorized deletion.

## Quick start

```ts
import { traceiq } from 'traceiq-sdk-js';

traceiq.initialize({
  projectId: 'your-project-id',
  writeKey: 'your-write-key',
  endpoint: 'https://api.traceiq.dev'
});

traceiq.track('signup_completed', { plan: 'pro' });
```

## Feature Flags

TraceIQ Feature Flags support deterministic sticky rollouts, user targeting, remote configuration payloads, and automatic exposure tracking.

```ts
import { traceiq } from 'traceiq-sdk-js';

// 1. Identify the user first so targeting rules (plan, custom traits) evaluate against them
traceiq.identify({
  userId: 'usr_123',
  traits: { plan: 'pro', role: 'member' }
});

// 2. Load flags for the identified user
await traceiq.flags.load();

// 3. Evaluate flag state (automatically records exposure without duplicate rerender spam)
if (traceiq.flags.isEnabled('nuwell-new-add-meal')) {
  const config = traceiq.flags.getPayload('nuwell-new-add-meal');
  renderNewFeature(config);
} else {
  renderLegacyFeature();
}
```

## Common methods

```ts
traceiq.identify({ userId: 'user_123', traits: { plan: 'pro' } });
traceiq.alias('user_123', 'guest_8f2c'); // link another ID for the same person
traceiq.track('checkout_started', { cartValue: 4200, currency: 'NGN' });
traceiq.page('Pricing');
traceiq.group({ organizationId: 'org_123', traits: { plan: 'growth' } });
traceiq.captureException(new Error('Payment failed'));
```

The browser SDK automatically captures CLS, INP, LCP, FCP, and TTFB as `$web_vital` events. Set `autoCaptureWebVitals: false` during initialization to disable this collection.

## Configuration

The `initialize()` call accepts:

- `projectId`: your TraceIQ project ID
- `writeKey`: your public SDK write key
- `endpoint`: the TraceIQ API base URL
- `propagateTraceHeaders`: with `autoCaptureRequests`, captured API calls carry a W3C `traceparent` header so a `traceiq-node` backend joins the same trace. Same-origin only by default, because cross-origin it needs the API's CORS config to allow `traceparent`; pass a list of allowed origins (e.g. `['https://api.example.com']`), or `false` to turn it off.
- `maxRetries`: retries after a network error, HTTP 429 or 5xx, with exponential backoff (default `3`; `0` disables). While the browser is offline, sends wait for it to reconnect.
- `persistUndeliveredEvents`: save events whose delivery is delayed (offline, or a failed first attempt) to `localStorage` and resend them on the next page load if the page closes first (default `true`; up to 100 events, kept 24 hours). Events sent on the first try are never stored.
- `debug`: enable console logging for troubleshooting

## Notes

- The browser SDK is intended for client-side integrations.
- It does not set cookies. It stores a persistent anonymous ID in `localStorage` and a visit-scoped session ID in `sessionStorage` when browser storage is available. Events whose delivery is delayed are also kept in `localStorage` until delivered (at most 24 hours), including their properties; set `persistUndeliveredEvents: false` to disable this.
- Page context can include the full URL, path, query string, referrer, page title, user agent, locale, viewport, and timezone. The API can add the request IP address and approximate geography.
- User IDs, traits, event properties, URLs, and exception messages or stacks can contain personal or sensitive data. Only send fields you are authorized to collect.
- TraceIQ does not make an application automatically compliant with GDPR, CCPA, PECR, or other privacy laws. Operators are responsible for notices, consent or another legal basis, retention, access, and deletion processes.
- Keep your write key in environment variables where possible.
- For server-side event ingestion, use the dedicated server SDK packages in this repository.
