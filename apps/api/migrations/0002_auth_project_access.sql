-- Supabase Auth integration foundation.
--
-- `user_id` stores Supabase Auth's user.id as text. We intentionally avoid a
-- foreign key to auth.users so this migration works in Neon, Supabase Postgres,
-- and local Postgres while the API remains the authorization boundary.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS created_by_user_id TEXT;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS created_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS allowed_origins TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE project_write_keys
  ADD COLUMN IF NOT EXISTS created_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS revoked_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS organization_members (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id),
  CONSTRAINT organization_members_role_check
    CHECK (role IN ('owner', 'admin', 'member'))
);

CREATE INDEX IF NOT EXISTS organization_members_user_id_idx
  ON organization_members(user_id);

CREATE INDEX IF NOT EXISTS organization_members_organization_role_idx
  ON organization_members(organization_id, role);

CREATE INDEX IF NOT EXISTS projects_organization_created_by_idx
  ON projects(organization_id, created_by_user_id)
  WHERE created_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS project_write_keys_project_active_idx
  ON project_write_keys(project_id, created_at DESC)
  WHERE revoked_at IS NULL;

