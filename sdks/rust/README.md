# traceiq (Rust)

Server-side TraceIQ SDK for Rust. Events are queued and flushed in batches by a
background thread, so your code never blocks on the network.

## Install

```toml
[dependencies]
traceiq = "0.1.0"
```

## Quickstart

```rust
use traceiq::Client;

let mut traceiq = Client::new("YOUR_PROJECT_ID", "YOUR_WRITE_KEY");
traceiq.capture(
    "payout_succeeded",
    Some("user_123"),
    None,
    Some(serde_json::json!({"amount": 50000, "currency": "NGN"})),
    None,
    None,
);

traceiq.identify("user_123", Some(serde_json::json!({"email": "a@b.com", "kyc_tier": 2})), None);
traceiq.group("org_9", Some("user_123"), None, Some(serde_json::json!({"plan": "growth"})), None);

traceiq.shutdown(); // flush before a short-lived process exits
```

With full configuration via the builder:

```rust
use std::time::Duration;
use traceiq::Client;

let mut traceiq = Client::builder("YOUR_PROJECT_ID", "YOUR_WRITE_KEY")
    .endpoint("https://your-traceiq-api.example.com")
    .flush_at(50)
    .flush_interval(Duration::from_secs(15))
    .max_retries(5)
    .timeout(Duration::from_secs(5))
    .debug(true)
    .on_error(|err| eprintln!("{err}"))
    .build();
```

## API

| Method | Purpose |
| --- | --- |
| `capture(event, user_id?, anonymous_id?, properties?, context?, timestamp?)` | Track an event. |
| `identify(user_id, traits?, timestamp?)` | Create/update a user profile. |
| `group(organization_id, user_id?, anonymous_id?, traits?, timestamp?)` | Associate a user with an account. |
| `log(level, message, user_id?, metadata?)` | Send a structured line to Logs. `level` is `"debug"`, `"info"`, `"warn"`, `"error"` or `"fatal"`. Lines flush with events. |
| `flush()` | Send everything queued now (blocks). |
| `shutdown()` | Stop the worker and flush. |

## Options

`endpoint`, `flush_at` (20), `flush_interval` (10s), `max_retries` (3),
`timeout` (10s), `debug` (false), `on_error` (callback), and `service_name` ("server")
and `environment` ("production") stamped on log lines.

Delivery is at-most-once; a batch that fails after `max_retries` is dropped and passed
to `on_error`. `properties["amount"]` (a number) powers the dashboard's revenue metrics.
