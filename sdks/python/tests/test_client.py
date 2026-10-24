"""Smoke tests for the TraceIQ Python client. Standard library only: run with
`python -m unittest discover -s tests` from sdks/python."""

import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest import mock

from traceiq import Client


class _Recorder(BaseHTTPRequestHandler):
    requests = []

    def do_POST(self):  # noqa: N802 - http.server naming
        length = int(self.headers.get("content-length", 0))
        _Recorder.requests.append(
            {
                "path": self.path,
                "write_key": self.headers.get("x-traceiq-write-key"),
                "body": json.loads(self.rfile.read(length)),
            }
        )
        self.send_response(202)
        self.end_headers()

    def log_message(self, *args):
        pass


class ClientDeliveryTest(unittest.TestCase):
    def setUp(self):
        _Recorder.requests = []
        self.server = HTTPServer(("127.0.0.1", 0), _Recorder)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.endpoint = "http://127.0.0.1:%d" % self.server.server_port

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()

    def test_shutdown_flushes_queued_events_as_one_batch(self):
        client = Client("proj_test", "trq_test", endpoint=self.endpoint, flush_interval=60)
        client.capture("payout_succeeded", user_id="user_1", properties={"amount": 500})
        client.identify("user_1", traits={"plan": "pro"})
        client.shutdown()

        self.assertEqual(len(_Recorder.requests), 1)
        sent = _Recorder.requests[0]
        self.assertEqual(sent["path"], "/v1/events/batch")
        self.assertEqual(sent["write_key"], "trq_test")
        self.assertEqual(sent["body"]["projectId"], "proj_test")
        names = [event["eventName"] for event in sent["body"]["batch"]]
        self.assertEqual(names, ["payout_succeeded", "$identify"])
        self.assertEqual(sent["body"]["batch"][0]["properties"], {"amount": 500})


class ClientRetryTest(unittest.TestCase):
    def test_client_errors_are_dropped_without_retry(self):
        errors = []
        client = Client("proj_test", "trq_test", flush_interval=60, on_error=errors.append)
        with mock.patch.object(client, "_send_request", return_value=400) as send:
            client.capture("evt")
            client.shutdown()
        self.assertEqual(send.call_count, 1)
        self.assertEqual(len(errors), 1)

    def test_server_errors_retry_then_report(self):
        errors = []
        client = Client("proj_test", "trq_test", flush_interval=60, max_retries=2, on_error=errors.append)
        with mock.patch.object(client, "_send_request", return_value=503) as send, mock.patch(
            "traceiq.client.time.sleep"
        ):
            client.capture("evt")
            client.shutdown()
        self.assertEqual(send.call_count, 3)
        self.assertEqual(len(errors), 1)

    def test_requires_credentials(self):
        with self.assertRaises(ValueError):
            Client("", "trq_test")
        with self.assertRaises(ValueError):
            Client("proj_test", "")


if __name__ == "__main__":
    unittest.main()
