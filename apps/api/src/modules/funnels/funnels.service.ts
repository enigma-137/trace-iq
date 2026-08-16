import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';

const DAY_MS = 24 * 60 * 60 * 1000;

interface StepInput {
  eventName: string;
  label?: string;
}

export interface CreateFunnelRequest {
  name?: string;
  steps?: Array<string | StepInput>;
  projectId?: string;
}

export type FunnelStep = {
  order: number;
  eventName: string;
  label: string | null;
};

export type FunnelSummary = {
  id: string;
  name: string;
  stepCount: number;
  createdAt: string;
};

export interface FunnelDetail extends FunnelSummary {
  steps: FunnelStep[];
}

export interface FunnelResultStep extends FunnelStep {
  count: number;
  conversionFromStart: number;
  conversionFromPrevious: number;
  droppedFromPrevious: number;
}

export interface FunnelResults {
  funnel: { id: string; name: string };
  from: string;
  to: string;
  days: number;
  steps: FunnelResultStep[];
}

export type FunnelActor = {
  actor: string;
  userId: string | null;
  externalId: string | null;
  anonymousId: string | null;
  identified: boolean;
  lastSeenAt: string | null;
  os: string | null;
  country: string | null;
};

export interface FunnelStepUsers {
  funnel: { id: string; name: string };
  step: { index: number; eventName: string; label: string | null };
  status: 'reached' | 'dropped';
  total: number;
  users: FunnelActor[];
  limit: number;
  offset: number;
}

export type FunnelDebugSample = {
  actor: string;
  userId: string | null;
  anonymousId: string | null;
  occurredAt: string;
  receivedAt: string;
};

export type FunnelDebugStep = {
  index: number;
  eventName: string;
  label: string | null;
  eventCount: number;
  actorCount: number;
  identifiedEventCount: number;
  anonymousEventCount: number;
  qualifiedCount: number;
  samples: FunnelDebugSample[];
};

export type FunnelEventNameCount = {
  eventName: string;
  eventCount: number;
};

export type FunnelDebug = {
  funnel: { id: string; name: string };
  projectId: string;
  from: string;
  to: string;
  days: number;
  steps: FunnelDebugStep[];
  eventNames: FunnelEventNameCount[];
}

@Injectable()
export class FunnelsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService
  ) {}

  async create(user: DashboardUser, body: CreateFunnelRequest): Promise<FunnelDetail> {
    const project = await this.projects.requireActiveProject(user, body.projectId);
    const name = this.requiredString(body.name, 'name');
    const steps = this.normalizeSteps(body.steps);

    const funnelId = `fnl_${randomUUID()}`;

    await this.database.transaction(async (client) => {
      await client.query(
        `INSERT INTO funnels (id, project_id, name, created_by_user_id) VALUES ($1, $2, $3, $4)`,
        [funnelId, project.id, name, user.id]
      );

      for (let index = 0; index < steps.length; index += 1) {
        const step = steps[index];
        await client.query(
          `INSERT INTO funnel_steps (id, funnel_id, step_order, event_name, label) VALUES ($1, $2, $3, $4, $5)`,
          [`fst_${randomUUID()}`, funnelId, index, step.eventName, step.label ?? null]
        );
      }
    });

    return this.getFunnel(user, funnelId, body.projectId);
  }

  async update(user: DashboardUser, funnelId: string, body: CreateFunnelRequest): Promise<FunnelDetail> {
    const project = await this.projects.requireActiveProject(user, body.projectId);
    await this.loadFunnel(project.id, funnelId);
    const name = this.requiredString(body.name, 'name');
    const steps = this.normalizeSteps(body.steps);

    await this.database.transaction(async (client) => {
      await client.query(`UPDATE funnels SET name = $1, updated_at = now() WHERE id = $2 AND project_id = $3`, [
        name,
        funnelId,
        project.id
      ]);
      await client.query(`DELETE FROM funnel_steps WHERE funnel_id = $1`, [funnelId]);
      for (let index = 0; index < steps.length; index += 1) {
        const step = steps[index];
        await client.query(
          `INSERT INTO funnel_steps (id, funnel_id, step_order, event_name, label) VALUES ($1, $2, $3, $4, $5)`,
          [`fst_${randomUUID()}`, funnelId, index, step.eventName, step.label ?? null]
        );
      }
    });

    return this.getFunnel(user, funnelId, body.projectId);
  }

  async remove(user: DashboardUser, funnelId: string, projectId?: string): Promise<{ deleted: boolean }> {
    const project = await this.projects.requireActiveProject(user, projectId);
    await this.loadFunnel(project.id, funnelId);
    // funnel_steps cascade-delete via FK.
    await this.database.query(`DELETE FROM funnels WHERE id = $1 AND project_id = $2`, [funnelId, project.id]);
    return { deleted: true };
  }

  async list(user: DashboardUser, projectId?: string): Promise<{ funnels: FunnelSummary[] }> {
    const project = await this.projects.resolveActiveProject(user, projectId);

    if (!project) {
      return { funnels: [] };
    }

    const result = await this.database.query<FunnelSummary>(
      `
        SELECT
          f.id,
          f.name,
          count(fs.id)::int AS "stepCount",
          f.created_at AS "createdAt"
        FROM funnels f
        LEFT JOIN funnel_steps fs ON fs.funnel_id = f.id
        WHERE f.project_id = $1
        GROUP BY f.id
        ORDER BY f.created_at DESC
      `,
      [project.id]
    );

    return { funnels: result.rows };
  }

  async getFunnel(user: DashboardUser, funnelId: string, projectId?: string): Promise<FunnelDetail> {
    const project = await this.projects.requireActiveProject(user, projectId);
    const funnel = await this.loadFunnel(project.id, funnelId);
    const steps = await this.loadSteps(funnelId);

    return {
      id: funnel.id,
      name: funnel.name,
      createdAt: funnel.created_at,
      stepCount: steps.length,
      steps
    };
  }

  async getResults(
    user: DashboardUser,
    funnelId: string,
    daysParam?: string,
    projectId?: string
  ): Promise<FunnelResults> {
    const project = await this.projects.requireActiveProject(user, projectId);
    const funnel = await this.loadFunnel(project.id, funnelId);
    const steps = await this.loadSteps(funnelId);

    if (steps.length < 1) {
      throw new BadRequestException('Funnel has no steps.');
    }

    const days = this.clampDays(daysParam);
    const to = new Date();
    const from = new Date(to.getTime() - days * DAY_MS);

    const counts = await this.computeStepCounts(project.id, steps, from, to);

    const startCount = counts[0] ?? 0;
    const resultSteps: FunnelResultStep[] = steps.map((step, index) => {
      const count = counts[index] ?? 0;
      const previous = index === 0 ? count : counts[index - 1] ?? 0;
      return {
        ...step,
        count,
        conversionFromStart: startCount > 0 ? count / startCount : 0,
        conversionFromPrevious: previous > 0 ? count / previous : index === 0 ? 1 : 0,
        droppedFromPrevious: index === 0 ? 0 : Math.max(previous - count, 0)
      };
    });

    return {
      funnel: { id: funnel.id, name: funnel.name },
      from: from.toISOString(),
      to: to.toISOString(),
      days,
      steps: resultSteps
    };
  }

  async getStepUsers(
    user: DashboardUser,
    funnelId: string,
    params: { step?: string; status?: string; days?: string; limit?: string; offset?: string; projectId?: string }
  ): Promise<FunnelStepUsers> {
    const project = await this.projects.requireActiveProject(user, params.projectId);
    const funnel = await this.loadFunnel(project.id, funnelId);
    const steps = await this.loadSteps(funnelId);

    const status: 'reached' | 'dropped' = params.status === 'dropped' ? 'dropped' : 'reached';
    const index = this.clampInt(params.step, 0, 0, Math.max(steps.length - 1, 0));
    if (steps.length === 0) {
      throw new BadRequestException('Funnel has no steps.');
    }
    if (status === 'dropped' && index === 0) {
      throw new BadRequestException('The first step has no drop-off.');
    }

    const days = this.clampDays(params.days);
    const limit = this.clampInt(params.limit, 50, 1, 200);
    const offset = this.clampInt(params.offset, 0, 0, 100000);
    const to = new Date();
    const from = new Date(to.getTime() - days * DAY_MS);

    const counts = await this.computeStepCounts(project.id, steps, from, to);
    const total = status === 'dropped' ? Math.max((counts[index - 1] ?? 0) - (counts[index] ?? 0), 0) : counts[index] ?? 0;

    const { ctes, values } = this.buildStepCtes(project.id, steps, from, to, index);
    const actorSelect =
      status === 'dropped'
        ? `SELECT actor FROM s${index - 1} WHERE actor NOT IN (SELECT actor FROM s${index})`
        : `SELECT actor FROM s${index}`;

    const limitParam = values.length + 1;
    const offsetParam = values.length + 2;
    values.push(limit, offset);

    const sql = `
      WITH ${ctes.join(',\n')}, actors AS (${actorSelect})
      SELECT
        a.actor,
        u.id AS "userId",
        u.external_id AS "externalId",
        u.anonymous_id AS "anonymousId",
        (u.id IS NOT NULL) AS "identified",
        u.last_seen_at AS "lastSeenAt",
        (
          SELECT e.device_info->>'os' FROM events e
          WHERE e.project_id = $1 AND COALESCE(e.user_id::text, e.anonymous_id) = a.actor
            AND NULLIF(e.device_info->>'os', '') IS NOT NULL
          ORDER BY e.occurred_at DESC LIMIT 1
        ) AS os,
        (
          SELECT e.network_info->>'country' FROM events e
          WHERE e.project_id = $1 AND COALESCE(e.user_id::text, e.anonymous_id) = a.actor
            AND NULLIF(e.network_info->>'country', '') IS NOT NULL
          ORDER BY e.occurred_at DESC LIMIT 1
        ) AS country
      FROM actors a
      LEFT JOIN users u ON u.id = a.actor
      ORDER BY u.last_seen_at DESC NULLS LAST
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;

    const result = await this.database.query<FunnelActor>(sql, values);
    const step = steps[index];

    return {
      funnel: { id: funnel.id, name: funnel.name },
      step: { index, eventName: step.eventName, label: step.label },
      status,
      total,
      users: result.rows,
      limit,
      offset
    };
  }

  async debugFunnel(user: DashboardUser, funnelId: string, daysParam?: string, projectId?: string): Promise<FunnelDebug> {
    const project = await this.projects.requireActiveProject(user, projectId);
    const funnel = await this.loadFunnel(project.id, funnelId);
    const steps = await this.loadSteps(funnelId);

    const days = this.clampDays(daysParam);
    const to = new Date();
    const from = new Date(to.getTime() - days * DAY_MS);

    const qualified = await this.computeStepCounts(project.id, steps, from, to);

    const stepsDebug: FunnelDebugStep[] = [];
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];

      const statsResult = await this.database.query<{
        eventCount: number;
        actorCount: number;
        identifiedEventCount: number;
        anonymousEventCount: number;
      }>(
        `SELECT
          count(*)::int AS "eventCount",
          count(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS "actorCount",
          count(*) FILTER (WHERE user_id IS NOT NULL)::int AS "identifiedEventCount",
          count(*) FILTER (WHERE user_id IS NULL AND anonymous_id IS NOT NULL)::int AS "anonymousEventCount"
        FROM events
        WHERE project_id = $1 AND occurred_at >= $2 AND occurred_at < $3
          AND event_name = $4 AND COALESCE(user_id::text, anonymous_id) IS NOT NULL`,
        [project.id, from.toISOString(), to.toISOString(), step.eventName]
      );
      const stats = statsResult.rows[0] ?? {
        eventCount: 0,
        actorCount: 0,
        identifiedEventCount: 0,
        anonymousEventCount: 0
      };

      const samplesResult = await this.database.query<FunnelDebugSample>(
        `SELECT
          COALESCE(user_id::text, anonymous_id) AS actor,
          user_id::text AS "userId",
          anonymous_id::text AS "anonymousId",
          occurred_at AS "occurredAt",
          received_at AS "receivedAt"
        FROM events
        WHERE project_id = $1 AND occurred_at >= $2 AND occurred_at < $3 AND event_name = $4
        ORDER BY received_at DESC
        LIMIT $5`,
        [project.id, from.toISOString(), to.toISOString(), step.eventName, 5]
      );

      stepsDebug.push({
        index,
        eventName: step.eventName,
        label: step.label,
        eventCount: stats.eventCount,
        actorCount: stats.actorCount,
        identifiedEventCount: stats.identifiedEventCount ?? 0,
        anonymousEventCount: stats.anonymousEventCount ?? 0,
        qualifiedCount: qualified[index] ?? 0,
        samples: samplesResult.rows
      });
    }

    const namesResult = await this.database.query<FunnelEventNameCount>(
      `SELECT event_name AS "eventName", count(*)::int AS "eventCount"
      FROM events
      WHERE project_id = $1 AND occurred_at >= $2 AND occurred_at < $3
      GROUP BY event_name
      ORDER BY "eventCount" DESC
      LIMIT 50`,
      [project.id, from.toISOString(), to.toISOString()]
    );

    return {
      funnel: { id: funnel.id, name: funnel.name },
      projectId: project.id,
      from: from.toISOString(),
      to: to.toISOString(),
      days,
      steps: stepsDebug,
      eventNames: namesResult.rows
    };
  }

  private async computeStepCounts(projectId: string, steps: FunnelStep[], from: Date, to: Date): Promise<number[]> {
    const { ctes, values } = this.buildStepCtes(projectId, steps, from, to, steps.length - 1);
    const selects = steps.map((_, index) => `(SELECT count(*) FROM s${index})::int AS step${index}`);
    const sql = `WITH ${ctes.join(',\n')} SELECT ${selects.join(', ')}`;

    const result = await this.database.query<Record<string, number>>(sql, values);
    const row = result.rows[0] ?? {};

    return steps.map((_, index) => Number(row[`step${index}`] ?? 0));
  }

  /** Builds the `base` + ordered `s0..s{upToIndex}` step CTEs and their positional params. */
  private buildStepCtes(
    projectId: string,
    steps: FunnelStep[],
    from: Date,
    to: Date,
    upToIndex: number
  ): { ctes: string[]; values: unknown[] } {
    const involvedNames = steps.slice(0, upToIndex + 1).map((step) => step.eventName);
    const values: unknown[] = [projectId, from.toISOString(), to.toISOString(), involvedNames];

    const ctes: string[] = [
      `base AS (
        SELECT COALESCE(user_id::text, anonymous_id) AS actor, event_name, occurred_at
        FROM events
        WHERE project_id = $1
          AND occurred_at >= $2 AND occurred_at < $3
          AND event_name = ANY($4)
          AND COALESCE(user_id::text, anonymous_id) IS NOT NULL
      )`
    ];

    for (let index = 0; index <= upToIndex; index += 1) {
      const paramIndex = values.length + 1;
      values.push(steps[index].eventName);

      if (index === 0) {
        ctes.push(
          `s0 AS (
            SELECT actor, MIN(occurred_at) AS reached
            FROM base
            WHERE event_name = $${paramIndex}
            GROUP BY actor
          )`
        );
      } else {
        ctes.push(
          `s${index} AS (
            SELECT b.actor, MIN(b.occurred_at) AS reached
            FROM base b
            JOIN s${index - 1} p ON p.actor = b.actor
            WHERE b.event_name = $${paramIndex} AND b.occurred_at >= p.reached
            GROUP BY b.actor
          )`
        );
      }
    }

    return { ctes, values };
  }

  private clampInt(value: string | undefined, fallback: number, min: number, max: number): number {
    const parsed = value !== undefined ? Number(value) : undefined;
    if (parsed === undefined || !Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(Math.max(Math.trunc(parsed), min), max);
  }

  private async loadFunnel(projectId: string, funnelId: string) {
    const result = await this.database.query<{ id: string; name: string; created_at: string }>(
      `SELECT id, name, created_at FROM funnels WHERE id = $1 AND project_id = $2 LIMIT 1`,
      [funnelId, projectId]
    );

    const funnel = result.rows[0];
    if (!funnel) {
      throw new NotFoundException('Funnel not found.');
    }

    return funnel;
  }

  private async loadSteps(funnelId: string): Promise<FunnelStep[]> {
    const result = await this.database.query<FunnelStep>(
      `
        SELECT step_order AS "order", event_name AS "eventName", label
        FROM funnel_steps
        WHERE funnel_id = $1
        ORDER BY step_order ASC
      `,
      [funnelId]
    );

    return result.rows;
  }

  private normalizeSteps(steps?: Array<string | StepInput>): StepInput[] {
    if (!Array.isArray(steps)) {
      throw new BadRequestException('steps must be an array.');
    }

    const normalized = steps
      .map((step) => (typeof step === 'string' ? { eventName: step } : step))
      .map((step) => ({
        eventName: this.requiredString(step?.eventName, 'step.eventName'),
        label: typeof step?.label === 'string' && step.label.trim().length > 0 ? step.label.trim() : undefined
      }));

    if (normalized.length < 2) {
      throw new BadRequestException('A funnel needs at least 2 steps.');
    }

    if (normalized.length > 12) {
      throw new BadRequestException('A funnel supports at most 12 steps.');
    }

    return normalized;
  }

  private clampDays(value?: string): number {
    const parsed = value ? Number(value) : undefined;
    if (parsed === undefined || !Number.isFinite(parsed)) {
      return 30;
    }
    return Math.min(Math.max(Math.trunc(parsed), 1), 365);
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`${field} is required.`);
    }
    return value.trim();
  }
}
