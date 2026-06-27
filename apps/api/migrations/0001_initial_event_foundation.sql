CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  data_retention_days INTEGER NOT NULL DEFAULT 365,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS project_write_keys (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT 'Default write key',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  external_id TEXT,
  anonymous_id TEXT,
  traits JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_project_external_id_idx
  ON users(project_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_project_anonymous_id_idx
  ON users(project_id, anonymous_id)
  WHERE anonymous_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  anonymous_id TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_project_started_at_idx
  ON sessions(project_id, started_at DESC);

CREATE INDEX IF NOT EXISTS sessions_project_user_id_idx
  ON sessions(project_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sessions_project_anonymous_id_idx
  ON sessions(project_id, anonymous_id)
  WHERE anonymous_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  anonymous_id TEXT,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  device_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  network_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_project_received_at_idx
  ON events(project_id, received_at DESC);

CREATE INDEX IF NOT EXISTS events_project_occurred_at_idx
  ON events(project_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS events_project_event_name_occurred_at_idx
  ON events(project_id, event_name, occurred_at DESC);

CREATE INDEX IF NOT EXISTS events_project_user_occurred_at_idx
  ON events(project_id, user_id, occurred_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS events_project_session_occurred_at_idx
  ON events(project_id, session_id, occurred_at DESC)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS events_properties_gin_idx
  ON events USING GIN (properties);
