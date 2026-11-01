# traceiq (Python)

Server-side TraceIQ SDK for Python (3.8+). Pure standard library — no dependencies.
Events are queued and flushed in batches by a background thread, so your code never
blocks on the network.

## Install

```bash
pip install traceiq-py
```

The package installs as `traceiq-py` and imports as `traceiq`.

## Quickstart

```python
from traceiq import Client

traceiq = Client(
    project_id="YOUR_PROJECT_ID",
    write_key="YOUR_WRITE_KEY",              # keep server keys secret
    endpoint="https://your-traceiq-api.example.com",  # defaults to http://localhost:4000
)

# A trustworthy revenue event, straight from your payments service:
traceiq.capture(
    "payout_succeeded",
    user_id="user_123",
    properties={"amount": 50000, "currency": "NGN"},
)

traceiq.identify("user_123", traits={"email": "a@b.com", "kyc_tier": 2})
traceiq.group("org_9", user_id="user_123", traits={"plan": "growth"})

traceiq.shutdown()  # flush before a short-lived process exits
```

The client also registers an `atexit` flush, so long-running services generally don't
need to call `shutdown()` explicitly.

## API

| Method | Purpose |
| --- | --- |
| `capture(event, user_id=None, anonymous_id=None, properties=None, context=None, timestamp=None)` | Track an event. |
| `identify(user_id, traits=None, timestamp=None)` | Create/update a user profile. |
| `alias(user_id, previous_id, timestamp=None)` | Link another ID for the same person (e.g. a guest ID) to `user_id`. |
| `group(organization_id, user_id=None, anonymous_id=None, traits=None, timestamp=None)` | Associate a user with an account. |
| `log(level, message, service=None, user_id=None, error=None, **metadata)` | Send a structured line to Logs. `level` is `debug`, `info`, `warn`, `error` or `fatal`. |
| `is_feature_enabled(key, distinct_id, default=False, properties=None, environment=None, track_exposure=True)` | Whether a feature flag is on for a user. Returns `default` if flags can't be evaluated. |
| `get_feature_flag_payload(key, distinct_id, default=None, ...)` | A flag's remote-config payload when it is on, else `default`. |
| `evaluate_flags(distinct_id, properties=None, environment=None)` | Every flag for a user: `{"flags", "payloads", "details"}`. |
| `track_flag_exposure(key, distinct_id, enabled, environment=None, properties=None)` | Record a flag exposure yourself (the helpers above do it unless `track_exposure=False`). |
| `flush()` | Send everything queued now (blocks). |
| `shutdown()` | Stop the worker and flush. |

```python
traceiq.log("error", "Payout provider timed out", provider="stripe", error=exc)

if traceiq.is_feature_enabled("new-payouts", "user_123", properties={"plan": "pro"}):
    ...
```

Flag calls are synchronous HTTP requests (one per call), so evaluate once per request and
reuse the result, for example with `evaluate_flags()`.

## Request timing (Django, Flask, FastAPI)

`traceiq.middleware` times every request and reports it as a server timing, the same number your
logs and Postman show. It appears under **Server** in API performance. The browser SDK reports a
different number (the full round trip from the visitor's device) and the dashboard keeps the two apart.

```python
# Django: settings.py
from traceiq import Client

TRACEIQ_CLIENT = Client(project_id="proj_...", write_key="trq_...",
                        endpoint="https://api.traceiq.run", service_name="my-api")
TRACEIQ_MIDDLEWARE = {  # optional
    "resolve_user_id": lambda request: request.user.email if request.user.is_authenticated else None,
    "ignore": lambda request: request.path == "/health/",
}
MIDDLEWARE = [
    "traceiq.middleware.DjangoMiddleware",  # near the top, so it times the middleware below it
    # ...
]

# Flask or any WSGI app
from traceiq.middleware import WSGIMiddleware
app.wsgi_app = WSGIMiddleware(app.wsgi_app, traceiq)

# FastAPI, Starlette or any ASGI app
from traceiq.middleware import ASGIMiddleware
app.add_middleware(ASGIMiddleware, client=traceiq)
```

Routes are templates (`/api/pay/verify/:ref/`), not raw URLs, so requests group instead of
exploding per id. Django and FastAPI report their own template; for Flask and other WSGI apps ids
are collapsed (`/orders/42` becomes `/orders/:id`), or pass `route=lambda environ: ...`.
`resolve_user_id` should return the same id your frontend passes to `identify()`.

Options: `ignore`, `resolve_user_id`, `service`, `environment`, `route`, `include_page_requests`,
`request_id_header` (`"x-request-id"`), `echo_request_id` (True). Static files and HTML pages are
skipped. The middleware reads the incoming `x-request-id` and `traceparent` headers, so a request joins
the trace that started in the browser, and `traceiq.middleware.get_trace_headers()` gives you a
`traceparent` to send on calls your handler makes to other services. It never reads headers, query
strings or bodies, and a failure inside it never reaches your request.

## Options

`endpoint`, `flush_at` (20), `flush_interval` (10.0s), `max_retries` (3),
`timeout` (10.0s), `debug` (False), `on_error` (callback), `service_name` ("server") and
`environment` ("production") stamped on log lines.

Delivery is at-most-once; a batch that fails after `max_retries` is dropped and passed
to `on_error`. `properties["amount"]` (a number) powers the dashboard's revenue metrics.
