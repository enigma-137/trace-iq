import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DashboardsService } from '../src/modules/dashboards/dashboards.service';
import { affected, mockDatabase, rows } from './helpers/mock-db';

const project = { id: 'proj_1', name: 'Site', slug: 'site', organizationId: 'org_1', organizationName: 'Org', role: 'owner' };
const user = { id: 'usr_1', authMethod: 'supabase' } as const;

function setup(ownerId = user.id) {
  const db = mockDatabase((sql) => {
    if (sql.includes('JOIN dashboards d')) return rows([{
      id: 'shr_1', dashboardId: 'dash_1', projectId: 'proj_1', dashboardName: 'Signups', ownerId,
      definition: { source: 'trend', event: 'signup', days: '30', measure: 'count' },
      permissions: ['summary'], expiresAt: null, createdAt: '2026-01-01', lastAccessedAt: null
    }]);
    if (sql.includes('SELECT id, owner_id')) return rows([{ id: 'dash_1', ownerId }]);
    return affected(1);
  });
  const projects = { requireActiveProject: vi.fn().mockResolvedValue(project) };
  const analytics = { getTrends: vi.fn().mockResolvedValue({
    event: 'signup', interval: 'day', measure: 'count', property: null, breakdown: null,
    buckets: ['2026-01-01T00:00:00Z'], series: [{ key: 'signup', points: [] }],
    summary: { current: 12, previous: 8, days: 30 }
  }) };
  return { db, analytics, service: new DashboardsService(db as never, projects as never, analytics as never) };
}

describe('permission-scoped public dashboard sharing', () => {
  it('stores a hash instead of the raw share token', async () => {
    const { db, service } = setup();
    const created = await service.createPublicShare(user, 'dash_1', { permissions: ['summary', 'chart'], projectId: 'proj_1' });
    expect(created.token).toMatch(/^tiq_share_/);
    const values = db.queryCalls('INSERT INTO public_dashboard_shares')[0].values;
    expect(values).not.toContain(created.token);
    expect(values[3]).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns only explicitly permitted public sections', async () => {
    const { analytics, service } = setup();
    const result = await service.getPublicShare(`tiq_share_${'a'.repeat(43)}`);
    expect(result.summary).toEqual({ current: 12, previous: 8, days: 30 });
    expect(result.chart).toBeUndefined();
    expect(result.definition).toBeUndefined();
    expect(analytics.getTrends).toHaveBeenCalledOnce();
  });

  it('allows only the dashboard owner to create links', async () => {
    const { service } = setup('usr_other');
    await expect(service.createPublicShare(user, 'dash_1', { permissions: ['summary'] })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns not found for an invalid public token', async () => {
    const { service } = setup();
    await expect(service.getPublicShare('not-a-share')).rejects.toBeInstanceOf(NotFoundException);
  });
});
