import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { OrganizationsService, MemberRole } from '../src/modules/organizations/organizations.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { mockDatabase, rows, type MockDb } from './helpers/mock-db';

type SetupRow = {
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  role: MemberRole;
  project_id: string | null;
  project_name: string | null;
  project_slug: string | null;
};

type MemberRow = { user_id: string; role: MemberRole; email: string | null; created_at: string };

function makeService(
  opts: {
    role?: MemberRole;
    targetRole?: MemberRole;
    duplicate?: boolean;
    noOrg?: boolean;
    targetNotFound?: boolean;
    ownerCount?: string;
    members?: MemberRow[];
  } = {}
) {
  const {
    role = 'owner',
    targetRole = 'member',
    duplicate = false,
    noOrg = false,
    targetNotFound = false,
    ownerCount = '2',
    members = [{ user_id: 'user_2', role: 'admin' as MemberRole, email: 'teammate@example.com', created_at: '2026-01-01T00:00:00Z' }]
  } = opts;

  const setupRow: SetupRow = {
    organization_id: 'org_1',
    organization_name: 'Acme',
    organization_slug: 'acme',
    role,
    project_id: 'proj_1',
    project_name: 'Web',
    project_slug: 'web'
  };

  const db: MockDb = mockDatabase((text, values) => {
    if (/JOIN organizations o ON o.id = om.organization_id/.test(text)) {
      return noOrg ? rows([]) : rows([setupRow]);
    }
    if (/SELECT EXISTS/.test(text)) {
      return rows([{ exists: duplicate }]);
    }
    if (/INSERT INTO organization_members/.test(text)) {
      const [, userId, insertRole, email] = values as [string, string, MemberRole, string];
      return rows([
        { user_id: userId, role: insertRole, email, created_at: '2026-01-01T00:00:00Z' }
      ]);
    }
    if (/SELECT role.*FROM organization_members/.test(text)) {
      return targetNotFound ? rows([]) : rows([{ role: targetRole, email: 'teammate@example.com' }]);
    }
    if (/SELECT user_id, role, email, created_at/.test(text)) {
      return rows(members);
    }
    if (/COUNT\(\*\) AS count/.test(text)) {
      return rows([{ count: ownerCount }]);
    }
    if (/UPDATE organization_members|DELETE FROM organization_members/.test(text)) {
      return rows([]);
    }
    return rows([]);
  });

  const service = new OrganizationsService(db as never);
  return { db, service };
}

const user = { id: 'user_1', authMethod: 'supabase' } as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OrganizationsService.listMembers', () => {
  it('returns the organization roster to any member', async () => {
    const { db, service } = makeService({ role: 'member' });

    const result = await service.listMembers(user);

    expect(result.organizationId).toBe('org_1');
    expect(result.members).toHaveLength(1);
    expect(result.members[0]).toMatchObject({ userId: 'user_2', role: 'admin', email: 'teammate@example.com' });
    expect(db.queryCalls(/SELECT user_id, role, email, created_at/).length).toBe(1);
  });

  it('throws when the user has no organization', async () => {
    const { service } = makeService({ noOrg: true });

    await expect(service.listMembers(user)).rejects.toThrow(BadRequestException);
  });
});

describe('OrganizationsService.addMember', () => {
  it('adds a member with the default role', async () => {
    const { db, service } = makeService();

    const result = await service.addMember(user, { userId: 'user_2', email: 'teammate@example.com' });

    expect(result.member).toMatchObject({ userId: 'user_2', role: 'member', email: 'teammate@example.com' });
    const inserts = db.queryCalls(/INSERT INTO organization_members/);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values).toEqual(['org_1', 'user_2', 'member', 'teammate@example.com']);
  });

  it('adds a member with an admin role', async () => {
    const { db, service } = makeService();

    await service.addMember(user, { userId: 'user_2', email: 'teammate@example.com', role: 'admin' });

    expect(db.queryCalls(/INSERT INTO organization_members/)[0].values[2]).toBe('admin');
  });

  it('rejects an owner role on add', async () => {
    const { service } = makeService();

    await expect(
      service.addMember(user, { userId: 'user_2', email: 'teammate@example.com', role: 'owner' })
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects regular members from adding teammates', async () => {
    const { service } = makeService({ role: 'member' });

    await expect(
      service.addMember(user, { userId: 'user_2', email: 'teammate@example.com' })
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects users who are already members', async () => {
    const { service } = makeService({ duplicate: true });

    await expect(
      service.addMember(user, { userId: 'user_2', email: 'teammate@example.com' })
    ).rejects.toThrow(ConflictException);
  });

  it('rejects an invalid role', async () => {
    const { service } = makeService();

    await expect(
      service.addMember(user, { userId: 'user_2', email: 'teammate@example.com', role: 'superadmin' as MemberRole })
    ).rejects.toThrow(BadRequestException);
  });
});

describe('OrganizationsService.updateMemberRole', () => {
  it('lets an owner promote a member to admin', async () => {
    const { db, service } = makeService({ targetRole: 'member' });

    const result = await service.updateMemberRole(user, 'user_2', 'admin');

    expect(result).toEqual({ userId: 'user_2', role: 'admin' });
    expect(db.queryCalls(/UPDATE organization_members\s+SET role/)[0].values).toEqual(['org_1', 'user_2', 'admin']);
  });

  it('lets an admin promote a member to admin', async () => {
    const { service } = makeService({ role: 'admin', targetRole: 'member' });

    await expect(service.updateMemberRole(user, 'user_2', 'admin')).resolves.toMatchObject({ role: 'admin' });
  });

  it('stops admins from changing other admins', async () => {
    const { service } = makeService({ role: 'admin', targetRole: 'admin' });

    await expect(service.updateMemberRole(user, 'user_2', 'member')).rejects.toThrow(ForbiddenException);
  });

  it('stops admins from changing owner roles', async () => {
    const { service } = makeService({ role: 'admin', targetRole: 'owner' });

    await expect(service.updateMemberRole(user, 'user_2', 'member')).rejects.toThrow(ForbiddenException);
  });

  it('stops demoting the last owner', async () => {
    const { service } = makeService({ role: 'owner', targetRole: 'owner', ownerCount: '1' });

    await expect(service.updateMemberRole(user, 'user_2', 'member')).rejects.toThrow(BadRequestException);
  });

  it('lets an owner demote a co-owner when another owner remains', async () => {
    const { db, service } = makeService({ role: 'owner', targetRole: 'owner', ownerCount: '2' });

    const result = await service.updateMemberRole(user, 'user_2', 'member');

    expect(result.role).toBe('member');
    expect(db.queryCalls(/UPDATE organization_members\s+SET role/).length).toBe(1);
  });

  it('rejects regular members from changing roles', async () => {
    const { service } = makeService({ role: 'member' });

    await expect(service.updateMemberRole(user, 'user_2', 'admin')).rejects.toThrow(ForbiddenException);
  });

  it('throws when the target is not a member', async () => {
    const { service } = makeService({ targetNotFound: true });

    await expect(service.updateMemberRole(user, 'user_2', 'admin')).rejects.toThrow(NotFoundException);
  });

  it('rejects an invalid role', async () => {
    const { service } = makeService();

    await expect(service.updateMemberRole(user, 'user_2', 'superadmin' as MemberRole)).rejects.toThrow(
      BadRequestException
    );
  });
});

describe('OrganizationsService.removeMember', () => {
  it('lets an owner remove a member', async () => {
    const { db, service } = makeService({ targetRole: 'member' });

    const result = await service.removeMember(user, 'user_2');

    expect(result).toMatchObject({ userId: 'user_2', removed: true });
    expect(db.queryCalls(/DELETE FROM organization_members/)).toHaveLength(1);
  });

  it('stops admins from removing owners', async () => {
    const { service } = makeService({ role: 'admin', targetRole: 'owner' });

    await expect(service.removeMember(user, 'user_2')).rejects.toThrow(ForbiddenException);
  });

  it('stops removing the last owner', async () => {
    const { service } = makeService({ role: 'owner', targetRole: 'owner', ownerCount: '1' });

    await expect(service.removeMember(user, 'user_2')).rejects.toThrow(BadRequestException);
  });

  it('lets an owner remove a co-owner when another owner remains', async () => {
    const { service } = makeService({ role: 'owner', targetRole: 'owner', ownerCount: '2' });

    await expect(service.removeMember(user, 'user_2')).resolves.toMatchObject({ removed: true });
  });

  it('stops users from removing themselves', async () => {
    const { service } = makeService();

    await expect(service.removeMember(user, 'user_1')).rejects.toThrow(BadRequestException);
  });

  it('throws when the target is not a member', async () => {
    const { service } = makeService({ targetNotFound: true });

    await expect(service.removeMember(user, 'user_2')).rejects.toThrow(NotFoundException);
  });
});

describe('AuthService.resolveUserByEmail', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it('resolves an email to a Supabase account via the Admin API', async () => {
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role';
    const service = new AuthService(mockDatabase() as never);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ users: [{ id: 'user_9', email: 'someone@example.com' }] })
      })
    );

    const result = await service.resolveUserByEmail('someone@example.com');

    expect(result).toEqual({ id: 'user_9', email: 'someone@example.com' });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/v1/admin/users?email=someone%40example.com'),
      expect.anything()
    );
  });

  it('returns null when no Supabase account exists', async () => {
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role';
    const service = new AuthService(mockDatabase() as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ users: [] }) }));

    await expect(service.resolveUserByEmail('ghost@example.com')).resolves.toBeNull();
  });

  it('throws when the service role key is missing', async () => {
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const service = new AuthService(mockDatabase() as never);

    await expect(service.resolveUserByEmail('a@b.co')).rejects.toThrow(UnauthorizedException);
  });
});
