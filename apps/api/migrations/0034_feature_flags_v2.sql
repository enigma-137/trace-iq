-- Feature Flags v2: Environments, Targeting Groups, Config Revisions, Audit Trail & Exposures.

-- 1. Extend feature_flags table with environment, flag_type, targeting_groups, revision, and archival.
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'production';
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS flag_type TEXT NOT NULL DEFAULT 'boolean';
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS targeting_groups JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS updated_by_user_id TEXT;
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

-- Composite indexes for fast scoped listing and evaluation
CREATE INDEX IF NOT EXISTS feature_flags_project_env_idx 
  ON feature_flags(project_id, environment) 
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS feature_flags_project_archived_idx 
  ON feature_flags(project_id, archived_at DESC);

-- 2. Audit Trail: Track every configuration change with actor, action, and before/after diffs
CREATE TABLE IF NOT EXISTS feature_flag_activities (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  flag_id TEXT NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
  actor_user_id TEXT,
  actor_email TEXT,
  action TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  before_state JSONB,
  after_state JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feature_flag_activities_flag_idx 
  ON feature_flag_activities(flag_id, created_at DESC);

CREATE INDEX IF NOT EXISTS feature_flag_activities_project_idx 
  ON feature_flag_activities(project_id, created_at DESC);

-- 3. Exposure Tracking: High-performance record of flag evaluations & user exposures
CREATE TABLE IF NOT EXISTS feature_flag_exposures (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  flag_id TEXT NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
  flag_key TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production',
  revision INTEGER NOT NULL DEFAULT 1,
  distinct_id TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  anonymous_id TEXT,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  enabled BOOLEAN NOT NULL,
  evaluation_reason TEXT,
  payload_hash TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feature_flag_exposures_flag_occurred_idx 
  ON feature_flag_exposures(flag_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS feature_flag_exposures_project_distinct_idx 
  ON feature_flag_exposures(project_id, distinct_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS feature_flag_exposures_flag_distinct_occurred_idx 
  ON feature_flag_exposures(flag_id, distinct_id, occurred_at DESC);
