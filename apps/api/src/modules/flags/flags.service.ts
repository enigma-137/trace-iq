import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';

export type FlagOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'not_contains'
  | 'exists'
  | 'not_exists'
  | 'in';

export const ALLOWED_OPERATORS: readonly FlagOperator[] = [
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'not_contains',
  'exists',
  'not_exists',
  'in'
];

export type FlagEnvironment = 'development' | 'staging' | 'production';
export const ALLOWED_ENVIRONMENTS: readonly FlagEnvironment[] = ['development', 'staging', 'production'];

export type FlagType = 'boolean' | 'remote_config' | 'multivariate';

export interface FlagTarget {
  property: string;
  operator: FlagOperator;
  value: string | number | boolean | Array<string | number>;
}

export interface FlagTargetGroup {
  id?: string;
  name?: string;
  rules: FlagTarget[];
  rolloutPercentage?: number;
}

export interface FlagRow {
  [column: string]: unknown;
  id: string;
  project_id: string;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  rollout_percentage: number;
  environment: string;
  flag_type: string;
  overrides: Record<string, boolean> | null;
  targeting: FlagTarget[] | null;
  targeting_groups: FlagTargetGroup[] | null;
  payload: unknown;
  revision: number;
  archived_at: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateFlagRequest {
  key?: string;
  name?: string;
  description?: string;
  enabled?: boolean;
  rolloutPercentage?: number;
  environment?: string;
  flagType?: string;
  overrides?: unknown;
  targeting?: unknown;
  targetingGroups?: unknown;
  payload?: unknown;
  projectId?: string;
}

export interface UpdateFlagRequest {
  name?: string;
  description?: string;
  enabled?: boolean;
  rolloutPercentage?: number;
  environment?: string;
  flagType?: string;
  overrides?: unknown;
  targeting?: unknown;
  targetingGroups?: unknown;
  payload?: unknown;
  projectId?: string;
}

export interface RuleEvaluationDetail {
  property: string;
  operator: FlagOperator;
  expectedValue: unknown;
  actualValue: unknown;
  passed: boolean;
}

export interface GroupEvaluationDetail {
  groupIndex: number;
  groupName: string;
  passed: boolean;
  rules: RuleEvaluationDetail[];
}

export interface FlagEvaluationResult {
  enabled: boolean;
  reason: string;
  humanReason: string;
  bucket: number;
  requiredRollout: number;
  matchedGroupIndex: number | null;
  groupDetails: GroupEvaluationDetail[];
  payload: unknown;
  revision: number;
  environment: string;
  flagKey: string;
}

const KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MAX_PAYLOAD_BYTES = 25 * 1024;
const MAX_TARGET_GROUPS = 10;
const MAX_TARGETS_PER_GROUP = 20;

@Injectable()
export class FlagsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService
  ) {}

  // -- Dashboard CRUD -----------------------------------------------------

  async list(
    user: DashboardUser,
    projectId?: string,
    filters?: { environment?: string; status?: string; search?: string; includeArchived?: boolean }
  ) {
    const project = await this.projects.resolveActiveProject(user, projectId);
    if (!project) return { project: null, flags: [], metrics: this.emptyMetrics() };

    const env = filters?.environment && ALLOWED_ENVIRONMENTS.includes(filters.environment as FlagEnvironment)
      ? filters.environment
      : undefined;

    const queryParams: unknown[] = [project.id];
    let sql = `
      SELECT f.*,
        (
          SELECT count(*)::int
          FROM feature_flag_exposures e
          WHERE e.flag_id = f.id AND e.occurred_at >= now() - interval '24 hours'
        ) AS recent_exposures_24h,
        (
          SELECT count(*)::int
          FROM feature_flag_exposures e
          WHERE e.flag_id = f.id
        ) AS total_exposures,
        (
          SELECT max(occurred_at)
          FROM feature_flag_exposures e
          WHERE e.flag_id = f.id
        ) AS last_evaluated_at
      FROM feature_flags f
      WHERE f.project_id = $1
    `;

    if (!filters?.includeArchived && filters?.status !== 'archived') {
      sql += ` AND f.archived_at IS NULL`;
    }

    if (env) {
      queryParams.push(env);
      sql += ` AND f.environment = $${queryParams.length}`;
    }

    if (filters?.search && filters.search.trim()) {
      queryParams.push(`%${filters.search.trim().toLowerCase()}%`);
      sql += ` AND (LOWER(f.name) LIKE $${queryParams.length} OR LOWER(f.key) LIKE $${queryParams.length} OR LOWER(COALESCE(f.description, '')) LIKE $${queryParams.length})`;
    }

    sql += ` ORDER BY f.created_at DESC`;

    const result = await this.database.query<
      FlagRow & { recent_exposures_24h: number; total_exposures: number; last_evaluated_at: string | null }
    >(sql, queryParams);

    // Calculate project-level summary metrics
    const metricsResult = await this.database.query<{
      total_count: number;
      active_count: number;
      rolling_out_count: number;
      exposed_count: number;
      disabled_count: number;
    }>(
      `
        SELECT
          count(*)::int AS total_count,
          count(*) FILTER (WHERE enabled = true AND archived_at IS NULL)::int AS active_count,
          count(*) FILTER (WHERE enabled = true AND rollout_percentage > 0 AND rollout_percentage < 100 AND archived_at IS NULL)::int AS rolling_out_count,
          count(*) FILTER (WHERE enabled = false AND archived_at IS NULL)::int AS disabled_count,
          (
            SELECT count(DISTINCT flag_id)::int
            FROM feature_flag_exposures
            WHERE project_id = $1 AND occurred_at >= now() - interval '7 days'
          ) AS exposed_count
        FROM feature_flags
        WHERE project_id = $1 AND archived_at IS NULL
          ${env ? `AND environment = '${env}'` : ''}
      `,
      [project.id]
    );

    const m = metricsResult.rows[0] ?? {
      total_count: 0,
      active_count: 0,
      rolling_out_count: 0,
      exposed_count: 0,
      disabled_count: 0
    };

    const metrics = {
      total: m.total_count,
      active: m.active_count,
      rollingOut: m.rolling_out_count,
      withRecentExposure: m.exposed_count,
      disabled: m.disabled_count
    };

    return {
      project,
      metrics,
      flags: result.rows.map((row) => this.toDto(row))
    };
  }

  async get(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const result = await this.database.query<
      FlagRow & { recent_exposures_24h: number; total_exposures: number; last_evaluated_at: string | null }
    >(
      `
        SELECT f.*,
          (
            SELECT count(*)::int
            FROM feature_flag_exposures e
            WHERE e.flag_id = f.id AND e.occurred_at >= now() - interval '24 hours'
          ) AS recent_exposures_24h,
          (
            SELECT count(*)::int
            FROM feature_flag_exposures e
            WHERE e.flag_id = f.id
          ) AS total_exposures,
          (
            SELECT max(occurred_at)
            FROM feature_flag_exposures e
            WHERE e.flag_id = f.id
          ) AS last_evaluated_at
        FROM feature_flags f
        WHERE (f.id = $1 OR f.key = $1) AND f.project_id = $2
        LIMIT 1
      `,
      [id, project.id]
    );

    const row = result.rows[0];
    if (!row) throw new NotFoundException('Feature flag not found.');

    // Compute audience estimates
    const totalUsersResult = await this.database.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM users WHERE project_id = $1`,
      [project.id]
    );
    const totalKnownUsers = totalUsersResult.rows[0]?.count ?? 0;

    return {
      project,
      flag: this.toDto(row),
      audienceEstimate: {
        totalUsers: totalKnownUsers,
        estimatedReceivingUsers: Math.round((totalKnownUsers * (row.enabled ? row.rollout_percentage : 0)) / 100)
      }
    };
  }

  async create(user: DashboardUser, body: CreateFlagRequest) {
    const project = await this.projects.requireWritableProject(user, body.projectId);

    const key = (typeof body.key === 'string' ? body.key.trim().toLowerCase() : '').replace(/\s+/g, '-');
    if (!KEY_PATTERN.test(key)) {
      throw new BadRequestException(
        'Key must start with a letter/number and contain only lowercase letters, numbers, dashes, or underscores (e.g. new-checkout).'
      );
    }
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : key;
    const environment =
      typeof body.environment === 'string' && ALLOWED_ENVIRONMENTS.includes(body.environment as FlagEnvironment)
        ? body.environment
        : 'production';
    const flagType =
      typeof body.flagType === 'string' && ['boolean', 'remote_config', 'multivariate'].includes(body.flagType)
        ? body.flagType
        : 'boolean';

    const existing = await this.database.query(
      `SELECT 1 FROM feature_flags WHERE project_id = $1 AND key = $2 AND environment = $3 AND archived_at IS NULL`,
      [project.id, key, environment]
    );
    if (existing.rowCount > 0) {
      throw new BadRequestException(`A flag with key "${key}" already exists in ${environment}.`);
    }

    const payload = sanitizePayload(body.payload);
    const targetingGroups = sanitizeTargetingGroups(body.targetingGroups ?? (body.targeting ? [{ rules: body.targeting }] : []));
    const targetingLegacy = targetingGroups.length > 0 ? targetingGroups[0].rules : [];

    const id = `flg_${randomUUID()}`;
    const initialRevision = 1;
    const isEnabled = Boolean(body.enabled);
    const rollout = clampPercent(body.rolloutPercentage);
    const overrides = sanitizeOverrides(body.overrides);

    await this.database.query(
      `
        INSERT INTO feature_flags (
          id, project_id, key, name, description, enabled, rollout_percentage,
          environment, flag_type, overrides, targeting, targeting_groups, payload,
          revision, created_by_user_id, updated_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15, $15)
      `,
      [
        id,
        project.id,
        key,
        name,
        typeof body.description === 'string' ? body.description.trim() : null,
        isEnabled,
        rollout,
        environment,
        flagType,
        JSON.stringify(overrides),
        JSON.stringify(targetingLegacy),
        JSON.stringify(targetingGroups),
        payload == null ? null : JSON.stringify(payload),
        initialRevision,
        user.id
      ]
    );

    // Record creation in activity log
    await this.recordActivity({
      flagId: id,
      projectId: project.id,
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'created',
      revision: initialRevision,
      afterState: { key, name, enabled: isEnabled, rolloutPercentage: rollout, environment, flagType }
    });

    return { id, key, environment };
  }

  async update(user: DashboardUser, id: string, body: UpdateFlagRequest) {
    const project = await this.projects.requireWritableProject(user, body.projectId);
    const current = await this.database.query<FlagRow>(
      `SELECT * FROM feature_flags WHERE id = $1 AND project_id = $2`,
      [id, project.id]
    );
    const flag = current.rows[0];
    if (!flag) throw new NotFoundException('Flag not found.');

    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : flag.name;
    const description =
      body.description === undefined ? flag.description : typeof body.description === 'string' ? body.description.trim() : null;
    const enabled = typeof body.enabled === 'boolean' ? body.enabled : flag.enabled;
    const rollout = body.rolloutPercentage === undefined ? flag.rollout_percentage : clampPercent(body.rolloutPercentage);
    const environment =
      typeof body.environment === 'string' && ALLOWED_ENVIRONMENTS.includes(body.environment as FlagEnvironment)
        ? body.environment
        : flag.environment ?? 'production';
    const flagType =
      typeof body.flagType === 'string' && ['boolean', 'remote_config', 'multivariate'].includes(body.flagType)
        ? body.flagType
        : flag.flag_type ?? 'boolean';
    const overrides = body.overrides === undefined ? flag.overrides ?? {} : sanitizeOverrides(body.overrides);
    const payload = body.payload === undefined ? flag.payload : sanitizePayload(body.payload);
    const payloadJson = payload == null ? null : JSON.stringify(payload);

    let targetingGroups = flag.targeting_groups ?? [];
    if (body.targetingGroups !== undefined) {
      targetingGroups = sanitizeTargetingGroups(body.targetingGroups);
    } else if (body.targeting !== undefined) {
      targetingGroups = sanitizeTargetingGroups([{ rules: body.targeting }]);
    }
    const legacyTargeting = targetingGroups.length > 0 ? targetingGroups[0].rules : [];

    const nextRevision = (flag.revision ?? 1) + 1;

    await this.database.query(
      `
        UPDATE feature_flags
        SET name = $3, description = $4, enabled = $5, rollout_percentage = $6,
            environment = $7, flag_type = $8, overrides = $9::jsonb,
            targeting = $10::jsonb, targeting_groups = $11::jsonb, payload = $12::jsonb,
            revision = $13, updated_by_user_id = $14, updated_at = now()
        WHERE id = $1 AND project_id = $2
      `,
      [
        id,
        project.id,
        name,
        description,
        enabled,
        rollout,
        environment,
        flagType,
        JSON.stringify(overrides),
        JSON.stringify(legacyTargeting),
        JSON.stringify(targetingGroups),
        payloadJson,
        nextRevision,
        user.id
      ]
    );

    // Determine activity action type
    let action = 'updated';
    if (flag.enabled !== enabled) {
      action = enabled ? 'enabled' : 'disabled';
    } else if (flag.rollout_percentage !== rollout) {
      action = 'rollout_updated';
    } else if (JSON.stringify(flag.overrides ?? {}) !== JSON.stringify(overrides ?? {})) {
      action = 'specific_users_updated';
    } else if (JSON.stringify(flag.targeting_groups) !== JSON.stringify(targetingGroups)) {
      action = 'targeting_updated';
    } else if (JSON.stringify(flag.payload) !== JSON.stringify(payload)) {
      action = 'payload_updated';
    }

    await this.recordActivity({
      flagId: id,
      projectId: project.id,
      actorUserId: user.id,
      actorEmail: user.email,
      action,
      revision: nextRevision,
      beforeState: {
        name: flag.name,
        enabled: flag.enabled,
        rolloutPercentage: flag.rollout_percentage,
        overridesCount: Object.keys(flag.overrides ?? {}).length,
        targetingGroups: flag.targeting_groups,
        payload: flag.payload
      },
      afterState: {
        name,
        enabled,
        rolloutPercentage: rollout,
        overridesCount: Object.keys(overrides ?? {}).length,
        targetingGroups,
        payload
      }
    });

    return { id, revision: nextRevision };
  }

  async toggle(user: DashboardUser, id: string, enabled: boolean, projectId?: string) {
    const project = await this.projects.requireWritableProject(user, projectId);
    const current = await this.database.query<FlagRow>(
      `SELECT * FROM feature_flags WHERE id = $1 AND project_id = $2`,
      [id, project.id]
    );
    const flag = current.rows[0];
    if (!flag) throw new NotFoundException('Flag not found.');

    const nextRevision = (flag.revision ?? 1) + 1;
    await this.database.query(
      `
        UPDATE feature_flags
        SET enabled = $3, revision = $4, updated_by_user_id = $5, updated_at = now()
        WHERE id = $1 AND project_id = $2
      `,
      [id, project.id, enabled, nextRevision, user.id]
    );

    await this.recordActivity({
      flagId: id,
      projectId: project.id,
      actorUserId: user.id,
      actorEmail: user.email,
      action: enabled ? 'enabled' : 'disabled',
      revision: nextRevision,
      beforeState: { enabled: flag.enabled },
      afterState: { enabled }
    });

    return { id, enabled, revision: nextRevision };
  }

  async archive(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.projects.requireWritableProject(user, projectId);
    const current = await this.database.query<FlagRow>(
      `SELECT * FROM feature_flags WHERE id = $1 AND project_id = $2`,
      [id, project.id]
    );
    const flag = current.rows[0];
    if (!flag) throw new NotFoundException('Flag not found.');

    const nextRevision = (flag.revision ?? 1) + 1;
    await this.database.query(
      `
        UPDATE feature_flags
        SET archived_at = now(), revision = $3, updated_by_user_id = $4, updated_at = now()
        WHERE id = $1 AND project_id = $2
      `,
      [id, project.id, nextRevision, user.id]
    );

    await this.recordActivity({
      flagId: id,
      projectId: project.id,
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'archived',
      revision: nextRevision,
      beforeState: { archivedAt: null },
      afterState: { archivedAt: new Date().toISOString() }
    });

    return { archived: true, id };
  }

  async restore(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.projects.requireWritableProject(user, projectId);
    const current = await this.database.query<FlagRow>(
      `SELECT * FROM feature_flags WHERE id = $1 AND project_id = $2`,
      [id, project.id]
    );
    const flag = current.rows[0];
    if (!flag) throw new NotFoundException('Flag not found.');

    const nextRevision = (flag.revision ?? 1) + 1;
    await this.database.query(
      `
        UPDATE feature_flags
        SET archived_at = NULL, revision = $3, updated_by_user_id = $4, updated_at = now()
        WHERE id = $1 AND project_id = $2
      `,
      [id, project.id, nextRevision, user.id]
    );

    await this.recordActivity({
      flagId: id,
      projectId: project.id,
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'restored',
      revision: nextRevision,
      beforeState: { archivedAt: flag.archived_at },
      afterState: { archivedAt: null }
    });

    return { restored: true, id };
  }

  async remove(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.projects.requireWritableProject(user, projectId);
    const result = await this.database.query(
      `DELETE FROM feature_flags WHERE id = $1 AND project_id = $2`,
      [id, project.id]
    );
    if (result.rowCount === 0) throw new NotFoundException('Flag not found.');
    return { deleted: true };
  }

  // -- Evaluation Tester & Simulator ---------------------------------------

  async testEvaluation(
    user: DashboardUser,
    id: string,
    params: { distinctId?: string; properties?: Record<string, unknown>; projectId?: string }
  ): Promise<FlagEvaluationResult> {
    const project = await this.projects.requireActiveProject(user, params.projectId);
    const result = await this.database.query<FlagRow>(
      `SELECT * FROM feature_flags WHERE (id = $1 OR key = $1) AND project_id = $2 LIMIT 1`,
      [id, project.id]
    );
    const flag = result.rows[0];
    if (!flag) throw new NotFoundException('Flag not found.');

    const distinctId = params.distinctId?.trim() || 'anonymous_test_user';
    const properties = params.properties ?? {};

    return evaluateFlagDetailed(flag, distinctId, properties);
  }

  // -- Public Evaluation API (Used by SDKs) --------------------------------

  async evaluate(
    writeKey: string | undefined,
    projectId: string | undefined,
    distinctId: string | undefined,
    properties?: Record<string, unknown>,
    environment?: string
  ) {
    const key = requiredString(writeKey, 'writeKey');
    const pid = requiredString(projectId, 'projectId');
    const distinct = requiredString(distinctId, 'distinctId');
    const auth = await this.authenticateWriteKey(key, pid);

    const env = environment && ALLOWED_ENVIRONMENTS.includes(environment as FlagEnvironment)
      ? environment
      : 'production';

    const result = await this.database.query<FlagRow>(
      `
        SELECT * FROM feature_flags
        WHERE project_id = $1 AND environment = $2 AND archived_at IS NULL
      `,
      [auth.project_id, env]
    );

    const flags: Record<string, boolean> = {};
    const payloads: Record<string, unknown> = {};
    const details: Record<string, { enabled: boolean; reason: string; revision: number }> = {};

    for (const flag of result.rows) {
      const evaluation = evaluateFlagDetailed(flag, distinct, properties ?? {});
      flags[flag.key] = evaluation.enabled;
      details[flag.key] = {
        enabled: evaluation.enabled,
        reason: evaluation.reason,
        revision: flag.revision ?? 1
      };
      if (evaluation.enabled && flag.payload != null) {
        payloads[flag.key] = flag.payload;
      }
    }

    return { flags, payloads, details, environment: env };
  }

  // -- Exposure Tracking ---------------------------------------------------

  async trackExposure(
    writeKey: string | undefined,
    projectId: string | undefined,
    exposure: {
      flagKey: string;
      distinctId: string;
      userId?: string;
      anonymousId?: string;
      sessionId?: string;
      enabled: boolean;
      environment?: string;
      revision?: number;
      evaluationReason?: string;
      payloadHash?: string;
      timestamp?: string;
      properties?: Record<string, unknown>;
    }
  ) {
    const key = requiredString(writeKey, 'writeKey');
    const pid = requiredString(projectId, 'projectId');
    const auth = await this.authenticateWriteKey(key, pid);

    const flagKey = requiredString(exposure.flagKey, 'flagKey');
    const distinctId = requiredString(exposure.distinctId, 'distinctId');
    const env = exposure.environment ?? 'production';

    // Find the corresponding flag
    const flagQuery = await this.database.query<FlagRow>(
      `SELECT id, key, name, revision, rollout_percentage FROM feature_flags WHERE project_id = $1 AND key = $2 AND environment = $3 LIMIT 1`,
      [auth.project_id, flagKey, env]
    );
    const flag = flagQuery.rows[0];
    const flagId = flag ? flag.id : `flg_${flagKey}`;
    const flagRevision = exposure.revision ?? flag?.revision ?? 1;

    const exposureId = `exp_${randomUUID()}`;
    const occurredAt = exposure.timestamp ? new Date(exposure.timestamp) : new Date();

    // Insert exposure record
    if (flag) {
      await this.database.query(
        `
          INSERT INTO feature_flag_exposures (
            id, project_id, flag_id, flag_key, environment, revision, distinct_id,
            user_id, anonymous_id, session_id, enabled, evaluation_reason, payload_hash, occurred_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `,
        [
          exposureId,
          auth.project_id,
          flag.id,
          flagKey,
          env,
          flagRevision,
          distinctId,
          exposure.userId ?? null,
          exposure.anonymousId ?? null,
          exposure.sessionId ?? null,
          Boolean(exposure.enabled),
          exposure.evaluationReason ?? null,
          exposure.payloadHash ?? null,
          occurredAt
        ]
      );
    }

    // Also insert as an event into events table so it seamlessly appears in user timeline & funnels!
    const eventId = `evt_${randomUUID()}`;
    await this.database.query(
      `
        INSERT INTO events (
          id, organization_id, project_id, user_id, anonymous_id, session_id,
          event_name, properties, occurred_at, received_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, '$feature_flag_exposure', $7::jsonb, $8, now())
      `,
      [
        eventId,
        auth.organization_id,
        auth.project_id,
        exposure.userId ?? null,
        exposure.anonymousId ?? distinctId,
        exposure.sessionId ?? null,
        JSON.stringify({
          flagKey,
          flagId,
          flagName: flag?.name ?? flagKey,
          environment: env,
          revision: flagRevision,
          enabled: exposure.enabled,
          rolloutPercentage: flag?.rollout_percentage ?? 0,
          evaluationReason: exposure.evaluationReason ?? 'sdk_evaluated',
          distinctId,
          ...(exposure.properties ?? {})
        }),
        occurredAt
      ]
    );

    return { accepted: true, exposureId, eventId };
  }

  // -- Impact & Analytics --------------------------------------------------

  async getAnalytics(
    user: DashboardUser,
    id: string,
    params?: { days?: string; conversionEvent?: string; projectId?: string }
  ) {
    const project = await this.projects.requireActiveProject(user, params?.projectId);
    const flagResult = await this.database.query<FlagRow>(
      `SELECT * FROM feature_flags WHERE (id = $1 OR key = $1) AND project_id = $2 LIMIT 1`,
      [id, project.id]
    );
    const flag = flagResult.rows[0];
    if (!flag) throw new NotFoundException('Flag not found.');

    const days = Math.min(Math.max(parseInt(params?.days || '14', 10) || 14, 1), 90);
    const conversionEvent = params?.conversionEvent?.trim() || undefined;

    // 1. Exposure counts: Exposed vs Control
    const exposureCounts = await this.database.query<{
      exposed_users: number;
      total_exposures: number;
      control_users: number;
    }>(
      `
        WITH exposed AS (
          SELECT DISTINCT distinct_id
          FROM feature_flag_exposures
          WHERE flag_id = $1 AND occurred_at >= now() - make_interval(days => $2::int) AND enabled = true
        ),
        total_active_users AS (
          SELECT DISTINCT COALESCE(user_id::text, anonymous_id) AS uid
          FROM events
          WHERE project_id = $3 AND occurred_at >= now() - make_interval(days => $2::int)
        )
        SELECT
          (SELECT count(*)::int FROM exposed) AS exposed_users,
          (
            SELECT count(*)::int
            FROM feature_flag_exposures
            WHERE flag_id = $1 AND occurred_at >= now() - make_interval(days => $2::int)
          ) AS total_exposures,
          (
            SELECT count(*)::int
            FROM total_active_users
            WHERE uid NOT IN (SELECT distinct_id FROM exposed)
          ) AS control_users
      `,
      [flag.id, days, project.id]
    );

    const counts = exposureCounts.rows[0] ?? { exposed_users: 0, total_exposures: 0, control_users: 0 };

    // 2. Exposure trend by day
    const trendResult = await this.database.query<{ day: string; count: number; enabled_count: number }>(
      `
        SELECT
          to_char(date_trunc('day', occurred_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
          count(*)::int AS count,
          count(*) FILTER (WHERE enabled = true)::int AS enabled_count
        FROM feature_flag_exposures
        WHERE flag_id = $1 AND occurred_at >= now() - make_interval(days => $2::int)
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      [flag.id, days]
    );

    // 3. Error Rate comparison (users with $exception events after exposure vs control users)
    const errorComparison = await this.database.query<{
      exposed_error_users: number;
      control_error_users: number;
    }>(
      `
        WITH exposed_uids AS (
          SELECT DISTINCT distinct_id FROM feature_flag_exposures WHERE flag_id = $1 AND enabled = true
        ),
        error_uids AS (
          SELECT DISTINCT COALESCE(user_id::text, anonymous_id) AS uid
          FROM events
          WHERE project_id = $2 AND event_name = '$exception' AND occurred_at >= now() - make_interval(days => $3::int)
        )
        SELECT
          (SELECT count(*)::int FROM error_uids WHERE uid IN (SELECT distinct_id FROM exposed_uids)) AS exposed_error_users,
          (SELECT count(*)::int FROM error_uids WHERE uid NOT IN (SELECT distinct_id FROM exposed_uids)) AS control_error_users
      `,
      [flag.id, project.id, days]
    );

    const errorRow = errorComparison.rows[0] ?? { exposed_error_users: 0, control_error_users: 0 };
    const exposedUsers = Math.max(counts.exposed_users, 1);
    const controlUsers = Math.max(counts.control_users, 1);

    const exposedErrorRate = Number(((errorRow.exposed_error_users / exposedUsers) * 100).toFixed(1));
    const controlErrorRate = Number(((errorRow.control_error_users / controlUsers) * 100).toFixed(1));

    // 4. Conversion Event Rate (if event given, or top downstream event)
    let targetEvent = conversionEvent;
    if (!targetEvent) {
      // Find top custom event in project (ignoring internal $ events)
      const topEventQuery = await this.database.query<{ event_name: string }>(
        `
          SELECT event_name
          FROM events
          WHERE project_id = $1 AND event_name NOT LIKE '$%'
          GROUP BY event_name
          ORDER BY count(*) DESC
          LIMIT 1
        `,
        [project.id]
      );
      targetEvent = topEventQuery.rows[0]?.event_name ?? 'conversion';
    }

    const conversionComparison = await this.database.query<{
      exposed_converted_users: number;
      control_converted_users: number;
    }>(
      `
        WITH exposed_uids AS (
          SELECT DISTINCT distinct_id FROM feature_flag_exposures WHERE flag_id = $1 AND enabled = true
        ),
        converted_uids AS (
          SELECT DISTINCT COALESCE(user_id::text, anonymous_id) AS uid
          FROM events
          WHERE project_id = $2 AND event_name = $4 AND occurred_at >= now() - make_interval(days => $3::int)
        )
        SELECT
          (SELECT count(*)::int FROM converted_uids WHERE uid IN (SELECT distinct_id FROM exposed_uids)) AS exposed_converted_users,
          (SELECT count(*)::int FROM converted_uids WHERE uid NOT IN (SELECT distinct_id FROM exposed_uids)) AS control_converted_users
      `,
      [flag.id, project.id, days, targetEvent]
    );

    const convRow = conversionComparison.rows[0] ?? { exposed_converted_users: 0, control_converted_users: 0 };
    const exposedConvRate = Number(((convRow.exposed_converted_users / exposedUsers) * 100).toFixed(1));
    const controlConvRate = Number(((convRow.control_converted_users / controlUsers) * 100).toFixed(1));

    return {
      flagKey: flag.key,
      days,
      targetEvent,
      exposedUsers: counts.exposed_users,
      controlUsers: counts.control_users,
      totalExposures: counts.total_exposures,
      trend: trendResult.rows,
      conversion: {
        eventName: targetEvent,
        exposedRate: exposedConvRate,
        exposedCount: convRow.exposed_converted_users,
        controlRate: controlConvRate,
        controlCount: convRow.control_converted_users
      },
      errors: {
        exposedRate: exposedErrorRate,
        exposedCount: errorRow.exposed_error_users,
        controlRate: controlErrorRate,
        controlCount: errorRow.control_error_users
      }
    };
  }

  // -- Activity History ----------------------------------------------------

  async getActivity(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const result = await this.database.query<{
      id: string;
      flag_id: string;
      actor_user_id: string | null;
      actor_email: string | null;
      action: string;
      revision: number;
      before_state: unknown;
      after_state: unknown;
      created_at: string;
    }>(
      `
        SELECT * FROM feature_flag_activities
        WHERE flag_id = $1 AND project_id = $2
        ORDER BY created_at DESC
        LIMIT 50
      `,
      [id, project.id]
    );

    return {
      activities: result.rows.map((row) => ({
        id: row.id,
        flagId: row.flag_id,
        actorUserId: row.actor_user_id,
        actorEmail: row.actor_email ?? 'Unknown user',
        action: row.action,
        revision: row.revision,
        beforeState: row.before_state,
        afterState: row.after_state,
        createdAt: row.created_at
      }))
    };
  }

  // -- Helpers -------------------------------------------------------------

  private async recordActivity(params: {
    flagId: string;
    projectId: string;
    actorUserId?: string;
    actorEmail?: string;
    action: string;
    revision: number;
    beforeState?: unknown;
    afterState?: unknown;
  }) {
    const id = `act_${randomUUID()}`;
    await this.database.query(
      `
        INSERT INTO feature_flag_activities (
          id, flag_id, project_id, actor_user_id, actor_email, action, revision, before_state, after_state
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
      `,
      [
        id,
        params.flagId,
        params.projectId,
        params.actorUserId ?? null,
        params.actorEmail ?? null,
        params.action,
        params.revision,
        params.beforeState ? JSON.stringify(params.beforeState) : null,
        params.afterState ? JSON.stringify(params.afterState) : null
      ]
    );
  }

  private async authenticateWriteKey(
    writeKey: string,
    projectId: string
  ): Promise<{ project_id: string; organization_id: string }> {
    const keyHash = createHash('sha256').update(writeKey).digest('hex');
    const result = await this.database.query<{ project_id: string; organization_id: string }>(
      `
        SELECT pwk.project_id, p.organization_id
        FROM project_write_keys pwk
        JOIN projects p ON p.id = pwk.project_id
        WHERE pwk.key_hash = $1 AND pwk.project_id = $2 AND pwk.revoked_at IS NULL
        LIMIT 1
      `,
      [keyHash, projectId]
    );
    const record = result.rows[0];
    if (!record) {
      throw new UnauthorizedException('Invalid projectId or write key.');
    }
    return record;
  }

  private toDto(
    row: FlagRow & { recent_exposures_24h?: number; total_exposures?: number; last_evaluated_at?: string | null }
  ) {
    const targetingGroups = row.targeting_groups && row.targeting_groups.length > 0
      ? row.targeting_groups
      : row.targeting && row.targeting.length > 0
        ? [{ id: 'grp_default', name: 'Default group', rules: row.targeting }]
        : [];

    return {
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      enabled: row.enabled,
      rolloutPercentage: row.rollout_percentage,
      environment: (row.environment as FlagEnvironment) ?? 'production',
      flagType: (row.flag_type as FlagType) ?? 'boolean',
      overrides: row.overrides ?? {},
      targeting: row.targeting ?? [],
      targetingGroups,
      payload: row.payload ?? null,
      revision: row.revision ?? 1,
      archivedAt: row.archived_at ?? null,
      recentExposures24h: row.recent_exposures_24h ?? 0,
      totalExposures: row.total_exposures ?? 0,
      lastEvaluatedAt: row.last_evaluated_at ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private emptyMetrics() {
    return { total: 0, active: 0, rollingOut: 0, withRecentExposure: 0, disabled: 0 };
  }
}

// -- Deterministic Evaluation Engine --------------------------------------

export function evaluateFlagDetailed(
  flag: Pick<
    FlagRow,
    'key' | 'enabled' | 'rollout_percentage' | 'overrides' | 'targeting' | 'targeting_groups' | 'payload' | 'revision' | 'environment'
  > & { project_id?: string },
  distinctId: string,
  properties: Record<string, unknown> = {}
): FlagEvaluationResult {
  const projectId = flag.project_id || 'default';
  const environment = flag.environment || 'production';
  const bucket = bucketOf(flag.key, distinctId, projectId, environment);
  const requiredRollout = flag.rollout_percentage ?? 0;
  const revision = flag.revision ?? 1;

  // 1. Master kill switch check
  if (!flag.enabled) {
    return {
      enabled: false,
      reason: 'disabled_by_master_switch',
      humanReason: 'Flag is disabled globally (kill switch is off).',
      bucket,
      requiredRollout,
      matchedGroupIndex: null,
      groupDetails: [],
      payload: null,
      revision,
      environment,
      flagKey: flag.key
    };
  }

  // 2. Specific individual override check
  const override = flag.overrides?.[distinctId];
  if (typeof override === 'boolean') {
    return {
      enabled: override,
      reason: override ? 'matched_override_enabled' : 'matched_override_disabled',
      humanReason: override
        ? `User ID "${distinctId}" matched an explicit override rule (Forced ON).`
        : `User ID "${distinctId}" matched an explicit override rule (Forced OFF).`,
      bucket,
      requiredRollout,
      matchedGroupIndex: null,
      groupDetails: [],
      payload: override ? flag.payload : null,
      revision,
      environment,
      flagKey: flag.key
    };
  }

  // Normalize targeting groups
  const groups: FlagTargetGroup[] =
    flag.targeting_groups && flag.targeting_groups.length > 0
      ? flag.targeting_groups
      : flag.targeting && flag.targeting.length > 0
        ? [{ name: 'Targeting rules', rules: flag.targeting }]
        : [];

  const groupDetails: GroupEvaluationDetail[] = [];
  let matchedGroupIndex: number | null = null;

  if (groups.length > 0) {
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const { passed, ruleDetails } = evaluateTargetGroup(group, properties);
      groupDetails.push({
        groupIndex: i,
        groupName: group.name || `Targeting Group ${i + 1}`,
        passed,
        rules: ruleDetails
      });

      if (passed && matchedGroupIndex === null) {
        matchedGroupIndex = i;
      }
    }

    if (matchedGroupIndex === null) {
      return {
        enabled: false,
        reason: 'disqualified_by_targeting',
        humanReason: 'User traits did not match any eligible targeting groups.',
        bucket,
        requiredRollout,
        matchedGroupIndex: null,
        groupDetails,
        payload: null,
        revision,
        environment,
        flagKey: flag.key
      };
    }
  }

  // 3. Rollout percentage check within eligible target audience
  if (requiredRollout <= 0) {
    return {
      enabled: false,
      reason: 'zero_percent_rollout',
      humanReason: 'Flag is enabled but rollout percentage is currently set to 0%.',
      bucket,
      requiredRollout,
      matchedGroupIndex,
      groupDetails,
      payload: null,
      revision,
      environment,
      flagKey: flag.key
    };
  }

  if (requiredRollout >= 100) {
    return {
      enabled: true,
      reason: groups.length > 0 ? `matched_targeting_group_${matchedGroupIndex! + 1}` : 'rolled_out_to_all',
      humanReason:
        groups.length > 0
          ? `Matched targeting group ${matchedGroupIndex! + 1} and flag is at 100% rollout.`
          : 'Flag is enabled for 100% of users.',
      bucket,
      requiredRollout,
      matchedGroupIndex,
      groupDetails,
      payload: flag.payload,
      revision,
      environment,
      flagKey: flag.key
    };
  }

  // Deterministic bucketing
  const isIncludedInRollout = bucket < requiredRollout;
  return {
    enabled: isIncludedInRollout,
    reason: isIncludedInRollout ? 'rollout_bucket_included' : 'rollout_bucket_excluded',
    humanReason: isIncludedInRollout
      ? `User landed in bucket ${bucket} (below required threshold of ${requiredRollout}%). Feature enabled.`
      : `User landed in bucket ${bucket} (above current rollout of ${requiredRollout}%). Feature disabled.`,
    bucket,
    requiredRollout,
    matchedGroupIndex,
    groupDetails,
    payload: isIncludedInRollout ? flag.payload : null,
    revision,
    environment,
    flagKey: flag.key
  };
}

export function evaluateFlag(
  flag: Pick<
    FlagRow,
    'key' | 'enabled' | 'rollout_percentage' | 'overrides' | 'targeting' | 'targeting_groups' | 'payload' | 'revision' | 'environment'
  >,
  distinctId: string,
  properties: Record<string, unknown> = {}
): boolean {
  return evaluateFlagDetailed(flag, distinctId, properties).enabled;
}

function evaluateTargetGroup(
  group: FlagTargetGroup,
  properties: Record<string, unknown>
): { passed: boolean; ruleDetails: RuleEvaluationDetail[] } {
  const ruleDetails: RuleEvaluationDetail[] = [];
  let allPassed = true;

  for (const rule of group.rules) {
    const actual = properties[rule.property];
    const rulePassed = evaluateRule(actual, rule.operator, rule.value, rule.property in properties);
    ruleDetails.push({
      property: rule.property,
      operator: rule.operator,
      expectedValue: rule.value,
      actualValue: actual !== undefined ? actual : '(not provided)',
      passed: rulePassed
    });

    if (!rulePassed) {
      allPassed = false;
    }
  }

  return { passed: allPassed, ruleDetails };
}

export function evaluateRule(
  actual: unknown,
  operator: FlagOperator,
  expected: FlagTarget['value'],
  propertyExists: boolean
): boolean {
  switch (operator) {
    case 'exists':
      return propertyExists && actual !== undefined && actual !== null && actual !== '';
    case 'not_exists':
      return !propertyExists || actual === undefined || actual === null || actual === '';
    case 'eq':
      if (!propertyExists) return false;
      return valuesEqual(actual, expected);
    case 'ne':
      if (!propertyExists) return false;
      return !valuesEqual(actual, expected);
    case 'contains':
      if (!propertyExists || actual == null) return false;
      return String(actual).toLowerCase().includes(String(expected).toLowerCase());
    case 'not_contains':
      if (!propertyExists || actual == null) return false;
      return !String(actual).toLowerCase().includes(String(expected).toLowerCase());
    case 'gt':
      if (!propertyExists) return false;
      return numericCmp(actual, expected) > 0;
    case 'gte':
      if (!propertyExists) return false;
      return numericCmp(actual, expected) >= 0;
    case 'lt':
      if (!propertyExists) return false;
      return numericCmp(actual, expected) < 0;
    case 'lte':
      if (!propertyExists) return false;
      return numericCmp(actual, expected) <= 0;
    case 'in':
      if (!propertyExists || actual == null) return false;
      if (Array.isArray(expected)) {
        return expected.some((v) => valuesEqual(actual, v));
      }
      if (typeof expected === 'string') {
        const parts = expected.split(',').map((s) => s.trim());
        return parts.some((v) => valuesEqual(actual, v));
      }
      return valuesEqual(actual, expected);
    default:
      return false;
  }
}

export function matchesTargeting(targeting: FlagTarget[], properties: Record<string, unknown>): boolean {
  for (const rule of targeting) {
    if (!evaluateRule(properties[rule.property], rule.operator, rule.value, rule.property in properties)) {
      return false;
    }
  }
  return true;
}

function valuesEqual(actual: unknown, expected: unknown): boolean {
  if (typeof actual === 'boolean' || typeof expected === 'boolean') {
    return Boolean(actual) === (expected === true || expected === 'true');
  }
  const left = typeof actual === 'number' || typeof expected === 'number' ? normalizeNumber(actual) : String(actual);
  const right = typeof actual === 'number' || typeof expected === 'number' ? normalizeNumber(expected) : String(expected);
  if (typeof left === 'number' && typeof right === 'number' && Number.isFinite(left) && Number.isFinite(right)) {
    return left === right;
  }
  return String(actual).trim().toLowerCase() === String(expected).trim().toLowerCase();
}

function numericCmp(actual: unknown, expected: unknown): number {
  const left = Number(actual);
  const right = Number(expected);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return NaN;
  return left - right;
}

function normalizeNumber(value: unknown): number | string {
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? asNumber : String(value);
}

// Canonical deterministic bucketing: SHA-256 of project_id:environment:key:distinctId converted to 0..99
export function bucketOf(
  key: string,
  distinctId: string,
  projectId: string = 'default',
  environment: string = 'production'
): number {
  const seed = `${projectId}:${environment}:${key}:${distinctId}`;
  const hash = createHash('sha256').update(seed).digest('hex');
  return parseInt(hash.slice(0, 8), 16) % 100;
}

function clampPercent(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(Math.round(parsed), 0), 100);
}

function sanitizeOverrides(input: unknown): Record<string, boolean> {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, boolean> = {};
  let count = 0;
  for (const [distinctId, value] of Object.entries(input as Record<string, unknown>)) {
    if (count >= 500) break;
    const id = distinctId.trim();
    if (id && typeof value === 'boolean') {
      out[id] = value;
      count += 1;
    }
  }
  return out;
}

function sanitizeTargetingGroups(input: unknown): FlagTargetGroup[] {
  if (!input) return [];
  if (!Array.isArray(input)) {
    throw new BadRequestException('targetingGroups must be an array of rule groups.');
  }

  const out: FlagTargetGroup[] = [];
  for (const item of input) {
    if (out.length >= MAX_TARGET_GROUPS) break;
    const group = (item ?? {}) as Record<string, unknown>;
    const name = typeof group.name === 'string' ? group.name.trim() : undefined;
    const rulesInput = Array.isArray(group.rules) ? group.rules : [];
    const rules: FlagTarget[] = [];

    for (const ruleItem of rulesInput) {
      if (rules.length >= MAX_TARGETS_PER_GROUP) break;
      const rule = (ruleItem ?? {}) as Record<string, unknown>;
      const property = typeof rule.property === 'string' ? rule.property.trim() : '';
      const operator = typeof rule.operator === 'string' ? rule.operator : '';
      if (!property) throw new BadRequestException('Each targeting rule must specify a property name.');
      if (!ALLOWED_OPERATORS.includes(operator as FlagOperator)) {
        throw new BadRequestException(`Unsupported targeting operator: "${operator}".`);
      }

      let value = rule.value;
      if (operator === 'exists' || operator === 'not_exists') {
        value = true;
      } else if (value === undefined || value === null) {
        throw new BadRequestException(`Targeting rule for "${property}" requires a value.`);
      }

      rules.push({
        property,
        operator: operator as FlagOperator,
        value: value as string | number | boolean | Array<string | number>
      });
    }

    if (rules.length > 0 || name) {
      out.push({
        id: typeof group.id === 'string' ? group.id : `grp_${randomUUID()}`,
        name: name || `Target group ${out.length + 1}`,
        rules
      });
    }
  }
  return out;
}

function sanitizePayload(input: unknown): unknown {
  if (input === undefined) return undefined;
  if (input === null) return null;
  let serialized: string;
  try {
    serialized = JSON.stringify(input);
  } catch {
    throw new BadRequestException('Payload must be valid JSON.');
  }
  if (serialized === undefined) {
    throw new BadRequestException('Payload must be valid JSON.');
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_PAYLOAD_BYTES) {
    throw new BadRequestException(`Payload is too large (max ${MAX_PAYLOAD_BYTES / 1024}KB).`);
  }
  return JSON.parse(serialized);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(`${field} is required.`);
  }
  return value.trim();
}
