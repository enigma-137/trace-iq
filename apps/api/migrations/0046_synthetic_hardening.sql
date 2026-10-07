-- Migration 0046: Synthetic Monitoring Hardening
-- Adds decoupled artifact storage, encrypted project secrets, and atomic execution leases.

-- 1. Encrypted Project Secrets for Synthetic Monitoring
CREATE TABLE IF NOT EXISTS synthetic_secrets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  encrypted_value TEXT NOT NULL,
  iv TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

CREATE INDEX IF NOT EXISTS synthetic_secrets_project_idx
  ON synthetic_secrets(project_id);

-- 2. Decoupled Synthetic Run Artifacts
CREATE TABLE IF NOT EXISTS synthetic_run_artifacts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES synthetic_runs(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('screenshot', 'trace', 'dom_snapshot', 'video', 'network_log')),
  storage_driver TEXT NOT NULL DEFAULT 'filesystem',
  storage_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS synthetic_run_artifacts_run_idx
  ON synthetic_run_artifacts(run_id);

CREATE INDEX IF NOT EXISTS synthetic_run_artifacts_project_idx
  ON synthetic_run_artifacts(project_id);

-- 3. Atomic Scheduler Lease fields on synthetic_monitors
ALTER TABLE synthetic_monitors
  ADD COLUMN IF NOT EXISTS claimed_by TEXT,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS synthetic_monitors_lease_due_idx
  ON synthetic_monitors(status, next_run_at)
  WHERE status = 'active';

-- 4. Fast queue indexing for synthetic_runs
CREATE INDEX IF NOT EXISTS synthetic_runs_queued_idx
  ON synthetic_runs(status, created_at ASC)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS synthetic_runs_running_stale_idx
  ON synthetic_runs(status, started_at)
  WHERE status = 'running';
