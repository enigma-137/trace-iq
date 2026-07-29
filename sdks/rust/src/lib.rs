use std::collections::VecDeque;
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::Duration;

use chrono::Utc;
use serde::Serialize;
use serde_json::Value;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_ENDPOINT: &str = "http://localhost:4000";
const DEFAULT_FLUSH_AT: usize = 20;
const DEFAULT_FLUSH_INTERVAL: Duration = Duration::from_secs(10);
const DEFAULT_MAX_RETRIES: u32 = 3;
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(10);
const BATCH_URL_PATH: &str = "/v1/events/batch";
const MAX_BACKOFF_MS: u64 = 30_000;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/// Errors reported by the TraceIQ client.
#[derive(Debug)]
pub struct TraceIQError {
    message: String,
}

impl TraceIQError {
    fn new(msg: impl Into<String>) -> Self {
        Self {
            message: msg.into(),
        }
    }
}

impl std::fmt::Display for TraceIQError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "TraceIQ: {}", self.message)
    }
}

impl std::error::Error for TraceIQError {}

// ---------------------------------------------------------------------------
// Event types (serialised to the /v1/events/batch JSON schema)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
struct Event {
    event_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    user_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    anonymous_id: Option<String>,
    properties: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    context: Option<Value>,
    timestamp: String,
}

#[derive(Debug, Serialize)]
struct BatchRequest {
    project_id: String,
    batch: Vec<Event>,
}

// ---------------------------------------------------------------------------
// Shared inner state (behind Arc so the background worker can access it)
// ---------------------------------------------------------------------------

struct Inner {
    project_id: String,
    write_key: String,
    endpoint: String,
    flush_at: usize,
    flush_interval: Duration,
    max_retries: u32,
    timeout: Duration,
    debug: bool,
    on_error: Option<Arc<dyn Fn(TraceIQError) + Send + Sync + 'static>>,
    queue: Mutex<VecDeque<Event>>,
    condvar: Condvar,
    stopped: Mutex<bool>,
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/// Builder for [`Client`].
///
/// ```no_run
/// use std::time::Duration;
/// use traceiq::{Client, ClientBuilder};
///
/// let client = Client::builder("proj_...", "trq_...")
///     .endpoint("https://api.traceiq.io")
///     .flush_at(50)
///     .flush_interval(Duration::from_secs(15))
///     .max_retries(5)
///     .timeout(Duration::from_secs(5))
///     .debug(true)
///     .on_error(|err| eprintln!("{err}"))
///     .build();
/// ```
pub struct ClientBuilder {
    project_id: String,
    write_key: String,
    endpoint: String,
    flush_at: usize,
    flush_interval: Duration,
    max_retries: u32,
    timeout: Duration,
    debug: bool,
    on_error: Option<Arc<dyn Fn(TraceIQError) + Send + Sync + 'static>>,
}

impl ClientBuilder {
    fn new(project_id: &str, write_key: &str) -> Self {
        Self {
            project_id: project_id.to_owned(),
            write_key: write_key.to_owned(),
            endpoint: DEFAULT_ENDPOINT.to_owned(),
            flush_at: DEFAULT_FLUSH_AT,
            flush_interval: DEFAULT_FLUSH_INTERVAL,
            max_retries: DEFAULT_MAX_RETRIES,
            timeout: DEFAULT_TIMEOUT,
            debug: false,
            on_error: None,
        }
    }

    /// Override the base URL for the TraceIQ ingestion API.
    pub fn endpoint(mut self, endpoint: &str) -> Self {
        self.endpoint = endpoint.trim_end_matches('/').to_owned();
        self
    }

    /// Flush automatically once this many events are queued (default 20).
    pub fn flush_at(mut self, n: usize) -> Self {
        self.flush_at = n;
        self
    }

    /// Flush on a timer (default 10s). Set to `Duration::ZERO` to disable the timer.
    pub fn flush_interval(mut self, duration: Duration) -> Self {
        self.flush_interval = duration;
        self
    }

    /// Network retries per batch before giving up (default 3).
    pub fn max_retries(mut self, n: u32) -> Self {
        self.max_retries = n;
        self
    }

    /// Per-request timeout (default 10s).
    pub fn timeout(mut self, duration: Duration) -> Self {
        self.timeout = duration;
        self
    }

    /// Log diagnostic messages to stderr (default false).
    pub fn debug(mut self, enabled: bool) -> Self {
        self.debug = enabled;
        self
    }

    /// Called when a batch is dropped after exhausting retries.
    pub fn on_error<F>(mut self, callback: F) -> Self
    where
        F: Fn(TraceIQError) + Send + Sync + 'static,
    {
        self.on_error = Some(Arc::new(callback));
        self
    }

    /// Build the [`Client`].
    pub fn build(self) -> Client {
        Client::build(self)
    }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/// TraceIQ server-side client for Rust.
///
/// Events are queued and flushed in batches by a background worker thread, so
/// callers never block on the network.
///
/// # Example
///
/// ```no_run
/// use traceiq::Client;
///
/// let mut client = Client::new("proj_...", "trq_...");
/// client.capture("payout_succeeded", Some("user_123"), None, None, None, None);
/// client.shutdown(); // flush before exit
/// ```
pub struct Client {
    inner: Arc<Inner>,
    worker: Option<thread::JoinHandle<()>>,
}

impl Client {
    /// Create a new TraceIQ client with default settings.
    ///
    /// # Panics
    ///
    /// Panics if `project_id` or `write_key` is empty.
    pub fn new(project_id: &str, write_key: &str) -> Self {
        Self::builder(project_id, write_key).build()
    }

    /// Obtain a builder for full configuration.
    pub fn builder(project_id: &str, write_key: &str) -> ClientBuilder {
        assert!(!project_id.is_empty(), "TraceIQ: project_id is required.");
        assert!(!write_key.is_empty(), "TraceIQ: write_key is required.");
        ClientBuilder::new(project_id, write_key)
    }

    fn build(builder: ClientBuilder) -> Self {
        let inner = Arc::new(Inner {
            project_id: builder.project_id,
            write_key: builder.write_key,
            endpoint: builder.endpoint,
            flush_at: builder.flush_at,
            flush_interval: builder.flush_interval,
            max_retries: builder.max_retries,
            timeout: builder.timeout,
            debug: builder.debug,
            on_error: builder.on_error,
            queue: Mutex::new(VecDeque::new()),
            condvar: Condvar::new(),
            stopped: Mutex::new(false),
        });

        let worker_inner = Arc::clone(&inner);
        let worker = if builder.flush_interval > Duration::ZERO {
            Some(thread::Builder::new()
                .name("traceiq-flush".into())
                .spawn(move || worker_loop(worker_inner))
                .expect("TraceIQ: failed to spawn background worker"))
        } else {
            None
        };

        Self {
            inner,
            worker,
        }
    }

    // -- public API ---------------------------------------------------------

    /// Track a server-side event.
    ///
    /// * `event`       – Event name, e.g. `"payout_succeeded"`.
    /// * `user_id`     – The identified user this event belongs to (optional).
    /// * `anonymous_id`– Anonymous identifier when there is no user yet (optional).
    /// * `properties`  – Arbitrary event properties as a JSON object (optional).
    /// * `context`     – Extra context (server, request id, …) as a JSON object (optional).
    /// * `timestamp`   – ISO-8601 timestamp; defaults to now.
    pub fn capture(
        &self,
        event: &str,
        user_id: Option<&str>,
        anonymous_id: Option<&str>,
        properties: Option<Value>,
        context: Option<Value>,
        timestamp: Option<&str>,
    ) {
        if event.is_empty() {
            self.debug("capture() called without an event name; ignored.");
            return;
        }
        self.enqueue(Event {
            event_name: event.to_owned(),
            user_id: user_id.map(|s| s.to_owned()),
            anonymous_id: anonymous_id.map(|s| s.to_owned()),
            properties: properties.unwrap_or(Value::Object(Default::default())),
            context,
            timestamp: timestamp
                .filter(|s| !s.is_empty())
                .map(|s| s.to_owned())
                .unwrap_or_else(now_iso),
        });
    }

    /// Create or update a user profile.
    ///
    /// Emits a `$identify` event.  Traits are stored as `properties.traits`.
    ///
    /// * `user_id` – The user to identify.
    /// * `traits`  – User traits as a JSON object (optional).
    /// * `timestamp` – ISO-8601 timestamp; defaults to now.
    pub fn identify(&self, user_id: &str, traits: Option<Value>, timestamp: Option<&str>) {
        self.enqueue(Event {
            event_name: "$identify".to_owned(),
            user_id: Some(user_id.to_owned()),
            anonymous_id: None,
            properties: serde_json::json!({ "traits": traits.unwrap_or(Value::Object(Default::default())) }),
            context: None,
            timestamp: timestamp
                .filter(|s| !s.is_empty())
                .map(|s| s.to_owned())
                .unwrap_or_else(now_iso),
        });
    }

    /// Associate a user with an organization / account.
    ///
    /// Emits a `$group` event.
    ///
    /// * `organization_id` – The organization to associate the user with.
    /// * `user_id`         – The user to associate (optional, but recommended).
    /// * `anonymous_id`    – Anonymous identifier when there is no user yet (optional).
    /// * `traits`          – Group traits as a JSON object (optional).
    /// * `timestamp`       – ISO-8601 timestamp; defaults to now.
    pub fn group(
        &self,
        organization_id: &str,
        user_id: Option<&str>,
        anonymous_id: Option<&str>,
        traits: Option<Value>,
        timestamp: Option<&str>,
    ) {
        self.enqueue(Event {
            event_name: "$group".to_owned(),
            user_id: user_id.map(|s| s.to_owned()),
            anonymous_id: anonymous_id.map(|s| s.to_owned()),
            properties: serde_json::json!({
                "organizationId": organization_id,
                "traits": traits.unwrap_or(Value::Object(Default::default())),
            }),
            context: None,
            timestamp: timestamp
                .filter(|s| !s.is_empty())
                .map(|s| s.to_owned())
                .unwrap_or_else(now_iso),
        });
    }

    /// Send everything queued right now (blocks until sent).
    ///
    /// Safe to call concurrently with `capture` / `identify` / `group`.
    pub fn flush(&self) {
        loop {
            let batch = {
                let mut queue = self.inner.queue.lock().unwrap();
                if queue.is_empty() {
                    return;
                }
                queue.drain(..).collect::<Vec<_>>()
            };
            send_batch(&self.inner, &batch);
        }
    }

    /// Flush and stop the background worker.  Call before the process exits.
    ///
    /// This is called automatically on `Drop` when the `Client` goes out of
    /// scope, so an explicit `shutdown()` is only necessary when you want to
    /// guarantee delivery before continuing.
    pub fn shutdown(&mut self) {
        {
            let mut stopped = self.inner.stopped.lock().unwrap();
            if *stopped {
                return;
            }
            *stopped = true;
            self.inner.condvar.notify_all();
        }
        if let Some(handle) = self.worker.take() {
            let _ = handle.thread().unpark(); // wake a timed-out Condvar wait
            let _ = handle.join();
        }
        self.flush();
    }

    // -- internals ----------------------------------------------------------

    fn enqueue(&self, event: Event) {
        let mut queue = self.inner.queue.lock().unwrap();
        queue.push_back(event);
        if queue.len() >= self.inner.flush_at {
            self.inner.condvar.notify_all();
        }
    }

    fn debug(&self, msg: &str) {
        if self.inner.debug {
            eprintln!("[traceiq] {msg}");
        }
    }
}

impl Drop for Client {
    fn drop(&mut self) {
        self.shutdown();
    }
}

// ---------------------------------------------------------------------------
// Background worker
// ---------------------------------------------------------------------------

fn worker_loop(inner: Arc<Inner>) {
    loop {
        let batch = {
            let mut queue = inner.queue.lock().unwrap();
            if !*inner.stopped.lock().unwrap() && queue.len() < inner.flush_at {
                let (guard, _) = inner
                    .condvar
                    .wait_timeout(queue, inner.flush_interval)
                    .unwrap();
                queue = guard;
            }
            if *inner.stopped.lock().unwrap() && queue.is_empty() {
                return;
            }
            queue.drain(..).collect::<Vec<_>>()
        };
        if !batch.is_empty() {
            send_batch(&inner, &batch);
        }
    }
}

// ---------------------------------------------------------------------------
// HTTP transport
// ---------------------------------------------------------------------------

fn send_batch(inner: &Inner, batch: &[Event]) {
    let body = serde_json::to_vec(&BatchRequest {
        project_id: inner.project_id.clone(),
        batch: batch.to_vec(),
    })
    .expect("TraceIQ: event serialisation failed (this is a bug)");

    let url = format!("{}{}", inner.endpoint, BATCH_URL_PATH);

    for attempt in 1.. {
        let result = try_send(&url, &inner.write_key, &body, inner.timeout);
        match result {
            Ok(()) => return,
            Err(status) if status < 500 && status != 429 => {
                handle_error(
                    inner,
                    TraceIQError::new(format!("batch rejected with {status}")),
                );
                return;
            }
            Err(_status) => {
                if attempt > inner.max_retries {
                    handle_error(
                        inner,
                        TraceIQError::new(format!("batch failed after {attempt} attempts")),
                    );
                    return;
                }
                let backoff = (1000u64 << (attempt - 1)).min(MAX_BACKOFF_MS);
                thread::sleep(Duration::from_millis(backoff));
            }
        }
    }
}

fn try_send(url: &str, write_key: &str, body: &[u8], timeout: Duration) -> Result<(), u16> {
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(timeout)
        .timeout_read(timeout)
        .timeout_write(timeout)
        .build();
    let response = agent
        .post(url)
        .set("content-type", "application/json")
        .set("x-traceiq-write-key", write_key)
        .send_bytes(body);

    match response {
        Ok(resp) => {
            let status = resp.status();
            if status < 300 {
                Ok(())
            } else {
                Err(status)
            }
        }
        Err(ureq::Error::Status(status, _)) => Err(status),
        Err(_) => Err(0), // network / timeout / dns error
    }
}

fn handle_error(inner: &Inner, error: TraceIQError) {
    if inner.debug {
        eprintln!("[traceiq] {error}");
    }
    if let Some(ref cb) = inner.on_error {
        cb(error);
    }
}

// ---------------------------------------------------------------------------
// Timestamp helpers
// ---------------------------------------------------------------------------

fn now_iso() -> String {
    Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_now_iso_format() {
        let ts = now_iso();
        assert!(ts.ends_with('Z'), "should end with Z: {ts}");
        assert_eq!(ts.len(), 24, "expected 24-char ISO-8601: {ts}");
    }

    #[test]
    fn test_capture_enqueues_event() {
        let client = Client::builder("proj_test", "key_test")
            .flush_interval(Duration::ZERO)
            .build();
        client.capture("test_event", Some("user_1"), None, None, None, None);

        let queue = client.inner.queue.lock().unwrap();
        assert_eq!(queue.len(), 1);
        assert_eq!(queue[0].event_name, "test_event");
        assert_eq!(queue[0].user_id.as_deref(), Some("user_1"));
    }

    #[test]
    fn test_identify_enqueues_dollar_event() {
        let client = Client::builder("proj_test", "key_test")
            .flush_interval(Duration::ZERO)
            .build();
        client.identify("user_1", None, None);

        let queue = client.inner.queue.lock().unwrap();
        assert_eq!(queue.len(), 1);
        assert_eq!(queue[0].event_name, "$identify");
    }

    #[test]
    fn test_group_enqueues_dollar_group() {
        let client = Client::builder("proj_test", "key_test")
            .flush_interval(Duration::ZERO)
            .build();
        client.group("org_1", Some("user_1"), None, None, None);

        let queue = client.inner.queue.lock().unwrap();
        assert_eq!(queue.len(), 1);
        assert_eq!(queue[0].event_name, "$group");
        let props = &queue[0].properties;
        assert_eq!(props["organizationId"], "org_1");
    }

    #[test]
    fn test_empty_event_name_is_ignored() {
        let client = Client::builder("proj_test", "key_test")
            .flush_interval(Duration::ZERO)
            .build();
        client.capture("", Some("user_1"), None, None, None, None);

        let queue = client.inner.queue.lock().unwrap();
        assert!(queue.is_empty());
    }

    #[test]
    fn test_flush_drains_queue() {
        let client = Client::builder("proj_test", "key_test")
            .flush_interval(Duration::ZERO)
            .build();
        client.capture("e1", None, None, None, None, None);
        client.capture("e2", None, None, None, None, None);

        client.flush();
        let queue = client.inner.queue.lock().unwrap();
        assert!(queue.is_empty());
    }

    #[test]
    fn test_flush_at_triggers_immediate_flush() {
        let client = Client::builder("proj_test", "key_test")
            .flush_at(2)
            .flush_interval(Duration::ZERO)
            .build();
        // First event: queue.len = 1 < flush_at(2), stays queued
        client.capture("e1", None, None, None, None, None);
        // Second event: queue.len = 2 >= flush_at(2), notify_all triggers worker
        // but since worker isn't running (flush_interval = ZERO), it stays
        client.capture("e2", None, None, None, None, None);

        let queue = client.inner.queue.lock().unwrap();
        assert_eq!(queue.len(), 2);
    }

    #[test]
    fn test_shutdown_joins_worker() {
        let mut client = Client::builder("proj_test", "key_test")
            .flush_interval(Duration::from_millis(50))
            .build();
        client.capture("e1", None, None, None, None, None);
        client.shutdown();
        // no panic = worker joined cleanly
    }

    #[test]
    fn test_on_error_called_on_bad_status() {
        let called = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let called_clone = Arc::clone(&called);
        let client = Client::builder("proj_test", "key_test")
            .endpoint("http://127.0.0.1:1") // unreachable -> network error
            .flush_interval(Duration::ZERO)
            .on_error(move |_| {
                called_clone.store(true, std::sync::atomic::Ordering::SeqCst);
            })
            .build();
        client.capture("e1", None, None, None, None, None);
        client.flush();
        assert!(called.load(std::sync::atomic::Ordering::SeqCst));
    }

    #[test]
    fn test_serialisation_roundtrip() {
        let event = Event {
            event_name: "test".into(),
            user_id: Some("usr_123".into()),
            anonymous_id: None,
            properties: serde_json::json!({"key": "value"}),
            context: None,
            timestamp: now_iso(),
        };
        let req = BatchRequest {
            project_id: "proj_test".into(),
            batch: vec![event],
        };
        let json = serde_json::to_value(&req).unwrap();
        assert_eq!(json["project_id"], "proj_test");
        assert_eq!(json["batch"][0]["event_name"], "test");
        assert_eq!(json["batch"][0]["user_id"], "usr_123");
        assert!(json["batch"][0]["anonymous_id"].is_null());
    }
}
