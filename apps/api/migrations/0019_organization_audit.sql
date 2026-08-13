-- Organization audit trail + last-owner invariant.
--
-- Phase 5 hardening. Every member-management and write-key mutation writes an
-- immutable event row so owners/admins can answer "who invited, removed, or
-- changed whose role" (mirroring the created_by_user_id / revoked_by_user_id
-- tracking already present on project_write_keys). The trigger below is the
-- database-level guarantee behind the service checks: an organization can
-- never lose its last owner.

CREATE TABLE IF NOT EXISTS organization_audit_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_user_id TEXT,
  target_email TEXT,
  role TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT organization_audit_actions_check
    CHECK (action IN (
      'member.added',
      'member.removed',
      'member.role_changed',
      'invite.created',
      'invite.resend',
      'invite.cancelled',
      'invite.accepted',
      'write_key.rotated'
    ))
);

CREATE INDEX IF NOT EXISTS organization_audit_events_org_created_idx
  ON organization_audit_events(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS organization_audit_events_actor_idx
  ON organization_audit_events(actor_user_id, created_at DESC);

-- Hard invariant: every organization must keep at least one owner. Runs before
-- deletes and role-demotions; the count includes the row being changed, so a
-- lone owner can neither be deleted nor demoted.
CREATE OR REPLACE FUNCTION enforce_org_owner_invariant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.role = 'owner' THEN
    IF (SELECT COUNT(*) FROM organization_members
        WHERE organization_id = OLD.organization_id AND role = 'owner') <= 1 THEN
      RAISE EXCEPTION 'An organization must keep at least one owner';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.role = 'owner' AND NEW.role IS DISTINCT FROM 'owner' THEN
    IF (SELECT COUNT(*) FROM organization_members
        WHERE organization_id = OLD.organization_id AND role = 'owner') <= 1 THEN
      RAISE EXCEPTION 'An organization must keep at least one owner';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organization_members_owner_invariant ON organization_members;
CREATE TRIGGER organization_members_owner_invariant
  BEFORE DELETE OR UPDATE OF role ON organization_members
  FOR EACH ROW EXECUTE FUNCTION enforce_org_owner_invariant();