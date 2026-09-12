-- Allow multiple Replay recording lifecycles per analytics session.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

DROP INDEX IF EXISTS session_replays_project_session_active_idx;

CREATE INDEX IF NOT EXISTS session_replays_project_session_active_idx
  ON session_replays(project_id, session_id, started_at DESC)
  WHERE deleted_at IS NULL;
