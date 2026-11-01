# Changelog

## 0.3.0

- **Request timing middleware** in `traceiq.middleware`, so a Python backend reports *server* response times to API performance and the Requests explorer, the same number your logs and Postman show. It sends a `$api_request` event per request with method, route, status, duration, request and trace ids, service, environment and sizes, and never reads headers, query strings or bodies.
  - `DjangoMiddleware` for Django, sync or async. Set `TRACEIQ_CLIENT` in settings (options go in `TRACEIQ_MIDDLEWARE`), or build one with `django_middleware(client, ...)`. It reports the matched route template (`/api/pay/verify/:ref/`, including `re_path` patterns); unmatched paths share one `<unmatched>` route so scanners can't fill the list.
  - `WSGIMiddleware` for Flask and any WSGI app, and `ASGIMiddleware` for FastAPI, Starlette and any ASGI app. They use the framework's route template when it exposes one (FastAPI does) and otherwise collapse ids (`/orders/42` becomes `/orders/:id`). Pass `route=` to supply your own.
  - Options: `ignore`, `resolve_user_id`, `service`, `environment`, `route`, `include_page_requests`, `request_id_header`, `echo_request_id`. Static files and HTML pages are skipped by default, as in the Node SDK.
  - Incoming `x-request-id` and W3C `traceparent` headers are honoured, so a request joins the trace that started in the browser. `get_trace_headers()` returns a `traceparent` for calls your handler makes to other services.
  - Requests the client abandons are recorded with status 499 and `aborted: true`. A failure inside the middleware never reaches your request.

## 0.2.0

- **Logs.** `log(level, message, service=None, user_id=None, error=None, **metadata)` queues structured log lines that flush with events, in batches of up to 100. Pass `error` to attach an exception's type and message.
- **Feature flags.** `evaluate_flags()`, `is_feature_enabled()` and `get_feature_flag_payload()` evaluate flags per call and fall back to your default on any error. Exposures are tracked on a background thread unless disabled; `track_flag_exposure()` records one by hand.
- **`alias(user_id, previous_id, timestamp=None)`** sends a `$alias` event linking another ID for the same person to `user_id`.
