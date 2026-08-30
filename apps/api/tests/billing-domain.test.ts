import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { EntitlementService } from '../src/modules/billing/entitlement.service';
import { UsageService } from '../src/modules/billing/usage.service';
import { RetentionService } from '../src/modules/billing/retention.service';

function result(rows: Record<string, unknown>[], rowCount = rows.length) {
  return { rows, rowCount, command: '', oid: 0, fields: [] };
}

const freeRow = {
  plan_key: null, status: null, grace_period_ends_at: null,
  projects: '1', members: '1', events: '0', ai_insights: '0'
};

describe('EntitlementService', () => {
  it('keeps self-hosted installations unrestricted without database reads', async () => {
    const database = { query: vi.fn() };
    const service = new EntitlementService(database as never, { deploymentMode: 'self_hosted' });
    const snapshot = await service.getSnapshot('org_1');

    expect(snapshot.plan).toBe('self_hosted');
    expect(snapshot.limits.events).toBeNull();
    expect(database.query).not.toHaveBeenCalled();
  });

  it('defaults Cloud organizations without a subscription to Free', async () => {
    const database = { query: vi.fn().mockResolvedValueOnce(result([freeRow])).mockResolvedValueOnce(result([])) };
    const service = new EntitlementService(database as never, { deploymentMode: 'cloud' });
    const snapshot = await service.getSnapshot('org_1');

    expect(snapshot).toMatchObject({
      plan: 'free',
      limits: { events: 50_000, projects: 1, members: 1, retentionDays: 30, aiInsights: 5 },
      features: { publicDashboards: true }
    });
  });

  it('honors active Pro and active entitlement overrides', async () => {
    const database = { query: vi.fn()
      .mockResolvedValueOnce(result([{ ...freeRow, plan_key: 'pro', status: 'active', projects: '3', members: '2' }]))
      .mockResolvedValueOnce(result([{ entitlement_key: 'projects', value: 20 }])) };
    const service = new EntitlementService(database as never, { deploymentMode: 'cloud' });
    const snapshot = await service.getSnapshot('org_1');

    expect(snapshot.plan).toBe('pro');
    expect(snapshot.limits.projects).toBe(20);
    expect(snapshot.limits.events).toBe(1_000_000);
  });

  it('stops Free event ingestion above the 5 percent grace allowance', async () => {
    const database = { query: vi.fn()
      .mockResolvedValueOnce(result([{ ...freeRow, events: '52499' }]))
      .mockResolvedValueOnce(result([])) };
    const service = new EntitlementService(database as never, { deploymentMode: 'cloud' });

    await expect(service.assertAvailable('org_1', 'events', 2)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('UsageService', () => {
  it('serializes and increments Cloud usage', async () => {
    const snapshot = {
      deploymentMode: 'cloud', plan: 'free', subscriptionStatus: null,
      limits: { events: 50_000, projects: 1, members: 1, retentionDays: 30, aiInsights: 5 },
      features: { publicDashboards: true },
      usage: { events: 10, projects: 1, members: 1, aiInsights: 0 },
      overLimit: { projects: false, members: false }
    } as const;
    const entitlements = {
      getSnapshot: vi.fn().mockResolvedValue(snapshot),
      assertAvailable: vi.fn().mockResolvedValue(snapshot)
    };
    const executor = { query: vi.fn().mockResolvedValue(result([])) };

    await new UsageService(entitlements as never).consume(executor as never, 'org_1', 'events', 25);

    expect(executor.query).toHaveBeenNthCalledWith(1, 'SELECT pg_advisory_xact_lock(hashtext($1))', ['org_1:events']);
    expect(executor.query.mock.calls[1][0]).toContain('INSERT INTO organization_usage_monthly');
  });
});

describe('RetentionService', () => {
  it('deletes expired self-hosted events in bounded batches', async () => {
    const database = { query: vi.fn()
      .mockResolvedValueOnce(result([{ id: 'proj_1', organization_id: 'org_1', data_retention_days: 30 }]))
      .mockResolvedValueOnce(result([], 4))
    };
    const service = new RetentionService(database as never, {} as never);
    const summary = await service.runSweep();

    expect(summary).toEqual({ projectsScanned: 1, deletedEvents: 4 });
    expect(database.query.mock.calls[1][0]).toContain("occurred_at < now() - ($2::int * interval '1 day')");
    expect(database.query.mock.calls[1][1]).toEqual(['proj_1', 30]);
  });
});

