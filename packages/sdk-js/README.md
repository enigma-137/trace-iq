# TraceIQ JavaScript SDK

TraceIQ helps you capture product analytics, user events, feature-flag usage, and error signals from your web applications.

## Installation

```bash
npm install traceiq-sdk-js
```

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

## Common methods

```ts
traceiq.identify({ userId: 'user_123', traits: { plan: 'pro' } });
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
- `debug`: enable console logging for troubleshooting

## Notes

- The browser SDK is intended for client-side integrations.
- It does not set cookies. It stores a persistent anonymous ID in `localStorage` and a visit-scoped session ID in `sessionStorage` when browser storage is available.
- Page context can include the full URL, path, query string, referrer, page title, user agent, locale, viewport, and timezone. The API can add the request IP address and approximate geography.
- User IDs, traits, event properties, URLs, and exception messages or stacks can contain personal or sensitive data. Only send fields you are authorized to collect.
- TraceIQ does not make an application automatically compliant with GDPR, CCPA, PECR, or other privacy laws. Operators are responsible for notices, consent or another legal basis, retention, access, and deletion processes.
- Keep your write key in environment variables where possible.
- For server-side event ingestion, use the dedicated server SDK packages in this repository.
