-- Expand organization audit actions to track project lifecycle events.

ALTER TABLE organization_audit_events
  DROP CONSTRAINT IF EXISTS organization_audit_actions_check;

ALTER TABLE organization_audit_events
  ADD CONSTRAINT organization_audit_actions_check
  CHECK (action IN (
    'member.added',
    'member.removed',
    'member.role_changed',
    'invite.created',
    'invite.resend',
    'invite.cancelled',
    'invite.accepted',
    'write_key.rotated',
    'project.created',
    'project.renamed',
    'project.deleted',
    'organization.renamed'
  ));
