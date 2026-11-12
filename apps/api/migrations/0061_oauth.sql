-- OAuth 2.1 for remote MCP clients (Claude, ChatGPT, Cursor, VS Code ...).
--
-- Clients register themselves (RFC 7591 dynamic client registration) and are
-- public: they prove possession with PKCE instead of a client secret. The access
-- token a client receives is an ordinary personal access token, so the user can
-- see and revoke it under Settings -> Personal access tokens.

CREATE TABLE IF NOT EXISTS oauth_clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  redirect_uris TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  scopes TEXT[] NOT NULL,
  resource TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oauth_authorization_codes_expires_idx
  ON oauth_authorization_codes(expires_at);

ALTER TABLE personal_access_tokens
  ADD COLUMN IF NOT EXISTS oauth_client_id TEXT REFERENCES oauth_clients(id) ON DELETE SET NULL;
