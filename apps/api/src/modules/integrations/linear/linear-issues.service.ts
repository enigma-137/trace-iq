import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { DashboardUser } from '../../auth/auth.service';
import { ErrorsService, ISSUE_ID_SQL } from '../../errors/errors.service';
import { EXCEPTION_EVENT } from '../../errors/fingerprint';
import { ProjectsService } from '../../projects/projects.service';
import { LinearClient } from './linear.client';
import { buildLinearIssueDescription, buildLinearIssueTitle } from './linear-issue.format';
import { LinearProjectSettings, LinearService, dashboardUrl, toHttpError } from './linear.service';

/** How far back the counts in the issue description look. */
export const LINEAR_ISSUE_WINDOW_DAYS = 90;

/** A claim older than this is treated as abandoned. Longer than any Linear request. */
const CLAIM_TTL_SECONDS = 300;

type CreateResult = { linearIssue: ErrorLinearIssue; created: boolean };

export type ErrorLinearIssue = {
  linearIssueId: string;
  identifier: string;
  url: string;
  createdAt: string;
};

const LINK_COLUMNS = `
  linear_issue_id AS "linearIssueId",
  identifier,
  url,
  created_at AS "createdAt"
`;

@Injectable()
export class LinearIssuesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService,
    private readonly errors: ErrorsService,
    private readonly linearService: LinearService,
    private readonly linear: LinearClient
  ) {}

  /**
   * Creates a Linear issue for the error issue `issueId` (its fingerprint) in the
   * project's default team, for a signed-in person. Idempotent: an existing link is
   * returned instead of a second issue.
   */
  async createForError(user: DashboardUser, issueId: string, projectId?: string): Promise<CreateResult> {
    const project = await this.projects.requireWritableProject(user, projectId);
    const id = typeof issueId === 'string' ? issueId.trim() : '';
    if (!id || id.length > 200) throw new BadRequestException('id is required.');
    return this.createLinked(project, id, { actorUserId: user.id, via: 'manual' });
  }

  /**
   * Shared by the button and auto-create. Only one caller at a time (across requests
   * and API instances) talks to Linear for an error: it holds a claim row, so no
   * database connection or lock is held while Linear responds.
   */
  async createLinked(
    project: { id: string; organizationId: string },
    id: string,
    options: { actorUserId: string | null; via: 'manual' | 'auto' }
  ): Promise<CreateResult> {
    const existing = await this.findLink(this.database, project.id, id);
    if (existing) return { linearIssue: existing, created: false };

    const connection = await this.linearService.requireActiveConnection(project.organizationId);
    const settings = await this.database.query<LinearProjectSettings>(
      `SELECT team_id AS "teamId", label_id AS "labelId" FROM linear_project_settings WHERE project_id = $1 AND workspace_id = $2`,
      [project.id, connection.workspaceId]
    );
    const team = settings.rows[0];
    if (!team) {
      throw new ConflictException({
        code: 'LINEAR_TEAM_NOT_SET',
        message: 'Choose a default Linear team for this project in Settings → Integrations.'
      });
    }

    const detail = await this.errors.issueDetail(project, { id, days: String(LINEAR_ISSUE_WINDOW_DAYS) });
    if (!detail.totals?.occurrences) throw new NotFoundException('Error issue not found.');

    if (!(await this.claim(project.id, id))) {
      // Someone else is creating it right now; return their link if it just landed.
      const raced = await this.findLink(this.database, project.id, id);
      if (raced) return { linearIssue: raced, created: false };
      throw new ConflictException({
        code: 'LINEAR_ISSUE_IN_PROGRESS',
        message: 'A Linear issue is already being created for this error. Try again in a moment.'
      });
    }

    try {
      // A request that held the claim before us may have finished in between.
      const raced = await this.findLink(this.database, project.id, id);
      if (raced) return { linearIssue: raced, created: false };

      const latest = detail.samples[0];
      const environment = await this.latestEnvironment(project.id, id);
      const description = buildLinearIssueDescription({
        issueId: id,
        projectId: project.id,
        type: detail.issue.type,
        message: detail.issue.message,
        stack: latest?.symbolicated?.stack ?? latest?.stack ?? null,
        occurrences: detail.totals.occurrences,
        users: detail.totals.users,
        firstSeen: detail.totals.firstSeen || null,
        lastSeen: detail.totals.lastSeen || null,
        environment,
        release: detail.totals.lastRelease ?? null,
        days: LINEAR_ISSUE_WINDOW_DAYS,
        dashboardBaseUrl: dashboardUrl()
      });

      let issue;
      try {
        issue = await this.linear.createIssue(connection, {
          teamId: team.teamId,
          title: buildLinearIssueTitle(detail.issue.type, detail.issue.message),
          description,
          labelIds: team.labelId ? [team.labelId] : []
        });
      } catch (error) {
        throw toHttpError(error);
      }

      const saved = await this.database.query<ErrorLinearIssue>(
        `INSERT INTO error_linear_issues
           (project_id, fingerprint, workspace_id, linear_issue_id, identifier, url, team_id, created_by_user_id, created_via)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (project_id, fingerprint) DO NOTHING
         RETURNING ${LINK_COLUMNS}`,
        [project.id, id, connection.workspaceId, issue.id, issue.identifier, issue.url, team.teamId, options.actorUserId, options.via]
      );
      if (saved.rows[0]) return { linearIssue: saved.rows[0], created: true };
      // Only reachable if a claim expired mid-request; keep the first link.
      const kept = await this.findLink(this.database, project.id, id);
      return { linearIssue: kept!, created: false };
    } finally {
      await this.release(project.id, id);
    }
  }

  /** True when this caller now holds the claim. Abandoned claims expire after a few minutes. */
  private async claim(projectId: string, fingerprint: string): Promise<boolean> {
    const result = await this.database.query(
      `INSERT INTO error_linear_issue_claims (project_id, fingerprint) VALUES ($1, $2)
       ON CONFLICT (project_id, fingerprint) DO UPDATE SET claimed_at = now()
       WHERE error_linear_issue_claims.claimed_at < now() - make_interval(secs => $3::int)
       RETURNING claimed_at`,
      [projectId, fingerprint, CLAIM_TTL_SECONDS]
    );
    return (result.rowCount ?? result.rows.length) > 0;
  }

  private async release(projectId: string, fingerprint: string): Promise<void> {
    await this.database
      .query(`DELETE FROM error_linear_issue_claims WHERE project_id = $1 AND fingerprint = $2`, [projectId, fingerprint])
      .catch(() => undefined);
  }

  private async findLink(
    executor: { query: DatabaseService['query'] },
    projectId: string,
    fingerprint: string
  ): Promise<ErrorLinearIssue | null> {
    const result = await executor.query<ErrorLinearIssue>(
      `SELECT ${LINK_COLUMNS} FROM error_linear_issues WHERE project_id = $1 AND fingerprint = $2`,
      [projectId, fingerprint]
    );
    return result.rows[0] ?? null;
  }

  /** Environment of the latest occurrence, when the SDK or app recorded one. */
  private async latestEnvironment(projectId: string, fingerprint: string): Promise<string | null> {
    const result = await this.database.query<{ environment: string | null }>(
      `SELECT COALESCE(NULLIF(e.context->>'environment', ''), NULLIF(e.properties->>'environment', '')) AS environment
       FROM events e
       WHERE e.project_id = $1 AND e.event_name = $2 AND ${ISSUE_ID_SQL} = $3
         AND e.occurred_at >= now() - make_interval(days => $4::int)
       ORDER BY e.occurred_at DESC
       LIMIT 1`,
      [projectId, EXCEPTION_EVENT, fingerprint, LINEAR_ISSUE_WINDOW_DAYS]
    );
    return result.rows[0]?.environment ?? null;
  }
}
