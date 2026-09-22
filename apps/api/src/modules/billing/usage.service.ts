import { ForbiddenException, Injectable } from '@nestjs/common';
import { QueryExecutor } from '../../database/database.service';
import { EntitlementService, LimitedResource } from './entitlement.service';
import { CLOUD_BILLING_POLICY } from './plan-catalog';

export interface UsageConsumption {
  quantityAfter: number;
  limit: number | null;
  warningThreshold: 70 | 90 | 100 | null;
}

@Injectable()
export class UsageService {
  constructor(private readonly entitlements: EntitlementService) {}

  async consume(executor: QueryExecutor, organizationId: string, metric: Extract<LimitedResource, 'events' | 'aiInsights'>, amount: number) {
    const initial = await this.entitlements.getSnapshot(organizationId, executor);
    if (initial.deploymentMode === 'self_hosted') {
      return { quantityAfter: 0, limit: null, warningThreshold: null } satisfies UsageConsumption;
    }
    // Serialize quota checks per organization/metric so concurrent requests
    // cannot both observe the same remaining allowance and overshoot it.
    await executor.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${organizationId}:${metric}`]);
    const snapshot = await this.entitlements.assertAvailable(organizationId, metric, amount, executor);
    const databaseMetric = metric === 'aiInsights' ? 'ai_insights' : metric;
    await executor.query(`
      INSERT INTO organization_usage_monthly (organization_id, metric, period_start, quantity)
      VALUES ($1, $2, date_trunc('month', now())::date, $3)
      ON CONFLICT (organization_id, metric, period_start)
      DO UPDATE SET quantity = organization_usage_monthly.quantity + EXCLUDED.quantity, updated_at = now()
    `, [organizationId, databaseMetric, amount]);
    const quantityAfter = snapshot.usage[metric] + amount;
    const limit = snapshot.limits[metric];
    const percentage = limit ? quantityAfter / limit * 100 : 0;
    const warningThreshold = [...CLOUD_BILLING_POLICY.eventUsageWarningPercentages]
      .reverse().find((threshold) => percentage >= threshold) ?? null;
    return { quantityAfter, limit, warningThreshold } as UsageConsumption;
  }

  async consumeProjectEvents(executor: QueryExecutor, organizationId: string, projectId: string, amount: number) {
    await this.entitlements.assertProjectWritable(projectId, executor);
    return this.consume(executor, organizationId, 'events', amount);
  }

  /**
   * Atomically reserves 1 Ask TraceIQ investigation slot for the specified usage period.
   * Acquires an advisory lock, reconciles stale reservations (> 5 mins), checks combined
   * consumed + reserved usage against plan limits, and sets quota_reserved = true.
   */
  async reserveAskInvestigation(
    executor: QueryExecutor,
    organizationId: string,
    investigationId: string,
    usagePeriod: string,
    amount = 1
  ) {
    const initial = await this.entitlements.getSnapshot(organizationId, executor);
    if (initial.deploymentMode === 'self_hosted') {
      return { allowed: true, plan: 'self_hosted', consumed: 0, reserved: 0, limit: null };
    }

    // Advisory lock to serialize concurrent reservation checks per organization
    await executor.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${organizationId}:aiInsights`]);

    // 1. Reconcile stale reservations older than 5 minutes (process crash, unhandled timeout recovery)
    await executor.query(`
      UPDATE ai_investigations
      SET quota_reserved = false, status = 'failed'
      WHERE organization_id = $1
        AND quota_reserved = true
        AND usage_charged = false
        AND started_at < now() - INTERVAL '5 minutes'
    `, [organizationId]);

    // 2. Query consumed usage and active reservations for this usagePeriod
    const usageResult = await executor.query<{ consumed: string; reserved: string }>(`
      SELECT
        COALESCE((
          SELECT quantity FROM organization_usage_monthly
          WHERE organization_id = $1
            AND metric = 'ai_insights'
            AND period_start = to_date($2 || '-01', 'YYYY-MM-DD')
        ), 0) AS consumed,
        COALESCE((
          SELECT COUNT(*) FROM ai_investigations
          WHERE organization_id = $1
            AND usage_period = $2
            AND quota_reserved = true
            AND usage_charged = false
            AND id != $3
        ), 0) AS reserved
    `, [organizationId, usagePeriod, investigationId]);

    const consumed = Number(usageResult.rows[0]?.consumed || 0);
    const activeReserved = Number(usageResult.rows[0]?.reserved || 0);
    const limit = initial.limits.aiInsights;

    if (limit !== null && (consumed + activeReserved + amount) > limit) {
      throw new ForbiddenException({
        code: 'MONTHLY_AI_INSIGHTS_LIMIT_REACHED',
        resource: 'aiInsights',
        plan: initial.plan,
        current: consumed,
        reserved: activeReserved,
        limit,
        effectiveLimit: limit,
        retryable: false,
        upgradeEligible: initial.plan === 'free',
        message: `Monthly Ask TraceIQ investigation allowance reached (${consumed + activeReserved}/${limit}).`
      });
    }

    // 3. Set quota_reserved = true on investigation record
    await executor.query(`
      UPDATE ai_investigations
      SET quota_reserved = true, usage_period = $2
      WHERE id = $1
    `, [investigationId, usagePeriod]);

    return {
      allowed: true,
      plan: initial.plan,
      consumed,
      reserved: activeReserved + amount,
      limit
    };
  }

  /**
   * Converts an active reservation into consumed monthly usage exactly once.
   */
  async chargeAskInvestigation(
    executor: QueryExecutor,
    organizationId: string,
    investigationId: string,
    usagePeriod: string,
    amount = 1
  ) {
    const initial = await this.entitlements.getSnapshot(organizationId, executor);
    if (initial.deploymentMode === 'self_hosted') {
      return { charged: false, plan: 'self_hosted' };
    }

    await executor.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${organizationId}:aiInsights`]);

    // Check if already charged to enforce idempotent exactly-once charging
    const checkResult = await executor.query<{ usage_charged: boolean }>(`
      SELECT usage_charged FROM ai_investigations WHERE id = $1 FOR UPDATE
    `, [investigationId]);

    if (checkResult.rows[0]?.usage_charged) {
      return { charged: true, duplicate: true };
    }

    // Increment monthly usage for the pinned usage period
    await executor.query(`
      INSERT INTO organization_usage_monthly (organization_id, metric, period_start, quantity)
      VALUES ($1, 'ai_insights', to_date($2 || '-01', 'YYYY-MM-DD'), $3)
      ON CONFLICT (organization_id, metric, period_start)
      DO UPDATE SET quantity = organization_usage_monthly.quantity + EXCLUDED.quantity, updated_at = now()
    `, [organizationId, usagePeriod, amount]);

    // Mark investigation charged and clear reservation flag
    await executor.query(`
      UPDATE ai_investigations
      SET usage_charged = true, quota_reserved = false
      WHERE id = $1
    `, [investigationId]);

    return { charged: true, duplicate: false };
  }

  /**
   * Releases an active reservation on eligible failure, timeout, or cancellation.
   */
  async releaseAskInvestigation(
    executor: QueryExecutor,
    organizationId: string,
    investigationId: string
  ) {
    await executor.query(`
      UPDATE ai_investigations
      SET quota_reserved = false
      WHERE id = $1 AND usage_charged = false
    `, [investigationId]);
  }
}
