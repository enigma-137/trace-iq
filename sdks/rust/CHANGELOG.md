# Changelog

## 0.2.0

- **Fix: events were rejected by the API.** Events and batches were serialised in snake_case (`project_id`, `event_name`), but the API expects camelCase, so every batch was rejected with 400. Upgrade from 0.1.0 to start delivering events.
- **Fix: network errors are retried.** Connection failures were treated as permanent rejections; they now retry with backoff like 429 and 5xx.
- **Logs.** `log(level, message, user_id, metadata)` queues structured log lines that flush with events, in batches of up to 100. New builder options `service_name()` and `environment()`.
- **`alias(user_id, previous_id, timestamp)`** sends a `$alias` event linking another ID for the same person to `user_id`.
