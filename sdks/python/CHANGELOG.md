# Changelog

## 0.2.0

- **Logs.** `log(level, message, service=None, user_id=None, error=None, **metadata)` queues structured log lines that flush with events, in batches of up to 100. Pass `error` to attach an exception's type and message.
- **Feature flags.** `evaluate_flags()`, `is_feature_enabled()` and `get_feature_flag_payload()` evaluate flags per call and fall back to your default on any error. Exposures are tracked on a background thread unless disabled; `track_flag_exposure()` records one by hand.
- **`alias(user_id, previous_id, timestamp=None)`** sends a `$alias` event linking another ID for the same person to `user_id`.
