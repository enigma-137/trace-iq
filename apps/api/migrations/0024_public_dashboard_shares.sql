CREATE TABLE IF NOT EXISTS public_dashboard_shares (
  id TEXT PRIMARY KEY,
  dashboard_id TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  token_prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  permissions TEXT[] NOT NULL,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed_at TIMESTAMPTZ,
  CONSTRAINT public_dashboard_shares_permissions_check
    CHECK (cardinality(permissions) > 0 AND permissions <@ ARRAY['summary', 'chart', 'definition']::TEXT[])
);

CREATE INDEX IF NOT EXISTS public_dashboard_shares_dashboard_idx
  ON public_dashboard_shares (dashboard_id, created_at DESC);

CREATE INDEX IF NOT EXISTS public_dashboard_shares_active_idx
  ON public_dashboard_shares (token_hash)
  WHERE revoked_at IS NULL;
