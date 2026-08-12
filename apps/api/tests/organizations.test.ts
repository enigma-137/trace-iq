import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrganizationsService } from '../src/modules/organizations/organizations.service';
import { mockDatabase, rows, type MockDb } from './helpers/mock-db';

type SetupRow = {
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  role: 'owner' | 'admin' | 'member';
  project_id: string | null;
};

function makeOrg(overrides: Partial<SetupRow> = {}): SetupRow {
  return {
    organization_id: 'org_1',
    organization_name: 'Acme',
    organization_slug: 'acme',
    role: 'owner',
    project_id: 'proj_1',
    ...overrides
  };
}

function makeService(row: SetupRow | null): { db: MockDb; service: OrganizationsService } {
  const db = mockDatabase((text) => {
    if (/UPDATE organizations/.test(text)) {
      return rows([]);
    }
    return row ? rows([row]) : rows([]);
  });
  const service = new OrganizationsService(db as never);
  return { db, service };
}

const user = { id: 'user_1', authMethod: 'supabase' } as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OrganizationsService.renameOrganization', () => {
  it('renames the organization when the user is an owner', async () => {
    const { db, service } = makeService(makeOrg());

    const result = await service.renameOrganization(user, { organizationName: 'New Name' });

    expect(result.organization).toMatchObject({ id: 'org_1', name: 'New Name', role: 'owner' });
    const updates = db.queryCalls(/UPDATE organizations/);
    expect(updates).toHaveLength(1);
    expect(updates[0].values).toEqual(['org_1', 'New Name']);
  });

  it('allows admins to rename the organization', async () => {
    const { service } = makeService(makeOrg({ role: 'admin' }));

    const result = await service.renameOrganization(user, { organizationName: 'Team' });

    expect(result.organization.name).toBe('Team');
  });

  it('rejects non-owners and non-admins', async () => {
    const { service } = makeService(makeOrg({ role: 'member' }));

    await expect(service.renameOrganization(user, { organizationName: 'Nope' })).rejects.toThrow(
      ForbiddenException
    );
  });

  it('rejects an empty or missing name', async () => {
    const { service } = makeService(makeOrg());

    await expect(service.renameOrganization(user, {})).rejects.toThrow(BadRequestException);
    await expect(service.renameOrganization(user, { organizationName: '   ' })).rejects.toThrow(BadRequestException);
  });

  it('throws when the user has no organization', async () => {
    const { service } = makeService(null);

    await expect(service.renameOrganization(user, { organizationName: 'Acme' })).rejects.toThrow(
      BadRequestException
    );
  });
});