package com.traceiq

import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.util.Collections
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

private data class Recorded(val path: String, val writeKey: String?, val body: String)

/** A local HTTP server that records every request and answers from a queue of statuses (then 202). */
private class Recorder(vararg statuses: Int) : AutoCloseable {
    val requests: MutableList<Recorded> = Collections.synchronizedList(mutableListOf())
    private val pending = ArrayDeque(statuses.toList())
    private val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
        createContext("/") { exchange ->
            val body = exchange.requestBody.readBytes().toString(Charsets.UTF_8)
            requests.add(Recorded(exchange.requestURI.path, exchange.requestHeaders.getFirst("x-traceiq-write-key"), body))
            val status = synchronized(pending) { pending.removeFirstOrNull() } ?: 202
            exchange.sendResponseHeaders(status, -1)
            exchange.close()
        }
        start()
    }
    val endpoint = "http://127.0.0.1:${server.address.port}"

    override fun close() = server.stop(0)
}

class TraceIQTest {
    private fun client(endpoint: String, maxRetries: Int = 0, onError: ((Throwable) -> Unit)? = null) = TraceIQ(
        TraceIQConfig(
            projectId = "proj_test",
            writeKey = "trq_test",
            endpoint = endpoint,
            flushIntervalMs = 0,
            maxRetries = maxRetries,
            onError = onError,
            serviceName = "billing",
            environment = "staging",
        ),
    )

    @Test
    fun `shutdown sends queued events as one camelCase batch`() {
        Recorder().use { server ->
            val traceiq = client(server.endpoint)
            traceiq.capture("payout_succeeded", userId = "user_1", properties = mapOf("amount" to 500))
            traceiq.identify("user_1", mapOf("plan" to "pro"))
            traceiq.shutdown()

            val request = server.requests.single()
            assertEquals("/v1/events/batch", request.path)
            assertEquals("trq_test", request.writeKey)
            assertTrue(request.body.startsWith("{\"projectId\":\"proj_test\",\"batch\":["), request.body)
            assertTrue("\"eventName\":\"payout_succeeded\",\"userId\":\"user_1\",\"properties\":{\"amount\":500}" in request.body, request.body)
            assertTrue("\"eventName\":\"\$identify\"" in request.body, request.body)
        }
    }

    @Test
    fun `alias links the previous ID and ignores an ID aliased to itself`() {
        Recorder().use { server ->
            val traceiq = client(server.endpoint)
            traceiq.alias("user_1", "guest_1")
            traceiq.alias("user_1", "user_1")
            traceiq.shutdown()
            val body = server.requests.single().body
            assertTrue("\"eventName\":\"\$alias\",\"userId\":\"user_1\",\"properties\":{\"previousId\":\"guest_1\"}" in body, body)
            assertEquals(1, Regex("\\\$alias").findAll(body).count(), body)
        }
    }

    @Test
    fun `strings are JSON-escaped`() {
        Recorder().use { server ->
            val traceiq = client(server.endpoint)
            traceiq.capture("note", properties = mapOf("text" to "say \"hi\"\nback\\slash\u0001"))
            traceiq.shutdown()
            assertTrue("\"text\":\"say \\\"hi\\\"\\nback\\\\slash\\u0001\"" in server.requests.single().body, server.requests.single().body)
        }
    }

    @Test
    fun `log lines go to the logs endpoint with metadata and error details`() {
        Recorder().use { server ->
            val traceiq = client(server.endpoint)
            traceiq.log("error", "Payout provider timed out", userId = "user_1", metadata = mapOf("provider" to "stripe"), error = IllegalStateException("30s"))
            traceiq.log("loud", "unknown levels become info")
            traceiq.log("info", "   ")
            traceiq.shutdown()

            val request = server.requests.single()
            assertEquals("/v1/logs/batch", request.path)
            val body = request.body
            assertEquals(2, Regex("\"level\":").findAll(body).count(), body)
            assertTrue("\"level\":\"error\",\"message\":\"Payout provider timed out\"" in body, body)
            assertTrue("\"service\":\"billing\",\"environment\":\"staging\",\"distinctId\":\"user_1\"" in body, body)
            assertTrue("\"metadata\":{\"provider\":\"stripe\"}" in body, body)
            assertTrue("\"name\":\"java.lang.IllegalStateException\",\"message\":\"30s\"" in body, body)
            assertTrue("\"level\":\"info\",\"message\":\"unknown levels become info\"" in body, body)
        }
    }

    @Test
    fun `client errors are reported once and not retried`() {
        Recorder(400).use { server ->
            val errors = Collections.synchronizedList(mutableListOf<Throwable>())
            val traceiq = client(server.endpoint, maxRetries = 3, onError = { errors.add(it) })
            traceiq.capture("bad")
            traceiq.shutdown()
            assertEquals(1, server.requests.size)
            assertEquals(1, errors.size)
        }
    }

    @Test
    fun `server errors are retried`() {
        Recorder(503).use { server ->
            val errors = Collections.synchronizedList(mutableListOf<Throwable>())
            val traceiq = client(server.endpoint, maxRetries = 1, onError = { errors.add(it) })
            traceiq.capture("flaky")
            traceiq.shutdown()
            assertEquals(2, server.requests.size)
            assertTrue(errors.isEmpty(), errors.toString())
        }
    }

    @Test
    fun `timestamps stay well-formed when captured from many threads`() {
        Recorder().use { server ->
            val traceiq = client(server.endpoint)
            val threads = 8
            val perThread = 200
            val pool = Executors.newFixedThreadPool(threads)
            val start = CountDownLatch(1)
            repeat(threads) {
                pool.execute {
                    start.await()
                    repeat(perThread) { i -> traceiq.capture("tick", properties = mapOf("i" to i)) }
                }
            }
            start.countDown()
            pool.shutdown()
            assertTrue(pool.awaitTermination(30, TimeUnit.SECONDS))
            traceiq.shutdown()

            val timestamps = server.requests.flatMap { request ->
                Regex("\"timestamp\":\"([^\"]*)\"").findAll(request.body).map { it.groupValues[1] }.toList()
            }
            assertEquals(threads * perThread, timestamps.size)
            val iso = Regex("""\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z""")
            timestamps.forEach { assertTrue(iso.matches(it), "malformed timestamp: $it") }
        }
    }
}
