import { afterEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { AuthService, DashboardUser } from '../src/modules/auth/auth.service';
import { mockDatabase, rows } from './helpers/mock-db';

type Role = 'owner' | 'admin' | 'member';

function makeRoleService(role: Role | null) {
  const db = mockDatabase((text) => {
    if (/SELECT om\.role/.test(text)) {
      return role ? rows([{ role }]) : rows([]);
    }
    return rows([]);
  });
  return new AuthService(db as never);
}

const user: DashboardUser = { id: 'user_1', authMethod: 'supabase' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AuthService.requireRole — permissions matrix', () => {
  it('allows an owner through an owner/admin gate', async () => {
    const service = makeRoleService('owner');

    await expect(service.requireRole(user, ['owner', 'admin'])).resolves.toBeUndefined();
  });

  it('allows an admin through an owner/admin gate', async () => {
    const service = makeRoleService('admin');

    await expect(service.requireRole(user, ['owner', 'admin'])).resolves.toBeUndefined();
  });

  it('rejects a member from an owner/admin gate', async () => {
    const service = makeRoleService('member');

    await expect(service.requireRole(user, ['owner', 'admin'])).rejects.toThrow(ForbiddenException);
  });

  it('allows a member through a member gate', async () => {
    const service = makeRoleService('member');

    await expect(service.requireRole(user, ['owner', 'admin', 'member'])).resolves.toBeUndefined();
  });

  it('rejects a user who is not a member of any organization', async () => {
    const service = makeRoleService(null);

    await expect(service.requireRole(user, ['owner', 'admin'])).rejects.toThrow(ForbiddenException);
  });

  it('rejects personal access tokens from role-gated actions', async () => {
    const service = makeRoleService('owner');
    const patUser: DashboardUser = { id: 'user_1', authMethod: 'pat', scopes: ['projects:read'] };

    await expect(service.requireRole(patUser, ['owner', 'admin'])).rejects.toThrow(ForbiddenException);
  });

  it('rejects a role not present in the allowed set', async () => {
    const service = makeRoleService('admin');

    await expect(service.requireRole(user, ['member'])).rejects.toThrow(ForbiddenException);
  });
});