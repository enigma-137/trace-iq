-- Saved dashboards: a named, reusable saved view of an analytics query (event type,
-- time range, measure, and other filter dimensions). One dashboard = one saved query.
-- Owned per dashboard user; may be shared at the org/workspace level via is_shared.
-- The definition stores the full query as JSON, e.g.
--   { "source": "trend", "event": "signup_completed", "days": "30", "measure": "count",
--     "interval": "day", "breakdown": "os", "filters": [...] }
CREATE TABLE IF NOT EXISTS dashboards (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dashboards_project_created_idx
  ON dashboards(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS dashboards_owner_idx
  ON dashboards(owner_id);