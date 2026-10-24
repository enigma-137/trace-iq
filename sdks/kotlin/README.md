# TraceIQ (Kotlin / Android)

TraceIQ SDK for Kotlin — JVM servers and Android (API 21+). No third-party
dependencies (uses `HttpURLConnection` + a tiny built-in JSON encoder), so the same
source compiles for backend services and Android apps. Events are queued and flushed
in batches on a background thread.

## Install

Publish to your Maven repo (or copy the source). Gradle:

```kotlin
dependencies {
    implementation("com.traceiq:traceiq:0.1.0")
}
```

## Quickstart

```kotlin
import com.traceiq.TraceIQ
import com.traceiq.TraceIQConfig

val traceiq = TraceIQ(
    TraceIQConfig(
        projectId = "YOUR_PROJECT_ID",
        writeKey = "YOUR_WRITE_KEY",
        endpoint = "https://your-traceiq-api.example.com", // defaults to http://localhost:4000
    )
)

traceiq.identify("user_123", traits = mapOf("kyc_tier" to 2))

traceiq.capture(
    "transfer_started",
    userId = "user_123",
    properties = mapOf("amount" to 5000, "currency" to "NGN"),
)

traceiq.shutdown() // flush before a short-lived process exits
```

On Android, remember `<uses-permission android:name="android.permission.INTERNET" />`.

## API

| Method | Purpose |
| --- | --- |
| `capture(event, userId?, anonymousId?, properties?, timestamp?)` | Track an event. |
| `identify(userId, traits?)` | Create/update a user profile. |
| `group(organizationId, userId?, traits?)` | Associate a user with an account. |
| `log(level, message, userId?, metadata?, error?)` | Send a structured line to Logs. `level` is `debug`, `info`, `warn`, `error` or `fatal`; `error` attaches a throwable's class, message and stack. Lines flush with events. |
| `flush()` | Send everything queued now (async). |
| `shutdown()` | Flush and stop the worker. |

## Behavior

`TraceIQConfig` also takes `serviceName` (default `"server"`) and `environment`
(default `"production"`), stamped on log lines.

Events flush by size (`flushAt`), on a timer (`flushIntervalMs`), or manually. Batches
that fail after `maxRetries` (exponential backoff) are dropped and passed to `onError`.
Numeric `amount` properties power the dashboard's revenue metrics. Delivery is
at-most-once; a persistent on-disk queue is a planned enhancement.
