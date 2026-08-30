import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { QueryResultRow } from 'pg';
import { appConfig } from '../../config/app.config';
import { DatabaseService, QueryExecutor } from '../../database/database.service';
import { CLOUD_BILLING_POLICY, CLOUD_PLAN_CATALOG, CloudPlanKey } from './plan-catalog';

export type LimitedResource = 'events' | 'projects' | 'members' | 'aiInsights';

export interface EntitlementSnapshot {
  deploymentMode: 'self_hosted' | 'cloud';
  plan: CloudPlanKey | 'self_hosted';
  subscriptionStatus: string | null;
  limits: Record<LimitedResource | 'retentionDays', number | null>;
  features: { publicDashboards: boolean };
  usage: Record<LimitedResource, number>;
  overLimit: { projects: boolean; members: boolean };
}

interface EntitlementRow extends QueryResultRow {
  plan_key: CloudPlanKey | null;
  status: string | null;
  grace_period_ends_at: string | null;
  subscription_updated_at: string | null;
  projects: string;
  members: string;
  events: string;
  ai_insights: string;
}

@Injectable()
export class EntitlementService {
  constructor(
    private readonly database: DatabaseService,
    @Optional() private readonly config: Pick<typeof appConfig, 'deploymentMode'> = appConfig
  ) {}

  async getSnapshot(organizationId: string, executor: QueryExecutor = this.database): Promise<EntitlementSnapshot> {
    if (this.config.deploymentMode === 'self_hosted') {
      return {
        deploymentMode: 'self_hosted', plan: 'self_hosted', subscriptionStatus: null,
        limits: { events: null, projects: null, members: null, retentionDays: null, aiInsights: null },
        features: { publicDashboards: true },
        usage: { events: 0, projects: 0, members: 0, aiInsights: 0 },
        overLimit: { projects: false, members: false }
      };
    }

    const result = await executor.query<EntitlementRow>(`
      SELECT
        s.plan_key, s.status, s.grace_period_ends_at, s.subscription_updated_at,
        (SELECT COUNT(*) FROM projects WHERE organization_id = $1) AS projects,
        (SELECT COUNT(*) FROM organization_members WHERE organization_id = $1) AS members,
        COALESCE((SELECT quantity FROM organization_usage_monthly
          WHERE organization_id = $1 AND metric = 'events' AND period_start = date_trunc('month', now())::date), 0) AS events,
        COALESCE((SELECT quantity FROM organization_usage_monthly
          WHERE organization_id = $1 AND metric = 'ai_insights' AND period_start = date_trunc('month', now())::date), 0) AS ai_insights
      FROM (SELECT 1) seed
      LEFT JOIN LATERAL (
        SELECT plan_key, status, grace_period_ends_at, updated_at AS subscription_updated_at FROM subscriptions
        WHERE organization_id = $1
        ORDER BY updated_at DESC LIMIT 1
      ) s ON true
    `, [organizationId]);
    const row = result.rows[0];
    const paid = row?.plan_key === 'pro' && this.isPaidStatus(
      row.status,
      row.grace_period_ends_at,
      row.subscription_updated_at
    );
    const planKey: CloudPlanKey = paid ? 'pro' : 'free';
    const plan = CLOUD_PLAN_CATALOG[planKey];
    const overrides = await this.loadOverrides(organizationId, executor);
    const limit = (key: LimitedResource | 'retentionDays', fallback: number) => overrides.get(key) ?? fallback;
    const usage = {
      events: Number(row?.events ?? 0), projects: Number(row?.projects ?? 0),
      members: Number(row?.members ?? 0), aiInsights: Number(row?.ai_insights ?? 0)
    };
    const limits = {
      events: limit('events', plan.limits.eventsPerMonth), projects: limit('projects', plan.limits.projects),
      members: limit('members', plan.limits.members), retentionDays: limit('retentionDays', plan.limits.retentionDays),
      aiInsights: limit('aiInsights', plan.limits.aiInsightsPerMonth)
    };
    return {
      deploymentMode: 'cloud', plan: planKey, subscriptionStatus: row?.status ?? null, limits,
      features: { publicDashboards: true }, usage,
      overLimit: { projects: usage.projects > limits.projects, members: usage.members > limits.members }
    };
  }

  async assertAvailable(organizationId: string, resource: LimitedResource, amount = 1, executor?: QueryExecutor) {
    const snapshot = await this.getSnapshot(organizationId, executor);
    const limit = snapshot.limits[resource];
    if (limit === null) return snapshot;
    const effectiveLimit = resource === 'events'
      ? Math.floor(limit * CLOUD_BILLING_POLICY.eventIngestionStopPercentage / 100)
      : limit;
    if (snapshot.usage[resource] + amount > effectiveLimit) {
      throw new ForbiddenException({
        code: resource === 'events' ? 'MONTHLY_EVENT_LIMIT_REACHED' : 'ENTITLEMENT_REQUIRED',
        resource, plan: snapshot.plan, current: snapshot.usage[resource], limit,
        effectiveLimit, retryable: false, upgradeEligible: snapshot.plan === 'free'
      });
    }
    return snapshot;
  }

  async assertProjectWritable(projectId: string, executor: QueryExecutor = this.database) {
    if (this.config.deploymentMode === 'self_hosted') return;
    const result = await executor.query<{ organization_id: string; position: string }>(`
      SELECT p.organization_id,
        1 + (SELECT COUNT(*) FROM projects older
          WHERE older.organization_id = p.organization_id
            AND (older.created_at, older.id) < (p.created_at, p.id)) AS position
      FROM projects p WHERE p.id = $1
    `, [projectId]);
    const row = result.rows[0];
    if (!row) return;
    const snapshot = await this.getSnapshot(row.organization_id, executor);
    const limit = snapshot.limits.projects;
    if (limit !== null && Number(row.position) > limit) {
      throw new ForbiddenException({
        code: 'RESOURCE_READ_ONLY', resource: 'project', projectId,
        plan: snapshot.plan, position: Number(row.position), limit,
        message: 'This project is read-only until the organization is back within its plan limits.'
      });
    }
  }

  async assertMemberWritable(organizationId: string, userId: string, executor: QueryExecutor = this.database) {
    if (this.config.deploymentMode === 'self_hosted') return;
    const result = await executor.query<{ position: string }>(`
      SELECT 1 + (SELECT COUNT(*) FROM organization_members older
        WHERE older.organization_id = member.organization_id
          AND (older.created_at, older.user_id) < (member.created_at, member.user_id)) AS position
      FROM organization_members member
      WHERE member.organization_id = $1 AND member.user_id = $2
    `, [organizationId, userId]);
    const row = result.rows[0];
    if (!row) return;
    const snapshot = await this.getSnapshot(organizationId, executor);
    const limit = snapshot.limits.members;
    if (limit !== null && Number(row.position) > limit) {
      throw new ForbiddenException({
        code: 'RESOURCE_READ_ONLY', resource: 'member', organizationId,
        plan: snapshot.plan, position: Number(row.position), limit,
        message: 'This membership is read-only until the organization is back within its plan limits.'
      });
    }
  }

  private isPaidStatus(status: string | null, graceEnd: string | null, updatedAt: string | null) {
    if (status === 'active' || status === 'trialing') return true;
    if (status === 'past_due') {
      const fallbackGraceEnd = updatedAt
        ? new Date(updatedAt).getTime() + CLOUD_BILLING_POLICY.failedPaymentGraceDays * 86_400_000
        : 0;
      return (graceEnd ? new Date(graceEnd).getTime() : fallbackGraceEnd) > Date.now();
    }
    return false;
  }

  private async loadOverrides(organizationId: string, executor: QueryExecutor) {
    const result = await executor.query<{ entitlement_key: string; value: unknown }>(`
      SELECT DISTINCT ON (entitlement_key) entitlement_key, value
      FROM entitlement_overrides
      WHERE organization_id = $1 AND (expires_at IS NULL OR expires_at > now())
      ORDER BY entitlement_key, created_at DESC
    `, [organizationId]);
    const overrides = new Map<string, number>();
    for (const row of result.rows) {
      const value = typeof row.value === 'number' ? row.value : Number(row.value);
      if (Number.isFinite(value) && value >= 0) overrides.set(row.entitlement_key, value);
    }
    return overrides;
  }
}
