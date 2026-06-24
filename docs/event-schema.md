# Event Schema

TraceIQ events are append-friendly records designed for ingestion, timelines, funnels, segmentation, and future replay correlation.

```ts
interface TraceIQEvent {
  id: string;
  organizationId: string;
  projectId: string;
  userId?: string;
  anonymousId?: string;
  sessionId: string;
  eventName: string;
  properties: Record<string, unknown>;
  deviceInfo?: TraceIQDeviceInfo;
  networkInfo?: TraceIQNetworkInfo;
  timestamp: string;
  context?: Record<string, unknown>;
}
```

## Timeline Readiness

Every event includes `userId`, `anonymousId`, `sessionId`, `eventName`, `properties`, and `timestamp` so product surfaces can render journeys like:

```text
User Registered
-> Email Verified
-> KYC Started
-> KYC Failed
-> Payment Attempted
-> Payment Failed
```

## Extensibility

- Use `properties` for event-specific payloads.
- Use `context` for SDK, app, campaign, page, or integration metadata.
- Keep provider-specific replay pointers outside the core event record unless they are needed for timeline correlation.
