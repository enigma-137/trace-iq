package com.traceiq

import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Configuration for a [TraceIQ] client. */
data class TraceIQConfig(
    val projectId: String,
    val writeKey: String,
    val endpoint: String = "http://localhost:4000",
    val flushAt: Int = 20,
    val flushIntervalMs: Long = 15_000,
    val maxRetries: Int = 3,
    val timeoutMs: Int = 10_000,
    val debug: Boolean = false,
    val onError: ((Throwable) -> Unit)? = null,
    /** Service name stamped on [TraceIQ.log] lines. */
    val serviceName: String = "server",
    /** Environment stamped on [TraceIQ.log] lines. */
    val environment: String = "production",
)

private val LOG_LEVELS = setOf("debug", "info", "warn", "error", "fatal")
private const val MAX_LOG_BATCH = 100 // API limit per /v1/logs/batch request
private const val MAX_QUEUED_LOGS = 1000

/**
 * Server / Android TraceIQ client. Events are queued and flushed in batches on a
 * background thread (by size or on a timer), so callers never block on the network.
 *
 *     val traceiq = TraceIQ(TraceIQConfig(projectId = "proj_...", writeKey = "trq_..."))
 *     traceiq.capture("payout_succeeded", userId = "user_123", properties = mapOf("amount" to 50000))
 *     traceiq.log("error", "Payout provider timed out", metadata = mapOf("provider" to "stripe"))
 *     traceiq.shutdown() // flush before a short-lived process exits
 */
class TraceIQ(private val config: TraceIQConfig) {

    private val endpoint = config.endpoint.trimEnd('/')
    private val lock = Any()
    private val queue = ArrayList<Map<String, Any?>>()
    private val logQueue = ArrayList<Map<String, Any?>>()

    private val worker = Executors.newSingleThreadScheduledExecutor { runnable ->
        Thread(runnable, "traceiq-flush").apply { isDaemon = true }
    }

    private val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    init {
        require(config.projectId.isNotEmpty()) { "TraceIQ: projectId is required." }
        require(config.writeKey.isNotEmpty()) { "TraceIQ: writeKey is required." }
        if (config.flushIntervalMs > 0) {
            worker.scheduleWithFixedDelay(
                { flushInternal() },
                config.flushIntervalMs,
                config.flushIntervalMs,
                TimeUnit.MILLISECONDS,
            )
        }
    }

    // region Public API

    @JvmOverloads
    fun capture(
        event: String,
        userId: String? = null,
        anonymousId: String? = null,
        properties: Map<String, Any?> = emptyMap(),
        timestamp: String? = null,
    ) {
        if (event.isEmpty()) return
        val e = LinkedHashMap<String, Any?>()
        e["eventName"] = event
        if (userId != null) e["userId"] = userId
        if (anonymousId != null) e["anonymousId"] = anonymousId
        e["properties"] = properties
        e["timestamp"] = timestamp ?: nowIso()
        enqueue(e)
    }

    @JvmOverloads
    fun identify(userId: String, traits: Map<String, Any?> = emptyMap()) {
        enqueue(
            linkedMapOf(
                "eventName" to "\$identify",
                "userId" to userId,
                "properties" to mapOf("traits" to traits),
                "timestamp" to nowIso(),
            ),
        )
    }

    @JvmOverloads
    fun group(organizationId: String, userId: String? = null, traits: Map<String, Any?> = emptyMap()) {
        val e = LinkedHashMap<String, Any?>()
        e["eventName"] = "\$group"
        if (userId != null) e["userId"] = userId
        e["properties"] = mapOf("organizationId" to organizationId, "traits" to traits)
        e["timestamp"] = nowIso()
        enqueue(e)
    }

    /**
     * Send a structured log line to TraceIQ Logs. [level] is `debug`, `info`, `warn`,
     * `error` or `fatal` (anything else is sent as `info`). Pass [error] to attach a
     * throwable's class, message and stack. Lines flush with events.
     */
    @JvmOverloads
    fun log(
        level: String,
        message: String,
        userId: String? = null,
        metadata: Map<String, Any?> = emptyMap(),
        error: Throwable? = null,
    ) {
        if (message.isBlank()) return
        val entry = LinkedHashMap<String, Any?>()
        entry["level"] = if (level in LOG_LEVELS) level else "info"
        entry["message"] = message.take(4000)
        entry["timestamp"] = nowIso()
        entry["service"] = config.serviceName
        entry["environment"] = config.environment
        if (userId != null) entry["distinctId"] = userId
        if (metadata.isNotEmpty()) entry["metadata"] = metadata
        if (error != null) {
            entry["errorDetails"] = mapOf(
                "name" to error.javaClass.name,
                "message" to error.message,
                "stack" to error.stackTraceToString(),
            )
        }
        val size: Int
        synchronized(lock) {
            logQueue.add(entry)
            // Bounded so an unreachable API can't grow memory without limit; oldest go first.
            while (logQueue.size > MAX_QUEUED_LOGS) logQueue.removeAt(0)
            size = logQueue.size
        }
        if (size >= config.flushAt) flush()
    }

    /** Send everything queued now (runs on the worker thread; returns immediately). */
    fun flush() {
        worker.execute { flushInternal() }
    }

    /** Flush and stop the worker. Call before the process exits. */
    fun shutdown() {
        worker.execute { flushInternal() }
        worker.shutdown()
        worker.awaitTermination(config.timeoutMs.toLong() + 5_000, TimeUnit.MILLISECONDS)
    }

    // endregion

    // region Internals

    private fun enqueue(event: Map<String, Any?>) {
        val size: Int
        synchronized(lock) {
            queue.add(event)
            size = queue.size
        }
        if (size >= config.flushAt) flush()
    }

    private fun flushInternal() {
        val batch: List<Map<String, Any?>>
        val logs: List<Map<String, Any?>>
        synchronized(lock) {
            if (queue.isEmpty() && logQueue.isEmpty()) return
            batch = ArrayList(queue)
            queue.clear()
            logs = ArrayList(logQueue)
            logQueue.clear()
        }
        if (batch.isNotEmpty()) send("/v1/events/batch", mapOf("projectId" to config.projectId, "batch" to batch))
        for (chunk in logs.chunked(MAX_LOG_BATCH)) {
            send("/v1/logs/batch", mapOf("projectId" to config.projectId, "logs" to chunk))
        }
    }

    private fun send(path: String, payload: Map<String, Any?>) {
        val body = encodeJson(payload)
        var attempt = 0
        while (true) {
            attempt++
            try {
                val status = post(path, body)
                if (status in 200..299) return
                if (status < 500 && status != 429) {
                    handleError(RuntimeException("TraceIQ request to $path rejected with $status."))
                    return
                }
                throw RuntimeException("TraceIQ request to $path failed with $status.")
            } catch (error: Throwable) {
                if (attempt > config.maxRetries) {
                    handleError(error)
                    return
                }
                try {
                    Thread.sleep(minOf(1000L shl (attempt - 1), 30_000L))
                } catch (interrupted: InterruptedException) {
                    Thread.currentThread().interrupt()
                    return
                }
            }
        }
    }

    private fun post(path: String, body: String): Int {
        val connection = URL("$endpoint$path").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = config.timeoutMs
            connection.readTimeout = config.timeoutMs
            connection.doOutput = true
            connection.setRequestProperty("content-type", "application/json")
            connection.setRequestProperty("x-traceiq-write-key", config.writeKey)
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            return connection.responseCode
        } finally {
            connection.disconnect()
        }
    }

    private fun nowIso(): String = isoFormat.format(Date())

    private fun handleError(error: Throwable) {
        if (config.debug) println("[traceiq] ${error.message}")
        config.onError?.invoke(error)
    }

    // endregion

    // region Minimal JSON encoder (dependency-free)

    private fun encodeJson(value: Any?): String {
        val sb = StringBuilder()
        writeJson(sb, value)
        return sb.toString()
    }

    private fun writeJson(sb: StringBuilder, value: Any?) {
        when (value) {
            null -> sb.append("null")
            is String -> writeString(sb, value)
            is Boolean -> sb.append(value.toString())
            is Number -> sb.append(value.toString())
            is Map<*, *> -> {
                sb.append('{')
                var first = true
                for ((k, v) in value) {
                    if (!first) sb.append(',')
                    first = false
                    writeString(sb, k.toString())
                    sb.append(':')
                    writeJson(sb, v)
                }
                sb.append('}')
            }
            is Iterable<*> -> {
                sb.append('[')
                var first = true
                for (item in value) {
                    if (!first) sb.append(',')
                    first = false
                    writeJson(sb, item)
                }
                sb.append(']')
            }
            else -> writeString(sb, value.toString())
        }
    }

    private fun writeString(sb: StringBuilder, value: String) {
        sb.append('"')
        for (ch in value) {
            when (ch) {
                '"' -> sb.append("\\\"")
                '\\' -> sb.append("\\\\")
                '\n' -> sb.append("\\n")
                '\r' -> sb.append("\\r")
                '\t' -> sb.append("\\t")
                else -> if (ch < ' ') sb.append("\\u%04x".format(ch.code)) else sb.append(ch)
            }
        }
        sb.append('"')
    }

    // endregion
}
