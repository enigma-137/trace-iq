# traceiq (Go)

Server-side TraceIQ SDK for Go 1.22+. Standard library only. Events are queued and
flushed in batches by a background goroutine, so request handlers never wait on the
network.

## Install

```bash
go get github.com/enigma-137/trace-iq/sdks/go
```

The package name is `traceiq`.

## Quickstart

```go
package main

import (
	"context"
	"log"

	traceiq "github.com/enigma-137/trace-iq/sdks/go"
)

func main() {
	client, err := traceiq.New(
		"YOUR_PROJECT_ID",
		"YOUR_WRITE_KEY", // keep server write keys secret
		traceiq.WithEndpoint("https://api.traceiq.run"),
		traceiq.WithRelease("1.4.0"),
	)
	if err != nil {
		log.Fatal(err)
	}
	defer client.Shutdown(context.Background())

	ctx := context.Background()

	err = client.Capture(ctx, traceiq.Event{
		Name:       "payout_succeeded",
		UserID:     "user_123",
		Properties: map[string]any{"amount": 50000, "currency": "NGN"},
	})
	if err != nil {
		log.Println(err)
	}

	err = client.Identify(ctx, "user_123", map[string]any{
		"email":    "a@b.com",
		"kyc_tier": 2,
	})
	if err != nil {
		log.Println(err)
	}
}
```

`Capture` only returns an error for invalid input, a closed client, or properties
that cannot be encoded. Network failures are reported through `WithOnError`.

## API

| Method | Purpose |
| --- | --- |
| `New(projectID, writeKey string, opts ...Option) (*Client, error)` | Create a client and start its worker. |
| `Capture(ctx context.Context, event Event) error` | Queue an event. |
| `Identify(ctx context.Context, userID string, traits map[string]any) error` | Create or update a user profile. |
| `CaptureError(ctx context.Context, err error, opts ErrorOptions) error` | Report an error as a `$exception` event. |
| `Flush(ctx context.Context) error` | Send everything queued now and wait. |
| `Shutdown(ctx context.Context) error` | Stop new captures, flush, and stop the worker. |

### Events

```go
client.Capture(ctx, traceiq.Event{
	Name:        "checkout_completed",
	UserID:      "user_123",
	AnonymousID: "anon_9",
	SessionID:   "sess_1",
	Properties:  map[string]any{"cart_value": 4200, "currency": "NGN"},
	Context:     map[string]any{"route": "/checkout"},
	Timestamp:   time.Now(),
})
```

`Properties["amount"]` (a number) powers the dashboard's revenue metrics. `Context`
is for SDK, app, campaign, or request metadata. `WithRelease` adds `context.release`
unless the event already has one.

### Errors

```go
if err := chargeCard(ctx); err != nil {
	_ = client.CaptureError(ctx, err, traceiq.ErrorOptions{
		Unhandled:  false,
		UserID:     "user_123",
		Properties: map[string]any{"provider": "stripe", "route": "/pay"},
	})
}
```

The SDK sends `type`, `message`, `stack`, and `handled`. The stack is captured from
the caller with `runtime.Callers`, so it does not include TraceIQ's own frames. Go
stacks are parsed by the TraceIQ API and grouped by function and file.

## net/http example

```go
package main

import (
	"context"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	traceiq "github.com/enigma-137/trace-iq/sdks/go"
)

func main() {
	client, err := traceiq.New("YOUR_PROJECT_ID", "YOUR_WRITE_KEY",
		traceiq.WithEndpoint("https://api.traceiq.run"),
	)
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /checkout", func(w http.ResponseWriter, r *http.Request) {
		userID := "user_123" // resolve from your session or auth middleware
		if err := checkout(r.Context()); err != nil {
			_ = client.CaptureError(r.Context(), err, traceiq.ErrorOptions{
				UserID:     userID,
				Properties: map[string]any{"route": "/checkout"},
			})
			http.Error(w, "checkout failed", http.StatusInternalServerError)
			return
		}
		_ = client.Capture(r.Context(), traceiq.Event{
			Name:   "checkout_completed",
			UserID: userID,
		})
		w.WriteHeader(http.StatusNoContent)
	})

	server := &http.Server{Addr: ":8080", Handler: mux}
	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	<-ctx.Done()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_ = server.Shutdown(shutdownCtx)
	if err := client.Shutdown(shutdownCtx); err != nil {
		log.Printf("traceiq shutdown: %v", err)
	}
}
```

The same pattern works with chi, gorilla/mux, Gin, Echo, and Fiber: pass
`r.Context()` to `Capture` and `CaptureError`, and call `Shutdown` after the HTTP
server has stopped.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `WithEndpoint` | `http://localhost:4000` | TraceIQ API base URL. |
| `WithFlushAt` | `20` | Flush once this many events are queued. |
| `WithFlushInterval` | `10s` | Timer flush. Set to `0` to disable it. |
| `WithMaxRetries` | `3` | Retries after the first failed attempt. |
| `WithTimeout` | `10s` | Per-request timeout. |
| `WithQueueSize` | `10000` | Bounded in-memory queue. |
| `WithRelease` | `TRACEIQ_RELEASE` | Stamped on every event as `context.release`. |
| `WithOnError` | none | Receives delivery failures and a full queue. Serialized; may be coalesced. |
| `WithDebug` | `false` | Log delivery warnings to the standard logger. |
| `WithHTTPClient` | none | Use a custom `*http.Client`. |

## Delivery behavior

- Flush at 20 events or every 10 seconds, whichever comes first.
- Requests are split at the API's 500-event batch limit.
- 429 and 5xx responses retry with exponential backoff and jitter. `Retry-After`
  is honored.
- Other 4xx responses are not retried. They are passed to `OnError`.
- A batch that exhausts retries is dropped and reported. Delivery is at-most-once.
- The queue is bounded. When it is full, the newest event is dropped and
  `ErrQueueFull` is reported.

## Notes

- Call `Shutdown` before the process exits. A `defer` in `main` is enough for a
  long-running server; serverless functions must call it explicitly.
- `Shutdown` stops new captures and flushes what is already queued. It is safe to
  call more than once.
- `Flush` and `Shutdown` respect the context deadline. The worker may still finish
  an in-flight request after the caller stops waiting.
- Keep the write key in an environment variable. It is never logged by the SDK.
- `Capture` serializes the event immediately, so mutating a properties map after
  the call cannot race with delivery.
- `OnError` callbacks run one at a time off the delivery worker, so a slow callback
  cannot stall events. `Shutdown` waits for callbacks that were already reported.
  A callback may call `Flush`, but must not call `Shutdown` (that would wait for
  itself). Reports that arrive while a callback is running may be dropped.

## License

MIT
