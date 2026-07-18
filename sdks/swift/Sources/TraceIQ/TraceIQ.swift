import Foundation

/// Configuration for a `TraceIQ` client.
public struct TraceIQConfig {
    public let projectId: String
    public let writeKey: String
    public var endpoint: String
    public var flushAt: Int
    public var flushInterval: TimeInterval
    public var maxRetries: Int
    public var timeout: TimeInterval
    public var debug: Bool

    public init(
        projectId: String,
        writeKey: String,
        endpoint: String = "http://localhost:4000",
        flushAt: Int = 20,
        flushInterval: TimeInterval = 15,
        maxRetries: Int = 3,
        timeout: TimeInterval = 10,
        debug: Bool = false
    ) {
        self.projectId = projectId
        self.writeKey = writeKey
        self.endpoint = endpoint.hasSuffix("/") ? String(endpoint.dropLast()) : endpoint
        self.flushAt = flushAt
        self.flushInterval = flushInterval
        self.maxRetries = maxRetries
        self.timeout = timeout
        self.debug = debug
    }
}

/// Server / Apple-platform TraceIQ client. Events are queued and flushed in batches
/// (by size or on a timer) so callers never block on the network.
///
///     let traceiq = TraceIQ(config: .init(projectId: "proj_...", writeKey: "trq_..."))
///     traceiq.capture("payout_succeeded", userId: "user_123", properties: ["amount": 50000])
///     traceiq.shutdown() // flush before a short-lived process exits
public final class TraceIQ {
    private let config: TraceIQConfig
    private let session: URLSession
    private let queue = DispatchQueue(label: "com.traceiq.sdk")
    private var buffer: [[String: Any]] = []
    private var timer: DispatchSourceTimer?

    private static let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    public init(config: TraceIQConfig) {
        self.config = config
        let sessionConfig = URLSessionConfiguration.default
        sessionConfig.timeoutIntervalForRequest = config.timeout
        self.session = URLSession(configuration: sessionConfig)
        startTimer()
    }

    // MARK: - Public API

    public func capture(
        _ event: String,
        userId: String? = nil,
        anonymousId: String? = nil,
        properties: [String: Any] = [:],
        timestamp: Date? = nil
    ) {
        guard !event.isEmpty else { return }
        var payload: [String: Any] = [
            "eventName": event,
            "properties": properties,
            "timestamp": Self.iso(timestamp)
        ]
        if let userId = userId { payload["userId"] = userId }
        if let anonymousId = anonymousId { payload["anonymousId"] = anonymousId }
        enqueue(payload)
    }

    public func identify(userId: String, traits: [String: Any] = [:]) {
        enqueue([
            "eventName": "$identify",
            "userId": userId,
            "properties": ["traits": traits],
            "timestamp": Self.iso(nil)
        ])
    }

    public func group(organizationId: String, userId: String? = nil, traits: [String: Any] = [:]) {
        var payload: [String: Any] = [
            "eventName": "$group",
            "properties": ["organizationId": organizationId, "traits": traits],
            "timestamp": Self.iso(nil)
        ]
        if let userId = userId { payload["userId"] = userId }
        enqueue(payload)
    }

    /// Send everything queued now. `completion` runs after the batch is delivered or dropped.
    public func flush(completion: (() -> Void)? = nil) {
        queue.async {
            guard !self.buffer.isEmpty else {
                completion?()
                return
            }
            let batch = self.buffer
            self.buffer.removeAll()
            self.send(batch, attempt: 1, completion: completion)
        }
    }

    /// Stop the timer and flush, blocking briefly so short-lived programs deliver events.
    public func shutdown() {
        timer?.cancel()
        timer = nil
        let semaphore = DispatchSemaphore(value: 0)
        flush { semaphore.signal() }
        _ = semaphore.wait(timeout: .now() + config.timeout + 5)
    }

    // MARK: - Internals

    private func enqueue(_ event: [String: Any]) {
        queue.async {
            self.buffer.append(event)
            if self.buffer.count >= self.config.flushAt {
                let batch = self.buffer
                self.buffer.removeAll()
                self.send(batch, attempt: 1, completion: nil)
            }
        }
    }

    private func send(_ batch: [[String: Any]], attempt: Int, completion: (() -> Void)?) {
        guard let url = URL(string: "\(config.endpoint)/v1/events/batch") else {
            completion?()
            return
        }
        let payload: [String: Any] = ["projectId": config.projectId, "batch": batch]
        guard let body = try? JSONSerialization.data(withJSONObject: payload, options: []) else {
            debug("failed to encode batch")
            completion?()
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue(config.writeKey, forHTTPHeaderField: "x-traceiq-write-key")
        request.httpBody = body

        let task = session.dataTask(with: request) { [weak self] _, response, error in
            guard let self = self else {
                completion?()
                return
            }
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0

            if error == nil, (200..<300).contains(status) {
                completion?()
                return
            }
            // 4xx (except 429) is a bad request — retrying won't help.
            if error == nil, status < 500, status != 429 {
                self.debug("batch rejected with \(status)")
                completion?()
                return
            }
            if attempt > self.config.maxRetries {
                self.debug("batch dropped after \(self.config.maxRetries) retries")
                completion?()
                return
            }
            let backoff = min(pow(2.0, Double(attempt - 1)), 30.0)
            self.queue.asyncAfter(deadline: .now() + backoff) {
                self.send(batch, attempt: attempt + 1, completion: completion)
            }
        }
        task.resume()
    }

    private func startTimer() {
        guard config.flushInterval > 0 else { return }
        let source = DispatchSource.makeTimerSource(queue: queue)
        source.schedule(deadline: .now() + config.flushInterval, repeating: config.flushInterval)
        source.setEventHandler { [weak self] in
            guard let self = self, !self.buffer.isEmpty else { return }
            let batch = self.buffer
            self.buffer.removeAll()
            self.send(batch, attempt: 1, completion: nil)
        }
        source.resume()
        timer = source
    }

    private static func iso(_ date: Date?) -> String {
        isoFormatter.string(from: date ?? Date())
    }

    private func debug(_ message: String) {
        if config.debug {
            print("[traceiq] \(message)")
        }
    }
}
