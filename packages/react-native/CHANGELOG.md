# Changelog

## 0.3.0

- **Feature flags.** `loadFeatureFlags(properties?)` fetches and caches flags for the current user. `isFeatureEnabled()` and `getFeatureFlagPayload()` read the cache synchronously and record one exposure per flag value (`autoTrackFlagExposures`, default true). `reset()` clears the cache.
- **Logs.** `log(level, message, attributes?)` sends structured log lines tagged with the session and user.
- Events, logs and flag requests share one retrying HTTP helper.
- **`alias(userId, previousId?)`** sends a `$alias` event linking another ID for the same person to `userId`. `previousId` defaults to the current user or anonymous ID.
