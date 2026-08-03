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

## Configuration

The `initialize()` call accepts:

- `projectId`: your TraceIQ project ID
- `writeKey`: your public SDK write key
- `endpoint`: the TraceIQ API base URL
- `debug`: enable console logging for troubleshooting

## Notes

- The browser SDK is intended for client-side integrations.
- Keep your write key in environment variables where possible.
- For server-side event ingestion, use the dedicated server SDK packages in this repository.
