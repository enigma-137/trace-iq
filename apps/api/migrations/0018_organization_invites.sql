-- Organization invites — table introduced in Phase 1 of team management, consumed
-- by the invite flow (create / accept / resend / revoke) in a later phase.
--
-- token_hash stores a SHA-256 of the raw invite token so the plaintext is never
-- persisted; the raw token is shown once in the invite email. token_prefix lets
-- the dashboard reference an invite without exposing the full token.

CREATE TABLE IF NOT EXISTS organization_invites (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  token_hash TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  invited_by_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT organization_invites_role_check
    CHECK (role IN ('owner', 'admin', 'member')),
  CONSTRAINT organization_invites_status_check
    CHECK (status IN ('pending', 'accepted', 'revoked'))
);

CREATE INDEX IF NOT EXISTS organization_invites_org_status_idx
  ON organization_invites(organization_id, status);

CREATE INDEX IF NOT EXISTS organization_invites_email_status_idx
  ON organization_invites(email, status);
