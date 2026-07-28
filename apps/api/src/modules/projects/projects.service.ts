import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';

export type ResolvedProject = {
  id: string;
  name: string;
  slug: string;
  organizationId: string;
  organizationName: string;
  role: string;
};

@Injectable()
export class ProjectsService {
  constructor(private readonly database: DatabaseService) {}

  async listAccessibleProjects(user: DashboardUser) {
    const result = await this.database.query<ResolvedProject>(
      `
        SELECT
          p.id,
          p.name,
          p.slug,
          o.id AS "organizationId",
          o.name AS "organizationName",
          om.role
        FROM organization_members om
        JOIN organizations o ON o.id = om.organization_id
        JOIN projects p ON p.organization_id = o.id
        WHERE om.user_id = $1
        ORDER BY o.created_at ASC, p.created_at ASC
      `,
      [user.id]
    );

    return { projects: result.rows };
  }

  /**
   * Resolve the project a dashboard user is allowed to read.
   * When `projectId` is supplied it is validated against the user's memberships;
   * otherwise the user's first project (oldest org, oldest project) is returned.
   * Returns `null` only when the user has no projects at all.
   */
  async resolveActiveProject(user: DashboardUser, projectId?: string): Promise<ResolvedProject | null> {
    const requestedProjectId = this.optionalString(projectId);

    const result = await this.database.query<ResolvedProject>(
      `
        SELECT
          p.id,
          p.name,
          p.slug,
          o.id AS "organizationId",
          o.name AS "organizationName",
          om.role
        FROM organization_members om
        JOIN organizations o ON o.id = om.organization_id
        JOIN projects p ON p.organization_id = o.id
        WHERE om.user_id = $1
          AND ($2::text IS NULL OR p.id = $2)
        ORDER BY o.created_at ASC, p.created_at ASC
        LIMIT 1
      `,
      [user.id, requestedProjectId ?? null]
    );

    const project = result.rows[0] ?? null;

    if (!project && requestedProjectId) {
      throw new NotFoundException('Project not found or not accessible.');
    }

    return project;
  }

  /**
   * Same as {@link resolveActiveProject} but throws when the user has no project,
   * for endpoints that require an active project to do anything useful.
   */
  async requireActiveProject(user: DashboardUser, projectId?: string): Promise<ResolvedProject> {
    const project = await this.resolveActiveProject(user, projectId);

    if (!project) {
      throw new NotFoundException('No project found for this account. Create one from setup first.');
    }

    return project;
  }

  private optionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
}

