-- Migration 0049: Session Replay to Synthetic Monitor Integration
-- Adds provenance tracking fields linking synthetic monitors to source session replays.

-- Update check constraint on source_type to allow 'replay'
ALTER TABLE synthetic_monitors
  DROP CONSTRAINT IF EXISTS synthetic_monitors_source_type_check;

ALTER TABLE synthetic_monitors
  ADD CONSTRAINT synthetic_monitors_source_type_check
  CHECK (source_type IN ('manual', 'funnel', 'template', 'replay'));

-- Add replay provenance fields
ALTER TABLE synthetic_monitors
  ADD COLUMN IF NOT EXISTS source_replay_id TEXT REFERENCES session_replays(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_session_id TEXT,
  ADD COLUMN IF NOT EXISTS source_replay_started_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS synthetic_monitors_source_replay_idx
  ON synthetic_monitors(source_replay_id)
  WHERE source_replay_id IS NOT NULL;
