package traceiq

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type batchPayload struct {
	ProjectID string           `json:"projectId"`
	Batch     []map[string]any `json:"batch"`
}

func readBatch(t *testing.T, r *http.Request) batchPayload {
	t.Helper()
	var body batchPayload
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		t.Errorf("decode batch: %v", err)
	}
	return body
}

func writeAccepted(w http.ResponseWriter) {
	w.WriteHeader(http.StatusAccepted)
	_, _ = io.WriteString(w, `{"accepted":true}`)
}

func newTestClient(t *testing.T, endpoint string, opts ...Option) *Client {
	t.Helper()
	base := []Option{
		WithEndpoint(endpoint),
		WithFlushInterval(time.Hour),
	}
	client, err := New("proj_test", "trq_test", append(base, opts...)...)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = client.Shutdown(ctx)
	})
	return client
}

func TestShutdownFlushesQueuedEventsAsOneBatch(t *testing.T) {
	var mu sync.Mutex
	var requests []batchPayload
	var keys []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/events/batch" {
			t.Errorf("path = %q, want /v1/events/batch", r.URL.Path)
		}
		mu.Lock()
		keys = append(keys, r.Header.Get("x-traceiq-write-key"))
		mu.Unlock()
		mu.Lock()
		requests = append(requests, readBatch(t, r))
		mu.Unlock()
		writeAccepted(w)
	}))
	defer server.Close()

	client := newTestClient(t, server.URL)
	ctx := context.Background()
	if err := client.Capture(ctx, Event{
		Name:       "payout_succeeded",
		UserID:     "user_1",
		Properties: map[string]any{"amount": 500},
	}); err != nil {
		t.Fatalf("Capture: %v", err)
	}
	if err := client.Identify(ctx, "user_1", map[string]any{"plan": "pro"}); err != nil {
		t.Fatalf("Identify: %v", err)
	}
	if err := client.Shutdown(ctx); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}

	mu.Lock()
	defer mu.Unlock()
	if len(requests) != 1 {
		t.Fatalf("requests = %d, want 1", len(requests))
	}
	if keys[0] != "trq_test" {
		t.Errorf("write key = %q, want trq_test", keys[0])
	}
	if requests[0].ProjectID != "proj_test" {
		t.Errorf("projectId = %q, want proj_test", requests[0].ProjectID)
	}
	if len(requests[0].Batch) != 2 {
		t.Fatalf("batch length = %d, want 2", len(requests[0].Batch))
	}
	if got := requests[0].Batch[0]["eventName"]; got != "payout_succeeded" {
		t.Errorf("first event = %v, want payout_succeeded", got)
	}
	if got := requests[0].Batch[0]["properties"].(map[string]any)["amount"]; got != float64(500) {
		t.Errorf("amount = %v, want 500", got)
	}
	if got := requests[0].Batch[1]["eventName"]; got != "$identify" {
		t.Errorf("second event = %v, want $identify", got)
	}
	if got := requests[0].Batch[1]["properties"].(map[string]any)["traits"].(map[string]any)["plan"]; got != "pro" {
		t.Errorf("identify plan = %v, want pro", got)
	}
}

func TestCaptureErrorPayload(t *testing.T) {
	var got batchPayload
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = readBatch(t, r)
		writeAccepted(w)
	}))
	defer server.Close()

	client := newTestClient(t, server.URL)
	ctx := context.Background()
	if err := client.CaptureError(ctx, errors.New("boom"), ErrorOptions{
		Unhandled:  true,
		Properties: map[string]any{"route": "/pay"},
	}); err != nil {
		t.Fatalf("CaptureError: %v", err)
	}
	if err := client.Shutdown(ctx); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}

	if len(got.Batch) != 1 {
		t.Fatalf("batch length = %d, want 1", len(got.Batch))
	}
	event := got.Batch[0]
	if event["eventName"] != "$exception" {
		t.Errorf("eventName = %v, want $exception", event["eventName"])
	}
	props := event["properties"].(map[string]any)
	if props["type"] != "Error" {
		t.Errorf("type = %v, want Error", props["type"])
	}
	if props["message"] != "boom" {
		t.Errorf("message = %v, want boom", props["message"])
	}
	if props["handled"] != false {
		t.Errorf("handled = %v, want false", props["handled"])
	}
	if props["route"] != "/pay" {
		t.Errorf("route = %v, want /pay", props["route"])
	}
	stack, _ := props["stack"].(string)
	if !strings.Contains(stack, "TestCaptureErrorPayload") {
		t.Errorf("stack does not contain the caller:\n%s", stack)
	}
	if strings.Contains(stack, "(*Client).CaptureError") {
		t.Errorf("stack contains SDK frames:\n%s", stack)
	}
}

func TestCaptureErrorUsesCustomTypeName(t *testing.T) {
	var got batchPayload
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = readBatch(t, r)
		writeAccepted(w)
	}))
	defer server.Close()

	client := newTestClient(t, server.URL)
	if err := client.CaptureError(context.Background(), paymentError{}, ErrorOptions{}); err != nil {
		t.Fatalf("CaptureError: %v", err)
	}
	if err := client.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}
	if got.Batch[0]["properties"].(map[string]any)["type"] != "paymentError" {
		t.Errorf("type = %v, want paymentError", got.Batch[0]["properties"].(map[string]any)["type"])
	}
}

type paymentError struct{}

func (paymentError) Error() string { return "declined" }

func TestRetryOn5xx(t *testing.T) {
	var attempts atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if attempts.Add(1) < 3 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		writeAccepted(w)
	}))
	defer server.Close()

	client := newTestClient(t, server.URL, WithMaxRetries(2), WithFlushAt(1))
	client.config.retryBackoff = func(int) time.Duration { return 0 }
	if err := client.Capture(context.Background(), Event{Name: "retry_me"}); err != nil {
		t.Fatalf("Capture: %v", err)
	}
	if err := client.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}
	if got := attempts.Load(); got != 3 {
		t.Errorf("attempts = %d, want 3", got)
	}
}

func TestNoRetryOn4xx(t *testing.T) {
	var attempts atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts.Add(1)
		w.WriteHeader(http.StatusBadRequest)
		_, _ = io.WriteString(w, `{"message":"bad event"}`)
	}))
	defer server.Close()

	var mu sync.Mutex
	var reported []error
	client := newTestClient(t, server.URL, WithMaxRetries(3), WithOnError(func(err error) {
		mu.Lock()
		reported = append(reported, err)
		mu.Unlock()
	}))
	client.config.retryBackoff = func(int) time.Duration { return 0 }
	if err := client.Capture(context.Background(), Event{Name: "bad"}); err != nil {
		t.Fatalf("Capture: %v", err)
	}
	if err := client.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}

	if got := attempts.Load(); got != 1 {
		t.Errorf("attempts = %d, want 1", got)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(reported) != 1 {
		t.Fatalf("reported errors = %d, want 1", len(reported))
	}
	if !errors.Is(reported[0], ErrRejected) {
		t.Errorf("error = %v, want ErrRejected", reported[0])
	}
}

func TestBatchSplitsAt500(t *testing.T) {
	var mu sync.Mutex
	var sizes []int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := readBatch(t, r)
		mu.Lock()
		sizes = append(sizes, len(body.Batch))
		mu.Unlock()
		writeAccepted(w)
	}))
	defer server.Close()

	client := newTestClient(t, server.URL, WithFlushAt(1000), WithQueueSize(2000))
	for i := 0; i < 501; i++ {
		if err := client.Capture(context.Background(), Event{Name: "event"}); err != nil {
			t.Fatalf("Capture %d: %v", i, err)
		}
	}
	if err := client.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}

	mu.Lock()
	defer mu.Unlock()
	if len(sizes) != 2 {
		t.Fatalf("requests = %d, want 2", len(sizes))
	}
	sort.Ints(sizes)
	if sizes[0] != 1 || sizes[1] != 500 {
		t.Errorf("batch sizes = %v, want [1 500]", sizes)
	}
}

func TestQueueFullReportsError(t *testing.T) {
	var got error
	client := &Client{
		queue: make(chan json.RawMessage, 1),
		config: config{
			onError: func(err error) { got = err },
		},
	}
	client.queue <- json.RawMessage(`{"eventName":"first"}`)
	if err := client.enqueue(json.RawMessage(`{"eventName":"second"}`)); err != nil {
		t.Fatalf("enqueue: %v", err)
	}
	if !errors.Is(got, ErrQueueFull) {
		t.Errorf("error = %v, want ErrQueueFull", got)
	}
}

func TestShutdownIsIdempotent(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeAccepted(w)
	}))
	defer server.Close()

	client := newTestClient(t, server.URL)
	if err := client.Capture(context.Background(), Event{Name: "event"}); err != nil {
		t.Fatalf("Capture: %v", err)
	}
	if err := client.Shutdown(context.Background()); err != nil {
		t.Fatalf("first Shutdown: %v", err)
	}
	if err := client.Shutdown(context.Background()); err != nil {
		t.Fatalf("second Shutdown: %v", err)
	}
}

func TestCaptureAfterShutdownReturnsErrClosed(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeAccepted(w)
	}))
	defer server.Close()

	client := newTestClient(t, server.URL)
	if err := client.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}
	err := client.Capture(context.Background(), Event{Name: "late"})
	if !errors.Is(err, ErrClosed) {
		t.Errorf("error = %v, want ErrClosed", err)
	}
}

func TestShutdownRespectsContext(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	var once sync.Once
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		once.Do(func() { close(started) })
		<-release
		writeAccepted(w)
	}))
	defer server.Close()

	client := newTestClient(t, server.URL, WithFlushAt(1), WithTimeout(5*time.Second))
	if err := client.Capture(context.Background(), Event{Name: "slow"}); err != nil {
		t.Fatalf("Capture: %v", err)
	}
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("request did not start")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if err := client.Shutdown(ctx); !errors.Is(err, context.DeadlineExceeded) {
		t.Errorf("Shutdown error = %v, want context.DeadlineExceeded", err)
	}

	close(release)
	if err := client.Shutdown(context.Background()); err != nil {
		t.Errorf("second Shutdown: %v", err)
	}
}

func TestConcurrentCapture(t *testing.T) {
	var count atomic.Int64
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := readBatch(t, r)
		count.Add(int64(len(body.Batch)))
		writeAccepted(w)
	}))
	defer server.Close()

	client := newTestClient(t, server.URL, WithFlushAt(100), WithQueueSize(20000))
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				if err := client.Capture(context.Background(), Event{Name: "event"}); err != nil {
					t.Errorf("Capture: %v", err)
				}
			}
		}()
	}
	wg.Wait()
	if err := client.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}
	if got := count.Load(); got != 10000 {
		t.Errorf("events = %d, want 10000", got)
	}
}

func TestReleaseIsStampedInContext(t *testing.T) {
	var got batchPayload
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = readBatch(t, r)
		writeAccepted(w)
	}))
	defer server.Close()

	client := newTestClient(t, server.URL, WithRelease("sha-123"))
	ctx := map[string]any{"route": "/checkout"}
	if err := client.Capture(context.Background(), Event{Name: "event", Context: ctx}); err != nil {
		t.Fatalf("Capture: %v", err)
	}
	if err := client.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}
	eventCtx := got.Batch[0]["context"].(map[string]any)
	if eventCtx["release"] != "sha-123" {
		t.Errorf("release = %v, want sha-123", eventCtx["release"])
	}
	if eventCtx["route"] != "/checkout" {
		t.Errorf("route = %v, want /checkout", eventCtx["route"])
	}
	if _, ok := ctx["release"]; ok {
		t.Error("Capture mutated the caller's context map")
	}
}

func TestPartialBatchFailureIsReported(t *testing.T) {
	var attempts atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts.Add(1)
		w.WriteHeader(http.StatusAccepted)
		_, _ = io.WriteString(w, `{"accepted":true,"results":[{"accepted":true},{"accepted":false,"error":"bad event"}]}`)
	}))
	defer server.Close()

	var mu sync.Mutex
	var reported []error
	client := newTestClient(t, server.URL, WithOnError(func(err error) {
		mu.Lock()
		reported = append(reported, err)
		mu.Unlock()
	}))
	for i := 0; i < 2; i++ {
		if err := client.Capture(context.Background(), Event{Name: "event"}); err != nil {
			t.Fatalf("Capture: %v", err)
		}
	}
	if err := client.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}

	if got := attempts.Load(); got != 1 {
		t.Errorf("attempts = %d, want 1", got)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(reported) != 1 {
		t.Fatalf("reported errors = %d, want 1", len(reported))
	}
	if !strings.Contains(reported[0].Error(), "bad event") {
		t.Errorf("error = %v, want it to contain bad event", reported[0])
	}
}

func TestFlushSendsQueuedEvents(t *testing.T) {
	var count atomic.Int64
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := readBatch(t, r)
		count.Add(int64(len(body.Batch)))
		writeAccepted(w)
	}))
	defer server.Close()

	client := newTestClient(t, server.URL, WithFlushAt(100))
	for i := 0; i < 3; i++ {
		if err := client.Capture(context.Background(), Event{Name: "event"}); err != nil {
			t.Fatalf("Capture: %v", err)
		}
	}
	if err := client.Flush(context.Background()); err != nil {
		t.Fatalf("Flush: %v", err)
	}
	if got := count.Load(); got != 3 {
		t.Errorf("events = %d, want 3", got)
	}
}

func TestInvalidConfig(t *testing.T) {
	tests := []struct {
		name      string
		projectID string
		writeKey  string
		opts      []Option
	}{
		{name: "missing project", projectID: "", writeKey: "key"},
		{name: "missing write key", projectID: "proj", writeKey: ""},
		{name: "bad endpoint", projectID: "proj", writeKey: "key", opts: []Option{WithEndpoint("://bad")}},
		{name: "zero flush at", projectID: "proj", writeKey: "key", opts: []Option{WithFlushAt(0)}},
		{name: "negative flush interval", projectID: "proj", writeKey: "key", opts: []Option{WithFlushInterval(-time.Second)}},
		{name: "negative retries", projectID: "proj", writeKey: "key", opts: []Option{WithMaxRetries(-1)}},
		{name: "zero timeout", projectID: "proj", writeKey: "key", opts: []Option{WithTimeout(0)}},
		{name: "zero queue", projectID: "proj", writeKey: "key", opts: []Option{WithQueueSize(0)}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := New(tt.projectID, tt.writeKey, tt.opts...); err == nil {
				t.Fatal("New returned nil error")
			}
		})
	}
}

func TestCaptureRejectsInvalidInput(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeAccepted(w)
	}))
	defer server.Close()

	client := newTestClient(t, server.URL)
	if err := client.Capture(nil, Event{Name: "event"}); err == nil {
		t.Error("nil context should fail")
	}
	if err := client.Capture(context.Background(), Event{}); !errors.Is(err, ErrInvalidEvent) {
		t.Errorf("empty event error = %v, want ErrInvalidEvent", err)
	}
	if err := client.Identify(context.Background(), "", nil); !errors.Is(err, ErrInvalidEvent) {
		t.Errorf("empty user id error = %v, want ErrInvalidEvent", err)
	}
	if err := client.CaptureError(context.Background(), nil, ErrorOptions{}); !errors.Is(err, ErrInvalidEvent) {
		t.Errorf("nil error = %v, want ErrInvalidEvent", err)
	}
}

func TestTimestampFormat(t *testing.T) {
	var got batchPayload
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = readBatch(t, r)
		writeAccepted(w)
	}))
	defer server.Close()

	client := newTestClient(t, server.URL)
	want := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	if err := client.Capture(context.Background(), Event{Name: "event", Timestamp: want}); err != nil {
		t.Fatalf("Capture: %v", err)
	}
	if err := client.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}
	if got.Batch[0]["timestamp"] != "2026-01-02T03:04:05Z" {
		t.Errorf("timestamp = %v, want 2026-01-02T03:04:05Z", got.Batch[0]["timestamp"])
	}
}

func TestUnsupportedPropertyReturnsError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeAccepted(w)
	}))
	defer server.Close()

	client := newTestClient(t, server.URL)
	err := client.Capture(context.Background(), Event{
		Name:       "event",
		Properties: map[string]any{"bad": make(chan int)},
	})
	if err == nil {
		t.Fatal("Capture should fail on unsupported property")
	}
}

func TestPropertiesAreSnapshottedAtCapture(t *testing.T) {
	var got batchPayload
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = readBatch(t, r)
		writeAccepted(w)
	}))
	defer server.Close()

	client := newTestClient(t, server.URL)
	properties := map[string]any{"status": "pending"}
	if err := client.Capture(context.Background(), Event{Name: "event", Properties: properties}); err != nil {
		t.Fatalf("Capture: %v", err)
	}
	properties["status"] = "changed"
	if err := client.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}

	props := got.Batch[0]["properties"].(map[string]any)
	if props["status"] != "pending" {
		t.Errorf("status = %v, want pending", props["status"])
	}
}

func TestOnErrorPanicDoesNotStopWorker(t *testing.T) {
	var attempts atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts.Add(1)
		w.WriteHeader(http.StatusBadRequest)
	}))
	defer server.Close()

	panicked := false
	client := newTestClient(t, server.URL, WithFlushAt(1), WithOnError(func(error) {
		panicked = true
		panic("callback failed")
	}))
	for i := 0; i < 2; i++ {
		if err := client.Capture(context.Background(), Event{Name: "event"}); err != nil {
			t.Fatalf("Capture: %v", err)
		}
	}
	if err := client.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}
	if !panicked {
		t.Error("OnError was not called")
	}
	if got := attempts.Load(); got != 2 {
		t.Errorf("attempts = %d, want 2", got)
	}
}

func TestParseRetryAfter(t *testing.T) {
	tests := []struct {
		value string
		want  time.Duration
	}{
		{value: "", want: 0},
		{value: "2", want: 2 * time.Second},
		{value: "-1", want: 0},
		{value: "nonsense", want: 0},
		{value: time.Now().Add(time.Hour).UTC().Format(http.TimeFormat), want: time.Hour},
	}
	for _, tt := range tests {
		got := parseRetryAfter(tt.value)
		if tt.want == 0 {
			if got != 0 {
				t.Errorf("parseRetryAfter(%q) = %v, want 0", tt.value, got)
			}
			continue
		}
		// The HTTP date has second precision, so allow a small drift.
		if got < tt.want-2*time.Second || got > tt.want {
			t.Errorf("parseRetryAfter(%q) = %v, want about %v", tt.value, got, tt.want)
		}
	}
}

func ExampleClient() {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeAccepted(w)
	}))
	defer server.Close()

	client, err := New("proj_123", "trq_123", WithEndpoint(server.URL))
	if err != nil {
		panic(err)
	}
	defer client.Shutdown(context.Background())

	err = client.Capture(context.Background(), Event{
		Name:       "signup_completed",
		UserID:     "user_123",
		Properties: map[string]any{"plan": "starter"},
	})
	fmt.Println(err)
	// Output: <nil>
}
