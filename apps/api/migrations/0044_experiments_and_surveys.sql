-- Migration 0044: Experiments and Surveys foundation

-- 1. Experiments
CREATE TABLE IF NOT EXISTS experiments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'paused', 'completed', 'archived')),
  environment TEXT NOT NULL DEFAULT 'production',
  primary_metric TEXT NOT NULL,
  secondary_metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
  variants JSONB NOT NULL DEFAULT '[]'::jsonb,
  audience_filter JSONB NOT NULL DEFAULT '{}'::jsonb,
  target_percentage INTEGER NOT NULL DEFAULT 100,
  winner_variant_key TEXT,
  started_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);

CREATE INDEX IF NOT EXISTS experiments_project_env_idx
  ON experiments(project_id, environment)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS experiments_project_status_idx
  ON experiments(project_id, status);

CREATE TABLE IF NOT EXISTS experiment_exposures (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  variant_key TEXT NOT NULL,
  distinct_id TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  anonymous_id TEXT,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  environment TEXT NOT NULL DEFAULT 'production',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS experiment_exposures_exp_occurred_idx
  ON experiment_exposures(experiment_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS experiment_exposures_exp_variant_idx
  ON experiment_exposures(experiment_id, variant_key);

CREATE INDEX IF NOT EXISTS experiment_exposures_project_distinct_idx
  ON experiment_exposures(project_id, distinct_id, occurred_at DESC);


-- 2. Surveys
CREATE TABLE IF NOT EXISTS surveys (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'paused', 'closed', 'archived')),
  environment TEXT NOT NULL DEFAULT 'production',
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  targeting JSONB NOT NULL DEFAULT '{}'::jsonb,
  display_trigger JSONB NOT NULL DEFAULT '{"type":"immediate"}'::jsonb,
  published_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS surveys_project_env_idx
  ON surveys(project_id, environment)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS surveys_project_status_idx
  ON surveys(project_id, status);

CREATE TABLE IF NOT EXISTS survey_interactions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  distinct_id TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  anonymous_id TEXT,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('impression', 'dismiss', 'complete')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS survey_interactions_survey_action_idx
  ON survey_interactions(survey_id, action);

CREATE INDEX IF NOT EXISTS survey_interactions_survey_distinct_idx
  ON survey_interactions(survey_id, distinct_id);

CREATE TABLE IF NOT EXISTS survey_responses (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  distinct_id TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  anonymous_id TEXT,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS survey_responses_survey_occurred_idx
  ON survey_responses(survey_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS survey_responses_survey_distinct_idx
  ON survey_responses(survey_id, distinct_id);
