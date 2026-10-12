import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { EntitlementService } from '../billing/entitlement.service';
import { AuditService } from '../organizations/audit.service';
import { getPreferredProjectId } from '../../common/active-project';

export type ResolvedProject = {
  id: string;
  name: string;
  slug: string;
  organizationId: string;
  organizationName: string;
  role: string;
};

export interface RenameProjectRequest {
  name: string;
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly entitlements: EntitlementService = new EntitlementService(database),
    @Optional() private readonly audit?: AuditService
  ) {}

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
   * otherwise the user's first project in `organizationId` (or overall, when no
   * organization is given) is returned. Returns `null` only when no project
   * matches.
   */
  async resolveActiveProject(
    user: DashboardUser,
    projectId?: string,
    organizationId?: string
  ): Promise<ResolvedProject | null> {
    const requestedProjectId = this.optionalString(projectId);
    const requestedOrganizationId = this.optionalString(organizationId);
    // Without an explicit project, prefer the one the dashboard last switched to.
    const preferredProjectId = requestedProjectId ? null : getPreferredProjectId();

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
          AND ($3::text IS NULL OR o.id = $3)
        ORDER BY (p.id = $4) DESC NULLS LAST, o.created_at ASC, p.created_at ASC
        LIMIT 1
      `,
      [user.id, requestedProjectId ?? null, requestedOrganizationId ?? null, preferredProjectId]
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

  async requireWritableProject(user: DashboardUser, projectId?: string): Promise<ResolvedProject> {
    const project = await this.requireActiveProject(user, projectId);
    await this.entitlements.assertProjectWritable(project.id);
    await this.entitlements.assertMemberWritable(project.organizationId, user.id);
    return project;
  }

  /**
   * Renames an existing project. Requires owner or admin permissions on the organization.
   * Project ID and slug remain immutable to preserve integration stability.
   */
  async renameProject(user: DashboardUser, projectId: string, newNameInput: string) {
    const project = await this.requireWritableProject(user, projectId);

    if (!['owner', 'admin'].includes(project.role)) {
      throw new ForbiddenException('Only owners and admins can rename projects.');
    }

    const trimmed = typeof newNameInput === 'string' ? newNameInput.trim() : '';
    if (!trimmed) {
      throw new BadRequestException('Project name cannot be empty.');
    }
    if (trimmed.length > 80) {
      throw new BadRequestException('Project name must be 80 characters or fewer.');
    }

    const oldName = project.name;
    await this.database.query(
      `
        UPDATE projects
        SET name = $2, updated_at = now()
        WHERE id = $1
      `,
      [project.id, trimmed]
    );

    await this.audit?.record({
      organizationId: project.organizationId,
      actorUserId: user.id,
      action: 'project.renamed',
      metadata: {
        projectId: project.id,
        oldName,
        newName: trimmed
      }
    });

    return {
      project: {
        id: project.id,
        name: trimmed,
        slug: project.slug,
        organizationId: project.organizationId
      }
    };
  }

  /**
   * Permanently deletes a project and all associated project-scoped data.
   * Requires owner or admin permissions on the parent organization.
   */
  async deleteProject(user: DashboardUser, projectId: string) {
    const project = await this.requireWritableProject(user, projectId);

    if (!['owner', 'admin'].includes(project.role)) {
      throw new ForbiddenException('Only owners and admins can delete projects.');
    }

    await this.database.transaction(async (client) => {
      // 1. Clean up replay chunks and replays (which have ON DELETE RESTRICT on projects/sessions)
      await client.query(
        `
          DELETE FROM replay_chunks
          WHERE replay_id IN (
            SELECT id FROM session_replays WHERE project_id = $1
          )
        `,
        [project.id]
      );

      await client.query(
        `DELETE FROM session_replay_funnels WHERE project_id = $1`,
        [project.id]
      );

      await client.query(
        `DELETE FROM replay_setting_funnels WHERE project_id = $1`,
        [project.id]
      );

      await client.query(
        `DELETE FROM session_replays WHERE project_id = $1`,
        [project.id]
      );

      await client.query(
        `DELETE FROM replay_settings WHERE project_id = $1`,
        [project.id]
      );

      // 2. Delete the project row (all other tables cascade automatically: events, users, sessions,
      // feature_flags, webhooks, dashboards, alerts, cohorts, funnels, project_write_keys, etc.)
      const result = await client.query(
        `DELETE FROM projects WHERE id = $1 AND organization_id = $2`,
        [project.id, project.organizationId]
      );

      if (result.rowCount === 0) {
        throw new NotFoundException('Project not found or already deleted.');
      }
    });

    await this.audit?.record({
      organizationId: project.organizationId,
      actorUserId: user.id,
      action: 'project.deleted',
      metadata: {
        projectId: project.id,
        projectName: project.name
      }
    });

    // Fetch remaining accessible projects in the same organization
    const remainingResult = await this.database.query<{ id: string; name: string; slug: string }>(
      `
        SELECT id, name, slug
        FROM projects
        WHERE organization_id = $1
        ORDER BY created_at ASC
      `,
      [project.organizationId]
    );

    return {
      deleted: true,
      projectId: project.id,
      remainingProjects: remainingResult.rows
    };
  }

  private optionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
}
