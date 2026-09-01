import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { QueryResultRow } from 'pg';
import { appConfig } from '../../config/app.config';
import { DatabaseService, QueryExecutor } from '../../database/database.service';
import { CLOUD_BILLING_POLICY, CLOUD_PLAN_CATALOG, CloudPlanKey } from './plan-catalog';

export type LimitedResource = 'events' | 'projects' | 'members' | 'aiInsights';
export type ReplayLimit =
  | 'replaySessions'
  | 'replayStorageBytes'
  | 'replayMaxSampleRatePercent'
  | 'replayMaxRetentionDays'
  | 'replayMaxDurationSeconds';

export interface EntitlementSnapshot {
  deploymentMode: 'self_hosted' | 'cloud';
  plan: CloudPlanKey | 'self_hosted';
  subscriptionStatus: string | null;
  limits: Record<LimitedResource | ReplayLimit | 'retentionDays', number | null>;
  features: { publicDashboards: boolean; sessionReplay: boolean };
  usage: Record<LimitedResource | 'replaySessions' | 'replayStorageBytes', number>;
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
  replay_sessions: string;
  replay_storage_bytes: string;
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
        limits: {
          events: null, projects: null, members: null, retentionDays: null, aiInsights: null,
          replaySessions: null, replayStorageBytes: null, replayMaxSampleRatePercent: null,
          replayMaxRetentionDays: null, replayMaxDurationSeconds: null
        },
        features: { publicDashboards: true, sessionReplay: true },
        usage: { events: 0, projects: 0, members: 0, aiInsights: 0, replaySessions: 0, replayStorageBytes: 0 },
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
        ,COALESCE((SELECT quantity FROM organization_usage_monthly
          WHERE organization_id = $1 AND metric = 'replay_sessions' AND period_start = date_trunc('month', now())::date), 0) AS replay_sessions
        ,COALESCE((SELECT quantity FROM organization_usage_monthly
          WHERE organization_id = $1 AND metric = 'replay_storage_bytes' AND period_start = date_trunc('month', now())::date), 0) AS replay_storage_bytes
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
    const limit = (key: LimitedResource | ReplayLimit | 'retentionDays', fallback: number | null) => overrides.get(key) ?? fallback;
    const usage = {
      events: Number(row?.events ?? 0), projects: Number(row?.projects ?? 0),
      members: Number(row?.members ?? 0), aiInsights: Number(row?.ai_insights ?? 0),
      replaySessions: Number(row?.replay_sessions ?? 0), replayStorageBytes: Number(row?.replay_storage_bytes ?? 0)
    };
    const limits = {
      events: limit('events', plan.limits.eventsPerMonth), projects: limit('projects', plan.limits.projects),
      members: limit('members', plan.limits.members), retentionDays: limit('retentionDays', plan.limits.retentionDays),
      aiInsights: limit('aiInsights', plan.limits.aiInsightsPerMonth),
      // Product allowances are intentionally unset. TraceIQ Cloud operators can
      // enable/cap replay through entitlement_overrides once pricing is decided.
      replaySessions: limit('replaySessions', null), replayStorageBytes: limit('replayStorageBytes', null),
      replayMaxSampleRatePercent: limit('replayMaxSampleRatePercent', null),
      replayMaxRetentionDays: limit('replayMaxRetentionDays', null),
      replayMaxDurationSeconds: limit('replayMaxDurationSeconds', null)
    };
    return {
      deploymentMode: 'cloud', plan: planKey, subscriptionStatus: row?.status ?? null, limits,
      features: { publicDashboards: true, sessionReplay: overrides.get('sessionReplay') === 1 }, usage,
      overLimit: {
        projects: limits.projects !== null && usage.projects > limits.projects,
        members: limits.members !== null && usage.members > limits.members
      }
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

  /**
   * Serializes count-based capacity checks with the write that follows in the
   * caller's transaction. This prevents concurrent project/member requests
   * from both observing the same final available slot.
   */
  async lockAndAssertAvailable(
    executor: QueryExecutor,
    organizationId: string,
    resource: Extract<LimitedResource, 'projects' | 'members'>,
    amount = 1
  ) {
    if (this.config.deploymentMode === 'self_hosted') return this.getSnapshot(organizationId, executor);
    await executor.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${organizationId}:${resource}`]);
    return this.assertAvailable(organizationId, resource, amount, executor);
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

  async assertReplayAvailable(organizationId: string, executor: QueryExecutor = this.database) {
    const snapshot = await this.getSnapshot(organizationId, executor);
    if (snapshot.deploymentMode === 'cloud' && !snapshot.features.sessionReplay) {
      throw new ForbiddenException({
        code: 'ENTITLEMENT_REQUIRED', resource: 'sessionReplay', plan: snapshot.plan,
        message: 'Session Replay is not enabled for this Cloud organization.'
      });
    }
    return snapshot;
  }

  async assertReplayCapacity(organizationId: string, bytes: number, newSession: boolean, executor: QueryExecutor = this.database) {
    const snapshot = await this.assertReplayAvailable(organizationId, executor);
    if (snapshot.deploymentMode === 'self_hosted') return snapshot;
    await executor.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${organizationId}:replayUsage`]);
    const fresh = await this.assertReplayAvailable(organizationId, executor);
    if (newSession && fresh.limits.replaySessions !== null && fresh.usage.replaySessions + 1 > fresh.limits.replaySessions) {
      throw new ForbiddenException({ code: 'REPLAY_SESSION_LIMIT_REACHED', resource: 'replaySessions' });
    }
    if (fresh.limits.replayStorageBytes !== null && fresh.usage.replayStorageBytes + bytes > fresh.limits.replayStorageBytes) {
      throw new ForbiddenException({ code: 'REPLAY_STORAGE_LIMIT_REACHED', resource: 'replayStorageBytes' });
    }
    return fresh;
  }

  async recordReplayUsage(organizationId: string, bytes: number, newSession: boolean, executor: QueryExecutor = this.database) {
    const snapshot = await this.getSnapshot(organizationId, executor);
    if (snapshot.deploymentMode === 'self_hosted') return;
    const metrics: Array<[string, number]> = [['replay_storage_bytes', bytes]];
    if (newSession) metrics.push(['replay_sessions', 1]);
    for (const [metric, amount] of metrics) {
      await executor.query(`
        INSERT INTO organization_usage_monthly(organization_id,metric,period_start,quantity)
        VALUES($1,$2,date_trunc('month',now())::date,$3)
        ON CONFLICT(organization_id,metric,period_start)
        DO UPDATE SET quantity=organization_usage_monthly.quantity+EXCLUDED.quantity,updated_at=now()
      `, [organizationId, metric, amount]);
    }
  }

  async assertReplaySettings(organizationId: string, settings: {
    enabled: boolean; sampleRate: number; retentionDays: number; maxDurationSeconds: number;
  }) {
    const snapshot = await this.getSnapshot(organizationId);
    if (settings.enabled) await this.assertReplayAvailable(organizationId);
    const checks: Array<[number | null, number, string]> = [
      [snapshot.limits.replayMaxSampleRatePercent, settings.sampleRate * 100, 'sampleRate'],
      [snapshot.limits.replayMaxRetentionDays, settings.retentionDays, 'retentionDays'],
      [snapshot.limits.replayMaxDurationSeconds, settings.maxDurationSeconds, 'maxDurationSeconds']
    ];
    for (const [limit, value, field] of checks) {
      if (limit !== null && value > limit) {
        throw new ForbiddenException({ code: 'REPLAY_SETTING_LIMIT_EXCEEDED', field, value, limit });
      }
    }
    return snapshot;
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
