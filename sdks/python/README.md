# traceiq (Python)

Server-side TraceIQ SDK for Python (3.8+). Pure standard library — no dependencies.
Events are queued and flushed in batches by a background thread, so your code never
blocks on the network.

## Install

```bash
pip install traceiq
```

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

## Options

`endpoint`, `flush_at` (20), `flush_interval` (10.0s), `max_retries` (3),
`timeout` (10.0s), `debug` (False), `on_error` (callback), `service_name` ("server") and
`environment` ("production") stamped on log lines.

Delivery is at-most-once; a batch that fails after `max_retries` is dropped and passed
to `on_error`. `properties["amount"]` (a number) powers the dashboard's revenue metrics.
