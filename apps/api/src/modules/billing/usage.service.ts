import { Injectable } from '@nestjs/common';
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
}
