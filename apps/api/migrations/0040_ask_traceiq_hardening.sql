-- Ask TraceIQ Hardening & Atomic Reservation Schema
--
-- Adds reservation tracking, usage period pinning, idempotency key constraints,
-- and structured findings support for cross-surface investigation.

ALTER TABLE ai_investigations
  ADD COLUMN IF NOT EXISTS quota_reserved BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS usage_period TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM'),
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS findings JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Idempotency unique constraint per organization, project, and idempotency_key
CREATE UNIQUE INDEX IF NOT EXISTS ai_investigations_org_idempotency_idx
  ON ai_investigations (organization_id, project_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Fast index for active quota reservations
CREATE INDEX IF NOT EXISTS ai_investigations_active_reservations_idx
  ON ai_investigations (organization_id, usage_period, quota_reserved)
  WHERE quota_reserved = true;
