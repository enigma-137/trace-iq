"""TraceIQ server-side client for Python.

Events are queued and flushed in batches by a background worker thread, so calls
never block on the network.

    from traceiq import Client

    traceiq = Client(project_id="proj_...", write_key="trq_...")
    traceiq.capture("payout_succeeded", user_id="user_123",
                    properties={"amount": 50000, "currency": "NGN"})
    traceiq.log("error", "Payout provider timed out", provider="stripe")
    if traceiq.is_feature_enabled("new-payouts", "user_123"):
        ...
    traceiq.shutdown()  # flush before exit
"""

from __future__ import annotations

import atexit
import json
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple, Union

__all__ = ["Client"]

LOG_LEVELS = ("debug", "info", "warn", "error", "fatal")
_MAX_LOG_BATCH = 100  # API limit per /v1/logs/batch request
_MAX_QUEUED_LOGS = 1000

_DEFAULTS = {
    "endpoint": "http://localhost:4000",
    "flush_at": 20,
    "flush_interval": 10.0,
    "max_retries": 3,
    "timeout": 10.0,
}


def _to_iso(value: Optional[Union[str, datetime]]) -> str:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat().replace("+00:00", "Z")
    if isinstance(value, str) and value:
        return value
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class Client:
    def __init__(
        self,
        project_id: str,
        write_key: str,
        endpoint: str = _DEFAULTS["endpoint"],
        flush_at: int = _DEFAULTS["flush_at"],
        flush_interval: float = _DEFAULTS["flush_interval"],
        max_retries: int = _DEFAULTS["max_retries"],
        timeout: float = _DEFAULTS["timeout"],
        debug: bool = False,
        on_error: Optional[Callable[[Exception], None]] = None,
        service_name: str = "server",
        environment: str = "production",
    ) -> None:
        if not project_id:
            raise ValueError("TraceIQ: project_id is required.")
        if not write_key:
            raise ValueError("TraceIQ: write_key is required.")

        self.project_id = project_id
        self.write_key = write_key
        self.endpoint = endpoint.rstrip("/")
        self.flush_at = flush_at
        self.flush_interval = flush_interval
        self.max_retries = max_retries
        self.timeout = timeout
        self.debug = debug
        self.on_error = on_error
        self.service_name = service_name
        self.environment = environment

        self._queue: List[Dict[str, Any]] = []
        self._log_queue: List[Dict[str, Any]] = []
        self._lock = threading.Lock()
        self._cond = threading.Condition(self._lock)
        self._stopped = False

        self._worker = threading.Thread(target=self._run, name="traceiq-flush", daemon=True)
        self._worker.start()
        atexit.register(self.shutdown)

    # -- public API ---------------------------------------------------------

    def capture(
        self,
        event: str,
        user_id: Optional[str] = None,
        anonymous_id: Optional[str] = None,
        properties: Optional[Dict[str, Any]] = None,
        context: Optional[Dict[str, Any]] = None,
        timestamp: Optional[Union[str, datetime]] = None,
    ) -> None:
        if not event:
            return
        self._enqueue(
            {
                "eventName": event,
                "userId": user_id,
                "anonymousId": anonymous_id,
                "properties": properties or {},
                "context": context or {},
                "timestamp": _to_iso(timestamp),
            }
        )

    def identify(
        self,
        user_id: str,
        traits: Optional[Dict[str, Any]] = None,
        timestamp: Optional[Union[str, datetime]] = None,
    ) -> None:
        self._enqueue(
            {
                "eventName": "$identify",
                "userId": user_id,
                "properties": {"traits": traits or {}},
                "timestamp": _to_iso(timestamp),
            }
        )

    def group(
        self,
        organization_id: str,
        user_id: Optional[str] = None,
        anonymous_id: Optional[str] = None,
        traits: Optional[Dict[str, Any]] = None,
        timestamp: Optional[Union[str, datetime]] = None,
    ) -> None:
        self._enqueue(
            {
                "eventName": "$group",
                "userId": user_id,
                "anonymousId": anonymous_id,
                "properties": {"organizationId": organization_id, "traits": traits or {}},
                "timestamp": _to_iso(timestamp),
            }
        )

    def log(
        self,
        level: str,
        message: str,
        service: Optional[str] = None,
        user_id: Optional[str] = None,
        error: Optional[BaseException] = None,
        **metadata: Any,
    ) -> None:
        """Send a structured log line to TraceIQ Logs. Extra keyword arguments are
        stored as metadata; pass ``error`` to attach the exception's details."""
        if not isinstance(message, str) or not message.strip():
            return
        entry: Dict[str, Any] = {
            "level": level if level in LOG_LEVELS else "info",
            "message": message[:4000],
            "timestamp": _to_iso(None),
            "service": service or self.service_name,
            "environment": self.environment,
        }
        if user_id:
            entry["distinctId"] = user_id
        if metadata:
            entry["metadata"] = metadata
        if error is not None:
            entry["errorDetails"] = {"name": type(error).__name__, "message": str(error)}
        with self._cond:
            if self._stopped:
                self._debug("client is shut down; log ignored.")
                return
            self._log_queue.append(entry)
            # Bounded so an unreachable API can't grow memory without limit; oldest go first.
            del self._log_queue[:-_MAX_QUEUED_LOGS]
            if len(self._log_queue) >= self.flush_at:
                self._cond.notify_all()

    def evaluate_flags(
        self,
        distinct_id: str,
        properties: Optional[Dict[str, Any]] = None,
        environment: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Evaluate every feature flag for a user. Returns ``{"flags", "payloads",
        "details"}``; on any error the dicts are empty, so callers fall back to defaults."""
        empty: Dict[str, Any] = {"flags": {}, "payloads": {}, "details": {}}
        payload: Dict[str, Any] = {"distinctId": distinct_id, "properties": properties or {}}
        if environment:
            payload["environment"] = environment
        try:
            status, data = self._post("/v1/flags/evaluate", payload)
        except Exception as error:  # noqa: BLE001 - flags must never break the caller
            self._handle_error(error)
            return empty
        if not 200 <= status < 300 or not isinstance(data, dict):
            self._debug("evaluate_flags failed with %s" % status)
            return empty
        return {key: data.get(key) or {} for key in ("flags", "payloads", "details")}

    def is_feature_enabled(
        self,
        key: str,
        distinct_id: str,
        default: bool = False,
        properties: Optional[Dict[str, Any]] = None,
        environment: Optional[str] = None,
        track_exposure: bool = True,
    ) -> bool:
        """Whether flag ``key`` is on for this user, or ``default`` if it can't be evaluated."""
        flags = self.evaluate_flags(distinct_id, properties, environment)["flags"]
        enabled = bool(flags.get(key, default))
        if track_exposure:
            self.track_flag_exposure(key, distinct_id, enabled, environment, properties)
        return enabled

    def get_feature_flag_payload(
        self,
        key: str,
        distinct_id: str,
        default: Any = None,
        properties: Optional[Dict[str, Any]] = None,
        environment: Optional[str] = None,
        track_exposure: bool = True,
    ) -> Any:
        """The remote-config payload of flag ``key`` when it is on, else ``default``."""
        result = self.evaluate_flags(distinct_id, properties, environment)
        enabled = result["flags"].get(key) is True
        if track_exposure:
            self.track_flag_exposure(key, distinct_id, enabled, environment, properties)
        if not enabled:
            return default
        value = result["payloads"].get(key)
        return default if value is None else value

    def track_flag_exposure(
        self,
        key: str,
        distinct_id: str,
        enabled: bool,
        environment: Optional[str] = None,
        properties: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Record that a user saw a flag's value. Sent in the background."""
        payload: Dict[str, Any] = {
            "flagKey": key,
            "distinctId": distinct_id,
            "enabled": enabled,
            "environment": environment or self.environment,
            "properties": properties or {},
        }

        def send() -> None:
            try:
                self._post("/v1/flags/exposure", payload)
            except Exception as error:  # noqa: BLE001 - exposure tracking is best-effort
                self._debug("track_flag_exposure failed: %s" % error)

        threading.Thread(target=send, name="traceiq-exposure", daemon=True).start()

    def flush(self) -> None:
        """Send everything queued right now (blocks until sent)."""
        while True:
            with self._lock:
                events, logs = self._take()
            if not events and not logs:
                return
            self._deliver(events, logs)

    def shutdown(self) -> None:
        """Stop the worker and flush remaining events."""
        with self._cond:
            if self._stopped:
                return
            self._stopped = True
            self._cond.notify_all()
        self._worker.join(timeout=self.timeout + 5)
        self.flush()

    # -- internals ----------------------------------------------------------

    def _enqueue(self, event: Dict[str, Any]) -> None:
        with self._cond:
            if self._stopped:
                self._debug("client is shut down; event ignored.")
                return
            self._queue.append(event)
            if len(self._queue) >= self.flush_at:
                self._cond.notify_all()

    def _run(self) -> None:
        while True:
            with self._cond:
                if not self._stopped and max(len(self._queue), len(self._log_queue)) < self.flush_at:
                    self._cond.wait(timeout=self.flush_interval)
                if self._stopped and not self._queue and not self._log_queue:
                    return
                events, logs = self._take()
            self._deliver(events, logs)

    def _take(self) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """Removes and returns everything queued. Caller holds the lock."""
        events, logs = self._queue[:], self._log_queue[:]
        self._queue.clear()
        self._log_queue.clear()
        return events, logs

    def _deliver(self, events: List[Dict[str, Any]], logs: List[Dict[str, Any]]) -> None:
        if events:
            self._send("/v1/events/batch", {"batch": events})
        for start in range(0, len(logs), _MAX_LOG_BATCH):
            self._send("/v1/logs/batch", {"logs": logs[start : start + _MAX_LOG_BATCH]})

    def _send(self, path: str, payload: Dict[str, Any]) -> None:
        body = json.dumps(dict(payload, projectId=self.project_id)).encode("utf-8")
        attempt = 0
        while True:
            attempt += 1
            try:
                status = self._send_request(path, body)
                if 200 <= status < 300:
                    return
                if status < 500 and status != 429:
                    self._handle_error(RuntimeError("TraceIQ batch rejected with %s." % status))
                    return
                raise RuntimeError("TraceIQ batch failed with %s." % status)
            except Exception as error:  # noqa: BLE001 - report and retry/drop
                if attempt > self.max_retries:
                    self._handle_error(error if isinstance(error, Exception) else RuntimeError(str(error)))
                    return
                time.sleep(min(1.0 * 2 ** (attempt - 1), 30.0))

    def _send_request(self, path: str, body: bytes) -> int:
        """POST a batch. Returns the HTTP status code. Overridable for tests."""
        request = self._request(path, body)
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return response.getcode()
        except urllib.error.HTTPError as http_error:
            return http_error.code

    def _post(self, path: str, payload: Dict[str, Any]) -> Tuple[int, Any]:
        """POST once (no retry) and return ``(status, parsed JSON body or None)``."""
        body = json.dumps(dict(payload, projectId=self.project_id)).encode("utf-8")
        try:
            with urllib.request.urlopen(self._request(path, body), timeout=self.timeout) as response:
                raw = response.read()
                return response.getcode(), json.loads(raw) if raw else None
        except urllib.error.HTTPError as http_error:
            return http_error.code, None

    def _request(self, path: str, body: bytes) -> urllib.request.Request:
        return urllib.request.Request(
            self.endpoint + path,
            data=body,
            method="POST",
            headers={"content-type": "application/json", "x-traceiq-write-key": self.write_key},
        )

    def _handle_error(self, error: Exception) -> None:
        self._debug(str(error))
        if self.on_error:
            self.on_error(error)

    def _debug(self, message: str) -> None:
        if self.debug:
            print("[traceiq] %s" % message)
