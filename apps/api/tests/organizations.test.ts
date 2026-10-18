import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrganizationsService } from '../src/modules/organizations/organizations.service';
import { mockDatabase, rows, affected, type MockDb } from './helpers/mock-db';
import { activeProjectMiddleware } from '../src/common/active-project';

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

describe('OrganizationsService.createProjectForUser', () => {
  function makeCreateService(row: SetupRow | null) {
    const db = mockDatabase((text) => {
      if (/FROM organization_members om/.test(text)) {
        return row ? rows([row]) : rows([]);
      }
      if (/INSERT INTO projects/.test(text)) {
        return affected(1);
      }
      if (/INSERT INTO project_write_keys/.test(text)) {
        return affected(1);
      }
      return rows([]);
    });
    const service = new OrganizationsService(db as never);
    return { db, service };
  }

  it('creates a second project in the active organization with a fresh write key', async () => {
    const { db, service } = makeCreateService(makeOrg());

    const result = await service.createProjectForUser(user, { projectName: 'Admin Panel' });

    expect(result.organization).toMatchObject({ id: 'org_1', role: 'owner' });
    expect(result.project.id).toMatch(/^proj_/);
    expect(result.project.organizationId).toBe('org_1');
    expect(result.project.name).toBe('Admin Panel');
    expect(result.writeKey.value).toMatch(/^trq_live_/);
    expect(result.sdkSnippet).toContain(result.project.id);
    expect(result.sdkSnippet).toContain(result.writeKey.value);

    const projectInserts = db.queryCalls(/INSERT INTO projects/);
    expect(projectInserts).toHaveLength(1);
    expect(projectInserts[0].values).toEqual([
      expect.stringMatching(/^proj_/),
      'org_1',
      'Admin Panel',
      expect.stringMatching(/^admin-panel-/),
      'user_1'
    ]);

    const keyInserts = db.queryCalls(/INSERT INTO project_write_keys/);
    expect(keyInserts).toHaveLength(1);
    expect(keyInserts[0].values[1]).toBe(result.project.id);
  });

  it('falls back to a default project name when none is given', async () => {
    const { service } = makeCreateService(makeOrg());

    const result = await service.createProjectForUser(user, {});

    expect(result.project.name).toBe('Web App');
  });

  it('rejects members from creating projects', async () => {
    const { service } = makeCreateService(makeOrg({ role: 'member' }));

    await expect(service.createProjectForUser(user, { projectName: 'Nope' })).rejects.toThrow(
      ForbiddenException
    );
  });

  it('rejects when the user has no organization', async () => {
    const { service } = makeCreateService(null);

    await expect(service.createProjectForUser(user, { projectName: 'Nope' })).rejects.toThrow(
      BadRequestException
    );
  });

  it('honors an explicit organizationId', async () => {
    const { db, service } = makeCreateService(makeOrg());

    await service.createProjectForUser(user, { organizationId: 'org_2', projectName: 'Mobile' });

    const setup = db.queryCalls(/FROM organization_members om/);
    expect(setup[0].values).toEqual(['user_1', 'org_2', null]);
  });
});

describe('OrganizationsService.listOrganizations', () => {
  it('returns every project of each organization with the first project first', async () => {
    const db = mockDatabase((text) => {
      if (/json_agg/.test(text)) {
        return rows([
          {
            id: 'org_1',
            name: 'Acme',
            slug: 'acme',
            role: 'owner',
            member_count: '2',
            projects: [
              { id: 'proj_1', name: 'Web App', slug: 'web-app' },
              { id: 'proj_2', name: 'Admin Panel', slug: 'admin-panel' }
            ]
          }
        ]);
      }
      return rows([]);
    });
    const service = new OrganizationsService(db as never);

    const result = await service.listOrganizations(user);

    expect(result.organizations).toHaveLength(1);
    expect(result.organizations[0]).toMatchObject({
      id: 'org_1',
      memberCount: 2,
      projects: [
        { id: 'proj_1', name: 'Web App', slug: 'web-app' },
        { id: 'proj_2', name: 'Admin Panel', slug: 'admin-panel' }
      ],
      project: { id: 'proj_1', name: 'Web App', slug: 'web-app' }
    });
  });

  it('returns an empty projects array for organizations without projects', async () => {
    const db = mockDatabase((text) => {
      if (/json_agg/.test(text)) {
        return rows([
          { id: 'org_1', name: 'Acme', slug: 'acme', role: 'owner', member_count: '1', projects: [] }
        ]);
      }
      return rows([]);
    });
    const service = new OrganizationsService(db as never);

    const result = await service.listOrganizations(user);

    expect(result.organizations[0].projects).toEqual([]);
    expect(result.organizations[0].project).toBeNull();
  });
});
describe('OrganizationsService.getSetup', () => {
  const setupRow = {
    id: 'org_1',
    name: 'Acme',
    slug: 'acme',
    role: 'owner',
    member_count: 1,
    project_id: 'proj_2',
    project_name: 'Second',
    project_slug: 'second'
  };

  function withActiveProject<T>(projectId: string, run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      activeProjectMiddleware(
        { headers: { 'x-traceiq-project-id': projectId } } as never,
        {} as never,
        () => {
          run().then(resolve, reject);
        }
      );
    });
  }

  it('prefers the active project when no projectId is given', async () => {
    const db = mockDatabase(() => rows([setupRow]));
    const service = new OrganizationsService(db as never);

    const result = await withActiveProject('proj_2', () => service.getSetup(user));

    expect(result.project).toMatchObject({ id: 'proj_2', name: 'Second' });
    const [call] = db.queryCalls(/FROM organization_members om/);
    expect(call.text).toContain('ORDER BY (p.id = $4) DESC NULLS LAST');
    expect(call.values).toEqual(['user_1', null, null, 'proj_2']);
  });

  it('lets an explicit projectId win over the active project', async () => {
    const db = mockDatabase(() => rows([{ ...setupRow, project_id: 'proj_1' }]));
    const service = new OrganizationsService(db as never);

    await withActiveProject('proj_2', () => service.getSetup(user, undefined, 'proj_1'));

    const [call] = db.queryCalls(/FROM organization_members om/);
    expect(call.values).toEqual(['user_1', null, 'proj_1', null]);
  });

  it('uses no preference outside a dashboard request', async () => {
    const db = mockDatabase(() => rows([setupRow]));
    const service = new OrganizationsService(db as never);

    await service.getSetup(user);

    const [call] = db.queryCalls(/FROM organization_members om/);
    expect(call.values[3]).toBeNull();
  });
});
