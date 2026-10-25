## 0.1.0

- Initial Flutter SDK release.
- Added persistent anonymous and user identity, session management, and privacy-safe reset.
- Added event, identify, screen, revenue, and exception capture APIs.
- Added persistent bounded batching, offline recovery, retry/backoff, and `Retry-After` support.
- Added Flutter lifecycle, navigator observer, and non-destructive automatic error integration.
- Added Android, iOS, web, macOS, Windows, and Linux support.
- Added feature flags: `loadFeatureFlags()`, `isFeatureEnabled()` and `getFeatureFlagPayload()`, with one exposure recorded per flag value.
- Added structured logs with `log()`, flushed after events with retry.
- Added `alias(userId, previousId:)` to link another ID for the same person.
- Added opt-in, consent-gated iOS/Android structural session replay with safe-region widgets, per-event funnel acknowledgement, in-memory chunking, and replay API transport.
