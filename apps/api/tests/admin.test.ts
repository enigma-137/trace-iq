import { describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../src/database/database.service';
import { AdminService } from '../src/modules/admin/admin.service';
import { AuthService, DashboardUser } from '../src/modules/auth/auth.service';
import { mockDatabase, rows, empty } from './helpers/mock-db';

function makeService(db: ReturnType<typeof mockDatabase>) {
  return new AdminService(db as unknown as DatabaseService);
}

describe('admin overview', () => {
  it('returns aggregate platform counts from a single query', async () => {
    const db = mockDatabase((text) => {
      if (text.includes('FROM organizations')) return rows([{ organizations: 4, projects: 12, eventsTotal: 500_000, events24h: 1200, activeOrgs24h: 3, trackedUsers: 9000 }]);
      return empty();
    });

    const result = await makeService(db).overview();

    expect(result.organizations).toBe(4);
    expect(result.projects).toBe(12);
    expect(result.eventsTotal).toBe(500_000);
    expect(result.events24h).toBe(1200);
    expect(result.activeOrgs24h).toBe(3);
    expect(result.trackedUsers).toBe(9000);
  });
});

describe('admin organizations', () => {
  it('lists organizations with member, project and event counts', async () => {
    const db = mockDatabase(() =>
      rows([
        { id: 'org1', name: 'Acme', slug: 'acme', createdAt: '2026-01-01T00:00:00Z', memberCount: 3, projectCount: 2, eventCount: 100 }
      ])
    );

    const result = await makeService(db).organizations();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Acme');
    expect(result[0].memberCount).toBe(3);
    expect(result[0].projectCount).toBe(2);
    expect(result[0].eventCount).toBe(100);
  });
});

describe('admin projects', () => {
  it('lists projects with their owning organization name', async () => {
    const db = mockDatabase(() =>
      rows([
        { id: 'proj1', name: 'App', slug: 'app', organizationName: 'Acme', createdAt: '2026-01-01T00:00:00Z', eventCount: 50, lastEventAt: '2026-08-17T10:00:00Z' }
      ])
    );

    const result = await makeService(db).projects();

    expect(result).toHaveLength(1);
    expect(result[0].organizationName).toBe('Acme');
    expect(result[0].eventCount).toBe(50);
    expect(result[0].lastEventAt).toMatch(/2026-08-17/);
  });
});

describe('admin activity', () => {
  it('returns the newest cross-organization events', async () => {
    const db = mockDatabase(() =>
      rows([
        {
          id: 'evt1',
          eventName: 'signup',
          projectName: 'App',
          organizationName: 'Acme',
          occurredAt: '2026-08-17T10:00:00Z',
          path: '/pricing',
          country: 'BR',
          device: 'mobile'
        }
      ])
    );

    const result = await makeService(db).activity();

    expect(result).toHaveLength(1);
    expect(result[0].eventName).toBe('signup');
    expect(result[0].organizationName).toBe('Acme');
  });
});

describe('admin logs', () => {
  it('unifies alert, digest, achievement and audit entries into one feed', async () => {
    const db = mockDatabase(() =>
      rows([
        { kind: 'alert', summary: 'Alert "Spike" → a@b.c [sent]', occurredAt: '2026-08-17T09:00:00Z' },
        { kind: 'digest', summary: 'Monthly digest sent to Acme', occurredAt: '2026-08-01T00:00:00Z' },
        { kind: 'audit', summary: 'member.added → x@y.z', occurredAt: '2026-07-30T00:00:00Z' }
      ])
    );

    const result = await makeService(db).logs();

    expect(result).toHaveLength(3);
    expect(result.map((row) => row.kind)).toEqual(['alert', 'digest', 'audit']);
  });
});

describe('requirePlatformAdmin', () => {
  it('allows a user whose email is listed in platform_admins', async () => {
    const db = mockDatabase(() => rows([{ email: 'emmanuelonoja291@gmail.com' }]));
    const auth = new AuthService(db as unknown as DatabaseService);
    const user: DashboardUser = { id: 'u1', email: 'EmmanuelOnoja291@gmail.com' };

    await expect(auth.requirePlatformAdmin(user)).resolves.toBeUndefined();
  });

  it('rejects a user whose email is not listed', async () => {
    const db = mockDatabase(() => empty());
    const auth = new AuthService(db as unknown as DatabaseService);
    const user: DashboardUser = { id: 'u2', email: 'someone@else.com' };

    await expect(auth.requirePlatformAdmin(user)).rejects.toThrow(/platform admin access/i);
  });

  it('rejects personal access tokens and sessions without an email', async () => {
    const db = mockDatabase(() => rows([{ email: 'emmanuelonoja291@gmail.com' }]));
    const auth = new AuthService(db as unknown as DatabaseService);

    await expect(auth.requirePlatformAdmin({ id: 'u1', authMethod: 'pat' })).rejects.toThrow(/signed-in session/i);
    await expect(auth.requirePlatformAdmin({ id: 'u1', authMethod: 'supabase' })).rejects.toThrow(/platform admin access/i);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('admin controller', () => {
  it('routes through the auth guard on every endpoint', async () => {
    const { AuthService: AuthClass } = await import('../src/modules/auth/auth.service');
    const { AdminController } = await import('../src/modules/admin/admin.controller');
    const { AdminService: AdminClass } = await import('../src/modules/admin/admin.service');

    const adminUser: DashboardUser = { id: 'u1', email: 'emmanuelonoja291@gmail.com' };
    const auth = {
      getDashboardUser: vi.fn().mockResolvedValue(adminUser),
      requirePlatformAdmin: vi.fn().mockResolvedValue(undefined)
    } as unknown as AuthClass;
    const svc = {
      overview: vi.fn().mockResolvedValue({ organizations: 1 }),
      organizations: vi.fn().mockResolvedValue([]),
      projects: vi.fn().mockResolvedValue([]),
      activity: vi.fn().mockResolvedValue([]),
      logs: vi.fn().mockResolvedValue([])
    } as unknown as AdminClass;

    const controller = new AdminController(auth, svc);

    await controller.overview('Bearer x');
    await controller.organizations('Bearer x');
    await controller.projects('Bearer x');
    await controller.activity('Bearer x');
    await controller.logs('Bearer x');

    expect(auth.requirePlatformAdmin).toHaveBeenCalledTimes(5);
    expect(svc.overview).toHaveBeenCalledTimes(1);
    expect(svc.logs).toHaveBeenCalledTimes(1);
  });
});
