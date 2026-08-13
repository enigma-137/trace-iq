import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException
} from '@nestjs/common';
import { OrganizationsService, MemberRole } from '../src/modules/organizations/organizations.service';
import { InvitesService } from '../src/modules/organizations/invites.service';
import { mockDatabase, rows, affected, type MockDb } from './helpers/mock-db';

type InviteRow = {
  id: string;
  organization_id: string;
  email: string;
  role: MemberRole;
  token_prefix: string;
  invited_by_user_id: string | null;
  status: string;
  expires_at: string;
  created_at: string;
};

const FUTURE = new Date(Date.now() + 60_000).toISOString();
const PAST = new Date(Date.now() - 60_000).toISOString();

function makeInvitesService(
  opts: {
    role?: MemberRole;
    noOrg?: boolean;
    duplicatePending?: boolean;
    alreadyMember?: boolean;
    invite?: Partial<InviteRow> | null;
    inviteById?: Partial<InviteRow> | null;
    list?: InviteRow[];
    cancelAffected?: number;
  } = {}
) {
  const {
    role = 'owner',
    noOrg = false,
    duplicatePending = false,
    alreadyMember = false,
    invite = null,
    inviteById = null,
    list = [],
    cancelAffected = 1
  } = opts;

  const setupRow = {
    organization_id: 'org_1',
    organization_name: 'Acme',
    organization_slug: 'acme',
    role,
    project_id: null,
    project_name: null,
    project_slug: null
  };

  const inviteRow: InviteRow = {
    id: 'inv_1',
    organization_id: 'org_1',
    email: 'teammate@example.com',
    role: 'member',
    token_prefix: 'trq_inv_ab12cd',
    invited_by_user_id: 'user_1',
    status: 'pending',
    expires_at: FUTURE,
    created_at: FUTURE,
    ...invite
  };

  const lookupRow = { ...inviteRow, organization_name: 'Acme', ...(inviteById ?? {}) };

  const db: MockDb = mockDatabase((text, values) => {
    if (/JOIN organizations o ON o.id = om.organization_id/.test(text)) {
      return noOrg ? rows([]) : rows([setupRow]);
    }
    if (/UPDATE organization_invites[\s\S]*status = 'revoked'/.test(text)) {
      return affected(cancelAffected);
    }
    if (/UPDATE organization_invites[\s\S]*status = 'accepted'/.test(text)) {
      return rows([]);
    }
    if (/UPDATE organization_invites[\s\S]*token_hash/.test(text)) {
      return rows([]);
    }
    if (/INSERT INTO organization_invites/.test(text)) {
      const [id, orgId, emailValue, role, , prefix, invitedBy] = values as [
        string,
        string,
        string,
        MemberRole,
        string,
        string,
        string
      ];
      return rows([
        {
          id,
          organization_id: orgId,
          email: emailValue,
          role,
          token_prefix: prefix,
          invited_by_user_id: invitedBy,
          status: 'pending',
          expires_at: FUTURE,
          created_at: FUTURE
        }
      ]);
    }
    if (/INSERT INTO organization_members/.test(text)) {
      return rows([]);
    }
    if (/SELECT EXISTS/.test(text)) {
      if (/organization_invites/.test(text)) {
        return rows([{ exists: duplicatePending }]);
      }
      return rows([{ exists: alreadyMember }]);
    }
    if (/WHERE i\.token_hash = \$1/.test(text)) {
      return invite ? rows([lookupRow]) : rows([]);
    }
    if (/WHERE token_hash = \$1/.test(text)) {
      return invite ? rows([lookupRow]) : rows([]);
    }
    if (/SELECT id, organization_id, email, role, token_prefix/.test(text)) {
      return invite ? rows([lookupRow]) : rows([]);
    }
    if (/WHERE id = \$1/.test(text)) {
      return inviteById ? rows([lookupRow]) : rows([]);
    }
    if (/FROM organization_invites i/.test(text)) {
      return rows(list);
    }
    return rows([]);
  });

  const organizations = new OrganizationsService(db as never);
  const email = { send: vi.fn().mockResolvedValue({ ok: true }) };
  const service = new InvitesService(db as never, organizations, email as never);

  return { db, service, email };
}

const user = { id: 'user_1', email: 'owner@example.com', authMethod: 'supabase' } as const;

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.DASHBOARD_URL;
});

describe('InvitesService.createInvite', () => {
  it('creates a pending invite, stores a hashed token and emails the invitee', async () => {
    const { db, service, email } = makeInvitesService();

    const result = await service.createInvite(user, { email: ' teammate@example.com ' });

    expect(result.invite).toMatchObject({
      organizationId: 'org_1',
      organizationName: 'Acme',
      email: 'teammate@example.com',
      role: 'member',
      status: 'pending'
    });
    expect(result.emailDelivered).toBe(true);
    expect('token' in result).toBe(false);

    const inserts = db.queryCalls(/INSERT INTO organization_invites/);
    expect(inserts).toHaveLength(1);
    const [id, orgId, emailValue, role, tokenHash, prefix, invitedBy] = inserts[0].values as string[];
    expect(id).toMatch(/^inv_/);
    expect(orgId).toBe('org_1');
    expect(emailValue).toBe('teammate@example.com');
    expect(role).toBe('member');
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(prefix).toMatch(/^trq_inv_/);
    expect(invitedBy).toBe('user_1');

    expect(email.send).toHaveBeenCalledTimes(1);
    const [args] = vi.mocked(email.send).mock.calls[0];
    expect(args.to).toEqual(['teammate@example.com']);
    expect(args.html).toContain('/invite/');
  });

  it('lets an admin invite a teammate as admin', async () => {
    const { service } = makeInvitesService({ role: 'admin' });

    const result = await service.createInvite(user, { email: 'teammate@example.com', role: 'admin' });

    expect(result.invite.role).toBe('admin');
  });

  it('rejects inviting as an owner role', async () => {
    const { service } = makeInvitesService();

    await expect(service.createInvite(user, { email: 'teammate@example.com', role: 'owner' })).rejects.toThrow(
      BadRequestException
    );
  });

  it('rejects an invalid email', async () => {
    const { service } = makeInvitesService();

    await expect(service.createInvite(user, { email: 'not-an-email' })).rejects.toThrow(BadRequestException);
    await expect(service.createInvite(user, { email: '   ' })).rejects.toThrow(BadRequestException);
  });

  it('rejects inviting yourself', async () => {
    const { service } = makeInvitesService();

    await expect(service.createInvite(user, { email: 'OWNER@example.com' })).rejects.toThrow(BadRequestException);
  });

  it('links invites to /invite/:token even when DASHBOARD_URL carries a /dashboard suffix', async () => {
    process.env.DASHBOARD_URL = 'https://traceiq.run/dashboard/';
    const { service, email } = makeInvitesService();

    await service.createInvite(user, { email: 'teammate@example.com' });

    const [args] = vi.mocked(email.send).mock.calls[0];
    expect(args.html).toContain('https://traceiq.run/invite/');
    expect(args.html).not.toContain('/dashboard/invite/');
  });

  it('rejects a duplicate pending invite for the same email', async () => {
    const { service } = makeInvitesService({ duplicatePending: true });

    await expect(service.createInvite(user, { email: 'teammate@example.com' })).rejects.toThrow(ConflictException);
  });

  it('rejects inviting someone already in the organization', async () => {
    const { service } = makeInvitesService({ alreadyMember: true });

    await expect(service.createInvite(user, { email: 'teammate@example.com' })).rejects.toThrow(ConflictException);
  });

  it('rejects regular members from inviting', async () => {
    const { service } = makeInvitesService({ role: 'member' });

    await expect(service.createInvite(user, { email: 'teammate@example.com' })).rejects.toThrow(ForbiddenException);
  });

  it('rejects a user with no organization', async () => {
    const { service } = makeInvitesService({ noOrg: true });

    await expect(service.createInvite(user, { email: 'teammate@example.com' })).rejects.toThrow(BadRequestException);
  });
});

describe('InvitesService.listInvites', () => {
  it('returns the org pending invites for an admin', async () => {
    const { service } = makeInvitesService({
      role: 'admin',
      list: [
        {
          id: 'inv_1',
          organization_id: 'org_1',
          organization_name: 'Acme',
          email: 'teammate@example.com',
          role: 'member',
          token_prefix: 'trq_inv_ab12cd',
          invited_by: 'user_1',
          status: 'pending',
          expires_at: FUTURE,
          created_at: FUTURE
        }
      ]
    });

    const result = await service.listInvites(user);

    expect(result.invites).toHaveLength(1);
    expect(result.invites[0]).toMatchObject({ email: 'teammate@example.com', status: 'pending' });
  });

  it('rejects regular members from viewing invites', async () => {
    const { service } = makeInvitesService({ role: 'member' });

    await expect(service.listInvites(user)).rejects.toThrow(ForbiddenException);
  });
});

describe('InvitesService.cancelInvite', () => {
  it('revokes a pending invite', async () => {
    const { db, service } = makeInvitesService();

    const result = await service.cancelInvite(user, 'inv_1');

    expect(result).toEqual({ id: 'inv_1', status: 'revoked' });
    expect(db.queryCalls(/SET status = 'revoked'/)).toHaveLength(1);
  });

  it('throws when the invite cannot be revoked', async () => {
    const { service } = makeInvitesService({ cancelAffected: 0 });

    await expect(service.cancelInvite(user, 'inv_1')).rejects.toThrow(NotFoundException);
  });

  it('rejects regular members', async () => {
    const { service } = makeInvitesService({ role: 'member' });

    await expect(service.cancelInvite(user, 'inv_1')).rejects.toThrow(ForbiddenException);
  });
});

describe('InvitesService.resendInvite', () => {
  it('regenerates the token and re-emails a pending invite', async () => {
    const { db, service, email } = makeInvitesService({ invite: { status: 'pending' } });

    const result = await service.resendInvite(user, 'inv_1');

    expect(result.emailDelivered).toBe(true);
    expect(result.invite).toMatchObject({ id: 'inv_1', email: 'teammate@example.com', status: 'pending' });
    const updates = db.queryCalls(/SET token_hash/);
    expect(updates).toHaveLength(1);
    const [tokenHash] = updates[0].values.slice(2, 3) as [string];
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(email.send).toHaveBeenCalledTimes(1);
  });

  it('rejects resending an invite that is no longer pending', async () => {
    const { service } = makeInvitesService({ invite: { status: 'accepted' } });

    await expect(service.resendInvite(user, 'inv_1')).rejects.toThrow(BadRequestException);
  });

  it('throws when the invite does not belong to the org', async () => {
    const { service } = makeInvitesService({ invite: null });

    await expect(service.resendInvite(user, 'inv_1')).rejects.toThrow(NotFoundException);
  });
});

describe('InvitesService.acceptInvite', () => {
  it('adds the sign-in user to the org and marks the invite accepted', async () => {
    const { db, service } = makeInvitesService({
      invite: { status: 'pending', role: 'admin', email: 'teammate@example.com', expires_at: FUTURE }
    });
    const invitee = { id: 'user_9', email: 'teammate@example.com', authMethod: 'supabase' } as const;

    const result = await service.acceptInvite(invitee, 'trq_inv_validtoken');

    expect(result).toEqual({ accepted: true, organizationId: 'org_1', role: 'admin' });
    const memberInsert = db.queryCalls(/INSERT INTO organization_members/);
    expect(memberInsert[0].values).toEqual(['org_1', 'user_9', 'admin', 'teammate@example.com']);
    expect(db.queryCalls(/SET status = 'accepted'/).length).toBeGreaterThan(0);
  });

  it('is idempotent when the user is already a member', async () => {
    const { service } = makeInvitesService({
      invite: { status: 'pending', email: 'teammate@example.com', expires_at: FUTURE },
      alreadyMember: true
    });
    const invitee = { id: 'user_9', email: 'teammate@example.com', authMethod: 'supabase' } as const;

    const result = await service.acceptInvite(invitee, 'trq_inv_validtoken');

    expect(result).toMatchObject({ accepted: true, alreadyMember: true });
  });

  it('rejects accepting with a different email than invited', async () => {
    const { service } = makeInvitesService({ invite: { status: 'pending', email: 'other@example.com', expires_at: FUTURE } });
    const invitee = { id: 'user_9', email: 'teammate@example.com', authMethod: 'supabase' } as const;

    await expect(service.acceptInvite(invitee, 'trq_inv_validtoken')).rejects.toThrow(ForbiddenException);
  });

  it('rejects an invite that was already used or revoked', async () => {
    const { service } = makeInvitesService({ invite: { status: 'revoked', email: 'teammate@example.com', expires_at: FUTURE } });
    const invitee = { id: 'user_9', email: 'teammate@example.com', authMethod: 'supabase' } as const;

    await expect(service.acceptInvite(invitee, 'trq_inv_validtoken')).rejects.toThrow(GoneException);
  });

  it('rejects an expired invite', async () => {
    const { service } = makeInvitesService({ invite: { status: 'pending', email: 'teammate@example.com', expires_at: PAST } });
    const invitee = { id: 'user_9', email: 'teammate@example.com', authMethod: 'supabase' } as const;

    await expect(service.acceptInvite(invitee, 'trq_inv_validtoken')).rejects.toThrow(GoneException);
  });

  it('throws when the invite does not exist', async () => {
    const { service } = makeInvitesService({ invite: null });
    const invitee = { id: 'user_9', email: 'teammate@example.com', authMethod: 'supabase' } as const;

    await expect(service.acceptInvite(invitee, 'trq_inv_validtoken')).rejects.toThrow(NotFoundException);
  });
});

describe('InvitesService.listPendingInvites', () => {
  it('lists pending, unexpired invites addressed to the caller email', async () => {
    const { service } = makeInvitesService({
      role: 'member',
      list: [
        {
          id: 'inv_1',
          organization_id: 'org_1',
          organization_name: 'Acme',
          email: 'teammate@example.com',
          role: 'admin',
          token_prefix: 'trq_inv_ab12cd',
          invited_by_user_id: 'user_1',
          status: 'pending',
          expires_at: FUTURE,
          created_at: FUTURE
        }
      ]
    });
    const invitee = { id: 'user_9', email: 'teammate@example.com', authMethod: 'supabase' } as const;

    const result = await service.listPendingInvites(invitee);

    expect(result.invites).toHaveLength(1);
    expect(result.invites[0]).toEqual({
      id: 'inv_1',
      organizationName: 'Acme',
      role: 'admin',
      expiresAt: FUTURE,
      createdAt: FUTURE
    });
  });

  it('returns an empty list when no invites are pending', async () => {
    const { service } = makeInvitesService({ role: 'member' });
    const invitee = { id: 'user_9', email: 'teammate@example.com', authMethod: 'supabase' } as const;

    const result = await service.listPendingInvites(invitee);

    expect(result.invites).toEqual([]);
  });
});

describe('InvitesService.acceptPendingInvite', () => {
  it('adds a pending invitee to the org and marks the invite accepted', async () => {
    const { db, service } = makeInvitesService({
      role: 'member',
      inviteById: { status: 'pending', role: 'admin', email: 'teammate@example.com', expires_at: FUTURE }
    });
    const invitee = { id: 'user_9', email: 'teammate@example.com', authMethod: 'supabase' } as const;

    const result = await service.acceptPendingInvite(invitee, 'inv_1');

    expect(result).toEqual({ accepted: true, organizationId: 'org_1', role: 'admin' });
    const memberInsert = db.queryCalls(/INSERT INTO organization_members/);
    expect(memberInsert[0].values).toEqual(['org_1', 'user_9', 'admin', 'teammate@example.com']);
    expect(db.queryCalls(/SET status = 'accepted'/).length).toBeGreaterThan(0);
  });

  it('is idempotent when the user is already a member', async () => {
    const { service } = makeInvitesService({
      role: 'member',
      inviteById: { status: 'pending', email: 'teammate@example.com', expires_at: FUTURE },
      alreadyMember: true
    });
    const invitee = { id: 'user_9', email: 'teammate@example.com', authMethod: 'supabase' } as const;

    const result = await service.acceptPendingInvite(invitee, 'inv_1');

    expect(result).toMatchObject({ accepted: true, alreadyMember: true });
  });

  it('rejects accepting an invite sent to a different email', async () => {
    const { service } = makeInvitesService({
      role: 'member',
      inviteById: { status: 'pending', email: 'other@example.com', expires_at: FUTURE }
    });
    const invitee = { id: 'user_9', email: 'teammate@example.com', authMethod: 'supabase' } as const;

    await expect(service.acceptPendingInvite(invitee, 'inv_1')).rejects.toThrow(ForbiddenException);
  });

  it('rejects an invite that is no longer pending', async () => {
    const { service } = makeInvitesService({
      role: 'member',
      inviteById: { status: 'revoked', email: 'teammate@example.com', expires_at: FUTURE }
    });
    const invitee = { id: 'user_9', email: 'teammate@example.com', authMethod: 'supabase' } as const;

    await expect(service.acceptPendingInvite(invitee, 'inv_1')).rejects.toThrow(GoneException);
  });

  it('rejects an expired invite', async () => {
    const { service } = makeInvitesService({
      role: 'member',
      inviteById: { status: 'pending', email: 'teammate@example.com', expires_at: PAST }
    });
    const invitee = { id: 'user_9', email: 'teammate@example.com', authMethod: 'supabase' } as const;

    await expect(service.acceptPendingInvite(invitee, 'inv_1')).rejects.toThrow(GoneException);
  });

  it('throws when the invite does not exist', async () => {
    const { service } = makeInvitesService({ role: 'member' });
    const invitee = { id: 'user_9', email: 'teammate@example.com', authMethod: 'supabase' } as const;

    await expect(service.acceptPendingInvite(invitee, 'inv_unknown')).rejects.toThrow(NotFoundException);
  });
});

describe('InvitesService.checkInvite', () => {
  it('reports a valid pending invite', async () => {
    const { service } = makeInvitesService({
      invite: { status: 'pending', email: 'teammate@example.com', role: 'admin', expires_at: FUTURE }
    });

    const result = await service.checkInvite('trq_inv_validtoken');

    expect(result).toMatchObject({ valid: true, organizationName: 'Acme', email: 'teammate@example.com', role: 'admin' });
  });

  it('reports an expired invite as invalid', async () => {
    const { service } = makeInvitesService({
      invite: { status: 'pending', email: 'teammate@example.com', role: 'member', expires_at: PAST }
    });

    const result = await service.checkInvite('trq_inv_validtoken');

    expect(result).toEqual({ valid: false, status: 'expired' });
  });

  it('reports a used or revoked invite as invalid', async () => {
    const { service } = makeInvitesService({
      invite: { status: 'accepted', email: 'teammate@example.com', role: 'member', expires_at: FUTURE }
    });

    const result = await service.checkInvite('trq_inv_validtoken');

    expect(result).toEqual({ valid: false, status: 'accepted' });
  });

  it('reports an unknown or blank token as invalid', async () => {
    const { service } = makeInvitesService({ invite: null });

    expect(await service.checkInvite('trq_inv_missing')).toEqual({ valid: false, status: 'not-found' });
    expect(await service.checkInvite('  ')).toEqual({ valid: false, status: 'invalid' });
  });
});