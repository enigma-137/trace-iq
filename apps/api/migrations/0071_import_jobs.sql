-- Imports of historical events from other tools, started from the dashboard's Import
-- page. Only PostHog pulls run as jobs (file uploads are sent in chunks by the
-- browser). The PostHog API key is never stored: it lives in the API process's
-- memory while the job runs, so a job interrupted by a restart is resumed by
-- starting a new one from `completed_through`. Safe to re-run.
CREATE TABLE IF NOT EXISTS import_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('posthog')),
  status TEXT NOT NULL CHECK (status IN ('running', 'cancelling', 'cancelled', 'completed', 'failed')),
  -- Where the data came from (PostHog host and project), never the key.
  source_host TEXT NOT NULL,
  source_project TEXT NOT NULL,
  range_start TIMESTAMPTZ NOT NULL,
  range_end TIMESTAMPTZ NOT NULL,
  -- Every event before this time has been imported (end of the last finished week).
  completed_through TIMESTAMPTZ,
  windows_total INTEGER NOT NULL DEFAULT 0,
  windows_done INTEGER NOT NULL DEFAULT 0,
  read_count BIGINT NOT NULL DEFAULT 0,
  imported_count BIGINT NOT NULL DEFAULT 0,
  skipped_count BIGINT NOT NULL DEFAULT 0,
  rejected_count BIGINT NOT NULL DEFAULT 0,
  skipped_events JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS import_jobs_project_created_idx ON import_jobs (project_id, created_at DESC);

-- One active import per project, so the same events are not imported twice at once.
CREATE UNIQUE INDEX IF NOT EXISTS import_jobs_one_active_per_project
  ON import_jobs (project_id) WHERE status IN ('running', 'cancelling');
