// Shared types and pure helpers for the Requests explorer. Kept free of React so
// the URL/filter logic can be unit-tested and reused by API Performance links.

export type CaptureState = 'captured' | 'redacted' | 'metadata_only' | 'unavailable';
export type RequestSort = 'time' | 'duration';

export interface RequestListItem {
  id: string;
  occurredAt: string;
  requestId: string | null;
  traceId: string | null;
  service: string | null;
  environment: string | null;
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  responseSize: number | null;
  captureState: CaptureState;
}

export interface CapturedBody {
  state: 'captured' | 'redacted' | 'truncated' | 'empty' | 'not_captured' | 'unavailable';
  reason?: string;
  contentType?: string | null;
  encoding?: 'json' | 'text';
  value?: unknown;
  size?: number | null;
}

export interface CapturedSide {
  headers?: Record<string, string> | null;
  headersState?: 'captured' | 'not_captured';
  query?: Record<string, string | string[]> | null;
  body: CapturedBody;
}

export interface RequestDetail extends RequestListItem {
  projectId: string;
  receivedAt: string;
  spanId: string | null;
  parentSpanId: string | null;
  sessionId: string | null;
  userId: string | null;
  anonymousId: string | null;
  instrumentation: string | null;
  host: string | null;
  url: string | null;
  requestSize: number | null;
  captureReason: string | null;
  payload: { request: CapturedSide; response: CapturedSide; redactedFields: number } | null;
}

export interface RequestsSummary {
  total: number;
  serverErrors: number;
  errorRate: number;
  p95: number;
  captures: { captured: number; redacted: number; metadataOnly: number; unavailable: number };
}

export interface TimelineEntry {
  kind: 'request' | 'log';
  id: string;
  name: string;
  service: string | null;
  startedAt: string;
  offsetMs: number;
  durationMs: number | null;
  status: string;
  statusCode: number | null;
  current: boolean;
  matchedBy: 'trace_id' | 'request_id' | 'self';
}

export interface RelatedResponse {
  correlation: { requestId: string | null; traceId: string | null };
  logs: Array<{
    id: string;
    timestamp: string;
    level: string;
    service: string;
    operation: string;
    message: string;
    status: string;
    durationMs: number | null;
    matchedBy: 'trace_id' | 'request_id';
  }>;
  errors: Array<{ id: string; type: string; message: string; occurredAt: string; matchedBy: string }>;
  syntheticRuns: Array<{ id: string; monitorId: string; monitorName: string | null; status: string; createdAt: string }>;
  session: { id: string } | null;
  user: { id: string } | null;
}

export interface CaptureSettings {
  enabled: boolean;
  services: string[];
  routes: string[];
  captureHeaders: boolean;
  captureBodies: boolean;
  redactFields: string[];
  maxBodyBytes: number;
}

export const TIME_RANGES = ['1h', '6h', '24h', '7d', '30d'] as const;
export type TimeRange = (typeof TIME_RANGES)[number];

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

export const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '2xx', label: '2xx success' },
  { value: '3xx', label: '3xx redirect' },
  { value: '4xx', label: '4xx client error' },
  { value: '5xx', label: '5xx server error' },
  { value: 'failed', label: 'No response (0)' }
];

export const CAPTURE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'payload', label: 'Has payload' },
  { value: 'captured', label: 'Captured' },
  { value: 'redacted', label: 'Redacted' },
  { value: 'metadata_only', label: 'Metadata only' },
  { value: 'unavailable', label: 'Unavailable' }
];

export const CAPTURE_LABELS: Record<CaptureState, string> = {
  captured: 'Captured',
  redacted: 'Redacted',
  metadata_only: 'Metadata only',
  unavailable: 'Unavailable'
};

/** Every filter the explorer keeps in the URL. Empty strings mean "not set". */
export interface RequestFilters {
  range: string;
  from: string;
  to: string;
  search: string;
  service: string;
  method: string;
  status: string;
  environment: string;
  capture: string;
  route: string;
  sort: RequestSort;
  request: string;
}

export const DEFAULT_FILTERS: RequestFilters = {
  range: '24h',
  from: '',
  to: '',
  search: '',
  service: '',
  method: '',
  status: '',
  environment: '',
  capture: '',
  route: '',
  sort: 'time',
  request: ''
};

const FILTER_KEYS = Object.keys(DEFAULT_FILTERS) as Array<keyof RequestFilters>;

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function read(source: ParamSource, key: string): string {
  if (source instanceof URLSearchParams) return source.get(key) ?? '';
  const value = source[key];
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

export function filtersFromParams(source: ParamSource): RequestFilters {
  const filters = { ...DEFAULT_FILTERS };
  for (const key of FILTER_KEYS) {
    const value = read(source, key).trim();
    if (value) (filters as Record<string, string>)[key] = value;
  }
  if (!(TIME_RANGES as readonly string[]).includes(filters.range)) filters.range = DEFAULT_FILTERS.range;
  if (filters.sort !== 'duration') filters.sort = 'time';
  if (filters.method) filters.method = filters.method.toUpperCase();
  // A custom window needs both ends; otherwise fall back to the preset.
  if (!filters.from || !filters.to) {
    filters.from = '';
    filters.to = '';
  }
  return filters;
}

/** URL query for the explorer page (only non-default values, plus projectId). */
export function filtersToSearch(filters: RequestFilters, projectId?: string | null): string {
  const params = new URLSearchParams();
  if (projectId) params.set('projectId', projectId);
  for (const key of FILTER_KEYS) {
    const value = filters[key];
    if (value && value !== DEFAULT_FILTERS[key]) params.set(key, value);
  }
  return params.toString();
}

/** Query string for the API (drops UI-only keys, includes the time window). */
export function filtersToApiQuery(
  filters: RequestFilters,
  projectId?: string | null,
  extra: Record<string, string | undefined> = {}
): string {
  const params = new URLSearchParams();
  if (projectId) params.set('projectId', projectId);
  if (filters.from && filters.to) {
    params.set('from', filters.from);
    params.set('to', filters.to);
  } else {
    params.set('range', filters.range);
  }
  for (const key of ['search', 'service', 'method', 'status', 'environment', 'capture', 'route'] as const) {
    if (filters[key]) params.set(key, filters[key]);
  }
  if (filters.sort === 'duration') params.set('sort', 'duration');
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  return params.toString();
}

const API_PERF_DAYS_TO_RANGE: Record<string, TimeRange> = { '1': '24h', '7': '7d', '30': '30d' };

/**
 * Link from an API Performance endpoint row to the Requests explorer, scoped to
 * that endpoint and the same period. 14d has no preset, so it becomes a custom
 * window ending now.
 */
export function requestsHrefForEndpoint(params: {
  method?: string;
  path: string;
  days?: string;
  status?: string;
  projectId?: string | null;
  sort?: RequestSort;
  now?: Date;
}): string {
  const filters: RequestFilters = { ...DEFAULT_FILTERS, route: params.path };
  if (params.method && (METHODS as readonly string[]).includes(params.method.toUpperCase())) {
    filters.method = params.method.toUpperCase();
  }
  if (params.status) filters.status = params.status;
  if (params.sort) filters.sort = params.sort;
  const days = params.days ?? '7';
  const preset = API_PERF_DAYS_TO_RANGE[days];
  if (preset) {
    filters.range = preset;
  } else {
    const dayCount = Math.min(Math.max(Number(days) || 7, 1), 30);
    const to = params.now ?? new Date();
    filters.from = new Date(to.getTime() - dayCount * 86_400_000).toISOString();
    filters.to = to.toISOString();
  }
  return `/dashboard/requests?${filtersToSearch(filters, params.projectId)}`;
}

export function activeFilterCount(filters: RequestFilters): number {
  return (['service', 'method', 'status', 'environment', 'capture', 'route', 'search'] as const).filter(
    (key) => !!filters[key]
  ).length;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms >= 10_000) return `${(ms / 1000).toFixed(1)} s`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms >= 100) return `${Math.round(ms)} ms`;
  const rounded = Math.round(ms * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ms`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type StatusTone = 'success' | 'redirect' | 'client' | 'server' | 'none';

export function statusTone(status: number): StatusTone {
  if (status >= 500) return 'server';
  if (status >= 400) return 'client';
  if (status >= 300) return 'redirect';
  if (status >= 200) return 'success';
  return 'none';
}

/** Deep link into the existing Errors issue view for a correlated exception. */
export function errorIssueHref(type: string, message: string, projectId?: string | null): string {
  const params = new URLSearchParams({ type, message, days: '30' });
  if (projectId) params.set('projectId', projectId);
  return `/dashboard/errors?${params.toString()}`;
}

/** Requests explorer filtered to an exact request id (e.g. from a synthetic run). */
export function requestsSearchHref(requestId: string, projectId?: string | null): string {
  return `/dashboard/requests?${filtersToSearch({ ...DEFAULT_FILTERS, range: '30d', search: requestId }, projectId)}`;
}

/** Deep link into Logs searching for a correlation id, ±1h around the request. */
export function logsSearchHref(id: string, at: string, projectId?: string | null): string {
  const time = new Date(at).getTime();
  const params = new URLSearchParams({ search: id });
  if (Number.isFinite(time)) {
    params.set('from', new Date(time - 3_600_000).toISOString());
    params.set('to', new Date(time + 3_600_000).toISOString());
  }
  if (projectId) params.set('projectId', projectId);
  return `/dashboard/logs?${params.toString()}`;
}
