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
   * project's default team. Idempotent: an existing link is returned instead, and a
   * per-issue lock stops two quick clicks from creating two Linear issues.
   */
  async createForError(user: DashboardUser, issueId: string, projectId?: string): Promise<{ linearIssue: ErrorLinearIssue; created: boolean }> {
    const project = await this.projects.requireWritableProject(user, projectId);
    const id = typeof issueId === 'string' ? issueId.trim() : '';
    if (!id || id.length > 200) throw new BadRequestException('id is required.');

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

    const detail = await this.errors.getIssue(user, { id, days: String(LINEAR_ISSUE_WINDOW_DAYS), projectId: project.id });
    if (!detail.totals?.occurrences) throw new NotFoundException('Error issue not found.');
    const latest = detail.samples[0];
    const environment = await this.latestEnvironment(project.id, id);

    const title = buildLinearIssueTitle(detail.issue.type, detail.issue.message);
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

    return this.database.transaction(async (client) => {
      // Serialises creation per error issue across requests and API instances.
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`linear-issue:${project.id}:${id}`]);
      const raced = await this.findLink(client, project.id, id);
      if (raced) return { linearIssue: raced, created: false };

      let issue;
      try {
        issue = await this.linear.createIssue(connection, {
          teamId: team.teamId,
          title,
          description,
          labelIds: team.labelId ? [team.labelId] : []
        });
      } catch (error) {
        throw toHttpError(error);
      }

      const saved = await client.query<ErrorLinearIssue>(
        `INSERT INTO error_linear_issues
           (project_id, fingerprint, workspace_id, linear_issue_id, identifier, url, team_id, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING ${LINK_COLUMNS}`,
        [project.id, id, connection.workspaceId, issue.id, issue.identifier, issue.url, team.teamId, user.id]
      );
      return { linearIssue: saved.rows[0], created: true };
    });
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
