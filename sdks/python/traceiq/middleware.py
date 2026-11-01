"""Server-side request timing for Python web apps: Django, WSGI (Flask...) and ASGI (FastAPI...).

Each request is timed from the moment it arrives until its response is handed off, and sent
as a `$api_request` event: method, route, status and duration, plus request and trace ids,
service, environment and sizes. These are *server* timings, the number your own logs and
Postman show. TraceIQ's browser SDK reports a different number (the full round trip from the
visitor's device) and the dashboard keeps the two apart.

Nothing here reads headers, query strings or bodies beyond the few listed above, and nothing
here can raise into your request: timing and capture failures are swallowed.

Django (settings.py)::

    from traceiq import Client
    TRACEIQ_CLIENT = Client(project_id="proj_...", write_key="trq_...",
                            endpoint="https://api.traceiq.run", service_name="my-api")
    MIDDLEWARE = ["traceiq.middleware.DjangoMiddleware", ...]

Flask or any WSGI app::

    app.wsgi_app = WSGIMiddleware(app.wsgi_app, traceiq)

FastAPI, Starlette or any ASGI app::

    app.add_middleware(ASGIMiddleware, client=traceiq)
"""

from __future__ import annotations

import asyncio
import contextvars
import re
import secrets
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

__all__ = [
    "ASGIMiddleware",
    "DjangoMiddleware",
    "RequestContext",
    "WSGIMiddleware",
    "django_middleware",
    "django_route_template",
    "get_request_context",
    "get_trace_headers",
    "templatize_path",
]

API_REQUEST_EVENT = "$api_request"

_ID_PATTERN = re.compile(r"^[A-Za-z0-9._:/+=-]{1,128}$")
_TRACEPARENT = re.compile(r"^[\da-f]{2}-([\da-f]{32})-([\da-f]{16})-[\da-f]{2}$", re.IGNORECASE)

# Page loads, assets and framework traffic rather than API calls.
_FRAMEWORK_PATH = re.compile(r"^/(static|media|__debug__|__reload__)/|^/favicon\.ico$")
_ASSET_EXTENSION = re.compile(
    r"\.(m?js|cjs|css|map|png|jpe?g|gif|svg|webp|avif|ico|bmp|woff2?|ttf|otf|eot|mp3|mp4|webm|ogg|wav|wasm|txt|webmanifest)$",
    re.IGNORECASE,
)
_UUID_SEGMENT = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)
_LONG_HEX_SEGMENT = re.compile(r"^[0-9a-f]{16,}$", re.IGNORECASE)

# Returned when no route matched (a 404 or a scanner): a constant, so random paths can't
# fill the route list with one-off entries.
UNMATCHED_ROUTE = "<unmatched>"


class RequestContext:
    """Correlation ids for the request being handled."""

    __slots__ = ("request_id", "trace_id", "span_id")

    def __init__(self, request_id: str, trace_id: str, span_id: str) -> None:
        self.request_id = request_id
        self.trace_id = trace_id
        self.span_id = span_id


_current: "contextvars.ContextVar[Optional[RequestContext]]" = contextvars.ContextVar("traceiq_request", default=None)


def get_request_context() -> Optional[RequestContext]:
    """Ids for the request in flight, or None outside the middleware."""
    return _current.get()


def get_trace_headers() -> Dict[str, str]:
    """A W3C `traceparent` header for calls made while handling a request, so a downstream
    service running this middleware joins the same trace and nests under this request.
    Empty outside a request. Works with any HTTP client::

        requests.get(url, headers=get_trace_headers())
    """
    context = _current.get()
    return {"traceparent": f"00-{context.trace_id}-{context.span_id}-01"} if context else {}


class _Options:
    def __init__(
        self,
        ignore: Optional[Callable[[Any], bool]] = None,
        include_page_requests: bool = False,
        resolve_user_id: Optional[Callable[[Any], Optional[str]]] = None,
        request_id_header: str = "x-request-id",
        echo_request_id: bool = True,
        service: Optional[str] = None,
        environment: Optional[str] = None,
        route: Optional[Callable[[Any], Optional[str]]] = None,
    ) -> None:
        self.ignore = ignore
        self.include_page_requests = include_page_requests
        self.resolve_user_id = resolve_user_id
        self.request_id_header = request_id_header.lower()
        self.echo_request_id = echo_request_id
        self.service = service
        self.environment = environment
        self.route = route


def _is_page_request(path: str, content_type: Optional[str]) -> bool:
    if _FRAMEWORK_PATH.search(path) or _ASSET_EXTENSION.search(path):
        return True
    return bool(content_type and content_type.lower().startswith("text/html"))


def templatize_path(path: str) -> str:
    """A low-cardinality route from a raw path, for frameworks that don't expose their route
    template: numeric, UUID and long-hex segments become `:id`. `/orders/42/items/7` is
    `/orders/:id/items/:id`, not one route per order."""
    clean = (path or "/").split("?", 1)[0].split("#", 1)[0] or "/"
    segments = []
    for segment in clean.split("/"):
        if segment.isdigit() or _UUID_SEGMENT.match(segment) or _LONG_HEX_SEGMENT.match(segment):
            segments.append(":id")
        else:
            segments.append(segment)
    return "/".join(segments) or "/"


_DJANGO_REGEX_GROUP = re.compile(r"\(\?P<([^>]+)>(?:[^()]|\([^()]*\))*\)")
_DJANGO_CONVERTER = re.compile(r"<(?:[^:>]+:)?([^>]+)>")


def django_route_template(route: Optional[str]) -> Optional[str]:
    """Turns a Django `resolver_match.route` into a route template.

    `api/pay/verify/<str:ref>/` -> `/api/pay/verify/:ref/`, and for `re_path`,
    `^api/items/(?P<pk>[0-9]+)/$` -> `/api/items/:pk/`. None when nothing matched.
    """
    if route is None:
        return None
    text = _DJANGO_REGEX_GROUP.sub(lambda match: ":" + match.group(1), route)
    text = _DJANGO_CONVERTER.sub(lambda match: ":" + match.group(1), text)
    text = text.replace("^", "").replace("$", "").replace("\\Z", "")
    text = re.sub(r"\\(.)", r"\1", text)
    text = "/" + text.lstrip("/")
    return re.sub(r"/{2,}", "/", text)


class _Timer:
    """One request's clock and ids. Created when the request arrives."""

    def __init__(self, options: _Options, header: Callable[[str], Optional[str]]) -> None:
        self.started_at = datetime.now(timezone.utc)
        self._start = time.perf_counter()
        incoming = header(options.request_id_header)
        request_id = incoming if incoming and _ID_PATTERN.match(incoming) else str(uuid.uuid4())
        parent = _TRACEPARENT.match(header("traceparent") or "")
        self.parent_span_id = parent.group(2).lower() if parent else None
        self.context = RequestContext(
            request_id=request_id,
            trace_id=parent.group(1).lower() if parent else secrets.token_hex(16),
            span_id=secrets.token_hex(8),
        )
        self._recorded = False

    def elapsed_ms(self) -> float:
        return round((time.perf_counter() - self._start) * 1000, 2)

    def claim(self) -> bool:
        """True once: a request is recorded a single time even if both an end and a close fire."""
        if self._recorded:
            return False
        self._recorded = True
        return True


def _record(
    client: Any,
    options: _Options,
    timer: _Timer,
    *,
    instrumentation: str,
    method: str,
    route: str,
    url: str,
    status: int,
    content_type: Optional[str] = None,
    host: Optional[str] = None,
    request_size: Optional[int] = None,
    response_size: Optional[int] = None,
    user_id: Optional[str] = None,
    aborted: bool = False,
) -> None:
    """Sends one `$api_request` event. Never raises."""
    try:
        if not timer.claim():
            return
        if not options.include_page_requests and _is_page_request(url, content_type):
            return
        properties: Dict[str, Any] = {
            "method": (method or "GET").upper(),
            "path": route,
            "status": status,
            "durationMs": timer.elapsed_ms(),
            "ok": 200 <= status < 400,
            "requestId": timer.context.request_id,
            "traceId": timer.context.trace_id,
            "spanId": timer.context.span_id,
            "url": url,
            "instrumentation": instrumentation,
        }
        if aborted:
            properties["aborted"] = True
        if timer.parent_span_id:
            properties["parentSpanId"] = timer.parent_span_id
        service = options.service or getattr(client, "service_name", None)
        if service:
            properties["service"] = service
        environment = options.environment or getattr(client, "environment", None)
        if environment:
            properties["environment"] = environment
        if host:
            properties["host"] = host
        if request_size is not None:
            properties["requestSize"] = request_size
        if response_size is not None:
            properties["responseSize"] = response_size
        client.capture(API_REQUEST_EVENT, user_id=user_id, properties=properties, timestamp=timer.started_at)
    except Exception:  # noqa: BLE001 - instrumentation must never break a request
        pass


def _to_size(value: Any) -> Optional[int]:
    try:
        size = int(value)
    except (TypeError, ValueError):
        return None
    return size if size >= 0 else None


def _safe_call(function: Optional[Callable[[Any], Any]], argument: Any) -> Any:
    if function is None:
        return None
    try:
        return function(argument)
    except Exception:  # noqa: BLE001
        return None


# ---------------------------------------------------------------- Django ----


def _django_setting(name: str) -> Any:
    try:
        from django.conf import settings  # type: ignore[import-not-found]

        return getattr(settings, name, None)
    except Exception:  # noqa: BLE001 - Django missing or not configured
        return None


try:  # Django ships asgiref; it is what Django itself uses to tell sync from async middleware.
    from asgiref.sync import iscoroutinefunction as _iscoroutinefunction  # type: ignore[import-not-found]
    from asgiref.sync import markcoroutinefunction as _markcoroutinefunction  # type: ignore[import-not-found]
except Exception:  # noqa: BLE001
    _iscoroutinefunction = asyncio.iscoroutinefunction
    _markcoroutinefunction = None


def _django_header(request: Any) -> Callable[[str], Optional[str]]:
    meta = getattr(request, "META", {}) or {}
    return lambda name: meta.get("HTTP_" + name.upper().replace("-", "_"))


class DjangoMiddleware:
    """Django middleware, sync or async. Reads the client from `settings.TRACEIQ_CLIENT` and,
    optionally, options from `settings.TRACEIQ_MIDDLEWARE` (a dict). Or build one around a client
    with :func:`django_middleware`. Put it high in MIDDLEWARE so it times the middleware below it.
    """

    sync_capable = True
    async_capable = True

    def __init__(self, get_response: Callable[..., Any], client: Any = None, **options: Any) -> None:
        self.get_response = get_response
        self._client = client if client is not None else _django_setting("TRACEIQ_CLIENT")
        if self._client is None:
            raise RuntimeError(
                "TraceIQ: set TRACEIQ_CLIENT in your Django settings to a traceiq.Client, "
                "or build the middleware with traceiq.middleware.django_middleware(client)."
            )
        merged = dict(_django_setting("TRACEIQ_MIDDLEWARE") or {})
        merged.update(options)
        self._options = _Options(**merged)
        self._is_async = bool(_iscoroutinefunction(get_response))
        if self._is_async and _markcoroutinefunction is not None:
            _markcoroutinefunction(self)

    def __call__(self, request: Any) -> Any:
        if self._is_async:
            return self._acall(request)
        return self._call(request)

    def _call(self, request: Any) -> Any:
        if self._skip(request):
            return self.get_response(request)
        timer = _Timer(self._options, _django_header(request))
        token = _current.set(timer.context)
        try:
            response = self.get_response(request)
        except BaseException:
            self._finish(request, None, timer, status=500)
            raise
        finally:
            _current.reset(token)
        self._finish(request, response, timer)
        return response

    async def _acall(self, request: Any) -> Any:
        if self._skip(request):
            return await self.get_response(request)
        timer = _Timer(self._options, _django_header(request))
        token = _current.set(timer.context)
        try:
            response = await self.get_response(request)
        except asyncio.CancelledError:
            # The client went away and the server cancelled the request.
            self._finish(request, None, timer, status=499, aborted=True)
            raise
        except BaseException:
            self._finish(request, None, timer, status=500)
            raise
        finally:
            _current.reset(token)
        self._finish(request, response, timer)
        return response

    def _skip(self, request: Any) -> bool:
        return bool(_safe_call(self._options.ignore, request))

    def _finish(self, request: Any, response: Any, timer: _Timer, status: Optional[int] = None, aborted: bool = False) -> None:
        try:
            options = self._options
            meta = getattr(request, "META", {}) or {}
            path = getattr(request, "path", "/") or "/"
            content_type = None
            response_size = None
            if response is not None:
                status = int(getattr(response, "status_code", 0) or 0)
                getter = getattr(response, "get", None)
                if callable(getter):
                    content_type = getter("Content-Type")
                    response_size = _to_size(getter("Content-Length"))
                if response_size is None and not getattr(response, "streaming", False):
                    try:
                        response_size = len(response.content)
                    except Exception:  # noqa: BLE001
                        response_size = None
                if options.echo_request_id:
                    try:
                        response["x-request-id"] = timer.context.request_id
                    except Exception:  # noqa: BLE001
                        pass

            match = getattr(request, "resolver_match", None)
            custom = _safe_call(options.route, request)
            route = custom or django_route_template(getattr(match, "route", None)) or UNMATCHED_ROUTE
            _record(
                self._client,
                options,
                timer,
                instrumentation="django",
                method=getattr(request, "method", "GET"),
                route=route,
                url=path,
                status=status if status is not None else 500,
                content_type=content_type,
                host=meta.get("HTTP_HOST") or meta.get("SERVER_NAME"),
                request_size=_to_size(meta.get("CONTENT_LENGTH")),
                response_size=response_size,
                user_id=_safe_call(options.resolve_user_id, request),
                aborted=aborted,
            )
        except Exception:  # noqa: BLE001
            pass


def django_middleware(client: Any, **options: Any) -> Callable[[Callable[..., Any]], DjangoMiddleware]:
    """A Django middleware factory bound to `client`, for projects that prefer not to put the
    client in settings. Assign it at module level and reference it by dotted path in MIDDLEWARE::

        # myproject/tracing.py
        traceiq_middleware = django_middleware(client, service="my-api")
    """

    def factory(get_response: Callable[..., Any]) -> DjangoMiddleware:
        return DjangoMiddleware(get_response, client=client, **options)

    # Django reads these off the object it imports to decide how to adapt the stack.
    factory.sync_capable = True  # type: ignore[attr-defined]
    factory.async_capable = True  # type: ignore[attr-defined]
    return factory


# ------------------------------------------------------------------ WSGI ----


def _wsgi_header(environ: Dict[str, Any]) -> Callable[[str], Optional[str]]:
    return lambda name: environ.get("HTTP_" + name.upper().replace("-", "_"))


class _ClosingIterable:
    """Wraps a WSGI response so the request is recorded when the server closes it, which is
    when the body has been sent. Counts the bytes on the way."""

    def __init__(self, result: Iterable[bytes], on_close: Callable[[int], None]) -> None:
        self._result = result
        self._iterator: Optional[Any] = None
        self._on_close = on_close
        self._size = 0

    def __iter__(self) -> "_ClosingIterable":
        self._iterator = iter(self._result)
        return self

    def __next__(self) -> bytes:
        if self._iterator is None:
            self._iterator = iter(self._result)
        chunk = next(self._iterator)
        self._size += len(chunk)
        return chunk

    def close(self) -> None:
        try:
            closer = getattr(self._result, "close", None)
            if callable(closer):
                closer()
        finally:
            self._on_close(self._size)


class WSGIMiddleware:
    """Wraps any WSGI app (Flask, Bottle, Pyramid...). Flask: `app.wsgi_app = WSGIMiddleware(app.wsgi_app, client)`.

    WSGI doesn't expose the matched route, so by default the route is the path with ids
    collapsed (`/orders/42` -> `/orders/:id`). Pass `route=lambda environ: ...` to supply your
    framework's own template. `resolve_user_id` and `ignore` also receive the WSGI `environ`.
    """

    def __init__(self, app: Callable[..., Any], client: Any, **options: Any) -> None:
        self.app = app
        self._client = client
        self._options = _Options(**options)

    def __call__(self, environ: Dict[str, Any], start_response: Callable[..., Any]) -> Any:
        if _safe_call(self._options.ignore, environ):
            return self.app(environ, start_response)

        timer = _Timer(self._options, _wsgi_header(environ))
        seen: Dict[str, Any] = {"status": 500, "content_type": None, "length": None}

        def traced_start_response(status: str, headers: List[Tuple[str, str]], exc_info: Any = None) -> Any:
            try:
                seen["status"] = int(str(status).split(" ", 1)[0])
                for key, value in headers:
                    lowered = key.lower()
                    if lowered == "content-type":
                        seen["content_type"] = value
                    elif lowered == "content-length":
                        seen["length"] = _to_size(value)
                if self._options.echo_request_id:
                    headers = list(headers) + [("x-request-id", timer.context.request_id)]
            except Exception:  # noqa: BLE001
                pass
            return start_response(status, headers, exc_info)

        def finish(size: int, status: Optional[int] = None) -> None:
            options = self._options
            path = environ.get("PATH_INFO", "/") or "/"
            custom = _safe_call(options.route, environ)
            _record(
                self._client,
                options,
                timer,
                instrumentation="wsgi",
                method=environ.get("REQUEST_METHOD", "GET"),
                route=custom or templatize_path(path),
                url=path,
                status=status if status is not None else seen["status"],
                content_type=seen["content_type"],
                host=environ.get("HTTP_HOST") or environ.get("SERVER_NAME"),
                request_size=_to_size(environ.get("CONTENT_LENGTH")),
                response_size=seen["length"] if seen["length"] is not None else size,
                user_id=_safe_call(options.resolve_user_id, environ),
            )

        token = _current.set(timer.context)
        try:
            result = self.app(environ, traced_start_response)
        except BaseException:
            finish(0, status=500)
            raise
        finally:
            _current.reset(token)
        return _ClosingIterable(result, finish)


# ------------------------------------------------------------------ ASGI ----


class ASGIMiddleware:
    """Wraps any ASGI app (FastAPI, Starlette, Django ASGI...). FastAPI:
    `app.add_middleware(ASGIMiddleware, client=traceiq)`.

    The route is the framework's own template when it exposes one (`scope["route"].path`,
    set by FastAPI), otherwise the path with ids collapsed. Requests the client abandons before
    the response is complete are recorded with status 499 and `aborted: true`.
    """

    def __init__(self, app: Callable[..., Any], client: Any, **options: Any) -> None:
        self.app = app
        self._client = client
        self._options = _Options(**options)

    async def __call__(self, scope: Dict[str, Any], receive: Callable[..., Any], send: Callable[..., Any]) -> None:
        if scope.get("type") != "http" or _safe_call(self._options.ignore, scope):
            await self.app(scope, receive, send)
            return

        headers: Dict[str, str] = {}
        for raw_key, raw_value in scope.get("headers") or []:
            try:
                headers.setdefault(raw_key.decode("latin-1").lower(), raw_value.decode("latin-1"))
            except Exception:  # noqa: BLE001
                continue
        timer = _Timer(self._options, lambda name: headers.get(name.lower()))
        state: Dict[str, Any] = {"status": None, "content_type": None, "length": None, "size": 0, "disconnected": False, "done": False}

        async def traced_receive() -> Any:
            message = await receive()
            if message.get("type") == "http.disconnect":
                state["disconnected"] = True
            return message

        async def traced_send(message: Dict[str, Any]) -> None:
            kind = message.get("type")
            if kind == "http.response.start":
                state["status"] = int(message.get("status", 0))
                message_headers = list(message.get("headers") or [])
                try:
                    for raw_key, raw_value in message_headers:
                        lowered = raw_key.decode("latin-1").lower()
                        if lowered == "content-type":
                            state["content_type"] = raw_value.decode("latin-1")
                        elif lowered == "content-length":
                            state["length"] = _to_size(raw_value.decode("latin-1"))
                    if self._options.echo_request_id:
                        message = dict(message)
                        message["headers"] = message_headers + [(b"x-request-id", timer.context.request_id.encode("latin-1"))]
                except Exception:  # noqa: BLE001
                    pass
            elif kind == "http.response.body":
                state["size"] += len(message.get("body") or b"")
                if not message.get("more_body"):
                    state["done"] = True
            await send(message)

        def finish(status: Optional[int] = None) -> None:
            options = self._options
            path = scope.get("path", "/") or "/"
            template = getattr(scope.get("route"), "path", None)
            custom = _safe_call(options.route, scope)
            aborted = state["disconnected"] and not state["done"]
            resolved = status if status is not None else (499 if aborted else state["status"] or 500)
            server = scope.get("server")
            _record(
                self._client,
                options,
                timer,
                instrumentation="asgi",
                method=scope.get("method", "GET"),
                route=custom or (template if isinstance(template, str) and template else templatize_path(path)),
                url=path,
                status=resolved,
                content_type=state["content_type"],
                host=headers.get("host") or (server[0] if server else None),
                request_size=_to_size(headers.get("content-length")),
                response_size=state["length"] if state["length"] is not None else state["size"],
                user_id=_safe_call(options.resolve_user_id, scope),
                aborted=aborted,
            )

        token = _current.set(timer.context)
        try:
            await self.app(scope, traced_receive, traced_send)
        except BaseException:
            finish(status=500)
            raise
        finally:
            _current.reset(token)
        finish()
