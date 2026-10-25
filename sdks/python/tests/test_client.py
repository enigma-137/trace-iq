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
    flags = {}

    def do_POST(self):  # noqa: N802 - http.server naming
        length = int(self.headers.get("content-length", 0))
        _Recorder.requests.append(
            {
                "path": self.path,
                "write_key": self.headers.get("x-traceiq-write-key"),
                "body": json.loads(self.rfile.read(length)),
            }
        )
        if self.path == "/v1/flags/evaluate":
            body = json.dumps(_Recorder.flags).encode("utf-8")
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(202)
        self.end_headers()

    def log_message(self, *args):
        pass


class ClientDeliveryTest(unittest.TestCase):
    def setUp(self):
        _Recorder.requests = []
        _Recorder.flags = {}
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

    def test_alias_links_previous_id_and_ignores_self_alias(self):
        client = Client("proj_test", "trq_test", endpoint=self.endpoint, flush_interval=60)
        client.alias("user_1", "guest_1")
        client.alias("user_1", "user_1")
        client.shutdown()

        batch = _Recorder.requests[0]["body"]["batch"]
        self.assertEqual(len(batch), 1)
        self.assertEqual(batch[0]["eventName"], "$alias")
        self.assertEqual(batch[0]["userId"], "user_1")
        self.assertEqual(batch[0]["properties"], {"previousId": "guest_1"})

    def test_logs_go_to_the_logs_endpoint_with_metadata_and_error(self):
        client = Client("proj_test", "trq_test", endpoint=self.endpoint, flush_interval=60, service_name="billing")
        client.log("error", "Payout provider timed out", user_id="user_1", error=TimeoutError("30s"), provider="stripe")
        client.log("loud", "unknown levels become info")
        client.log("info", "   ")
        client.shutdown()

        self.assertEqual([r["path"] for r in _Recorder.requests], ["/v1/logs/batch"])
        body = _Recorder.requests[0]["body"]
        self.assertEqual(body["projectId"], "proj_test")
        first, second = body["logs"]
        self.assertEqual(first["level"], "error")
        self.assertEqual(first["service"], "billing")
        self.assertEqual(first["distinctId"], "user_1")
        self.assertEqual(first["metadata"], {"provider": "stripe"})
        self.assertEqual(first["errorDetails"], {"name": "TimeoutError", "message": "30s"})
        self.assertEqual(second["level"], "info")

    def test_feature_flags_evaluate_and_track_exposure(self):
        _Recorder.flags = {"flags": {"new-payouts": True, "beta": False}, "payloads": {"new-payouts": {"limit": 5}}}
        client = Client("proj_test", "trq_test", endpoint=self.endpoint, flush_interval=60)

        self.assertTrue(client.is_feature_enabled("new-payouts", "user_1", track_exposure=False))
        self.assertFalse(client.is_feature_enabled("beta", "user_1", track_exposure=False))
        self.assertTrue(client.is_feature_enabled("missing", "user_1", default=True, track_exposure=False))
        self.assertEqual(client.get_feature_flag_payload("new-payouts", "user_1", track_exposure=False), {"limit": 5})
        self.assertEqual(client.get_feature_flag_payload("beta", "user_1", default="off", track_exposure=False), "off")

        evaluate = _Recorder.requests[0]
        self.assertEqual(evaluate["path"], "/v1/flags/evaluate")
        self.assertEqual(evaluate["body"]["distinctId"], "user_1")

        _Recorder.requests = []
        client.is_feature_enabled("new-payouts", "user_1", environment="staging")
        for _ in range(50):
            if len(_Recorder.requests) == 2:
                break
            threading.Event().wait(0.02)
        exposure = _Recorder.requests[1]
        self.assertEqual(exposure["path"], "/v1/flags/exposure")
        self.assertEqual(exposure["body"]["flagKey"], "new-payouts")
        self.assertIs(exposure["body"]["enabled"], True)
        self.assertEqual(exposure["body"]["environment"], "staging")
        client.shutdown()

    def test_flag_evaluation_falls_back_to_default_when_unreachable(self):
        client = Client("proj_test", "trq_test", endpoint="http://127.0.0.1:9", timeout=1, flush_interval=60)
        self.assertFalse(client.is_feature_enabled("anything", "user_1", track_exposure=False))
        self.assertEqual(client.evaluate_flags("user_1"), {"flags": {}, "payloads": {}, "details": {}})
        client.shutdown()


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
