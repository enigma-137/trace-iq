package traceiq

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

// Errors returned by the client. Delivery failures are reported through OnError
// instead, because Capture does not wait for the network.
var (
	ErrClosed       = errors.New("traceiq: client is closed")
	ErrQueueFull    = errors.New("traceiq: queue is full; event dropped")
	ErrInvalidEvent = errors.New("traceiq: invalid event")
	ErrRejected     = errors.New("traceiq: request rejected")
)

type config struct {
	endpoint      string
	flushAt       int
	flushInterval time.Duration
	maxRetries    int
	timeout       time.Duration
	debug         bool
	onError       func(error)
	release       string
	queueSize     int
	httpClient    *http.Client
	retryBackoff  func(attempt int) time.Duration
}

func defaultConfig() config {
	return config{
		endpoint:      "http://localhost:4000",
		flushAt:       20,
		flushInterval: 10 * time.Second,
		maxRetries:    3,
		timeout:       10 * time.Second,
		queueSize:     10_000,
		release:       os.Getenv("TRACEIQ_RELEASE"),
		retryBackoff:  defaultRetryBackoff,
	}
}

// Option configures a Client.
type Option func(*config)

// WithEndpoint sets the TraceIQ API base URL. The default is http://localhost:4000.
func WithEndpoint(endpoint string) Option {
	return func(c *config) { c.endpoint = endpoint }
}

// WithFlushAt flushes once this many events are queued. The default is 20.
func WithFlushAt(n int) Option {
	return func(c *config) { c.flushAt = n }
}

// WithFlushInterval flushes on a timer. The default is 10 seconds. Zero disables
// the timer; events then flush by size, Flush, or Shutdown.
func WithFlushInterval(d time.Duration) Option {
	return func(c *config) { c.flushInterval = d }
}

// WithMaxRetries sets retries after the first failed attempt. The default is 3.
func WithMaxRetries(n int) Option {
	return func(c *config) { c.maxRetries = n }
}

// WithTimeout sets the per-request timeout. The default is 10 seconds.
func WithTimeout(d time.Duration) Option {
	return func(c *config) { c.timeout = d }
}

// WithDebug logs delivery warnings to the standard logger.
func WithDebug(enabled bool) Option {
	return func(c *config) { c.debug = enabled }
}

// WithOnError receives delivery failures: dropped batches, rejected events, and
// a full queue. Callbacks are serialized on their own goroutine, may run after
// Capture returns, and are waited for by Shutdown. Do not call Shutdown from a
// callback; Flush is safe. Concurrent and recursive reports may be coalesced.
func WithOnError(fn func(error)) Option {
	return func(c *config) { c.onError = fn }
}

// WithRelease stamps every event's context with the running release, such as a
// git SHA or version. It defaults to the TRACEIQ_RELEASE environment variable.
func WithRelease(release string) Option {
	return func(c *config) { c.release = release }
}

// WithQueueSize bounds the in-memory queue. The default is 10,000 events. A full
// queue drops the newest event and reports ErrQueueFull.
func WithQueueSize(n int) Option {
	return func(c *config) { c.queueSize = n }
}

// WithHTTPClient uses a custom HTTP client. The client's own Timeout is not
// changed; WithTimeout still applies per request.
func WithHTTPClient(client *http.Client) Option {
	return func(c *config) { c.httpClient = client }
}

type flushRequest struct {
	ctx  context.Context
	done chan error
}

// Client queues events and delivers them in batches from a background goroutine.
// It is safe for concurrent use.
type Client struct {
	projectID  string
	writeKey   string
	config     config
	httpClient *http.Client

	queue   chan json.RawMessage
	flushCh chan flushRequest
	stopCh  chan struct{}
	done    chan struct{}

	mu     sync.RWMutex
	closed bool

	// Error callbacks run off the worker so a slow callback cannot stall delivery.
	// errMu guards callback registration and Shutdown's wait; callbackMu serializes
	// the callbacks themselves and makes recursive reports cheap to drop.
	errMu      sync.Mutex
	errClosed  bool
	callbackMu sync.Mutex
	errWG      sync.WaitGroup
}

// New creates a client and starts its background worker.
func New(projectID, writeKey string, opts ...Option) (*Client, error) {
	cfg := defaultConfig()
	for _, opt := range opts {
		if opt != nil {
			opt(&cfg)
		}
	}
	cfg.endpoint = strings.TrimRight(strings.TrimSpace(cfg.endpoint), "/")
	if cfg.httpClient == nil {
		cfg.httpClient = &http.Client{}
	}
	if cfg.retryBackoff == nil {
		cfg.retryBackoff = defaultRetryBackoff
	}
	projectID = strings.TrimSpace(projectID)
	writeKey = strings.TrimSpace(writeKey)
	if err := validateConfig(projectID, writeKey, cfg); err != nil {
		return nil, err
	}

	client := &Client{
		projectID:  projectID,
		writeKey:   writeKey,
		config:     cfg,
		httpClient: cfg.httpClient,
		queue:      make(chan json.RawMessage, cfg.queueSize),
		flushCh:    make(chan flushRequest),
		stopCh:     make(chan struct{}),
		done:       make(chan struct{}),
	}
	go client.run()
	return client, nil
}

func validateConfig(projectID, writeKey string, cfg config) error {
	if projectID == "" {
		return errors.New("traceiq: project id is required")
	}
	if writeKey == "" {
		return errors.New("traceiq: write key is required")
	}
	parsed, err := url.Parse(cfg.endpoint)
	if err != nil {
		return fmt.Errorf("traceiq: invalid endpoint: %w", err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return errors.New("traceiq: endpoint must use http or https")
	}
	if parsed.Host == "" {
		return errors.New("traceiq: endpoint must include a host")
	}
	if cfg.flushAt <= 0 {
		return errors.New("traceiq: flushAt must be greater than zero")
	}
	if cfg.flushInterval < 0 {
		return errors.New("traceiq: flushInterval cannot be negative")
	}
	if cfg.maxRetries < 0 {
		return errors.New("traceiq: maxRetries cannot be negative")
	}
	if cfg.timeout <= 0 {
		return errors.New("traceiq: timeout must be greater than zero")
	}
	if cfg.queueSize <= 0 {
		return errors.New("traceiq: queueSize must be greater than zero")
	}
	return nil
}

// Capture queues an event. It returns an error only for invalid input, a closed
// client, or properties that cannot be encoded. Network failures are reported
// through OnError.
func (c *Client) Capture(ctx context.Context, event Event) error {
	if ctx == nil {
		return fmt.Errorf("%w: nil context", ErrInvalidEvent)
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if strings.TrimSpace(event.Name) == "" {
		return fmt.Errorf("%w: event name is required", ErrInvalidEvent)
	}
	raw, err := c.marshalEvent(event)
	if err != nil {
		return err
	}
	return c.enqueue(raw)
}

// Identify creates or updates a user profile. Traits are stored on the $identify
// event, not fetched from TraceIQ.
func (c *Client) Identify(ctx context.Context, userID string, traits map[string]any) error {
	if strings.TrimSpace(userID) == "" {
		return fmt.Errorf("%w: user id is required", ErrInvalidEvent)
	}
	if traits == nil {
		traits = map[string]any{}
	}
	return c.Capture(ctx, Event{
		Name:       "$identify",
		UserID:     userID,
		Properties: map[string]any{"traits": traits},
	})
}

// ErrorOptions adds context to CaptureError.
type ErrorOptions struct {
	// Unhandled marks an error the application did not handle. The zero value
	// means handled, which is the common case for a manual CaptureError call.
	Unhandled   bool
	UserID      string
	AnonymousID string
	SessionID   string
	Properties  map[string]any
	Context     map[string]any
	Timestamp   time.Time
	// Stack overrides the stack captured at the call site.
	Stack string
}

// CaptureError reports err as a $exception event. The stack is captured from the
// caller and omits TraceIQ's own frames.
func (c *Client) CaptureError(ctx context.Context, err error, opts ErrorOptions) error {
	if err == nil {
		return fmt.Errorf("%w: error is required", ErrInvalidEvent)
	}
	stack := opts.Stack
	if stack == "" {
		stack = captureStack(1)
	}
	properties := make(map[string]any, len(opts.Properties)+4)
	for key, value := range opts.Properties {
		properties[key] = value
	}
	properties["type"] = errorType(err)
	properties["message"] = err.Error()
	properties["stack"] = stack
	properties["handled"] = !opts.Unhandled

	return c.Capture(ctx, Event{
		Name:        "$exception",
		UserID:      opts.UserID,
		AnonymousID: opts.AnonymousID,
		SessionID:   opts.SessionID,
		Properties:  properties,
		Context:     opts.Context,
		Timestamp:   opts.Timestamp,
	})
}

// Flush sends everything queued now and waits for the result.
func (c *Client) Flush(ctx context.Context) error {
	if ctx == nil {
		return fmt.Errorf("%w: nil context", ErrInvalidEvent)
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if c.isClosed() {
		select {
		case <-c.done:
			return nil
		case <-ctx.Done():
			return ctx.Err()
		}
	}

	req := flushRequest{ctx: ctx, done: make(chan error, 1)}
	select {
	case c.flushCh <- req:
	case <-ctx.Done():
		return ctx.Err()
	case <-c.done:
		return ErrClosed
	}

	select {
	case err := <-req.done:
		return err
	case <-ctx.Done():
		return ctx.Err()
	case <-c.done:
		select {
		case err := <-req.done:
			return err
		default:
			return nil
		}
	}
}

// Shutdown stops new captures, flushes queued events, and stops the worker. It is
// safe to call more than once. The context bounds how long the caller waits.
func (c *Client) Shutdown(ctx context.Context) error {
	if ctx == nil {
		return fmt.Errorf("%w: nil context", ErrInvalidEvent)
	}
	c.mu.Lock()
	if !c.closed {
		c.closed = true
		close(c.stopCh)
	}
	c.mu.Unlock()

	select {
	case <-c.done:
	case <-ctx.Done():
		return ctx.Err()
	}

	// Stop registering new callbacks only after the worker has reported everything
	// it drained, so delivery failures during shutdown are not lost.
	c.errMu.Lock()
	c.errClosed = true
	c.errMu.Unlock()

	// Wait for callbacks that were already registered. Callbacks run on their own
	// goroutine, so they can safely call Flush while this wait is in progress.
	callbacksDone := make(chan struct{})
	go func() {
		c.errWG.Wait()
		close(callbacksDone)
	}()
	select {
	case <-callbacksDone:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (c *Client) isClosed() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.closed
}

func (c *Client) enqueue(raw json.RawMessage) error {
	c.mu.RLock()
	if c.closed {
		c.mu.RUnlock()
		return ErrClosed
	}
	select {
	case c.queue <- raw:
		c.mu.RUnlock()
		return nil
	default:
		c.mu.RUnlock()
		c.reportError(ErrQueueFull)
		return nil
	}
}

func (c *Client) run() {
	defer close(c.done)
	defer func() {
		if recovered := recover(); recovered != nil {
			c.reportError(fmt.Errorf("traceiq: worker panic: %v", recovered))
		}
	}()

	var ticker *time.Ticker
	var ticks <-chan time.Time
	if c.config.flushInterval > 0 {
		ticker = time.NewTicker(c.config.flushInterval)
		ticks = ticker.C
		defer ticker.Stop()
	}

	capacity := c.config.flushAt
	if capacity > 1024 {
		capacity = 1024
	}
	batch := make([]json.RawMessage, 0, capacity)
	for {
		select {
		case raw := <-c.queue:
			batch = append(batch, raw)
			if len(batch) >= c.config.flushAt {
				c.sendAndReport(context.Background(), batch)
				batch = batch[:0]
			}
		case <-ticks:
			if len(batch) > 0 {
				c.sendAndReport(context.Background(), batch)
				batch = batch[:0]
			}
		case req := <-c.flushCh:
			batch = append(batch, c.drainQueue()...)
			err := c.sendBatch(req.ctx, batch)
			batch = batch[:0]
			req.done <- err
		case <-c.stopCh:
			batch = append(batch, c.drainQueue()...)
			if len(batch) > 0 {
				c.sendAndReport(context.Background(), batch)
			}
			return
		}
	}
}

func (c *Client) drainQueue() []json.RawMessage {
	var drained []json.RawMessage
	for {
		select {
		case raw := <-c.queue:
			drained = append(drained, raw)
		default:
			return drained
		}
	}
}

func (c *Client) sendAndReport(ctx context.Context, batch []json.RawMessage) {
	if err := c.sendBatch(ctx, batch); err != nil {
		c.reportError(err)
	}
}

func (c *Client) reportError(err error) {
	if err == nil {
		return
	}
	if c.config.debug {
		log.Printf("[traceiq] %v", err)
	}
	if c.config.onError == nil {
		return
	}

	c.errMu.Lock()
	if c.errClosed || !c.callbackMu.TryLock() {
		c.errMu.Unlock()
		return // closed client, or a callback reporting from inside a callback
	}
	c.errWG.Add(1)
	c.errMu.Unlock()

	go func() {
		defer c.errWG.Done()
		defer c.callbackMu.Unlock()
		defer func() {
			_ = recover()
		}()
		c.config.onError(err)
	}()
}
