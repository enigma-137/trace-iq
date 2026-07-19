-- Saved cohorts: a named, reusable segmentation filter set that can be applied to any
-- analytics view (trends, retention, …). The definition stores { filters: [...] }.
CREATE TABLE IF NOT EXISTS cohorts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cohorts_project_created_idx ON cohorts(project_id, created_at DESC);
