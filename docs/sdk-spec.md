# SDK Spec

The JavaScript SDK exposes five core methods:

```ts
traceiq.initialize({
  projectId: 'proj_123',
  writeKey: 'write_key',
  endpoint: 'http://localhost:4000'
});

traceiq.identify({
  userId: 'user_123',
  traits: { email: 'user@example.com' }
});

traceiq.track('signup_completed', {
  plan: 'premium'
});

traceiq.page('Pricing');

traceiq.group({
  organizationId: 'org_123',
  traits: { plan: 'growth' }
});
```

## SDK Responsibilities

- Manage project configuration.
- Track anonymous and identified users.
- Attach session metadata.
- Enrich events with device and page context.
- Transport individual events to `POST /v1/events`.
- Add batching and retries in a future implementation.
- Provide replay capture hooks behind an abstraction layer.

## Current MVP Behavior

- `initialize()` stores project config and creates anonymous/session IDs.
- `track()` posts events to the API with `x-traceiq-write-key`.
- `identify()` stores the current user and emits `$identify`.
- `page()` emits `$page`.
- `group()` stores organization/account context and emits `$group`.
- Failed TraceIQ requests are caught so the host app does not crash.
