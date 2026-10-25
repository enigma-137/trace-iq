# Changelog

## Unreleased

- **`release` option.** Set your app version or build in `initialize({ release })`; it is sent as `context.release` on every event, and Error tracking shows the release each error was first and last seen in.

## 0.3.0

- **Trace propagation.** With `autoCaptureRequests` on, captured `fetch` and XHR calls carry a W3C `traceparent` header, and the `$api_request` event records the same `traceId` and `spanId`. A `traceiq-node` backend then nests its request under the browser's in the Requests waterfall. Same-origin only by default; list other origins with `propagateTraceHeaders`, or pass `false` to turn it off.
- **Retries.** Event and log deliveries retry network errors, 429 and 5xx with exponential backoff (1s, 2s, 4s) or the server's `Retry-After`, up to `maxRetries` (default 3). While the browser is offline, sends wait for the `online` event.
- **Delayed events survive page loads.** An event still waiting on a retry or for the network is saved to `localStorage` (`traceiq.pendingEvents.<projectId>`, at most 100 events for 24 hours) and resent on the next page load. Turn off with `persistUndeliveredEvents: false`.
- **`alias(userId, previousId?)`** sends a `$alias` event linking another ID for the same person to `userId`. `previousId` defaults to the current user or anonymous ID.
- Events now report the real SDK version in `context.sdk.version` (it was stuck at `0.1.0`).
