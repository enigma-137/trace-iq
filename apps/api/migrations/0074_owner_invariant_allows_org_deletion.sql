-- Two fixes to the owner invariant from 0019 (a BEFORE DELETE OR UPDATE trigger on
-- organization_members):
--
-- 1. Deleting a member who is not an owner fell through to `RETURN NEW`. NEW is NULL
--    for a DELETE, and a BEFORE trigger returning NULL silently skips the row, so
--    "Remove member", "Leave organization" and account deletion reported success
--    while the membership stayed. A DELETE now always returns OLD.
-- 2. Deleting an organization cascades to its members, and the trigger refused to
--    delete the last owner, so scheduled organization deletions failed and were
--    retried every minute. Once the organization row is gone there is no
--    organization left to protect, so its members are deleted with it.
--
-- Removing or demoting the last owner of an organization that still exists is
-- refused as before. Safe to re-run.
CREATE OR REPLACE FUNCTION enforce_org_owner_invariant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'owner'
      -- Cascading from DELETE FROM organizations: the organization is already gone.
      AND EXISTS (SELECT 1 FROM organizations WHERE id = OLD.organization_id)
      AND (SELECT COUNT(*) FROM organization_members
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
