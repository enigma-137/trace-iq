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
    /// Service name stamped on `log` lines.
    public var serviceName: String
    /// Environment stamped on `log` lines.
    public var environment: String

    public init(
        projectId: String,
        writeKey: String,
        endpoint: String = "http://localhost:4000",
        flushAt: Int = 20,
        flushInterval: TimeInterval = 15,
        maxRetries: Int = 3,
        timeout: TimeInterval = 10,
        debug: Bool = false,
        serviceName: String = "server",
        environment: String = "production"
    ) {
        self.projectId = projectId
        self.writeKey = writeKey
        self.endpoint = endpoint.hasSuffix("/") ? String(endpoint.dropLast()) : endpoint
        self.flushAt = flushAt
        self.flushInterval = flushInterval
        self.maxRetries = maxRetries
        self.timeout = timeout
        self.debug = debug
        self.serviceName = serviceName
        self.environment = environment
    }
}

/// Server / Apple-platform TraceIQ client. Events are queued and flushed in batches
/// (by size or on a timer) so callers never block on the network.
///
///     let traceiq = TraceIQ(config: .init(projectId: "proj_...", writeKey: "trq_..."))
///     traceiq.capture("payout_succeeded", userId: "user_123", properties: ["amount": 50000])
///     traceiq.log("error", "Payout provider timed out", metadata: ["provider": "stripe"])
///     traceiq.shutdown() // flush before a short-lived process exits
public final class TraceIQ {
    private let config: TraceIQConfig
    private let session: URLSession
    private let queue = DispatchQueue(label: "com.traceiq.sdk")
    private var buffer: [[String: Any]] = []
    private var logBuffer: [[String: Any]] = []
    private var timer: DispatchSourceTimer?

    private static let logLevels: Set<String> = ["debug", "info", "warn", "error", "fatal"]
    private static let maxLogBatch = 100 // API limit per /v1/logs/batch request
    private static let maxQueuedLogs = 1000

    private static let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    public convenience init(config: TraceIQConfig) {
        self.init(config: config, sessionConfiguration: .default)
    }

    /// Tests inject a configuration whose `protocolClasses` stub the network.
    init(config: TraceIQConfig, sessionConfiguration: URLSessionConfiguration) {
        self.config = config
        let sessionConfig = sessionConfiguration
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

    /// Tell TraceIQ that `previousId` and `userId` are the same person, so their events
    /// and profiles can be merged into `userId`. Aliasing an ID to itself is ignored.
    public func alias(userId: String, previousId: String) {
        guard !userId.isEmpty, !previousId.isEmpty, userId != previousId else {
            debug("alias() needs two different IDs; ignored.")
            return
        }
        enqueue([
            "eventName": "$alias",
            "userId": userId,
            "properties": ["previousId": previousId],
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

    /// Send a structured log line to TraceIQ Logs. `level` is `debug`, `info`, `warn`,
    /// `error` or `fatal` (anything else is sent as `info`). Lines flush with events.
    public func log(
        _ level: String,
        _ message: String,
        userId: String? = nil,
        metadata: [String: Any] = [:],
        error: Error? = nil
    ) {
        guard !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        var entry: [String: Any] = [
            "level": TraceIQ.logLevels.contains(level) ? level : "info",
            "message": String(message.prefix(4000)),
            "timestamp": TraceIQ.iso(nil),
            "service": config.serviceName,
            "environment": config.environment,
        ]
        if let userId = userId { entry["distinctId"] = userId }
        if !metadata.isEmpty { entry["metadata"] = metadata }
        if let error = error {
            entry["errorDetails"] = [
                "name": String(describing: type(of: error)),
                "message": error.localizedDescription,
            ]
        }
        queue.async {
            self.logBuffer.append(entry)
            // Bounded so an unreachable API can't grow memory without limit; oldest go first.
            if self.logBuffer.count > TraceIQ.maxQueuedLogs {
                self.logBuffer.removeFirst(self.logBuffer.count - TraceIQ.maxQueuedLogs)
            }
            if self.logBuffer.count >= self.config.flushAt {
                self.deliverBuffered(completion: nil)
            }
        }
    }

    /// Send everything queued now. `completion` runs after every batch is delivered or dropped.
    public func flush(completion: (() -> Void)? = nil) {
        queue.async {
            self.deliverBuffered(completion: completion)
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
                self.deliverBuffered(completion: nil)
            }
        }
    }

    /// Takes both buffers and sends the events, then each log chunk, one request at a
    /// time. Must run on `queue`.
    private func deliverBuffered(completion: (() -> Void)?) {
        var requests: [(path: String, payload: [String: Any])] = []
        if !buffer.isEmpty {
            requests.append((path: "/v1/events/batch", payload: ["batch": buffer]))
        }
        for start in stride(from: 0, to: logBuffer.count, by: TraceIQ.maxLogBatch) {
            let chunk = Array(logBuffer[start..<min(start + TraceIQ.maxLogBatch, logBuffer.count)])
            requests.append((path: "/v1/logs/batch", payload: ["logs": chunk]))
        }
        buffer.removeAll()
        logBuffer.removeAll()
        sendSequentially(requests[...], completion: completion)
    }

    private func sendSequentially(
        _ requests: ArraySlice<(path: String, payload: [String: Any])>,
        completion: (() -> Void)?
    ) {
        guard let next = requests.first else {
            completion?()
            return
        }
        send(path: next.path, payload: next.payload, attempt: 1) {
            self.sendSequentially(requests.dropFirst(), completion: completion)
        }
    }

    private func send(path: String, payload: [String: Any], attempt: Int, completion: (() -> Void)?) {
        guard let url = URL(string: "\(config.endpoint)\(path)") else {
            completion?()
            return
        }
        var payload = payload
        payload["projectId"] = config.projectId
        guard let body = try? JSONSerialization.data(withJSONObject: payload, options: []) else {
            debug("failed to encode \(path) payload")
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
                self.debug("\(path) rejected with \(status)")
                completion?()
                return
            }
            if attempt > self.config.maxRetries {
                self.debug("\(path) dropped after \(self.config.maxRetries) retries")
                completion?()
                return
            }
            let backoff = min(pow(2.0, Double(attempt - 1)), 30.0)
            self.queue.asyncAfter(deadline: .now() + backoff) {
                self.send(path: path, payload: payload, attempt: attempt + 1, completion: completion)
            }
        }
        task.resume()
    }

    private func startTimer() {
        guard config.flushInterval > 0 else { return }
        let source = DispatchSource.makeTimerSource(queue: queue)
        source.schedule(deadline: .now() + config.flushInterval, repeating: config.flushInterval)
        source.setEventHandler { [weak self] in
            guard let self = self, !self.buffer.isEmpty || !self.logBuffer.isEmpty else { return }
            self.deliverBuffered(completion: nil)
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
