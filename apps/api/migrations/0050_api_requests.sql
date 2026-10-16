-- 0050_api_requests.sql
-- Individual HTTP request records for the Requests Explorer.
--
-- `$api_request` events keep flowing through the normal event ingest path (and
-- still power API Performance). During ingest each one is also normalized into a
-- typed, indexed row here so the explorer can filter, sort and paginate without
-- scanning JSON in the generic events table. Payloads (headers/bodies) are only
-- persisted when the project's capture policy allows it, and are redacted before
-- they are written.

CREATE TABLE IF NOT EXISTS api_requests (
  id TEXT PRIMARY KEY,
  event_id TEXT,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Correlation
  request_id TEXT,
  trace_id TEXT,
  span_id TEXT,
  parent_span_id TEXT,
  session_id TEXT,
  user_id TEXT,
  anonymous_id TEXT,

  -- Where it ran
  service TEXT,
  environment TEXT,
  instrumentation TEXT,
  host TEXT,

  -- What happened
  method TEXT NOT NULL,
  route TEXT NOT NULL,
  url TEXT,
  status_code INTEGER NOT NULL,
  duration_ms DOUBLE PRECISION NOT NULL CHECK (duration_ms >= 0),
  request_size INTEGER,
  response_size INTEGER,

  -- Payload capture. `payload` is NULL unless capture_state is captured/redacted.
  capture_state TEXT NOT NULL DEFAULT 'metadata_only'
    CHECK (capture_state IN ('captured', 'redacted', 'metadata_only', 'unavailable')),
  capture_reason TEXT,
  payload JSONB
);

CREATE INDEX IF NOT EXISTS api_requests_project_time_idx
  ON api_requests (project_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS api_requests_project_route_time_idx
  ON api_requests (project_id, route, occurred_at DESC);

CREATE INDEX IF NOT EXISTS api_requests_project_service_time_idx
  ON api_requests (project_id, service, occurred_at DESC)
  WHERE service IS NOT NULL;

CREATE INDEX IF NOT EXISTS api_requests_project_status_time_idx
  ON api_requests (project_id, status_code, occurred_at DESC);

CREATE INDEX IF NOT EXISTS api_requests_project_request_id_idx
  ON api_requests (project_id, request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS api_requests_project_trace_id_idx
  ON api_requests (project_id, trace_id)
  WHERE trace_id IS NOT NULL;

-- Per-project payload capture policy. Absent row = metadata only (the default).
CREATE TABLE IF NOT EXISTS api_request_capture_settings (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  -- Empty array = every service / route. Routes match by prefix.
  services TEXT[] NOT NULL DEFAULT '{}',
  routes TEXT[] NOT NULL DEFAULT '{}',
  capture_headers BOOLEAN NOT NULL DEFAULT true,
  capture_bodies BOOLEAN NOT NULL DEFAULT false,
  -- Extra field names (case-insensitive) redacted on top of the built-in list.
  redact_fields TEXT[] NOT NULL DEFAULT '{}',
  max_body_bytes INTEGER NOT NULL DEFAULT 8192 CHECK (max_body_bytes BETWEEN 0 AND 65536),
  updated_by_user_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backfill metadata-only records from recent `$api_request` events so the
-- explorer is useful immediately. Bounded to 30 days and to rows with a valid
-- numeric status/duration (the same guard API Performance uses).
INSERT INTO api_requests (
  id, event_id, organization_id, project_id, occurred_at, received_at,
  session_id, user_id, anonymous_id, instrumentation,
  method, route, status_code, duration_ms, capture_state, capture_reason
)
SELECT
  'req_' || substr(md5(e.id), 1, 24),
  e.id,
  e.organization_id,
  e.project_id,
  e.occurred_at,
  e.received_at,
  e.session_id,
  e.user_id::text,
  e.anonymous_id,
  'backfill',
  upper(left(COALESCE(NULLIF(e.properties->>'method', ''), 'GET'), 16)),
  left(COALESCE(NULLIF(e.properties->>'path', ''), '/'), 512),
  (e.properties->>'status')::int,
  (e.properties->>'durationMs')::double precision,
  'metadata_only',
  'Recorded before request capture was available.'
FROM events e
WHERE e.event_name = '$api_request'
  AND e.occurred_at >= now() - interval '30 days'
  AND e.properties->>'durationMs' ~ '^[0-9]+(\.[0-9]+)?$'
  AND e.properties->>'status' ~ '^[0-9]{1,3}$'
ON CONFLICT (id) DO NOTHING;
