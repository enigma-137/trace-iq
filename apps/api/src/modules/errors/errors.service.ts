import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';

const EXCEPTION_EVENT = '$exception';

export type ErrorIssue = {
  type: string;
  message: string;
  occurrences: number;
  sessions: number;
  users: number;
  firstSeen: string;
  lastSeen: string;
  sparkline: number[];
};

type IssueAggregateRow = {
  type: string;
  message: string;
  occurrences: number;
  sessions: number;
  users: number;
  firstSeen: string;
  lastSeen: string;
};

export type ErrorSample = {
  id: string;
  message: string | null;
  stack: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  actor: string | null;
  externalId: string | null;
  occurredAt: string;
};

@Injectable()
export class ErrorsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService
  ) {}

  async listIssues(user: DashboardUser, daysParam?: string, projectId?: string) {
    const project = await this.projects.resolveActiveProject(user, projectId);
    const days = this.clampDays(daysParam);

    if (!project) {
      return { project: null, issues: [] as ErrorIssue[], days };
    }

    const aggregate = await this.database.query<IssueAggregateRow>(
      `
        SELECT
          COALESCE(NULLIF(properties->>'type', ''), 'Error') AS type,
          COALESCE(NULLIF(properties->>'message', ''), '(no message)') AS message,
          count(*)::int AS occurrences,
          count(DISTINCT session_id)::int AS sessions,
          count(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS users,
          min(occurred_at) AS "firstSeen",
          max(occurred_at) AS "lastSeen"
        FROM events
        WHERE project_id = $1 AND event_name = $2
          AND occurred_at >= now() - make_interval(days => $3::int)
        GROUP BY 1, 2
        ORDER BY "lastSeen" DESC
        LIMIT 100
      `,
      [project.id, EXCEPTION_EVENT, days]
    );

    const daily = await this.database.query<{ type: string; message: string; day: string; total: number }>(
      `
        SELECT
          COALESCE(NULLIF(properties->>'type', ''), 'Error') AS type,
          COALESCE(NULLIF(properties->>'message', ''), '(no message)') AS message,
          to_char(date_trunc('day', occurred_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
          count(*)::int AS total
        FROM events
        WHERE project_id = $1 AND event_name = $2
          AND occurred_at >= now() - make_interval(days => $3::int)
        GROUP BY 1, 2, 3
      `,
      [project.id, EXCEPTION_EVENT, days]
    );

    const buckets = this.dayBuckets(days);
    const byKey = new Map<string, Map<string, number>>();
    for (const row of daily.rows) {
      const key = `${row.type}\n${row.message}`;
      const dayMap = byKey.get(key) ?? new Map<string, number>();
      dayMap.set(row.day, row.total);
      byKey.set(key, dayMap);
    }

    const issues: ErrorIssue[] = aggregate.rows.map((row) => {
      const dayMap = byKey.get(`${row.type}\n${row.message}`) ?? new Map<string, number>();
      return { ...row, sparkline: buckets.map((day) => dayMap.get(day) ?? 0) };
    });

    return { project, issues, days };
  }

  async getIssue(
    user: DashboardUser,
    params: { type?: string; message?: string; days?: string; projectId?: string }
  ) {
    const project = await this.projects.requireActiveProject(user, params.projectId);
    const type = this.required(params.type, 'type');
    const message = this.required(params.message, 'message');
    const days = this.clampDays(params.days);

    // All queries alias the events table as `e` so columns stay unambiguous when joining `users`.
    const filter = `e.project_id = $1 AND e.event_name = $2
      AND COALESCE(NULLIF(e.properties->>'type', ''), 'Error') = $3
      AND COALESCE(NULLIF(e.properties->>'message', ''), '(no message)') = $4
      AND e.occurred_at >= now() - make_interval(days => $5::int)`;
    const filterValues = [project.id, EXCEPTION_EVENT, type, message, days];

    const totals = await this.database.query<{
      occurrences: number;
      sessions: number;
      users: number;
      firstSeen: string;
      lastSeen: string;
    }>(
      `SELECT count(*)::int AS occurrences,
        count(DISTINCT e.session_id)::int AS sessions,
        count(DISTINCT COALESCE(e.user_id::text, e.anonymous_id))::int AS users,
        min(e.occurred_at) AS "firstSeen", max(e.occurred_at) AS "lastSeen"
       FROM events e WHERE ${filter}`,
      filterValues
    );

    const samples = await this.database.query<ErrorSample>(
      `SELECT
        e.id,
        e.properties->>'message' AS message,
        e.properties->>'stack' AS stack,
        e.device_info->>'browser' AS browser,
        e.device_info->>'os' AS os,
        e.network_info->>'country' AS country,
        COALESCE(e.user_id::text, e.anonymous_id) AS actor,
        u.external_id AS "externalId",
        e.occurred_at AS "occurredAt"
       FROM events e
       LEFT JOIN users u ON u.id = e.user_id
       WHERE ${filter}
       ORDER BY e.occurred_at DESC
       LIMIT 25`,
      filterValues
    );

    const browsers = await this.breakdown(filter, filterValues, "e.device_info->>'browser'");
    const operatingSystems = await this.breakdown(filter, filterValues, "e.device_info->>'os'");

    return {
      project,
      issue: { type, message },
      days,
      totals: totals.rows[0] ?? { occurrences: 0, sessions: 0, users: 0, firstSeen: '', lastSeen: '' },
      samples: samples.rows,
      browsers,
      operatingSystems
    };
  }

  private async breakdown(filter: string, values: unknown[], source: string) {
    const result = await this.database.query<{ name: string; total: number }>(
      `SELECT COALESCE(NULLIF(${source}, ''), 'unknown') AS name, count(*)::int AS total
       FROM events e WHERE ${filter} GROUP BY 1 ORDER BY total DESC LIMIT 6`,
      values
    );
    return result.rows;
  }

  private dayBuckets(days: number): string[] {
    const buckets: string[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      buckets.push(d.toISOString().slice(0, 10));
    }
    return buckets;
  }

  private clampDays(value?: string): number {
    const parsed = value ? Number(value) : undefined;
    if (parsed === undefined || !Number.isFinite(parsed)) {
      return 14;
    }
    return Math.min(Math.max(Math.trunc(parsed), 1), 90);
  }

  private required(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new BadRequestException(`${field} is required.`);
    }
    return value;
  }
}
