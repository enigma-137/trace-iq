import { describe, expect, it, vi } from 'vitest';
import { DashboardsService } from '../src/modules/dashboards/dashboards.service';
import { SavedInsightsService } from '../src/modules/insights/saved-insights.service';

const project = { id: 'proj_1', organizationId: 'org_1' };
const viewer = { id: 'user_1', email: 'Me@Acme.com' };

function setup(rows: Record<string, unknown>[]) {
  const query = vi.fn(async (sql: string) =>
    sql.startsWith('UPDATE') ? { rows: [], rowCount: 1 } : { rows, rowCount: rows.length }
  );
  const projects = { resolveActiveProject: vi.fn().mockResolvedValue(project) };
  return { query, db: { query }, projects };
}

const emailUpdates = (query: ReturnType<typeof vi.fn>) =>
  query.mock.calls.filter(([sql]) => String(sql).startsWith('UPDATE organization_members'));

describe('owner emails on library lists', () => {
  it("returns a teammate's email for dashboards", async () => {
    const { db, projects, query } = setup([{ id: 'd1', ownerId: 'user_2', ownerEmail: 'mate@acme.com' }]);
    const service = new DashboardsService(db as never, projects as never, {} as never, {} as never);

    const { dashboards } = await service.list(viewer as never);

    expect(String(query.mock.calls[0][0])).toContain('organization_members');
    expect(dashboards[0].ownerEmail).toBe('mate@acme.com');
    expect(emailUpdates(query)).toHaveLength(0);
  });

  it('falls back to the viewer email and remembers it for teammates', async () => {
    const { db, projects, query } = setup([{ id: 'd1', ownerId: 'user_1', ownerEmail: null }]);
    const service = new DashboardsService(db as never, projects as never, {} as never, {} as never);

    const { dashboards } = await service.list(viewer as never);

    expect(dashboards[0].ownerEmail).toBe('Me@Acme.com');
    expect(emailUpdates(query)[0][1]).toEqual(['org_1', 'user_1', 'me@acme.com']);
  });

  it("returns the creator's email for insights", async () => {
    const { db, projects } = setup([
      { id: 'i1', createdByUserId: 'user_2', createdByUserEmail: 'mate@acme.com' },
      { id: 'i2', createdByUserId: 'user_3', createdByUserEmail: null }
    ]);
    const service = new SavedInsightsService(db as never, projects as never, {} as never, {} as never, {} as never);

    const { insights } = await service.list(viewer as never, {});

    expect(insights[0].createdByUserEmail).toBe('mate@acme.com');
    expect(insights[1].createdByUserEmail).toBeUndefined();
  });

  it('still lists rows when remembering the email fails', async () => {
    const { db, projects, query } = setup([]);
    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('UPDATE')) throw new Error('db down');
      return { rows: [{ id: 'd1', ownerId: 'user_1', ownerEmail: null }], rowCount: 1 };
    });
    const service = new DashboardsService(db as never, projects as never, {} as never, {} as never);

    await expect(service.list(viewer as never)).resolves.toMatchObject({ dashboards: [{ id: 'd1' }] });
  });
});
