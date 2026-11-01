"""Tests for the request-timing middleware. Standard library only, no Django, Flask or FastAPI
needed: the frameworks' requests and responses are faked. Run with
`python -m unittest discover -s tests` from sdks/python."""

import asyncio
import re
import sys
import time
import types
import unittest
from datetime import datetime
from unittest import mock

from traceiq.middleware import (
    ASGIMiddleware,
    DjangoMiddleware,
    WSGIMiddleware,
    django_middleware,
    django_route_template,
    get_request_context,
    get_trace_headers,
    templatize_path,
)


class FakeClient:
    service_name = "nuwell-api"
    environment = "production"

    def __init__(self):
        self.events = []

    def capture(self, event, user_id=None, anonymous_id=None, properties=None, context=None, timestamp=None):
        self.events.append({"event": event, "user_id": user_id, "properties": properties, "timestamp": timestamp})


class BrokenClient(FakeClient):
    def capture(self, *args, **kwargs):
        raise RuntimeError("TraceIQ is down")


class FakeRequest:
    def __init__(self, method="GET", path="/api/payment/verify/T123/", route="api/payment/verify/<str:ref>/", meta=None):
        self.method = method
        self.path = path
        self.META = {"HTTP_HOST": "api.nuwell.test", "CONTENT_LENGTH": "42"}
        self.META.update(meta or {})
        self.resolver_match = types.SimpleNamespace(route=route) if route is not None else None


class FakeResponse:
    streaming = False

    def __init__(self, status_code=200, content=b'{"ok": true}', content_type="application/json"):
        self.status_code = status_code
        self.content = content
        self.headers = {"Content-Type": content_type}

    def get(self, key, default=None):
        return self.headers.get(key, default)

    def __setitem__(self, key, value):
        self.headers[key] = value

    def __getitem__(self, key):
        return self.headers[key]


def last_props(client):
    return client.events[-1]["properties"]


class RouteTemplateTests(unittest.TestCase):
    def test_django_route_patterns_become_templates(self):
        self.assertEqual(django_route_template("api/payment/verify/<str:ref>/"), "/api/payment/verify/:ref/")
        self.assertEqual(django_route_template("users/<int:id>/posts/<slug>/"), "/users/:id/posts/:slug/")
        self.assertEqual(django_route_template(r"^api/items/(?P<pk>[0-9]+)/$"), "/api/items/:pk/")
        self.assertEqual(django_route_template(r"api/^items/(?P<pk>\d+)/(?P<tail>(?:a|b))/$"), "/api/items/:pk/:tail/")
        self.assertEqual(django_route_template(""), "/")

    def test_nothing_matched_is_none(self):
        self.assertIsNone(django_route_template(None))

    def test_ids_in_a_raw_path_are_collapsed(self):
        self.assertEqual(templatize_path("/orders/42/items/7"), "/orders/:id/items/:id")
        self.assertEqual(templatize_path("/users/3f2b8c1e-9d4a-4b6e-8f10-1a2b3c4d5e6f"), "/users/:id")
        self.assertEqual(templatize_path("/files/0123456789abcdef0123"), "/files/:id")
        self.assertEqual(templatize_path("/health?x=1"), "/health")
        self.assertEqual(templatize_path("/api/v2/users"), "/api/v2/users")
        self.assertEqual(templatize_path(""), "/")


class DjangoSyncTests(unittest.TestCase):
    def build(self, view, client=None, **options):
        client = client or FakeClient()
        return client, DjangoMiddleware(view, client=client, **options)

    def test_records_one_api_request_event_with_the_server_timing(self):
        def view(request):
            time.sleep(0.03)
            return FakeResponse()

        client, middleware = self.build(view)
        response = middleware(FakeRequest())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(client.events), 1)
        event = client.events[0]
        self.assertEqual(event["event"], "$api_request")
        self.assertIsInstance(event["timestamp"], datetime)
        self.assertIsNotNone(event["timestamp"].tzinfo)
        props = event["properties"]
        self.assertGreaterEqual(props["durationMs"], 25)
        self.assertLess(props["durationMs"], 2000)
        self.assertEqual(props["method"], "GET")
        self.assertEqual(props["path"], "/api/payment/verify/:ref/")  # the template, not the raw URL
        self.assertEqual(props["url"], "/api/payment/verify/T123/")
        self.assertEqual(props["status"], 200)
        self.assertTrue(props["ok"])
        self.assertEqual(props["instrumentation"], "django")  # not "browser": this is a server timing
        self.assertEqual(props["service"], "nuwell-api")
        self.assertEqual(props["environment"], "production")
        self.assertEqual(props["host"], "api.nuwell.test")
        self.assertEqual(props["requestSize"], 42)
        self.assertEqual(props["responseSize"], len(b'{"ok": true}'))

    def test_trace_ids_are_well_formed_and_the_request_id_is_echoed(self):
        client, middleware = self.build(lambda request: FakeResponse())
        response = middleware(FakeRequest())
        props = last_props(client)
        self.assertRegex(props["traceId"], r"^[0-9a-f]{32}$")
        self.assertRegex(props["spanId"], r"^[0-9a-f]{16}$")
        self.assertEqual(response["x-request-id"], props["requestId"])
        self.assertNotIn("parentSpanId", props)

    def test_unmatched_routes_share_one_constant_so_scanners_cannot_flood_the_list(self):
        client, middleware = self.build(lambda request: FakeResponse(404))
        middleware(FakeRequest(path="/wp-login-7731.php", route=None))
        middleware(FakeRequest(path="/.env.bak", route=None))
        self.assertEqual({event["properties"]["path"] for event in client.events}, {"<unmatched>"})
        self.assertFalse(client.events[0]["properties"]["ok"])

    def test_an_exception_is_recorded_as_500_and_still_raised(self):
        def view(request):
            raise ValueError("boom")

        client, middleware = self.build(view)
        with self.assertRaises(ValueError):
            middleware(FakeRequest())
        self.assertEqual(last_props(client)["status"], 500)
        self.assertIsNone(get_request_context())  # the request context never leaks out

    def test_incoming_ids_are_honoured_and_a_trace_is_continued(self):
        client, middleware = self.build(lambda request: FakeResponse())
        trace, parent = "4bf92f3577b34da6a3ce929d0e0e4736", "00f067aa0ba902b7"
        middleware(FakeRequest(meta={"HTTP_X_REQUEST_ID": "req-abc_123", "HTTP_TRACEPARENT": f"00-{trace}-{parent}-01"}))
        props = last_props(client)
        self.assertEqual(props["requestId"], "req-abc_123")
        self.assertEqual(props["traceId"], trace)
        self.assertEqual(props["parentSpanId"], parent)
        self.assertNotEqual(props["spanId"], parent)

    def test_a_malformed_request_id_is_replaced_not_trusted(self):
        client, middleware = self.build(lambda request: FakeResponse())
        middleware(FakeRequest(meta={"HTTP_X_REQUEST_ID": "bad id with spaces <script>"}))
        self.assertRegex(last_props(client)["requestId"], r"^[0-9a-f-]{36}$")

    def test_ignored_requests_assets_and_html_pages_are_not_recorded(self):
        client, middleware = self.build(lambda request: FakeResponse(), ignore=lambda request: request.path == "/healthz")
        middleware(FakeRequest(path="/healthz"))
        middleware(FakeRequest(path="/static/app.css", route=None))
        self.assertEqual(client.events, [])

        pages, page_middleware = self.build(lambda request: FakeResponse(content_type="text/html; charset=utf-8"))
        page_middleware(FakeRequest(path="/admin/login/"))
        self.assertEqual(pages.events, [])

        included, include_middleware = self.build(lambda request: FakeResponse(content_type="text/html"), include_page_requests=True)
        include_middleware(FakeRequest(path="/admin/login/"))
        self.assertEqual(len(included.events), 1)

    def test_a_broken_client_never_breaks_the_request(self):
        _, middleware = self.build(lambda request: FakeResponse(), client=BrokenClient())
        self.assertEqual(middleware(FakeRequest()).status_code, 200)

    def test_user_id_comes_from_the_resolver_and_a_failing_resolver_is_harmless(self):
        client, middleware = self.build(lambda request: FakeResponse(), resolve_user_id=lambda request: "jane@nuwell.com")
        middleware(FakeRequest())
        self.assertEqual(client.events[0]["user_id"], "jane@nuwell.com")

        def broken(request):
            raise RuntimeError("no user")

        client2, middleware2 = self.build(lambda request: FakeResponse(), resolve_user_id=broken)
        middleware2(FakeRequest())
        self.assertIsNone(client2.events[0]["user_id"])

    def test_trace_headers_exist_only_while_a_request_is_being_handled(self):
        seen = {}

        def view(request):
            seen["headers"] = get_trace_headers()
            seen["context"] = get_request_context()
            return FakeResponse()

        client, middleware = self.build(view)
        middleware(FakeRequest())
        props = last_props(client)
        self.assertEqual(seen["headers"], {"traceparent": f"00-{props['traceId']}-{props['spanId']}-01"})
        self.assertEqual(seen["context"].request_id, props["requestId"])
        self.assertEqual(get_trace_headers(), {})

    def test_the_request_id_header_can_be_left_off_the_response(self):
        _, middleware = self.build(lambda request: FakeResponse(), echo_request_id=False)
        self.assertNotIn("x-request-id", middleware(FakeRequest()).headers)

    def test_a_custom_route_and_service_override_the_defaults(self):
        client, middleware = self.build(lambda request: FakeResponse(), route=lambda request: "/custom", service="billing")
        middleware(FakeRequest())
        self.assertEqual(last_props(client)["path"], "/custom")
        self.assertEqual(last_props(client)["service"], "billing")

    def test_streaming_responses_are_timed_without_reading_their_body(self):
        response = FakeResponse()
        response.streaming = True
        del response.content  # accessing it would raise, as it does on a real streaming response
        client, middleware = self.build(lambda request: response)
        middleware(FakeRequest())
        self.assertNotIn("responseSize", last_props(client))


class DjangoSettingsTests(unittest.TestCase):
    def fake_django(self, **settings):
        module = types.ModuleType("django.conf")
        module.settings = types.SimpleNamespace(**settings)
        return mock.patch.dict(sys.modules, {"django": types.ModuleType("django"), "django.conf": module})

    def test_the_client_and_options_come_from_django_settings(self):
        client = FakeClient()
        with self.fake_django(TRACEIQ_CLIENT=client, TRACEIQ_MIDDLEWARE={"service": "from-settings"}):
            middleware = DjangoMiddleware(lambda request: FakeResponse())
            middleware(FakeRequest())
        self.assertEqual(last_props(client)["service"], "from-settings")

    def test_a_missing_client_says_how_to_fix_it(self):
        with self.fake_django():
            with self.assertRaises(RuntimeError) as raised:
                DjangoMiddleware(lambda request: FakeResponse())
        self.assertIn("TRACEIQ_CLIENT", str(raised.exception))

    def test_the_factory_binds_a_client_and_tells_django_it_handles_sync_and_async(self):
        client = FakeClient()
        factory = django_middleware(client, service="factory")
        self.assertTrue(factory.sync_capable)
        self.assertTrue(factory.async_capable)
        factory(lambda request: FakeResponse())(FakeRequest())
        self.assertEqual(last_props(client)["service"], "factory")


class DjangoAsyncTests(unittest.TestCase):
    def test_an_async_stack_is_awaited_and_recorded(self):
        async def view(request):
            await asyncio.sleep(0.03)
            return FakeResponse()

        client = FakeClient()
        middleware = DjangoMiddleware(view, client=client)

        async def run():
            return await middleware(FakeRequest())

        response = asyncio.run(run())
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(last_props(client)["durationMs"], 25)
        self.assertEqual(last_props(client)["instrumentation"], "django")

    def test_an_async_exception_is_a_500_and_a_cancelled_request_is_an_aborted_499(self):
        async def failing(request):
            raise ValueError("boom")

        client = FakeClient()
        with self.assertRaises(ValueError):
            asyncio.run(DjangoMiddleware(failing, client=client)(FakeRequest()))
        self.assertEqual(last_props(client)["status"], 500)

        async def cancelled(request):
            raise asyncio.CancelledError()

        client2 = FakeClient()
        with self.assertRaises(asyncio.CancelledError):
            asyncio.run(DjangoMiddleware(cancelled, client=client2)(FakeRequest()))
        self.assertEqual(last_props(client2)["status"], 499)
        self.assertTrue(last_props(client2)["aborted"])


def run_wsgi(middleware, environ=None, body=None):
    """Calls a WSGI app the way a server would. Returns (status line, headers, collected body, closed result)."""
    environ = {"REQUEST_METHOD": "GET", "PATH_INFO": "/orders/42", "HTTP_HOST": "api.nuwell.test", "CONTENT_LENGTH": "0", **(environ or {})}
    captured = {}

    def start_response(status, headers, exc_info=None):
        captured["status"] = status
        captured["headers"] = headers

    result = middleware(environ, start_response)
    return captured, result


class WSGITests(unittest.TestCase):
    @staticmethod
    def app(status="200 OK", chunks=(b"hello ", b"world"), headers=None):
        def application(environ, start_response):
            start_response(status, headers or [("Content-Type", "application/json")])
            return list(chunks)

        return application

    def test_records_when_the_body_has_been_sent_not_before(self):
        client = FakeClient()
        middleware = WSGIMiddleware(self.app(), client)
        captured, result = run_wsgi(middleware)
        self.assertEqual(client.events, [])  # the app returned, but the server hasn't finished sending
        body = b"".join(result)
        result.close()
        result.close()  # a server may close twice; it is still one request
        self.assertEqual(body, b"hello world")
        self.assertEqual(len(client.events), 1)
        props = last_props(client)
        self.assertEqual(props["status"], 200)
        self.assertEqual(props["path"], "/orders/:id")
        self.assertEqual(props["url"], "/orders/42")
        self.assertEqual(props["instrumentation"], "wsgi")
        self.assertEqual(props["responseSize"], len(b"hello world"))
        self.assertEqual(props["host"], "api.nuwell.test")
        self.assertEqual(dict(captured["headers"])["x-request-id"], props["requestId"])

    def test_the_status_line_is_parsed_and_a_declared_length_is_used(self):
        client = FakeClient()
        middleware = WSGIMiddleware(self.app("404 Not Found", headers=[("Content-Length", "99"), ("Content-Type", "application/json")]), client)
        _, result = run_wsgi(middleware)
        list(result)
        result.close()
        self.assertEqual(last_props(client)["status"], 404)
        self.assertEqual(last_props(client)["responseSize"], 99)
        self.assertFalse(last_props(client)["ok"])

    def test_an_exception_is_recorded_as_500_and_raised(self):
        def failing(environ, start_response):
            raise RuntimeError("boom")

        client = FakeClient()
        with self.assertRaises(RuntimeError):
            run_wsgi(WSGIMiddleware(failing, client))
        self.assertEqual(last_props(client)["status"], 500)

    def test_ignore_html_and_a_custom_route(self):
        client = FakeClient()
        run_wsgi(WSGIMiddleware(self.app(), client, ignore=lambda environ: environ["PATH_INFO"] == "/health"), {"PATH_INFO": "/health"})
        self.assertEqual(client.events, [])

        html = FakeClient()
        _, result = run_wsgi(WSGIMiddleware(self.app(headers=[("Content-Type", "text/html")]), html))
        list(result)
        result.close()
        self.assertEqual(html.events, [])

        custom = FakeClient()
        _, result = run_wsgi(WSGIMiddleware(self.app(), custom, route=lambda environ: "/flask/orders/<id>"))
        list(result)
        result.close()
        self.assertEqual(last_props(custom)["path"], "/flask/orders/<id>")

    def test_a_broken_client_never_breaks_the_response(self):
        _, result = run_wsgi(WSGIMiddleware(self.app(), BrokenClient()))
        self.assertEqual(b"".join(result), b"hello world")
        result.close()


def run_asgi(middleware, scope=None, app_messages=None, receive_messages=None):
    scope = {"type": "http", "method": "GET", "path": "/orders/42", "headers": [(b"host", b"api.nuwell.test")], **(scope or {})}
    sent = []
    incoming = list(receive_messages or [{"type": "http.request", "body": b"", "more_body": False}])

    async def receive():
        return incoming.pop(0) if incoming else {"type": "http.disconnect"}

    async def send(message):
        sent.append(message)

    asyncio.run(middleware(scope, receive, send))
    return sent


class ASGITests(unittest.TestCase):
    @staticmethod
    def app(status=200, body=b"hello", route=None, headers=None):
        async def application(scope, receive, send):
            if route:
                scope["route"] = types.SimpleNamespace(path=route)
            await send({"type": "http.response.start", "status": status, "headers": headers or [(b"content-type", b"application/json")]})
            await send({"type": "http.response.body", "body": body, "more_body": False})

        return application

    def test_records_the_request_with_the_framework_route(self):
        client = FakeClient()
        sent = run_asgi(ASGIMiddleware(self.app(route="/orders/{order_id}"), client=client))
        props = last_props(client)
        self.assertEqual(props["path"], "/orders/{order_id}")  # FastAPI's own template
        self.assertEqual(props["url"], "/orders/42")
        self.assertEqual(props["status"], 200)
        self.assertEqual(props["instrumentation"], "asgi")
        self.assertEqual(props["responseSize"], 5)
        self.assertEqual(props["host"], "api.nuwell.test")
        echoed = dict(sent[0]["headers"])
        self.assertEqual(echoed[b"x-request-id"].decode(), props["requestId"])

    def test_falls_back_to_collapsing_ids_when_the_framework_gives_no_template(self):
        client = FakeClient()
        run_asgi(ASGIMiddleware(self.app(), client=client))
        self.assertEqual(last_props(client)["path"], "/orders/:id")

    def test_an_exception_is_a_500_and_raised(self):
        async def failing(scope, receive, send):
            raise RuntimeError("boom")

        client = FakeClient()
        with self.assertRaises(RuntimeError):
            run_asgi(ASGIMiddleware(failing, client=client))
        self.assertEqual(last_props(client)["status"], 500)

    def test_other_scopes_pass_through_untouched(self):
        called = []

        async def lifespan_app(scope, receive, send):
            called.append(scope["type"])

        client = FakeClient()
        run_asgi(ASGIMiddleware(lifespan_app, client=client), scope={"type": "lifespan"})
        self.assertEqual(called, ["lifespan"])
        self.assertEqual(client.events, [])

    def test_a_client_that_leaves_before_the_response_finishes_is_an_aborted_499(self):
        async def slow(scope, receive, send):
            await receive()  # the request body
            message = await receive()  # the client hangs up
            self.assertEqual(message["type"], "http.disconnect")

        client = FakeClient()
        run_asgi(ASGIMiddleware(slow, client=client))
        props = last_props(client)
        self.assertEqual(props["status"], 499)
        self.assertTrue(props["aborted"])

    def test_incoming_request_and_trace_ids_are_read_from_the_headers(self):
        client = FakeClient()
        trace, parent = "4bf92f3577b34da6a3ce929d0e0e4736", "00f067aa0ba902b7"
        headers = [
            (b"host", b"api.nuwell.test"),
            (b"x-request-id", b"req-42"),
            (b"traceparent", f"00-{trace}-{parent}-01".encode()),
        ]
        run_asgi(ASGIMiddleware(self.app(), client=client), scope={"headers": headers})
        props = last_props(client)
        self.assertEqual((props["requestId"], props["traceId"], props["parentSpanId"]), ("req-42", trace, parent))

    def test_ignore_and_html_are_skipped_and_a_broken_client_is_harmless(self):
        client = FakeClient()
        run_asgi(ASGIMiddleware(self.app(), client=client, ignore=lambda scope: scope["path"] == "/health"), scope={"path": "/health"})
        run_asgi(ASGIMiddleware(self.app(headers=[(b"content-type", b"text/html")]), client=client))
        self.assertEqual(client.events, [])

        sent = run_asgi(ASGIMiddleware(self.app(), client=BrokenClient()))
        self.assertEqual(sent[0]["status"], 200)


class NoSecretsTests(unittest.TestCase):
    def test_events_carry_no_headers_queries_or_bodies(self):
        client = FakeClient()
        request = FakeRequest(
            path="/api/pay/",
            meta={"HTTP_AUTHORIZATION": "Bearer secret-token", "HTTP_COOKIE": "session=abc", "QUERY_STRING": "token=secret"},
        )
        DjangoMiddleware(lambda r: FakeResponse(content=b'{"card": "4242424242424242"}'), client=client)(request)
        flat = repr(last_props(client))
        for secret in ("secret-token", "session=abc", "token=secret", "4242424242424242", "Authorization"):
            self.assertNotIn(secret, flat)
        self.assertTrue(re.fullmatch(r"[A-Za-z]+", last_props(client)["method"]))


if __name__ == "__main__":
    unittest.main()
