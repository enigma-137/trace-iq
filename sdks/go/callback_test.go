package traceiq

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestOnErrorCallbacksAreSerialized(t *testing.T) {
	var count int // deliberately unsynchronized: a serialized callback cannot race
	called := make(chan struct{})
	var once sync.Once
	client := &Client{
		queue: make(chan json.RawMessage, 1),
		config: config{onError: func(error) {
			count++
			once.Do(func() { close(called) })
		}},
	}
	client.queue <- json.RawMessage(`{}`)

	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = client.enqueue(json.RawMessage(`{}`))
		}()
	}
	wg.Wait()
	select {
	case <-called:
	case <-time.After(time.Second):
		t.Fatal("OnError was not called")
	}
}

func TestOnErrorCallbackDoesNotRecurse(t *testing.T) {
	var calls atomic.Int32
	client := &Client{queue: make(chan json.RawMessage, 1)}
	client.config.onError = func(error) {
		if calls.Add(1) >= 5 {
			return
		}
		_ = client.enqueue(json.RawMessage(`{}`))
	}
	client.queue <- json.RawMessage(`{}`)
	_ = client.enqueue(json.RawMessage(`{}`))

	if got := calls.Load(); got > 1 {
		t.Errorf("one enqueue produced %d OnError calls (recursive reporting)", got)
	}
}

func TestFlushFromOnErrorWorks(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = io.WriteString(w, `{"message":"bad"}`)
	}))
	defer server.Close()

	var callbackErr error
	var client *Client
	client, err := New("proj", "key", WithEndpoint(server.URL), WithFlushAt(1), WithOnError(func(error) {
		ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
		defer cancel()
		callbackErr = client.Flush(ctx)
	}))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if err := client.Capture(context.Background(), Event{Name: "event"}); err != nil {
		t.Fatalf("Capture: %v", err)
	}
	if err := client.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}
	if callbackErr != nil {
		t.Errorf("Flush from OnError returned %v, want nil", callbackErr)
	}
}
