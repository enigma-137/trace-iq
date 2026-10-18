import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';
import { EXCEPTION_EVENT } from './fingerprint';

/** Workflow state as stored. */
export type StoredIssueStatus = 'open' | 'resolved' | 'ignored';
/** What the API reports: a resolved issue that occurred again is `regressed`. */
export type IssueStatus = StoredIssueStatus | 'regressed';
export type IssueStatusFilter = IssueStatus | 'all';

const STORED_STATUSES: StoredIssueStatus[] = ['open', 'resolved', 'ignored'];
const STATUS_FILTERS: IssueStatusFilter[] = ['all', 'open', 'regressed', 'resolved', 'ignored'];

// Representative type and message for an event (alias `e`).
const TYPE_SQL = `COALESCE(NULLIF(e.properties->>'type', ''), 'Error')`;
const MESSAGE_SQL = `COALESCE(NULLIF(e.properties->>'message', ''), '(no message)')`;
/**
 * Issue id: the fingerprint stamped at ingest, or, for events stored before
 * fingerprinting existed, a hash of type + message (how they were grouped then).
 */
const ISSUE_ID_SQL = `COALESCE(NULLIF(e.properties->>'$fingerprint', ''), md5(${TYPE_SQL} || E'\n' || ${MESSAGE_SQL}))`;

export type ErrorIssue = {
  id: string;
  type: string;
  message: string;
  occurrences: number;
  sessions: number;
  users: number;
  firstSeen: string;
  lastSeen: string;
  status: IssueStatus;
  assigneeUserId: string | null;
  resolvedAt: string | null;
  sparkline: number[];
};

type IssueRow = Omit<ErrorIssue, 'sparkline'>;

export type ErrorSample = {
  id: string;
  sessionId?: string | null;
  message: string | null;
  stack: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  actor: string | null;
  externalId: string | null;
  url?: string | null;
  occurredAt: string;
};

type IssueStateRow = { status: StoredIssueStatus; assignee_user_id: string | null; resolved_at: string | null };

export interface UpdateIssueRequest {
  projectId?: string;
  status?: unknown;
  /** A member's user id, `"me"`, or null to unassign. Omit to leave unchanged. */
  assigneeUserId?: unknown;
}

@Injectable()
export class ErrorsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService
  ) {}

  /**
   * Issues seen in the last `days`, with their workflow status. Regressed issues
   * sort first, then most recently seen. `status` defaults to `all`.
   */
  async listIssues(user: DashboardUser, daysParam?: string, projectId?: string, statusParam?: string) {
    const project = await this.projects.resolveActiveProject(user, projectId);
    const days = this.clampDays(daysParam);
    const status = this.statusFilter(statusParam);
    const emptyCounts = { all: 0, open: 0, regressed: 0, resolved: 0, ignored: 0 };

    if (!project) {
      return { project: null, issues: [] as ErrorIssue[], days, status, counts: emptyCounts };
    }

    const values = [project.id, EXCEPTION_EVENT, days];
    const issuesCte = this.issuesCte();

    const listed = await this.database.query<IssueRow>(
      `${issuesCte}
        SELECT * FROM issues
        WHERE $4::text = 'all' OR status = $4::text OR ($4::text = 'open' AND status = 'regressed')
        ORDER BY (status = 'regressed') DESC, "lastSeen" DESC
        LIMIT 100`,
      [...values, status]
    );

    const counted = await this.database.query<{ status: IssueStatus; total: number }>(
      `${issuesCte}
        SELECT status, count(*)::int AS total FROM issues GROUP BY status`,
      values
    );
    const counts = { ...emptyCounts };
    for (const row of counted.rows) {
      counts[row.status] = row.total;
      counts.all += row.total;
    }
    // "Open" in the UI includes regressions: they need attention again.
    counts.open += counts.regressed;

    const ids = listed.rows.map((row) => row.id);
    const daily = ids.length
      ? await this.database.query<{ id: string; day: string; total: number }>(
          `
            SELECT
              ${ISSUE_ID_SQL} AS id,
              to_char(date_trunc('day', e.occurred_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
              count(*)::int AS total
            FROM events e
            WHERE e.project_id = $1 AND e.event_name = $2
              AND e.occurred_at >= now() - make_interval(days => $3::int)
              AND ${ISSUE_ID_SQL} = ANY($4::text[])
            GROUP BY 1, 2
          `,
          [...values, ids]
        )
      : { rows: [] as Array<{ id: string; day: string; total: number }> };

    const buckets = this.dayBuckets(days);
    const byId = new Map<string, Map<string, number>>();
    for (const row of daily.rows) {
      const dayMap = byId.get(row.id) ?? new Map<string, number>();
      dayMap.set(row.day, row.total);
      byId.set(row.id, dayMap);
    }

    const issues: ErrorIssue[] = listed.rows.map((row) => {
      const dayMap = byId.get(row.id) ?? new Map<string, number>();
      return { ...row, sparkline: buckets.map((day) => dayMap.get(day) ?? 0) };
    });

    return { project, issues, days, status, counts };
  }

  /**
   * One row per issue seen in the window ($1 project, $2 event name, $3 days),
   * joined with its stored workflow state.
   */
  private issuesCte(): string {
    return `
      WITH agg AS (
        SELECT
          ${ISSUE_ID_SQL} AS id,
          (array_agg(${TYPE_SQL} ORDER BY e.occurred_at DESC))[1] AS type,
          (array_agg(${MESSAGE_SQL} ORDER BY e.occurred_at DESC))[1] AS message,
          count(*)::int AS occurrences,
          count(DISTINCT e.session_id)::int AS sessions,
          count(DISTINCT COALESCE(e.user_id::text, e.anonymous_id))::int AS users,
          min(e.occurred_at) AS "firstSeen",
          max(e.occurred_at) AS "lastSeen"
        FROM events e
        WHERE e.project_id = $1 AND e.event_name = $2
          AND e.occurred_at >= now() - make_interval(days => $3::int)
        GROUP BY 1
      ),
      issues AS (
        SELECT
          agg.*,
          CASE
            WHEN ei.status = 'ignored' THEN 'ignored'
            WHEN ei.status = 'resolved' AND agg."lastSeen" > ei.resolved_at THEN 'regressed'
            WHEN ei.status = 'resolved' THEN 'resolved'
            ELSE 'open'
          END AS status,
          ei.assignee_user_id AS "assigneeUserId",
          ei.resolved_at AS "resolvedAt"
        FROM agg
        LEFT JOIN error_issues ei ON ei.project_id = $1 AND ei.fingerprint = agg.id
      )`;
  }

  /**
   * Detail for one issue, addressed by `id` (its fingerprint). `type` +
   * `message` still work for older links and the MCP server: they resolve to
   * the issue those events belong to.
   */
  async getIssue(
    user: DashboardUser,
    params: { id?: string; type?: string; message?: string; days?: string; projectId?: string }
  ) {
    const project = await this.projects.requireActiveProject(user, params.projectId);
    const days = this.clampDays(params.days);
    const id = typeof params.id === 'string' && params.id.trim() ? params.id.trim() : null;

    // All queries alias the events table as `e` so columns stay unambiguous when joining `users`.
    let filter: string;
    let filterValues: unknown[];
    if (id) {
      filter = `e.project_id = $1 AND e.event_name = $2
        AND ${ISSUE_ID_SQL} = $3
        AND e.occurred_at >= now() - make_interval(days => $4::int)`;
      filterValues = [project.id, EXCEPTION_EVENT, id, days];
    } else {
      const type = this.required(params.type, 'type');
      const message = this.required(params.message, 'message');
      filter = `e.project_id = $1 AND e.event_name = $2
        AND ${TYPE_SQL} = $3
        AND ${MESSAGE_SQL} = $4
        AND e.occurred_at >= now() - make_interval(days => $5::int)`;
      filterValues = [project.id, EXCEPTION_EVENT, type, message, days];
    }

    const identity = await this.database.query<{ id: string; type: string; message: string }>(
      `SELECT ${ISSUE_ID_SQL} AS id, ${TYPE_SQL} AS type, ${MESSAGE_SQL} AS message
       FROM events e WHERE ${filter}
       ORDER BY e.occurred_at DESC LIMIT 1`,
      filterValues
    );
    const latest = identity.rows[0];
    const issueId = id ?? latest?.id ?? null;
    const state = issueId ? await this.readState(project.id, issueId) : null;

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
        e.session_id AS "sessionId",
        e.properties->>'message' AS message,
        e.properties->>'stack' AS stack,
        e.device_info->>'browser' AS browser,
        e.device_info->>'os' AS os,
        e.network_info->>'country' AS country,
        COALESCE(e.user_id::text, e.anonymous_id) AS actor,
        u.external_id AS "externalId",
        COALESCE(e.properties->>'pathname', e.properties->>'$current_url', e.properties->>'url') AS url,
        e.occurred_at AS "occurredAt"
       FROM events e
       LEFT JOIN users u ON u.id = e.user_id
       WHERE ${filter}
       ORDER BY e.occurred_at DESC
       LIMIT 25`,
      filterValues
    );

    const timelineDaily = await this.database.query<{ day: string; count: number }>(
      `SELECT
        to_char(date_trunc('day', e.occurred_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
        count(*)::int AS count
       FROM events e
       WHERE ${filter}
       GROUP BY 1
       ORDER BY 1 ASC`,
      filterValues
    );

    const buckets = this.dayBuckets(days);
    const dayMap = new Map<string, number>();
    for (const row of timelineDaily.rows) {
      dayMap.set(row.day, row.count);
    }
    const timeline = buckets.map((day) => ({
      day,
      count: dayMap.get(day) ?? 0
    }));

    const browsers = await this.breakdown(filter, filterValues, "e.device_info->>'browser'");
    const operatingSystems = await this.breakdown(filter, filterValues, "e.device_info->>'os'");
    const pages = await this.breakdown(filter, filterValues, "COALESCE(NULLIF(e.properties->>'pathname', ''), NULLIF(e.properties->>'$current_url', ''), NULLIF(e.properties->>'url', ''), '/')");
    const releases = await this.breakdown(filter, filterValues, "COALESCE(NULLIF(e.properties->>'release', ''), NULLIF(e.device_info->>'appVersion', ''), 'v1.0.0')");

    return {
      project,
      issue: {
        id: issueId,
        type: latest?.type ?? params.type ?? 'Error',
        message: latest?.message ?? params.message ?? '(no message)',
        status: this.effectiveStatus(state, totals.rows[0]?.lastSeen ?? null),
        assigneeUserId: state?.assignee_user_id ?? null,
        resolvedAt: state?.resolved_at ?? null
      },
      days,
      totals: totals.rows[0] ?? { occurrences: 0, sessions: 0, users: 0, firstSeen: '', lastSeen: '' },
      samples: samples.rows,
      timeline,
      browsers,
      operatingSystems,
      pages,
      releases
    };
  }

  /**
   * Sets an issue's status and/or assignee. Resolving stamps `resolved_at`, so a
   * later occurrence shows the issue as regressed. Any project member may triage.
   */
  async updateIssue(user: DashboardUser, issueId: string, body: UpdateIssueRequest) {
    const project = await this.projects.requireWritableProject(user, body.projectId);
    const id = this.required(typeof issueId === 'string' ? issueId.trim() : issueId, 'id');

    const status = body.status === undefined ? undefined : this.storedStatus(body.status);
    const assigneeUserId = body.assigneeUserId === undefined ? undefined : await this.assignee(project, user, body.assigneeUserId);
    if (status === undefined && assigneeUserId === undefined) {
      throw new BadRequestException('Provide status and/or assigneeUserId.');
    }

    const exists = await this.database.query(
      `SELECT 1 FROM events e WHERE e.project_id = $1 AND e.event_name = $2 AND ${ISSUE_ID_SQL} = $3 LIMIT 1`,
      [project.id, EXCEPTION_EVENT, id]
    );
    if (exists.rows.length === 0) {
      throw new NotFoundException('Error issue not found.');
    }

    const current = await this.readState(project.id, id);
    const nextStatus = status ?? current?.status ?? 'open';
    const statusChanged = status !== undefined && status !== current?.status;
    const resolvedAt =
      nextStatus !== 'resolved' ? null : statusChanged || !current?.resolved_at ? new Date().toISOString() : current.resolved_at;
    const nextAssignee = assigneeUserId === undefined ? current?.assignee_user_id ?? null : assigneeUserId;

    const saved = await this.database.query<IssueStateRow>(
      `
        INSERT INTO error_issues (project_id, fingerprint, status, assignee_user_id, resolved_at, updated_by_user_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (project_id, fingerprint) DO UPDATE SET
          status = EXCLUDED.status,
          assignee_user_id = EXCLUDED.assignee_user_id,
          resolved_at = EXCLUDED.resolved_at,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = now()
        RETURNING status, assignee_user_id, resolved_at
      `,
      [project.id, id, nextStatus, nextAssignee, resolvedAt, user.id]
    );

    const row = saved.rows[0];
    return {
      issue: {
        id,
        status: row.status as IssueStatus,
        assigneeUserId: row.assignee_user_id,
        resolvedAt: row.resolved_at
      }
    };
  }

  private async readState(projectId: string, issueId: string): Promise<IssueStateRow | null> {
    const result = await this.database.query<IssueStateRow>(
      `SELECT status, assignee_user_id, resolved_at FROM error_issues WHERE project_id = $1 AND fingerprint = $2`,
      [projectId, issueId]
    );
    return result.rows[0] ?? null;
  }

  private effectiveStatus(state: IssueStateRow | null, lastSeen: string | null): IssueStatus {
    if (!state || state.status === 'open') return 'open';
    if (state.status === 'ignored') return 'ignored';
    if (lastSeen && state.resolved_at && new Date(lastSeen) > new Date(state.resolved_at)) return 'regressed';
    return 'resolved';
  }

  private async assignee(
    project: { id: string; organizationId: string },
    user: DashboardUser,
    value: unknown
  ): Promise<string | null> {
    if (value === null || value === '') return null;
    if (typeof value !== 'string') {
      throw new BadRequestException('assigneeUserId must be a user id, "me", or null.');
    }
    const userId = value === 'me' ? user.id : value.trim();
    const member = await this.database.query(
      `SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 LIMIT 1`,
      [project.organizationId, userId]
    );
    if (member.rows.length === 0) {
      throw new BadRequestException('The assignee must be a member of this organization.');
    }
    return userId;
  }

  private storedStatus(value: unknown): StoredIssueStatus {
    if (typeof value === 'string' && (STORED_STATUSES as string[]).includes(value)) {
      return value as StoredIssueStatus;
    }
    throw new BadRequestException(`status must be one of: ${STORED_STATUSES.join(', ')}.`);
  }

  private statusFilter(value?: string): IssueStatusFilter {
    if (!value) return 'all';
    if ((STATUS_FILTERS as string[]).includes(value)) return value as IssueStatusFilter;
    throw new BadRequestException(`status must be one of: ${STATUS_FILTERS.join(', ')}.`);
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
