-- Feature flags: toggle features per-user with deterministic percentage rollout.
CREATE TABLE IF NOT EXISTS feature_flags (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  rollout_percentage INTEGER NOT NULL DEFAULT 0,
  -- { "<distinctId>": true|false } forced results that win over the percentage rollout.
  overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS feature_flags_project_key_idx ON feature_flags(project_id, key);
CREATE INDEX IF NOT EXISTS feature_flags_project_created_idx ON feature_flags(project_id, created_at DESC);
