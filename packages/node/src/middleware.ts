import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes, randomUUID } from 'node:crypto';
import type { CaptureParams } from './client';

// Minimal structural types so we don't depend on express (works with express,
// connect, and anything that follows the (req, res, next) contract).
export interface RequestLike {
  method?: string;
  originalUrl?: string;
  url?: string;
  baseUrl?: string;
  path?: string;
  route?: { path?: unknown };
  headers?: Record<string, string | string[] | undefined>;
  query?: unknown;
  body?: unknown;
}

export interface ResponseLike {
  statusCode?: number;
  on(event: 'finish' | 'close', listener: () => void): void;
  writableFinished?: boolean;
  setHeader?(name: string, value: string): unknown;
  getHeader?(name: string): unknown;
  getHeaders?(): Record<string, unknown>;
  headersSent?: boolean;
  write?: (...args: any[]) => any;
  end?: (...args: any[]) => any;
}

export type NextLike = (error?: unknown) => void;

export interface PayloadCaptureOptions {
  /** Send request/response headers (sensitive headers are always redacted). Default true. */
  headers?: boolean;
  /** Send request/response bodies (sensitive fields are always redacted). Default false. */
  bodies?: boolean;
  /** Bytes kept per body before truncation. Default 8192. */
  maxBodyBytes?: number;
  /** Return false to keep a request metadata-only (e.g. auth routes). */
  shouldCapture?: (req: RequestLike) => boolean;
}

export interface MiddlewareOptions {
  /** Pull the identified user id off the request (e.g. (req) => req.user?.id). */
  resolveUserId?: (req: RequestLike) => string | undefined;
  /** Override how the route/path is derived. Defaults to the Express route template. */
  path?: (req: RequestLike) => string;
  /** Return true to skip a request (health checks, …). */
  ignore?: (req: RequestLike) => boolean;
  /**
   * Also record page loads: HTML responses (server-rendered pages, SPA fallback),
   * static assets and framework/dev-server paths. Off by default, so the Requests
   * explorer and API performance show API calls only.
   */
  includePageRequests?: boolean;
  /** Logical service name shown in the Requests explorer (e.g. "billing-api"). */
  service?: string;
  /** Deployment environment (e.g. "production"). Defaults to NODE_ENV when set. */
  environment?: string;
  /** Incoming header that carries an upstream request id. Default "x-request-id". */
  requestIdHeader?: string;
  /** Echo the request id back on the response as `x-request-id`. Default true. */
  echoRequestId?: boolean;
  /**
   * Opt-in payload capture. Off by default. Payloads are also gated server-side by
   * the project's capture settings and redacted again before they are stored.
   */
  capturePayloads?: boolean | PayloadCaptureOptions;
}

/** The request currently being handled, available to code running inside it. */
export interface RequestContext {
  requestId: string;
  traceId: string;
  spanId: string;
}

const requestContext = new AsyncLocalStorage<RequestContext>();

/** Correlation ids for the in-flight request, or undefined outside the middleware. */
export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}

/**
 * A W3C `traceparent` header for calls made while handling a request, so a
 * downstream service instrumented with traceiq.middleware() joins the same trace
 * and nests under this request. Empty outside a request. Works with any HTTP client:
 *
 *   await axios.get(url, { headers: getTraceHeaders() });
 */
export function getTraceHeaders(): Record<string, string> {
  const context = requestContext.getStore();
  return context ? { traceparent: traceparentFor(context) } : {};
}

function traceparentFor(context: RequestContext): string {
  // This request's span is the parent of whatever the downstream service records.
  return `00-${context.traceId}-${context.spanId}-01`;
}

export type TracePropagationTargets = true | Array<string | RegExp>;

let fetchPatched = false;
let propagation: { targets: TracePropagationTargets; skip: string[] } | undefined;

/**
 * Wraps the global fetch (once per process) so calls made inside a request handled
 * by traceiq.middleware() carry a traceparent header. `true` propagates to every
 * URL; a list limits it to URLs containing a string or matching a RegExp. Calls to
 * `skipPrefix` (TraceIQ itself) and requests that already set traceparent are left
 * alone. The latest client's targets apply when several clients enable it.
 */
export function installFetchTracePropagation(targets: TracePropagationTargets, skipPrefix: string): void {
  propagation = { targets, skip: [...(propagation?.skip ?? []), skipPrefix] };
  if (fetchPatched || typeof globalThis.fetch !== 'function') return;
  fetchPatched = true;
  const original = globalThis.fetch;
  globalThis.fetch = function traceiqFetch(input: Parameters<typeof fetch>[0], init?: RequestInit) {
    const context = requestContext.getStore();
    if (context && propagation) {
      try {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (shouldPropagate(url, propagation)) {
          const headers = new Headers(init?.headers ?? (typeof input === 'object' && 'headers' in input ? input.headers : undefined));
          if (!headers.has('traceparent')) {
            headers.set('traceparent', traceparentFor(context));
            init = { ...init, headers };
          }
        }
      } catch {
        // Never let instrumentation break the request.
      }
    }
    return original.call(globalThis, input, init);
  } as typeof fetch;
}

function shouldPropagate(url: string, config: { targets: TracePropagationTargets; skip: string[] }): boolean {
  if (config.skip.some((prefix) => url.startsWith(prefix))) return false;
  if (config.targets === true) return true;
  return config.targets.some((target) => (typeof target === 'string' ? url.includes(target) : target.test(url)));
}

interface Capturer {
  capture(params: CaptureParams): void;
}

const ID_PATTERN = /^[A-Za-z0-9._:/+=-]{1,128}$/;
const TRACEPARENT = /^[\da-f]{2}-([\da-f]{32})-([\da-f]{16})-[\da-f]{2}$/i;

const FRAMEWORK_PATH = /^\/(_next|__nextjs|_nuxt|__vite_ping|@vite|@fs|@id|@react-refresh|__webpack_hmr|sockjs-node|_app\/immutable)\b|\.hot-update\./;
const ASSET_EXTENSION =
  /\.(m?js|cjs|css|map|png|jpe?g|gif|svg|webp|avif|ico|bmp|woff2?|ttf|otf|eot|mp3|mp4|webm|ogg|wav|wasm|txt|webmanifest)$/i;

// Page loads, assets and framework traffic rather than API calls.
function isPageRequest(req: RequestLike, res: ResponseLike): boolean {
  const pathname = (req.originalUrl ?? req.url ?? '/').split(/[?#]/)[0];
  if (FRAMEWORK_PATH.test(pathname) || ASSET_EXTENSION.test(pathname)) return true;
  const contentType = String(res.getHeader?.('content-type') ?? '');
  return /^text\/html\b/i.test(contentType);
}

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-access-token',
  'x-csrf-token',
  'x-xsrf-token',
  'x-traceiq-write-key'
]);
const SENSITIVE_FIELD = /(pass(word|wd)?|secret|token|api[-_]?key|private[-_]?key|authorization|cookie|session|ssn|card[-_]?number|cvv|cvc)/i;

/**
 * Express/connect-style middleware that times each request and emits a
 * `$api_request` event when the response finishes: method, route, status and
 * duration, plus request/trace ids, service, environment and sizes. Timing and
 * capture never throw into the request lifecycle.
 */
export function createRequestMiddleware(client: Capturer, options: MiddlewareOptions = {}) {
  const idHeader = (options.requestIdHeader ?? 'x-request-id').toLowerCase();
  const environment = options.environment ?? process.env.NODE_ENV ?? undefined;
  const capture = resolveCapture(options.capturePayloads);

  return function traceiqRequestMiddleware(req: RequestLike, res: ResponseLike, next: NextLike): void {
    if (options.ignore?.(req)) {
      next();
      return;
    }

    const startedAt = new Date();
    const start = process.hrtime.bigint();
    const incomingId = header(req, idHeader);
    const requestId = incomingId && ID_PATTERN.test(incomingId) ? incomingId : randomUUID();
    const parent = TRACEPARENT.exec(header(req, 'traceparent') ?? '');
    const context: RequestContext = {
      requestId,
      traceId: parent ? parent[1].toLowerCase() : randomBytes(16).toString('hex'),
      spanId: randomBytes(8).toString('hex')
    };

    if (options.echoRequestId !== false) {
      try {
        if (!res.headersSent) res.setHeader?.('x-request-id', requestId);
      } catch {
        // Never let instrumentation break the request.
      }
    }

    const captureThis = capture && (capture.shouldCapture?.(req) ?? true);
    const responseBody = captureThis && capture.bodies ? tapResponseBody(res, capture.maxBodyBytes) : null;

    // `finish` fires once the response is fully handed off; `close` without it means
    // the client went away first. Both are recorded (once) so aborted requests and
    // long-polls that are cut off still show up instead of silently vanishing.
    let recorded = false;
    const record = (aborted: boolean) => {
      if (recorded) return;
      recorded = true;
      try {
        if (!options.includePageRequests && isPageRequest(req, res)) return;
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        const status = aborted ? 499 : res.statusCode ?? 0;
        const rawUrl = req.originalUrl ?? req.url ?? '/';
        const properties: Record<string, unknown> = {
          method: (req.method ?? 'GET').toUpperCase(),
          path: options.path ? options.path(req) : derivePath(req),
          status,
          durationMs: Math.round(durationMs * 100) / 100,
          ok: status >= 200 && status < 400,
          requestId: context.requestId,
          traceId: context.traceId,
          spanId: context.spanId,
          url: rawUrl.split(/[?#]/)[0],
          instrumentation: 'node'
        };
        if (aborted) properties.aborted = true;
        if (parent) properties.parentSpanId = parent[2].toLowerCase();
        if (options.service) properties.service = options.service;
        if (environment) properties.environment = environment;
        const host = header(req, 'host');
        if (host) properties.host = host;
        const requestSize = toSize(header(req, 'content-length'));
        if (requestSize !== undefined) properties.requestSize = requestSize;
        const responseSize = toSize(res.getHeader?.('content-length')) ?? responseBody?.size();
        if (responseSize !== undefined) properties.responseSize = responseSize;

        if (captureThis && capture) {
          properties.payload = buildPayload(req, res, capture, responseBody);
        }

        client.capture({
          event: '$api_request',
          userId: options.resolveUserId?.(req),
          properties,
          timestamp: startedAt
        });
      } catch {
        // Never let instrumentation break the request.
      }
    };
    res.on('finish', () => record(false));
    res.on('close', () => record(res.writableFinished === false));

    requestContext.run(context, () => next());
  };
}

interface ResolvedCapture {
  headers: boolean;
  bodies: boolean;
  maxBodyBytes: number;
  shouldCapture?: (req: RequestLike) => boolean;
}

function resolveCapture(option: MiddlewareOptions['capturePayloads']): ResolvedCapture | null {
  if (!option) return null;
  const config = option === true ? {} : option;
  return {
    headers: config.headers !== false,
    bodies: config.bodies === true,
    maxBodyBytes: Math.min(Math.max(config.maxBodyBytes ?? 8192, 0), 65_536),
    shouldCapture: config.shouldCapture
  };
}

function header(req: RequestLike, name: string): string | undefined {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' ? value : undefined;
}

function toSize(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : undefined;
}

function redactHeaders(headers: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    const key = name.toLowerCase();
    if (value === undefined) continue;
    out[key] =
      SENSITIVE_HEADERS.has(key) || SENSITIVE_FIELD.test(key)
        ? '[REDACTED]'
        : Array.isArray(value)
          ? value.map(String).join(', ')
          : String(value);
  }
  return out;
}

function redactFields(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactFields(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_FIELD.test(key) ? '[REDACTED]' : redactFields(inner, depth + 1);
  }
  return out;
}

function bodyForTransport(body: unknown, maxBytes: number): unknown {
  if (body === undefined || body === null) return undefined;
  if (Buffer.isBuffer(body)) return body.subarray(0, maxBytes).toString('utf8');
  if (typeof body === 'string') return body.length > maxBytes * 2 ? body.slice(0, maxBytes * 2) : body;
  return redactFields(body);
}

function buildPayload(
  req: RequestLike,
  res: ResponseLike,
  capture: ResolvedCapture,
  responseBody: ReturnType<typeof tapResponseBody> | null
) {
  const requestType = header(req, 'content-type') ?? null;
  const responseType = String(res.getHeader?.('content-type') ?? '') || null;
  return {
    request: {
      headers: capture.headers ? redactHeaders(req.headers) : undefined,
      query: req.query && typeof req.query === 'object' ? redactFields(req.query) : undefined,
      contentType: requestType,
      body: capture.bodies ? bodyForTransport(req.body, capture.maxBodyBytes) : undefined,
      bodySize: toSize(header(req, 'content-length'))
    },
    response: {
      headers: capture.headers ? redactHeaders(res.getHeaders?.()) : undefined,
      contentType: responseType,
      body: capture.bodies ? responseBody?.text() : undefined,
      bodySize: responseBody?.size()
    }
  };
}

// Wraps res.write/res.end to keep the first `maxBytes` of the response body.
function tapResponseBody(res: ResponseLike, maxBytes: number) {
  const chunks: Buffer[] = [];
  let kept = 0;
  let total = 0;
  const collect = (chunk: unknown, encoding?: unknown) => {
    if (chunk === undefined || chunk === null || typeof chunk === 'function') return;
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(String(chunk), typeof encoding === 'string' ? (encoding as BufferEncoding) : 'utf8');
    total += buffer.length;
    if (kept < maxBytes) {
      const slice = buffer.subarray(0, maxBytes - kept);
      chunks.push(slice);
      kept += slice.length;
    }
  };
  const originalWrite = res.write;
  const originalEnd = res.end;
  if (typeof originalWrite === 'function') {
    res.write = function (this: unknown, chunk: unknown, ...rest: unknown[]) {
      try {
        collect(chunk, rest[0]);
      } catch {
        // ignore
      }
      return originalWrite.call(this, chunk, ...rest);
    };
  }
  if (typeof originalEnd === 'function') {
    res.end = function (this: unknown, chunk: unknown, ...rest: unknown[]) {
      try {
        collect(chunk, rest[0]);
      } catch {
        // ignore
      }
      return originalEnd.call(this, chunk, ...rest);
    };
  }
  return {
    text: () => (chunks.length ? Buffer.concat(chunks).toString('utf8') : undefined),
    size: () => (total > 0 ? total : undefined)
  };
}

function derivePath(req: RequestLike): string {
  // Prefer the matched route template (/users/:id) so requests group cleanly.
  const routePath = req.route?.path;
  if (typeof routePath === 'string' && routePath.length > 0) {
    return normalizeApiPath(`${req.baseUrl ?? ''}${routePath}`);
  }
  return normalizeApiPath(req.originalUrl ?? req.url ?? req.path ?? '/');
}

// Strips query + collapses id-like segments so /users/123 -> /users/:id.
export function normalizeApiPath(rawUrl: string): string {
  const pathname = rawUrl.split('?')[0].split('#')[0];
  const collapsed = pathname
    .split('/')
    .map((segment) => (isIdSegment(segment) ? ':id' : segment))
    .join('/');
  return collapsed || '/';
}

function isIdSegment(segment: string): boolean {
  if (!segment) return false;
  if (/^\d+$/.test(segment)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return true;
  if (/^[0-9a-f]{16,}$/i.test(segment)) return true;
  if (/^\d/.test(segment) && /[a-z]/i.test(segment) && segment.length >= 12) return true;
  return false;
}
