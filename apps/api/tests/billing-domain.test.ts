import { afterEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { EntitlementService } from '../src/modules/billing/entitlement.service';
import { UsageService } from '../src/modules/billing/usage.service';
import { RetentionService } from '../src/modules/billing/retention.service';

function result(rows: Record<string, unknown>[], rowCount = rows.length) {
  return { rows, rowCount, command: '', oid: 0, fields: [] };
}

const freeRow = {
  plan_key: null, status: null, grace_period_ends_at: null,
  subscription_updated_at: null, provider_product_id: null, billing_period: null,
  current_period_end: null, cancel_at_period_end: false,
  subscription_change_status: null, subscription_change_target_billing_period: null,
  subscription_change_requested_at: null, subscription_change_failure_code: null,
  projects: '1', members: '1', events: '0', ai_insights: '0'
};

afterEach(() => vi.useRealTimers());

describe('EntitlementService', () => {
  it('keeps self-hosted installations unrestricted without database reads', async () => {
    const database = { query: vi.fn() };
    const service = new EntitlementService(database as never, { deploymentMode: 'self_hosted' });
    const snapshot = await service.getSnapshot('org_1');

    expect(snapshot.plan).toBe('self_hosted');
    expect(snapshot.limits.events).toBeNull();
    expect(snapshot.features).toMatchObject({ sessionReplay: true, alerts: true });
    expect(database.query).not.toHaveBeenCalled();
  });

  it('defaults Cloud organizations without a subscription to Free', async () => {
    const database = { query: vi.fn().mockResolvedValueOnce(result([freeRow])).mockResolvedValueOnce(result([])) };
    const service = new EntitlementService(database as never, { deploymentMode: 'cloud' });
    const snapshot = await service.getSnapshot('org_1');

    expect(snapshot).toMatchObject({
      plan: 'free',
      limits: { events: 50_000, projects: 1, members: 1, retentionDays: 30, aiInsights: 5 },
      features: { publicDashboards: true, sessionReplay: false, alerts: false }
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
    expect(snapshot.features).toMatchObject({ sessionReplay: true, alerts: true });
  });

  it('uses zero-valued feature overrides only as Cloud Pro emergency kill switches', async () => {
    const database = { query: vi.fn()
      .mockResolvedValueOnce(result([{ ...freeRow, plan_key: 'pro', status: 'active' }]))
      .mockResolvedValueOnce(result([
        { entitlement_key: 'sessionReplay', value: 0 },
        { entitlement_key: 'alerts', value: 0 }
      ])) };
    const snapshot = await new EntitlementService(database as never, { deploymentMode: 'cloud' }).getSnapshot('org_1');

    expect(snapshot.plan).toBe('pro');
    expect(snapshot.features).toMatchObject({ sessionReplay: false, alerts: false });
  });

  it('keeps legacy positive Replay overrides harmless for Pro and unable to grant Free', async () => {
    const proDb = { query: vi.fn()
      .mockResolvedValueOnce(result([{ ...freeRow, plan_key: 'pro', status: 'active' }]))
      .mockResolvedValueOnce(result([{ entitlement_key: 'sessionReplay', value: 1 }])) };
    const freeDb = { query: vi.fn()
      .mockResolvedValueOnce(result([freeRow]))
      .mockResolvedValueOnce(result([{ entitlement_key: 'sessionReplay', value: 1 }])) };

    expect((await new EntitlementService(proDb as never, { deploymentMode: 'cloud' }).getSnapshot('org_1')).features.sessionReplay).toBe(true);
    expect((await new EntitlementService(freeDb as never, { deploymentMode: 'cloud' }).getSnapshot('org_1')).features.sessionReplay).toBe(false);
  });

  it('keeps past-due Pro during the seven-day grace period and downgrades after it expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-05T00:00:00Z'));
    const withinGraceDb = { query: vi.fn()
      .mockResolvedValueOnce(result([{
        ...freeRow, plan_key: 'pro', status: 'past_due', billing_period: 'monthly',
        provider_product_id: 'prod_monthly', grace_period_ends_at: '2026-09-08T00:00:00Z'
      }]))
      .mockResolvedValueOnce(result([])) };
    const withinGrace = await new EntitlementService(withinGraceDb as never, { deploymentMode: 'cloud' }).getSnapshot('org_1');
    expect(withinGrace.plan).toBe('pro');

    vi.setSystemTime(new Date('2026-09-09T00:00:00Z'));
    const expiredGraceDb = { query: vi.fn()
      .mockResolvedValueOnce(result([{
        ...freeRow, plan_key: 'pro', status: 'past_due', billing_period: 'monthly',
        provider_product_id: 'prod_monthly', grace_period_ends_at: '2026-09-08T00:00:00Z'
      }]))
      .mockResolvedValueOnce(result([])) };
    const expiredGrace = await new EntitlementService(expiredGraceDb as never, { deploymentMode: 'cloud' }).getSnapshot('org_1');
    expect(expiredGrace.plan).toBe('free');
  });

  it('restores Pro after payment recovery and exposes the provider-backed yearly interval', async () => {
    const database = { query: vi.fn()
      .mockResolvedValueOnce(result([{
        ...freeRow, plan_key: 'pro', status: 'active', provider_product_id: 'prod_yearly',
        billing_period: 'yearly', current_period_end: '2027-09-02T00:00:00Z'
      }]))
      .mockResolvedValueOnce(result([])) };
    const service = new EntitlementService(database as never, {
      deploymentMode: 'cloud',
      bachs: { products: { proMonthly: 'prod_monthly', proYearly: 'prod_yearly' } }
    } as never);
    const snapshot = await service.getSnapshot('org_1');

    expect(snapshot.plan).toBe('pro');
    expect(snapshot.subscription).toMatchObject({
      status: 'active', providerProductId: 'prod_yearly', billingPeriod: 'yearly'
    });
  });

  it('exposes pending and failed yearly changes while retaining the monthly interval', async () => {
    const pendingDb = { query: vi.fn()
      .mockResolvedValueOnce(result([{
        ...freeRow, plan_key: 'pro', status: 'active', provider_product_id: 'prod_monthly',
        billing_period: 'monthly', subscription_change_status: 'pending',
        subscription_change_target_billing_period: 'yearly',
        subscription_change_requested_at: '2026-09-02T12:00:00Z',
        current_period_end: '2026-09-30T08:00:00Z'
      }]))
      .mockResolvedValueOnce(result([])) };
    const pending = await new EntitlementService(pendingDb as never, { deploymentMode: 'cloud' }).getSnapshot('org_1');
    expect(pending.plan).toBe('pro');
    expect(pending.subscription?.status).toBe('active');
    expect(pending.subscription).toMatchObject({
      billingPeriod: 'monthly',
      billingChange: {
        status: 'pending', targetBillingPeriod: 'yearly',
        effectiveAt: '2026-09-30T08:00:00Z', failureCode: null
      }
    });

    const failedDb = { query: vi.fn()
      .mockResolvedValueOnce(result([{
        ...freeRow, plan_key: 'pro', status: 'active', provider_product_id: 'prod_monthly',
        billing_period: 'monthly', subscription_change_status: 'failed',
        subscription_change_target_billing_period: 'yearly',
        subscription_change_requested_at: '2026-09-02T12:00:00Z',
        subscription_change_failure_code: 'payment_failed'
      }]))
      .mockResolvedValueOnce(result([])) };
    const failed = await new EntitlementService(failedDb as never, { deploymentMode: 'cloud' }).getSnapshot('org_1');
    expect(failed.subscription).toMatchObject({
      billingPeriod: 'monthly',
      billingChange: {
        status: 'failed', targetBillingPeriod: 'yearly',
        effectiveAt: null, failureCode: 'payment_failed'
      }
    });
  });

  it('keeps Pro through a period-end cancellation and becomes Free on the terminal cancellation event', async () => {
    const scheduledDb = { query: vi.fn()
      .mockResolvedValueOnce(result([{
        ...freeRow, plan_key: 'pro', status: 'active', billing_period: 'monthly',
        cancel_at_period_end: true, current_period_end: '2026-10-02T00:00:00Z'
      }]))
      .mockResolvedValueOnce(result([])) };
    const scheduled = await new EntitlementService(scheduledDb as never, { deploymentMode: 'cloud' }).getSnapshot('org_1');
    expect(scheduled.plan).toBe('pro');
    expect(scheduled.subscription?.cancelAtPeriodEnd).toBe(true);

    const canceledDb = { query: vi.fn()
      .mockResolvedValueOnce(result([{
        ...freeRow, plan_key: 'pro', status: 'canceled', billing_period: 'monthly',
        current_period_end: '2026-10-02T00:00:00Z'
      }]))
      .mockResolvedValueOnce(result([])) };
    const canceled = await new EntitlementService(canceledDb as never, { deploymentMode: 'cloud' }).getSnapshot('org_1');
    expect(canceled.plan).toBe('free');
  });

  it('stops Free event ingestion above the 5 percent grace allowance', async () => {
    const database = { query: vi.fn()
      .mockResolvedValueOnce(result([{ ...freeRow, events: '52499' }]))
      .mockResolvedValueOnce(result([])) };
    const service = new EntitlementService(database as never, { deploymentMode: 'cloud' });

    await expect(service.assertAvailable('org_1', 'events', 2)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('takes an organization resource lock before checking count-based capacity', async () => {
    const executor = { query: vi.fn()
      .mockResolvedValueOnce(result([]))
      .mockResolvedValueOnce(result([{ ...freeRow, projects: '0' }]))
      .mockResolvedValueOnce(result([])) };
    const service = new EntitlementService({ query: vi.fn() } as never, { deploymentMode: 'cloud' });

    await service.lockAndAssertAvailable(executor as never, 'org_1', 'projects');

    expect(executor.query).toHaveBeenNthCalledWith(
      1,
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['org_1:projects']
    );
    expect(String(executor.query.mock.calls[1][0])).toContain('SELECT');
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
    const client = { query: vi.fn()
      .mockResolvedValueOnce(result([]))
      .mockResolvedValueOnce(result([], 4)) };
    const database = {
      query: vi.fn().mockResolvedValueOnce(result([{ id: 'proj_1', organization_id: 'org_1', data_retention_days: 30 }])),
      transaction: vi.fn(async (callback: (executor: typeof client) => Promise<unknown>) => callback(client))
    };
    const service = new RetentionService(database as never, {} as never);
    const summary = await service.runSweep();

    expect(summary).toEqual({ projectsScanned: 1, deletedEvents: 4 });
    expect(client.query).toHaveBeenNthCalledWith(1, "SELECT set_config('traceiq.retention_sweep', 'on', true)");
    expect(client.query.mock.calls[1][0]).toContain("occurred_at < now() - ($2::int * interval '1 day')");
    expect(client.query.mock.calls[1][1]).toEqual(['proj_1', 30]);
  });
});
