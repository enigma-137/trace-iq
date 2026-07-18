# TraceIQ (Swift)

TraceIQ SDK for Apple platforms (iOS 13+, macOS 10.15+) and server-side Swift.
Foundation-only, no dependencies. Events are queued and flushed in batches.

## Install (Swift Package Manager)

```swift
// Package.swift
dependencies: [
    .package(url: "https://github.com/your-org/traceiq-swift.git", from: "0.1.0")
]
```

Or in Xcode: **File → Add Packages…** and paste the repo URL.

## Quickstart

```swift
import TraceIQ

let traceiq = TraceIQ(config: .init(
    projectId: "YOUR_PROJECT_ID",
    writeKey: "YOUR_WRITE_KEY",
    endpoint: "https://your-traceiq-api.example.com" // defaults to http://localhost:4000
))

traceiq.identify(userId: "user_123", traits: ["kyc_tier": 2])

traceiq.capture("transfer_started", userId: "user_123", properties: [
    "amount": 5000,
    "currency": "NGN"
])

traceiq.shutdown() // flush before a short-lived process exits
```

## API

| Method | Purpose |
| --- | --- |
| `capture(_:userId:anonymousId:properties:timestamp:)` | Track an event. |
| `identify(userId:traits:)` | Create/update a user profile. |
| `group(organizationId:userId:traits:)` | Associate a user with an account. |
| `flush(completion:)` | Send everything queued now. |
| `shutdown()` | Stop the timer and flush (blocks briefly). |

## Behavior

Events flush by size (`flushAt`), on a timer (`flushInterval`), or manually. Batches
that fail after `maxRetries` (exponential backoff) are dropped. Numeric `amount`
properties power the dashboard's revenue metrics. Delivery is at-most-once; a
persistent on-disk queue is a planned enhancement.
