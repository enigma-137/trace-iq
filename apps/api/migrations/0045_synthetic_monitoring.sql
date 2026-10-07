-- Migration 0045: Synthetic Monitoring Foundation
-- Tables for deterministic synthetic monitors, steps, and test runs.

CREATE TABLE IF NOT EXISTS synthetic_monitors (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  base_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  schedule TEXT NOT NULL DEFAULT '15m' CHECK (schedule IN ('5m', '15m', '30m', '1h', '6h', '24h', 'manual')),
  browser TEXT NOT NULL DEFAULT 'chromium' CHECK (browser IN ('chromium', 'firefox', 'webkit')),
  viewport_width INTEGER NOT NULL DEFAULT 1280,
  viewport_height INTEGER NOT NULL DEFAULT 720,
  timeout_ms INTEGER NOT NULL DEFAULT 30000,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  environment TEXT NOT NULL DEFAULT 'production',
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT CHECK (last_run_status IN ('passed', 'failed', 'timed_out', 'running')),
  last_run_duration_ms INTEGER,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS synthetic_monitors_project_status_idx
  ON synthetic_monitors(project_id, status)
  WHERE status != 'archived';

CREATE INDEX IF NOT EXISTS synthetic_monitors_due_idx
  ON synthetic_monitors(status, next_run_at)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS synthetic_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  monitor_id TEXT NOT NULL REFERENCES synthetic_monitors(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'passed', 'failed', 'timed_out')),
  trigger TEXT NOT NULL DEFAULT 'scheduled' CHECK (trigger IN ('scheduled', 'manual', 'api', 'ci')),
  target_url TEXT NOT NULL,
  browser TEXT NOT NULL DEFAULT 'chromium',
  viewport JSONB NOT NULL DEFAULT '{"width": 1280, "height": 720}'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  failed_step_index INTEGER,
  failure_reason TEXT,
  final_url TEXT,
  step_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  console_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
  network_requests JSONB NOT NULL DEFAULT '[]'::jsonb,
  http_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  screenshot_base64 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS synthetic_runs_monitor_time_idx
  ON synthetic_runs(monitor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS synthetic_runs_project_time_idx
  ON synthetic_runs(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS synthetic_runs_status_idx
  ON synthetic_runs(status)
  WHERE status IN ('queued', 'running');
