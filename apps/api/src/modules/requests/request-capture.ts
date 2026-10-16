// Normalization and redaction for `$api_request` telemetry.
//
// Pure functions only: the ingest path calls these to turn an event's properties
// into a typed `api_requests` row, and to make sure raw payloads (headers, query,
// bodies) never reach the generic events table, webhooks, or the database without
// passing the project's capture policy and redaction first.

type JsonObject = Record<string, unknown>;

export const API_REQUEST_EVENT = '$api_request';

export type CaptureState = 'captured' | 'redacted' | 'metadata_only' | 'unavailable';
export const CAPTURE_STATES: readonly CaptureState[] = ['captured', 'redacted', 'metadata_only', 'unavailable'];

export interface CaptureSettings {
  enabled: boolean;
  services: string[];
  routes: string[];
  captureHeaders: boolean;
  captureBodies: boolean;
  redactFields: string[];
  maxBodyBytes: number;
}

export const DEFAULT_CAPTURE_SETTINGS: CaptureSettings = {
  enabled: false,
  services: [],
  routes: [],
  captureHeaders: true,
  captureBodies: false,
  redactFields: [],
  maxBodyBytes: 8192
};

export const MAX_BODY_BYTES_LIMIT = 65_536;

export type BodyState = 'captured' | 'redacted' | 'truncated' | 'empty' | 'not_captured' | 'unavailable';

export interface CapturedBody {
  state: BodyState;
  reason?: string;
  contentType?: string | null;
  encoding?: 'json' | 'text';
  value?: unknown;
  /** Size in bytes the SDK reported or that we measured before truncation. */
  size?: number | null;
}

export interface CapturedSide {
  headers?: Record<string, string> | null;
  headersState?: 'captured' | 'not_captured';
  query?: Record<string, string | string[]> | null;
  body: CapturedBody;
}

export interface CapturedPayload {
  request: CapturedSide;
  response: CapturedSide;
  redactedFields: number;
}

export interface ApiRequestRecord {
  id: string;
  eventId: string | null;
  organizationId: string;
  projectId: string;
  occurredAt: string;
  requestId: string | null;
  traceId: string | null;
  spanId: string | null;
  parentSpanId: string | null;
  sessionId: string | null;
  userId: string | null;
  anonymousId: string | null;
  service: string | null;
  environment: string | null;
  instrumentation: string | null;
  host: string | null;
  method: string;
  route: string;
  url: string | null;
  statusCode: number;
  durationMs: number;
  requestSize: number | null;
  responseSize: number | null;
  captureState: CaptureState;
  captureReason: string | null;
  payload: CapturedPayload | null;
}

export interface NormalizeInput {
  id: string;
  eventId: string | null;
  organizationId: string;
  projectId: string;
  occurredAt: Date;
  properties: JsonObject | undefined;
  context?: JsonObject;
  sessionId?: string | null;
  userId?: string | null;
  anonymousId?: string | null;
  settings: CaptureSettings | null;
}

// ─── Redaction ──────────────────────────────────────────────────────────────

export const REDACTED = '[REDACTED]';

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-access-token',
  'x-refresh-token',
  'x-csrf-token',
  'x-xsrf-token',
  'x-traceiq-write-key',
  'x-amz-security-token',
  'x-goog-api-key'
]);

// Compared after lowercasing and stripping non-alphanumerics, so `api_key`,
// `apiKey` and `API-KEY` all match `apikey`.
const SENSITIVE_FIELDS = new Set([
  'password',
  'passwd',
  'pass',
  'pwd',
  'secret',
  'clientsecret',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'authtoken',
  'sessiontoken',
  'apikey',
  'apisecret',
  'privatekey',
  'authorization',
  'auth',
  'credentials',
  'credential',
  'cookie',
  'session',
  'sessionid',
  'sid',
  'otp',
  'mfacode',
  'pin',
  'ssn',
  'socialsecuritynumber',
  'creditcard',
  'cardnumber',
  'ccnumber',
  'cvv',
  'cvc',
  'iban',
  'accountnumber',
  'routingnumber',
  'taxid',
  'dob',
  'dateofbirth',
  'email',
  'phone',
  'phonenumber'
]);

const SENSITIVE_FRAGMENTS = ['password', 'secret', 'token', 'apikey', 'privatekey', 'creditcard', 'cardnumber'];

const BEARER_PATTERN = /\b(bearer|basic)\s+[a-z0-9._~+/=-]{8,}/gi;
const JWT_PATTERN = /\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b/g;
const CARD_PATTERN = /\b\d(?:[ -]?\d){12,18}\b/g;

const MAX_DEPTH = 8;
const MAX_KEYS = 200;
const MAX_ARRAY_ITEMS = 100;
const MAX_HEADER_VALUE = 1024;

function fieldKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function isSensitiveField(name: string, extra: ReadonlySet<string> = new Set()): boolean {
  const key = fieldKey(name);
  if (!key) return false;
  if (SENSITIVE_FIELDS.has(key) || extra.has(key)) return true;
  return SENSITIVE_FRAGMENTS.some((fragment) => key.includes(fragment));
}

export function isSensitiveHeader(name: string, extra: ReadonlySet<string> = new Set()): boolean {
  const lower = name.toLowerCase();
  if (SENSITIVE_HEADERS.has(lower)) return true;
  return isSensitiveField(lower, extra);
}

class RedactionCounter {
  count = 0;
}

function redactString(value: string, counter: RedactionCounter): string {
  let changed = false;
  const next = value
    .replace(BEARER_PATTERN, () => {
      changed = true;
      return REDACTED;
    })
    .replace(JWT_PATTERN, () => {
      changed = true;
      return REDACTED;
    })
    .replace(CARD_PATTERN, (match) => {
      // Only treat it as a card when it passes the Luhn check, so plain long
      // numbers (ids, timestamps) are left readable.
      if (!luhn(match.replace(/\D/g, ''))) return match;
      changed = true;
      return REDACTED;
    });
  if (changed) counter.count += 1;
  return next;
}

function luhn(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

export function redactValue(
  value: unknown,
  extra: ReadonlySet<string>,
  counter: RedactionCounter = new RedactionCounter(),
  depth = 0
): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string') return redactString(value, counter);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= MAX_DEPTH) return '[MAX DEPTH]';
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => redactValue(item, extra, counter, depth + 1));
  }
  if (typeof value === 'object') {
    const out: JsonObject = {};
    for (const [key, inner] of Object.entries(value as JsonObject).slice(0, MAX_KEYS)) {
      if (isSensitiveField(key, extra)) {
        out[key] = REDACTED;
        counter.count += 1;
      } else {
        out[key] = redactValue(inner, extra, counter, depth + 1);
      }
    }
    return out;
  }
  return null;
}

export function redactHeaders(
  headers: unknown,
  extra: ReadonlySet<string>,
  counter: RedactionCounter = new RedactionCounter()
): Record<string, string> | null {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return null;
  const out: Record<string, string> = {};
  for (const [name, raw] of Object.entries(headers as JsonObject).slice(0, MAX_KEYS)) {
    const key = name.toLowerCase().slice(0, 128);
    if (isSensitiveHeader(key, extra)) {
      out[key] = REDACTED;
      counter.count += 1;
      continue;
    }
    const value = Array.isArray(raw) ? raw.map(String).join(', ') : raw == null ? '' : String(raw);
    out[key] = redactString(value.slice(0, MAX_HEADER_VALUE), counter);
  }
  return out;
}

export function redactQuery(
  query: unknown,
  extra: ReadonlySet<string>,
  counter: RedactionCounter = new RedactionCounter()
): Record<string, string | string[]> | null {
  if (!query || typeof query !== 'object' || Array.isArray(query)) return null;
  const out: Record<string, string | string[]> = {};
  for (const [name, raw] of Object.entries(query as JsonObject).slice(0, MAX_KEYS)) {
    const key = name.slice(0, 128);
    if (isSensitiveField(key, extra)) {
      out[key] = REDACTED;
      counter.count += 1;
      continue;
    }
    out[key] = Array.isArray(raw)
      ? raw.slice(0, MAX_ARRAY_ITEMS).map((item) => redactString(String(item), counter))
      : redactString(raw == null ? '' : String(raw), counter);
  }
  return out;
}

/** Drops the query string + fragment and any userinfo from a URL; returns null when unusable. */
export function sanitizeUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const trimmed = raw.trim().slice(0, 2048);
  try {
    const parsed = new URL(trimmed, 'http://relative.invalid');
    const origin = parsed.host === 'relative.invalid' ? '' : `${parsed.protocol}//${parsed.host}`;
    return `${origin}${parsed.pathname}`.slice(0, 1024);
  } catch {
    return trimmed.split(/[?#]/)[0].slice(0, 1024) || null;
  }
}

function hostFromUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const parsed = new URL(raw);
    return parsed.host || null;
  } catch {
    return null;
  }
}

// ─── Body handling ─────────────────────────────────────────────────────────

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (byteLength(value) <= maxBytes) return value;
  return Buffer.from(value, 'utf8').subarray(0, maxBytes).toString('utf8').replace(/�+$/, '');
}

function isJsonContentType(contentType: string | null | undefined): boolean {
  return !!contentType && /[/+]json\b/i.test(contentType);
}

function isFormContentType(contentType: string | null | undefined): boolean {
  return !!contentType && /application\/x-www-form-urlencoded/i.test(contentType);
}

function isTextual(contentType: string | null | undefined): boolean {
  if (!contentType) return true;
  return /^(text\/|application\/(json|xml|x-www-form-urlencoded|graphql|javascript)|.*\+(json|xml))/i.test(contentType);
}

export function captureBody(
  side: JsonObject | undefined,
  settings: CaptureSettings,
  extra: ReadonlySet<string>,
  counter: RedactionCounter
): CapturedBody {
  const contentType = optionalString(side?.contentType, 256);
  const reportedSize = optionalInt(side?.bodySize);

  if (!settings.captureBodies) {
    return {
      state: 'not_captured',
      reason: 'Body capture is disabled in this project’s capture settings.',
      contentType,
      size: reportedSize
    };
  }
  if (side?.bodyState === 'unavailable') {
    return {
      state: 'unavailable',
      reason: optionalString(side?.bodyReason, 256) ?? 'The SDK could not read this body (streamed or binary).',
      contentType,
      size: reportedSize
    };
  }

  const raw = side?.body;
  if (raw === undefined || raw === null || raw === '') {
    return { state: 'empty', contentType, size: reportedSize ?? 0 };
  }
  if (!isTextual(contentType)) {
    return {
      state: 'unavailable',
      reason: `Binary content (${contentType}) is never captured.`,
      contentType,
      size: reportedSize
    };
  }

  const before = counter.count;
  let structured: unknown = undefined;
  if (typeof raw === 'object') {
    structured = raw;
  } else if (typeof raw === 'string' && isJsonContentType(contentType)) {
    try {
      structured = JSON.parse(raw);
    } catch {
      structured = undefined;
    }
  } else if (typeof raw === 'string' && isFormContentType(contentType)) {
    const params = new URLSearchParams(raw);
    const form: JsonObject = {};
    for (const [key, value] of params) form[key] = value;
    structured = form;
  }

  const maxBytes = Math.min(Math.max(settings.maxBodyBytes, 0), MAX_BODY_BYTES_LIMIT);

  if (structured !== undefined) {
    const redacted = redactValue(structured, extra, counter);
    const serialized = JSON.stringify(redacted);
    const size = reportedSize ?? byteLength(typeof raw === 'string' ? raw : JSON.stringify(raw));
    if (byteLength(serialized) > maxBytes) {
      return {
        state: 'truncated',
        reason: `Body exceeded the ${maxBytes}-byte capture limit; showing the first ${maxBytes} bytes after redaction.`,
        contentType,
        encoding: 'text',
        value: truncateUtf8(serialized, maxBytes),
        size
      };
    }
    return {
      state: counter.count > before ? 'redacted' : 'captured',
      contentType,
      encoding: 'json',
      value: redacted,
      size
    };
  }

  const text = redactString(String(raw), counter);
  const size = reportedSize ?? byteLength(String(raw));
  if (byteLength(text) > maxBytes) {
    return {
      state: 'truncated',
      reason: `Body exceeded the ${maxBytes}-byte capture limit; showing the first ${maxBytes} bytes after redaction.`,
      contentType,
      encoding: 'text',
      value: truncateUtf8(text, maxBytes),
      size
    };
  }
  return {
    state: counter.count > before ? 'redacted' : 'captured',
    contentType,
    encoding: 'text',
    value: text,
    size
  };
}

// ─── Policy ──────────────────────────────────────────────────────────────────

/** Why payloads are (not) captured for this request; null means capture is allowed. */
export function captureBlockedReason(
  settings: CaptureSettings | null,
  service: string | null,
  route: string
): string | null {
  if (!settings || !settings.enabled) return 'Payload capture is disabled for this project (metadata only).';
  if (settings.services.length > 0 && (!service || !settings.services.includes(service))) {
    return `Payload capture is not enabled for service "${service ?? 'unknown'}".`;
  }
  if (settings.routes.length > 0 && !settings.routes.some((prefix) => route.startsWith(prefix))) {
    return 'Payload capture is not enabled for this route.';
  }
  return null;
}

// ─── Normalization ─────────────────────────────────────────────────────────

function optionalString(value: unknown, max = 256): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function optionalInt(value: unknown): number | null {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed) || parsed < 0) return null;
  return Math.min(Math.round(parsed), 2_147_483_647);
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^[0-9]+(\.[0-9]+)?$/.test(value.trim())) return Number(value);
  return null;
}

const ID_PATTERN = /^[A-Za-z0-9._:/+=-]{1,128}$/;

function optionalId(value: unknown): string | null {
  // Never truncate an id: a shortened id would silently correlate with the wrong record.
  if (typeof value !== 'string') return null;
  const str = value.trim();
  return ID_PATTERN.test(str) ? str : null;
}

function normalizeRoute(value: unknown): string {
  const str = optionalString(value, 2048) ?? '/';
  const path = str.split(/[?#]/)[0];
  return path.slice(0, 512) || '/';
}

/**
 * Removes payload material from an `$api_request` event's properties before the
 * event is stored or forwarded, and strips query strings from any URL. Other
 * events are returned untouched.
 */
export function stripApiRequestPayload(eventName: string, properties: JsonObject | undefined): JsonObject | undefined {
  if (eventName !== API_REQUEST_EVENT || !properties) return properties;
  const { payload: _payload, ...rest } = properties;
  if (typeof rest.url === 'string') {
    rest.url = sanitizeUrl(rest.url);
  }
  if (typeof rest.path === 'string') {
    rest.path = normalizeRoute(rest.path);
  }
  return rest;
}

export function normalizeApiRequest(input: NormalizeInput): ApiRequestRecord | null {
  const props = input.properties ?? {};
  const statusCode = parseNumber(props.status ?? props.statusCode);
  const durationMs = parseNumber(props.durationMs ?? props.duration);
  if (statusCode === null || durationMs === null || statusCode > 999) return null;

  const library = (input.context?.library ?? null) as JsonObject | null;
  const route = normalizeRoute(props.route ?? props.path);
  const service = optionalString(props.service, 128);
  const rawUrl = typeof props.url === 'string' ? props.url : null;

  const record: ApiRequestRecord = {
    id: input.id,
    eventId: input.eventId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    occurredAt: input.occurredAt.toISOString(),
    requestId: optionalId(props.requestId),
    traceId: optionalId(props.traceId),
    spanId: optionalId(props.spanId),
    parentSpanId: optionalId(props.parentSpanId),
    sessionId: input.sessionId ?? null,
    userId: input.userId ?? null,
    anonymousId: input.anonymousId ?? null,
    service,
    environment: optionalString(props.environment, 64),
    instrumentation: optionalString(props.instrumentation, 64) ?? optionalString(library?.name, 64),
    host: optionalString(props.host, 256) ?? hostFromUrl(rawUrl),
    method: (optionalString(props.method, 16) ?? 'GET').toUpperCase(),
    route,
    url: sanitizeUrl(rawUrl),
    statusCode: Math.trunc(statusCode),
    durationMs: Math.round(durationMs * 100) / 100,
    requestSize: optionalInt(props.requestSize),
    responseSize: optionalInt(props.responseSize),
    captureState: 'metadata_only',
    captureReason: null,
    payload: null
  };

  const rawPayload = props.payload && typeof props.payload === 'object' && !Array.isArray(props.payload)
    ? (props.payload as JsonObject)
    : null;

  if (!rawPayload) {
    record.captureReason = 'The instrumentation did not send a payload for this request.';
    return record;
  }

  const blocked = captureBlockedReason(input.settings, service, route);
  if (blocked) {
    record.captureReason = blocked;
    return record;
  }

  if (rawPayload.state === 'unavailable') {
    record.captureState = 'unavailable';
    record.captureReason = optionalString(rawPayload.reason, 256) ?? 'The SDK could not capture this payload.';
    return record;
  }

  const settings = input.settings as CaptureSettings;
  const extra = new Set(settings.redactFields.map(fieldKey).filter(Boolean));
  const counter = new RedactionCounter();
  const side = (key: 'request' | 'response'): CapturedSide => {
    const raw = (rawPayload[key] && typeof rawPayload[key] === 'object' ? rawPayload[key] : {}) as JsonObject;
    return {
      headers: settings.captureHeaders ? redactHeaders(raw.headers, extra, counter) : null,
      headersState: settings.captureHeaders ? 'captured' : 'not_captured',
      query: key === 'request' ? redactQuery(raw.query, extra, counter) : null,
      body: captureBody(raw, settings, extra, counter)
    };
  };

  const request = side('request');
  const response = side('response');
  record.payload = { request, response, redactedFields: counter.count };
  record.captureState = counter.count > 0 ? 'redacted' : 'captured';
  return record;
}

export function rowToCaptureSettings(row: {
  enabled: boolean;
  services: string[] | null;
  routes: string[] | null;
  capture_headers: boolean;
  capture_bodies: boolean;
  redact_fields: string[] | null;
  max_body_bytes: number;
}): CaptureSettings {
  return {
    enabled: row.enabled,
    services: row.services ?? [],
    routes: row.routes ?? [],
    captureHeaders: row.capture_headers,
    captureBodies: row.capture_bodies,
    redactFields: row.redact_fields ?? [],
    maxBodyBytes: row.max_body_bytes
  };
}
