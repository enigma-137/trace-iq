# Changelog

## 0.3.0

- **`release` option** (defaults to the `TRACEIQ_RELEASE` environment variable) is sent as `context.release` on every event, so Error tracking can show which release each error was seen in. A per-event `context.release` wins.

## 0.2.0

- **Trace propagation to downstream services.** `propagateTraceHeaders` adds a W3C `traceparent` header to global `fetch()` calls made while handling a request in `traceiq.middleware()`, so other services running the middleware join the same trace. Pass a list of your own service URLs (strings or RegExps), or `true` for every call. Off by default; calls to TraceIQ itself are never touched.
- **`getTraceHeaders()` and `traceiq.traceHeaders()`** return `{ traceparent }` for the current request, for HTTP clients other than `fetch` (for example axios). Outside a request they return `{}`.
- **`alias({ userId, previousId, timestamp? })`** sends a `$alias` event linking another ID for the same person to `userId`.
