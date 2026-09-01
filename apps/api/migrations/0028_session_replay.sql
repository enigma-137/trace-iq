-- Session Replay stores only searchable metadata in PostgreSQL. rrweb payloads
-- live in the configured private object store and are addressed by server-made
-- keys recorded in replay_chunks.

-- The migration runner wraps each file in a transaction. Fail quickly rather
-- than waiting indefinitely for parent-table locks on a busy installation.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- Preflight before taking the ALTER TABLE lock. This fails without changing
-- data if legacy rows already violate the tenant relationship being enforced.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.user_id IS NOT NULL AND u.project_id <> s.project_id
  ) THEN
    RAISE EXCEPTION '0028 cannot enforce sessions/user tenant isolation: cross-project rows exist';
  END IF;
END $$;

CREATE TABLE replay_settings (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  sample_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.10,
  max_duration_seconds INTEGER NOT NULL DEFAULT 600,
  retention_days INTEGER NOT NULL DEFAULT 30,
  privacy_mode TEXT NOT NULL DEFAULT 'strict',
  require_consent BOOLEAN NOT NULL DEFAULT true,
  mask_selectors TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  block_selectors TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ignore_selectors TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT replay_settings_sample_rate_check CHECK (sample_rate >= 0 AND sample_rate <= 1),
  CONSTRAINT replay_settings_duration_check CHECK (max_duration_seconds BETWEEN 1 AND 86400),
  CONSTRAINT replay_settings_retention_check CHECK (retention_days BETWEEN 1 AND 3650),
  CONSTRAINT replay_settings_privacy_check CHECK (privacy_mode IN ('strict', 'balanced', 'custom'))
);

-- Composite candidate keys let replay foreign keys enforce tenant ownership,
-- not merely the existence of each independent identifier.
CREATE UNIQUE INDEX projects_id_organization_replay_fk_idx
  ON projects(id, organization_id);
CREATE UNIQUE INDEX sessions_id_project_replay_fk_idx
  ON sessions(id, project_id);
CREATE UNIQUE INDEX users_id_project_replay_fk_idx
  ON users(id, project_id);

ALTER TABLE sessions
  ADD CONSTRAINT sessions_user_project_replay_fk
  FOREIGN KEY (user_id, project_id) REFERENCES users(id, project_id)
  ON DELETE SET NULL (user_id) NOT VALID;
ALTER TABLE sessions VALIDATE CONSTRAINT sessions_user_project_replay_fk;

CREATE TABLE session_replays (
  id TEXT PRIMARY KEY,
  -- RESTRICT forces callers through ReplayService cleanup before deleting the
  -- owning org/project/session, preventing private objects from being orphaned.
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  project_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  user_id TEXT,
  anonymous_id TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_ms BIGINT NOT NULL DEFAULT 0,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  event_count INTEGER NOT NULL DEFAULT 0,
  compressed_size_bytes BIGINT NOT NULL DEFAULT 0,
  uncompressed_size_bytes BIGINT NOT NULL DEFAULT 0,
  storage_prefix TEXT NOT NULL,
  recording_format TEXT NOT NULL DEFAULT 'rrweb-json-gzip',
  recording_version TEXT NOT NULL,
  privacy_mode TEXT NOT NULL,
  sampled BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'recording',
  expires_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  deletion_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT session_replays_status_check CHECK (status IN ('recording', 'complete', 'expired', 'deleting', 'deleted', 'failed')),
  CONSTRAINT session_replays_privacy_check CHECK (privacy_mode IN ('strict', 'balanced', 'custom')),
  CONSTRAINT session_replays_project_organization_fk
    FOREIGN KEY (project_id, organization_id) REFERENCES projects(id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT session_replays_session_project_fk
    FOREIGN KEY (session_id, project_id) REFERENCES sessions(id, project_id) ON DELETE RESTRICT,
  CONSTRAINT session_replays_user_project_fk
    FOREIGN KEY (user_id, project_id) REFERENCES users(id, project_id) ON DELETE SET NULL (user_id),
  CONSTRAINT session_replays_time_order_check CHECK (ended_at IS NULL OR ended_at >= started_at),
  CONSTRAINT session_replays_storage_prefix_check CHECK (
    storage_prefix ~ '^[A-Za-z0-9_-]{1,128}/[A-Za-z0-9_-]{1,128}/[A-Za-z0-9_-]{1,128}$'
  ),
  CONSTRAINT session_replays_nonnegative_check CHECK (
    duration_ms >= 0 AND chunk_count >= 0 AND event_count >= 0
    AND compressed_size_bytes >= 0 AND uncompressed_size_bytes >= 0
  )
);

CREATE UNIQUE INDEX session_replays_project_session_active_idx
  ON session_replays(project_id, session_id)
  WHERE deleted_at IS NULL;
CREATE INDEX session_replays_project_started_idx
  ON session_replays(project_id, started_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX session_replays_project_user_idx
  ON session_replays(project_id, user_id, started_at DESC)
  WHERE user_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX session_replays_project_anonymous_idx
  ON session_replays(project_id, anonymous_id, started_at DESC)
  WHERE anonymous_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX session_replays_expiry_idx
  ON session_replays(expires_at) WHERE deleted_at IS NULL;
CREATE INDEX session_replays_organization_created_idx
  ON session_replays(organization_id, created_at);
CREATE INDEX session_replays_session_idx
  ON session_replays(session_id);
CREATE INDEX session_replays_user_idx
  ON session_replays(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX session_replays_deleting_idx
  ON session_replays(updated_at) WHERE status = 'deleting' AND deleted_at IS NULL;

CREATE TABLE replay_chunks (
  id TEXT PRIMARY KEY,
  replay_id TEXT NOT NULL REFERENCES session_replays(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  event_count INTEGER NOT NULL,
  compressed_size_bytes INTEGER NOT NULL,
  uncompressed_size_bytes INTEGER NOT NULL,
  content_sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploading',
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at TIMESTAMPTZ,
  first_event_at TIMESTAMPTZ,
  last_event_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  delete_attempts INTEGER NOT NULL DEFAULT 0,
  delete_error TEXT,
  UNIQUE (replay_id, sequence),
  CONSTRAINT replay_chunks_status_check CHECK (status IN ('uploading', 'ready', 'delete_failed')),
  CONSTRAINT replay_chunks_checksum_check CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT replay_chunks_storage_key_check CHECK (
    storage_key ~ '^[A-Za-z0-9_-]{1,128}/[A-Za-z0-9_-]{1,128}/[A-Za-z0-9_-]{1,128}/[0-9]{6}-[0-9a-f]{12}\.json\.gz$'
  ),
  CONSTRAINT replay_chunks_sequence_check CHECK (sequence >= 0),
  CONSTRAINT replay_chunks_size_check CHECK (
    event_count > 0 AND compressed_size_bytes > 0 AND uncompressed_size_bytes > 0
  )
);

CREATE INDEX replay_chunks_pending_delete_idx
  ON replay_chunks(replay_id) WHERE deleted_at IS NULL;
CREATE INDEX replay_chunks_stale_upload_idx
  ON replay_chunks(reserved_at) WHERE status IN ('uploading', 'delete_failed');

CREATE TABLE replay_deletion_audit (
  id TEXT PRIMARY KEY,
  replay_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  chunk_count INTEGER NOT NULL,
  compressed_size_bytes BIGINT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX replay_deletion_audit_project_completed_idx
  ON replay_deletion_audit(project_id, completed_at DESC);

COMMENT ON TABLE replay_settings IS 'Per-project, conservative-by-default Session Replay configuration.';
COMMENT ON TABLE session_replays IS 'Searchable replay metadata only; never contains rrweb DOM payloads.';
COMMENT ON TABLE replay_chunks IS 'Pointers and integrity metadata for private object-storage replay chunks.';
COMMENT ON TABLE replay_deletion_audit IS 'Payload-free audit trail retained when replay metadata must be physically erased.';
