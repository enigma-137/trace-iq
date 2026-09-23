-- 0041_observability_logs.sql
-- Canonical operational observability logs, request tracking, and distributed tracing.

CREATE TABLE IF NOT EXISTS observability_logs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error', 'fatal')),
  source TEXT NOT NULL, -- 'api', 'webhook', 'ai', 'alert', 'error', 'auth', 'job', 'sdk', 'custom'
  service TEXT NOT NULL DEFAULT 'api',
  message TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'warning', 'error', 'info', 'pending')),
  status_code INTEGER,
  duration_ms INTEGER,

  -- HTTP & API request metadata
  method TEXT,
  route TEXT,
  client_ip TEXT,
  user_agent TEXT,

  -- Distributed Tracing & Correlation
  trace_id TEXT,
  request_id TEXT,
  session_id TEXT,
  distinct_id TEXT,
  actor_user_id TEXT,

  -- AI / Integration specific metadata
  provider TEXT,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd DOUBLE PRECISION,

  -- Structured attributes / metadata
  environment TEXT NOT NULL DEFAULT 'production',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_details JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- High-performance query indexing
CREATE INDEX IF NOT EXISTS observability_logs_project_time_idx
  ON observability_logs(project_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS observability_logs_project_source_time_idx
  ON observability_logs(project_id, source, timestamp DESC);

CREATE INDEX IF NOT EXISTS observability_logs_project_level_time_idx
  ON observability_logs(project_id, level, timestamp DESC);

CREATE INDEX IF NOT EXISTS observability_logs_project_status_time_idx
  ON observability_logs(project_id, status, timestamp DESC);

CREATE INDEX IF NOT EXISTS observability_logs_trace_id_idx
  ON observability_logs(trace_id)
  WHERE trace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS observability_logs_request_id_idx
  ON observability_logs(request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS observability_logs_session_id_idx
  ON observability_logs(session_id)
  WHERE session_id IS NOT NULL;
