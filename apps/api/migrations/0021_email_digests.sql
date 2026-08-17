-- Monthly email digest bookkeeping.
--
-- Tracks which organization has already received a digest for a given period
-- (e.g. '2026-08'), so the scheduled script never re-sends the same monthly
-- summary. Safe to re-run; idempotent.

CREATE TABLE IF NOT EXISTS email_digest_sends (
  organization_id TEXT NOT NULL,
  period TEXT NOT NULL,          -- 'YYYY-MM' of the digest month
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, period)
);