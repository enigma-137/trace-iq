CREATE TABLE IF NOT EXISTS funnels (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS funnel_steps (
  id TEXT PRIMARY KEY,
  funnel_id TEXT NOT NULL REFERENCES funnels(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  event_name TEXT NOT NULL,
  label TEXT,
  UNIQUE (funnel_id, step_order)
);

CREATE INDEX IF NOT EXISTS funnels_project_created_idx
  ON funnels(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS funnel_steps_funnel_order_idx
  ON funnel_steps(funnel_id, step_order);
