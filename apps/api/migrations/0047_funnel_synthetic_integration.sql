-- Migration 0047: Funnel to Synthetic Monitor Integration
-- Adds provenance tracking fields linking synthetic monitors to source funnels.

ALTER TABLE synthetic_monitors
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'funnel', 'template')),
  ADD COLUMN IF NOT EXISTS source_funnel_id TEXT REFERENCES funnels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_funnel_name TEXT,
  ADD COLUMN IF NOT EXISTS source_funnel_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_funnel_step_count INTEGER;

CREATE INDEX IF NOT EXISTS synthetic_monitors_source_funnel_idx
  ON synthetic_monitors(source_funnel_id)
  WHERE source_funnel_id IS NOT NULL;
