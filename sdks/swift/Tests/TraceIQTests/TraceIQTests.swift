import Foundation
import XCTest
@testable import TraceIQ

/// Records every request and answers from a queue of statuses (then 202).
final class StubProtocol: URLProtocol {
    struct Recorded {
        let path: String
        let writeKey: String?
        let json: [String: Any]
    }

    private static let lock = NSLock()
    private static var statuses: [Int] = []
    private static var recorded: [Recorded] = []

    static func reset(statuses: [Int] = []) {
        lock.lock(); defer { lock.unlock() }
        self.statuses = statuses
        recorded = []
    }

    static var requests: [Recorded] {
        lock.lock(); defer { lock.unlock() }
        return recorded
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        // URLSession hands protocols the body as a stream, not httpBody.
        let body = request.httpBody ?? request.httpBodyStream.map(Self.read) ?? Data()
        let json = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] ?? [:]
        StubProtocol.lock.lock()
        StubProtocol.recorded.append(Recorded(
            path: request.url?.path ?? "",
            writeKey: request.value(forHTTPHeaderField: "x-traceiq-write-key"),
            json: json
        ))
        let status = StubProtocol.statuses.isEmpty ? 202 : StubProtocol.statuses.removeFirst()
        StubProtocol.lock.unlock()

        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data())
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    private static func read(_ stream: InputStream) -> Data {
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count <= 0 { break }
            data.append(buffer, count: count)
        }
        return data
    }
}

final class TraceIQTests: XCTestCase {
    private func client(maxRetries: Int = 0) -> TraceIQ {
        let session = URLSessionConfiguration.ephemeral
        session.protocolClasses = [StubProtocol.self]
        return TraceIQ(
            config: TraceIQConfig(
                projectId: "proj_test",
                writeKey: "trq_test",
                endpoint: "https://api.example.test/",
                flushInterval: 0,
                maxRetries: maxRetries,
                serviceName: "billing",
                environment: "staging"
            ),
            sessionConfiguration: session
        )
    }

    override func setUp() {
        super.setUp()
        StubProtocol.reset()
    }

    func testShutdownSendsQueuedEventsAsOneBatch() {
        let traceiq = client()
        traceiq.capture("payout_succeeded", userId: "user_1", properties: ["amount": 500])
        traceiq.identify(userId: "user_1", traits: ["plan": "pro"])
        traceiq.shutdown()

        XCTAssertEqual(StubProtocol.requests.count, 1)
        let request = StubProtocol.requests[0]
        XCTAssertEqual(request.path, "/v1/events/batch")
        XCTAssertEqual(request.writeKey, "trq_test")
        XCTAssertEqual(request.json["projectId"] as? String, "proj_test")
        let batch = request.json["batch"] as? [[String: Any]] ?? []
        XCTAssertEqual(batch.map { $0["eventName"] as? String }, ["payout_succeeded", "$identify"])
        XCTAssertEqual(batch.first?["userId"] as? String, "user_1")
        XCTAssertEqual((batch.first?["properties"] as? [String: Any])?["amount"] as? Int, 500)
    }

    func testLogLinesGoToTheLogsEndpointAfterEvents() {
        let traceiq = client()
        traceiq.capture("checkout_started")
        traceiq.log("error", "Payout provider timed out", userId: "user_1", metadata: ["provider": "stripe"])
        traceiq.log("loud", "unknown levels become info")
        traceiq.log("info", "   ")
        traceiq.shutdown()

        XCTAssertEqual(StubProtocol.requests.map(\.path), ["/v1/events/batch", "/v1/logs/batch"])
        let logs = StubProtocol.requests[1].json["logs"] as? [[String: Any]] ?? []
        XCTAssertEqual(logs.count, 2)
        XCTAssertEqual(logs[0]["level"] as? String, "error")
        XCTAssertEqual(logs[0]["service"] as? String, "billing")
        XCTAssertEqual(logs[0]["environment"] as? String, "staging")
        XCTAssertEqual(logs[0]["distinctId"] as? String, "user_1")
        XCTAssertEqual((logs[0]["metadata"] as? [String: Any])?["provider"] as? String, "stripe")
        XCTAssertEqual(logs[1]["level"] as? String, "info")
    }

    func testClientErrorsAreNotRetried() {
        StubProtocol.reset(statuses: [400])
        let traceiq = client(maxRetries: 3)
        traceiq.capture("bad")
        traceiq.shutdown()
        XCTAssertEqual(StubProtocol.requests.count, 1)
    }

    func testServerErrorsAreRetried() {
        StubProtocol.reset(statuses: [503])
        let traceiq = client(maxRetries: 1)
        traceiq.capture("flaky")
        traceiq.shutdown()
        XCTAssertEqual(StubProtocol.requests.count, 2)
    }

    func testFlushWithNothingQueuedStillCompletes() {
        let traceiq = client()
        let done = expectation(description: "flush completion")
        traceiq.flush { done.fulfill() }
        wait(for: [done], timeout: 5)
        XCTAssertTrue(StubProtocol.requests.isEmpty)
    }
}
