"""TraceIQ server-side client for Python.

Events are queued and flushed in batches by a background worker thread, so calls
never block on the network.

    from traceiq import Client

    traceiq = Client(project_id="proj_...", write_key="trq_...")
    traceiq.capture("payout_succeeded", user_id="user_123",
                    properties={"amount": 50000, "currency": "NGN"})
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
from typing import Any, Callable, Dict, List, Optional, Union

__all__ = ["Client"]

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

        self._queue: List[Dict[str, Any]] = []
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

    def flush(self) -> None:
        """Send everything queued right now (blocks until sent)."""
        while True:
            with self._lock:
                if not self._queue:
                    return
                batch = self._queue[:]
                self._queue.clear()
            self._send(batch)

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
                if not self._stopped and len(self._queue) < self.flush_at:
                    self._cond.wait(timeout=self.flush_interval)
                if self._stopped and not self._queue:
                    return
                batch = self._queue[:]
                self._queue.clear()
            if batch:
                self._send(batch)

    def _send(self, batch: List[Dict[str, Any]]) -> None:
        body = json.dumps({"projectId": self.project_id, "batch": batch}).encode("utf-8")
        attempt = 0
        while True:
            attempt += 1
            try:
                status = self._send_request(body)
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

    def _send_request(self, body: bytes) -> int:
        """POST the batch. Returns the HTTP status code. Overridable for tests."""
        request = urllib.request.Request(
            "%s/v1/events/batch" % self.endpoint,
            data=body,
            method="POST",
            headers={"content-type": "application/json", "x-traceiq-write-key": self.write_key},
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return response.getcode()
        except urllib.error.HTTPError as http_error:
            return http_error.code

    def _handle_error(self, error: Exception) -> None:
        self._debug(str(error))
        if self.on_error:
            self.on_error(error)

    def _debug(self, message: str) -> None:
        if self.debug:
            print("[traceiq] %s" % message)
