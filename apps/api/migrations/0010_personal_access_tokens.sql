-- Personal access tokens for API and MCP clients.
--
-- user_id stores the Supabase Auth user id as text so the API remains portable
-- across local Postgres, Neon, and Supabase-hosted Postgres.

CREATE TABLE IF NOT EXISTS personal_access_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['projects:read', 'flags:read']::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS personal_access_tokens_user_created_idx
  ON personal_access_tokens(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS personal_access_tokens_active_hash_idx
  ON personal_access_tokens(token_hash)
  WHERE revoked_at IS NULL;
