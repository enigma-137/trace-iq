# SDK Spec

The JavaScript SDK exposes five core methods:

```ts
traceiq.initialize({
  projectId: 'proj_123',
  writeKey: 'write_key'
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
- Transport events reliably with batching and retries in a future implementation.
- Provide replay capture hooks behind an abstraction layer.
