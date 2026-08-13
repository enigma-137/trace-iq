import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { mockDatabase, rows, affected, type MockDb } from './helpers/mock-db';
import { OrganizationsService, MemberRole } from '../src/modules/organizations/organizations.service';
import { InvitesService } from '../src/modules/organizations/invites.service';

const setupRow = {
  organization_id: 'org_1',
  organization_name: 'Acme',
  organization_slug: 'acme',
  role: 'owner' as MemberRole,
  project_id: 'proj_1',
  project_name: 'Web',
  project_slug: 'web'
};

const user = { id: 'user_1', email: 'owner@example.com', authMethod: 'supabase' } as const;

function makeService(opts: {
  role?: MemberRole;
  members?: { email: string }[];
  targetRole?: MemberRole;
  seatCount?: string;
  noOrg?: boolean;
  emptySetup?: boolean;
} = {}) {
  const {
    role = 'owner',
    members = [{ email: 'owner@example.com' }, { email: 'teammate@example.com' }],
    targetRole = 'admin',
    seatCount = '1',
    noOrg = false,
    emptySetup = false
  } = opts;

  const db: MockDb = mockDatabase((text) => {
    if (/JOIN organizations o ON o.id = om.organization_id/.test(text)) {
      return noOrg || emptySetup ? rows([]) : rows([{ ...setupRow, role }]);
    }
    if (/COUNT\(\*\) AS count/.test(text)) {
      return rows([{ count: seatCount }]);
    }
    if (/AS count/.test(text)) {
      return rows([{ count: seatCount }]);
    }
    if (/SELECT role.*FROM organization_members/.test(text)) {
      return rows([{ role: targetRole, email: 'target@example.com' }]);
    }
    if (/INSERT INTO organization_members/.test(text)) {
      return rows([{ user_id: 'user_2', role: (text.includes("'admin'") ? 'admin' : 'member') as MemberRole, email: 'user2@example.com', created_at: '2026-01-01T00:00:00Z' }]);
    }
    if (/UPDATE project_write_keys|INSERT INTO project_write_keys/.test(text)) {
      return rows([]);
    }
    if (/UPDATE organization_members|DELETE FROM organization_members/.test(text)) {
      return rows([]);
    }
    if (/email IS NOT NULL/.test(text)) {
      return rows(members);
    }
    if (/INSERT INTO organization_audit_events/.test(text)) {
      return rows([]);
    }
    return rows([]);
  });

  const email = { send: vi.fn().mockResolvedValue({ ok: true }) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new OrganizationsService(db as never, email as never, audit as never);
  return { db, service, email, audit };
}

function makeInvitesService(opts: {
  orgRole?: MemberRole;
  seatCount?: string;
  invite?: Record<string, unknown> | null;
} = {}) {
  const { orgRole = 'owner', seatCount = '1', invite = defaultRow } = opts;
  const db: MockDb = mockDatabase((text) => {
    if (/JOIN organizations o ON o.id = om.organization_id/.test(text)) {
      return rows([{ ...setupRow, role: orgRole }]);
    }
    if (/AS count/.test(text)) {
      return rows([{ count: seatCount }]);
    }
    if (/SELECT EXISTS/.test(text)) {
      if (/organization_invites/.test(text)) {
        return rows([{ exists: false }]);
      }
      return rows([{ exists: false }]);
    }
    if (/WHERE token_hash = \$1/.test(text)) {
      return invite ? rows([invite]) : rows([]);
    }
    if (/WHERE id = \$1 AND organization_id = \$2/.test(text)) {
      return invite ? rows([invite]) : rows([]);
    }
    if (/INSERT INTO organization_invites/.test(text)) {
      return rows([{ id: 'inv_1', organization_id: 'org_1', email: 'teammate@example.com', role: 'member', token_prefix: 'trq_inv_ab12', invited_by_user_id: 'user_1', status: 'pending', expires_at: new Date(Date.now() + 86400000).toISOString(), created_at: new Date().toISOString() }]);
    }
    if (/INSERT INTO organization_members/.test(text)) {
      return rows([]);
    }
    if (/INSERT INTO organization_audit_events/.test(text)) {
      return rows([]);
    }
    if (/UPDATE organization_invites/.test(text)) {
      return affected(1);
    }
    return rows([]);
  });

  const email = { send: vi.fn().mockResolvedValue({ ok: true }) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const organizations = new OrganizationsService(db as never, email as never, audit as never);
  const service = new InvitesService(db as never, organizations, email as never, audit as never);
  return { db, service, email, audit };
}

const defaultRow = {
  id: 'inv_1',
  organization_id: 'org_1',
  email: 'teammate@example.com',
  role: 'member' as MemberRole,
  token_prefix: 'trq_inv_ab12',
  invited_by_user_id: 'user_1',
  status: 'pending',
  expires_at: new Date(Date.now() + 86400000).toISOString(),
  created_at: new Date().toISOString()
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MAX_ORGANIZATION_SEATS;
});

describe('seat limits', () => {
  it('blocks adding a member at the seat cap', async () => {
    process.env.MAX_ORGANIZATION_SEATS = '2';
    const { service } = makeService({ seatCount: '2' });

    await expect(service.addMember(user, { userId: 'user_2', email: 'user2@example.com' })).rejects.toThrow(
      BadRequestException
    );
  });

  it('allows adding a member under the seat cap', async () => {
    process.env.MAX_ORGANIZATION_SEATS = '3';
    const { service } = makeService({ seatCount: '2' });

    const result = await service.addMember(user, { userId: 'user_2', email: 'user2@example.com' });
    expect(result.member.userId).toBe('user_2');
  });

  it('blocks creating an invite at the seat cap', async () => {
    process.env.MAX_ORGANIZATION_SEATS = '2';
    const { service } = makeInvitesService({ seatCount: '2' });

    await expect(service.createInvite(user, { email: 'teammate@example.com' })).rejects.toThrow(BadRequestException);
  });

  it('is a no-op when MAX_ORGANIZATION_SEATS is unset', async () => {
    delete process.env.MAX_ORGANIZATION_SEATS;
    const { db, service } = makeService();

    await service.addMember(user, { userId: 'user_2', email: 'user2@example.com' });

    expect(db.queryCalls(/AS count/)).toHaveLength(0);
  });
});

describe('audit trail', () => {
  it('records member.added', async () => {
    const { audit, service } = makeService();

    await service.addMember(user, { userId: 'user_2', email: 'user2@example.com' });

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_1', actorUserId: 'user_1', action: 'member.added', role: 'member' })
    );
  });

  it('records member.role_changed with from/to metadata', async () => {
    const { audit, service } = makeService({ targetRole: 'member' });

    await service.updateMemberRole(user, 'user_2', 'admin');

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'member.role_changed',
        targetUserId: 'user_2',
        role: 'admin',
        metadata: { from: 'member', to: 'admin' }
      })
    );
  });

  it('records member.removed with the target email', async () => {
    const { audit, service } = makeService({ targetRole: 'member' });

    await service.removeMember(user, 'user_2');

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'member.removed',
        targetUserId: 'user_2',
        targetEmail: 'target@example.com'
      })
    );
  });

  it('records write_key.rotated for regenerateWriteKey', async () => {
    const { audit, service } = makeService();

    await service.regenerateWriteKey(user);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'write_key.rotated', actorUserId: 'user_1' })
    );
  });

  it('records invite.created, invite.resend, invite.cancelled and invite.accepted', async () => {
    const { service, audit } = makeInvitesService();

    await service.createInvite(user, { email: 'teammate@example.com' });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'invite.created', targetEmail: 'teammate@example.com' }));

    audit.record.mockClear();
    await service.resendInvite(user, 'inv_1');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'invite.resend', targetEmail: 'teammate@example.com' }));

    audit.record.mockClear();
    await service.cancelInvite(user, 'inv_1');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'invite.cancelled' }));

    audit.record.mockClear();
    await service.acceptInvite({ id: 'user_2', email: 'teammate@example.com', authMethod: 'supabase' }, 'trq_inv_token');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'invite.accepted', targetUserId: 'user_2', role: 'member' }));
  });
});

describe('token invalidation on revoke', () => {
  it('nulls token_hash when an invite is cancelled', async () => {
    const { db, service } = makeInvitesService();

    await service.cancelInvite(user, 'inv_1');

    const update = db.queryCalls(/UPDATE organization_invites/)[0];
    expect(update.text).toContain('token_hash = NULL');
    expect(update.text).toContain("status = 'revoked'");
  });
});

describe('team notifications', () => {
  it('emails the team when the write key is rotated (excluding the actor)', async () => {
    const { email, service } = makeService();

    await service.regenerateWriteKey(user);

    expect(email.send).toHaveBeenCalledTimes(1);
    const [args] = vi.mocked(email.send).mock.calls[0];
    expect(args.to).toEqual(['teammate@example.com']);
    expect(args.subject).toContain('Write key rotated');
  });

  it('emails remaining members when someone is removed (excluding the actor)', async () => {
    const { email, service } = makeService({ targetRole: 'member' });

    await service.removeMember(user, 'user_2');

    expect(email.send).toHaveBeenCalledTimes(1);
    const [args] = vi.mocked(email.send).mock.calls[0];
    expect(args.to).toEqual(['teammate@example.com']);
    expect(args.subject).toContain('left Acme');
  });

  it('skips notifications when there are no other members', async () => {
    const { email, service } = makeService({ members: [{ email: 'owner@example.com' }] });

    await service.regenerateWriteKey(user);

    expect(email.send).not.toHaveBeenCalled();
  });
});