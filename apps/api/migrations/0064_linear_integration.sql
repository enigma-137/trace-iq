-- Linear integration (phase 1): one Linear workspace per TraceIQ organization,
-- connected through OAuth2 with actor=app so issues are authored by "TraceIQ",
-- plus a default team (and optional label) per project for new issues.
--
-- Access follows the same model as the rest of the schema: the API checks
-- organization membership and role before touching these rows, and every row
-- is removed with its organization or project.

CREATE TABLE IF NOT EXISTS linear_connections (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  -- AES-256-GCM ciphertext (see integrations/common/token-cipher.ts). Never returned
  -- to the dashboard and never logged.
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  workspace_id TEXT NOT NULL,
  workspace_name TEXT,
  workspace_url_key TEXT,
  -- needs_reconnect: Linear rejected the token (revoked, app removed, refresh failed).
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'needs_reconnect')),
  connected_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS linear_project_settings (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  -- The Linear workspace these ids belong to. Settings from another workspace are
  -- ignored (and cleared when the organization connects a different workspace).
  workspace_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  team_name TEXT,
  team_key TEXT,
  label_id TEXT,
  label_name TEXT,
  updated_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
