-- Migration 0048: Synthetic CI Run Groups and Preview Testing
-- Enables running stored synthetic journeys against pull request preview URLs

CREATE TABLE IF NOT EXISTS synthetic_ci_run_groups (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'passed', 'failed', 'timed_out')),
  base_url TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'preview',
  git_provider TEXT DEFAULT 'github',
  repository TEXT,
  commit_sha TEXT,
  branch TEXT,
  pull_request_number INTEGER,
  idempotency_key TEXT,
  total_monitors INTEGER NOT NULL DEFAULT 0,
  passed_monitors INTEGER NOT NULL DEFAULT 0,
  failed_monitors INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS synthetic_ci_run_groups_project_idx
  ON synthetic_ci_run_groups(project_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS synthetic_ci_run_groups_idempotency_idx
  ON synthetic_ci_run_groups(project_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Extend synthetic_runs with CI provenance and group linkage
ALTER TABLE synthetic_runs
  ADD COLUMN IF NOT EXISTS run_group_id TEXT REFERENCES synthetic_ci_run_groups(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS environment TEXT DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS git_provider TEXT,
  ADD COLUMN IF NOT EXISTS repository TEXT,
  ADD COLUMN IF NOT EXISTS commit_sha TEXT,
  ADD COLUMN IF NOT EXISTS branch TEXT,
  ADD COLUMN IF NOT EXISTS pull_request_number INTEGER,
  ADD COLUMN IF NOT EXISTS check_run_id TEXT;

CREATE INDEX IF NOT EXISTS synthetic_runs_group_idx
  ON synthetic_runs(run_group_id)
  WHERE run_group_id IS NOT NULL;
