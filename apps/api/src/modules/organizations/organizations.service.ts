import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { QueryResultRow } from 'pg';
import { DatabaseService, QueryExecutor } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { AuditService } from './audit.service';
import { EmailService, toUniqueEmails } from '../emails/email.service';

export interface BootstrapSetupRequest {
  organizationName?: string;
  projectName?: string;
}

export interface CreateProjectRequest {
  organizationId?: string;
  projectName?: string;
}

export type MemberRole = 'owner' | 'admin' | 'member';

export interface AddMemberRequestBody {
  email?: string;
  role?: MemberRole;
}

export interface UpdateMemberRoleRequestBody {
  role?: MemberRole;
}

interface MemberRow extends QueryResultRow {
  user_id: string;
  role: MemberRole;
  email: string | null;
  created_at: string;
}

interface SetupRow extends QueryResultRow {
  id: string;
  name: string;
  slug: string;
  role: 'owner' | 'admin' | 'member';
  member_count: number;
  project_id: string | null;
  project_name: string | null;
  project_slug: string | null;
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly email?: EmailService,
    private readonly audit?: AuditService
  ) {}

  async getSetup(user: DashboardUser, organizationId?: string, projectId?: string) {
    const orgId = this.optionalString(organizationId);
    const projId = this.optionalString(projectId);

    const result = await this.database.query<SetupRow>(
      `
        SELECT
          o.id,
          o.name,
          o.slug,
          om.role,
          (SELECT COUNT(*) FROM organization_members om2 WHERE om2.organization_id = o.id) AS member_count,
          p.id AS project_id,
          p.name AS project_name,
          p.slug AS project_slug
        FROM organization_members om
        JOIN organizations o ON o.id = om.organization_id
        LEFT JOIN projects p ON p.organization_id = o.id
        WHERE om.user_id = $1
          AND ($2::text IS NULL OR o.id = $2)
          AND ($3::text IS NULL OR p.id = $3)
        ORDER BY o.created_at ASC, p.created_at ASC
        LIMIT 1;
      `,
      [user.id, orgId ?? null, projId ?? null]
    );

    const row = result.rows[0];

    if ((orgId || projId) && !row) {
      throw new NotFoundException('Organization not found or not accessible.');
    }

    if (!row) {
      return {
        hasSetup: false,
        organization: null,
        project: null,
        writeKey: null,
        sdkSnippet: null
      };
    }

    const resolvedProjectId = row.project_id as string | null;

    return {
      hasSetup: Boolean(resolvedProjectId),
      organization: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        role: row.role,
        memberCount: row.member_count
      },
      project: resolvedProjectId
        ? {
            id: resolvedProjectId,
            organizationId: row.id,
            name: row.project_name ?? '',
            slug: row.project_slug ?? ''
          }
        : null,
      writeKey: null,
      sdkSnippet: projectId ? this.createSdkSnippet(projectId, 'YOUR_PROJECT_WRITE_KEY') : null
    };
  }

  /**
   * Resolves the acting user's primary organization and their role in it,
   * without any project context. Returns `null` when the user has no
   * organization (used by the invite flow).
   */
  async getMembership(user: DashboardUser) {
    const existing = await this.getExistingSetup(this.database, user);
    return existing.organization;
  }

  /**
   * Lists every organization the user belongs to, including their role, the
   * member count, and every project in each organization (the first one is also
   * exposed as `project` so the dashboard can jump straight into it). Used by
   * the sidebar organization switcher.
   */
  async listOrganizations(user: DashboardUser) {
    const result = await this.database.query<
      QueryResultRow & {
        id: string;
        name: string;
        slug: string;
        role: MemberRole;
        member_count: string;
        projects: Array<{ id: string; name: string; slug: string }>;
      }
    >(
      `
        SELECT
          o.id,
          o.name,
          o.slug,
          om.role,
          (SELECT COUNT(*) FROM organization_members om2 WHERE om2.organization_id = o.id) AS member_count,
          COALESCE(
            json_agg(
              json_build_object('id', p.id, 'name', p.name, 'slug', p.slug)
              ORDER BY p.created_at ASC
            ) FILTER (WHERE p.id IS NOT NULL),
            '[]'
          ) AS projects
        FROM organization_members om
        JOIN organizations o ON o.id = om.organization_id
        LEFT JOIN projects p ON p.organization_id = o.id
        WHERE om.user_id = $1
        GROUP BY o.id, o.name, o.slug, om.role
        ORDER BY o.created_at ASC;
      `,
      [user.id]
    );

    return {
      organizations: result.rows.map((row) => {
        const projects = row.projects ?? [];
        return {
          id: row.id,
          name: row.name,
          slug: row.slug,
          role: row.role,
          memberCount: Number(row.member_count),
          projects,
          project: projects[0] ?? null
        };
      })
    };
  }

  /**
   * Creates an additional organization for the user together with a fresh
   * project and write key, so the new organization is immediately usable. The
   * user is recorded as owner. Used by the "Add organization" action.
   */
  async createOrganizationForUser(user: DashboardUser, input: BootstrapSetupRequest) {
    const organizationName = this.cleanName(input.organizationName, 'My Organization');
    const projectName = this.cleanName(input.projectName, 'Web App');

    return this.database.transaction(async (client) => {
      const organization = await this.createOrganization(client, user, organizationName);
      const project = await this.createProject(client, user, organization.id, projectName);
      const writeKey = await this.createWriteKey(client, user, project.id);

      return {
        hasSetup: true,
        organization,
        project,
        writeKey,
        sdkSnippet: this.createSdkSnippet(project.id, writeKey.value)
      };
    });
  }

  /**
   * Creates an additional project inside an existing organization the user
   * belongs to, together with a fresh write key so the project is immediately
   * usable. Owners and admins can create projects; used by the "Add project"
   * action in the dashboard.
   */
  async createProjectForUser(user: DashboardUser, input: CreateProjectRequest) {
    const projectName = this.cleanName(input.projectName, 'Web App');
    const organizationId = this.optionalString(input.organizationId);

    return this.database.transaction(async (client) => {
      const existing = await this.getExistingSetup(client, user, organizationId);

      if (!existing.organization) {
        throw new BadRequestException('Create an organization before creating a project.');
      }

      if (!['owner', 'admin'].includes(existing.organization.role)) {
        throw new ForbiddenException('Only owners and admins can create projects.');
      }

      const project = await this.createProject(client, user, existing.organization.id, projectName);
      const writeKey = await this.createWriteKey(client, user, project.id);

      return {
        organization: existing.organization,
        project,
        writeKey,
        sdkSnippet: this.createSdkSnippet(project.id, writeKey.value)
      };
    });
  }

  async bootstrapSetup(user: DashboardUser, input: BootstrapSetupRequest, organizationId?: string) {
    const organizationName = this.cleanName(input.organizationName, 'My Organization');
    const projectName = this.cleanName(input.projectName, 'Web App');

    return this.database.transaction(async (client) => {
      const existing = await this.getExistingSetup(client, user, organizationId);

      if (existing.project) {
        return {
          ...existing,
          writeKey: null,
          sdkSnippet: this.createSdkSnippet(existing.project.id, 'YOUR_PROJECT_WRITE_KEY')
        };
      }

      const organization = existing.organization ?? (await this.createOrganization(client, user, organizationName));
      const project = await this.createProject(client, user, organization.id, projectName);
      const writeKey = await this.createWriteKey(client, user, project.id);

      return {
        hasSetup: true,
        organization,
        project,
        writeKey,
        sdkSnippet: this.createSdkSnippet(project.id, writeKey.value)
      };
    });
  }

  async regenerateWriteKey(user: DashboardUser) {
    const transaction = await this.database.transaction(async (client) => {
      const existing = await this.getExistingSetup(client, user);

      if (!existing.organization || !existing.project) {
        throw new BadRequestException('Create an organization and project before regenerating a write key.');
      }

      if (!['owner', 'admin'].includes(existing.organization.role)) {
        throw new ForbiddenException('Only owners and admins can regenerate project write keys.');
      }

      await client.query(
        `
          UPDATE project_write_keys
          SET revoked_at = now(), revoked_by_user_id = $2
          WHERE project_id = $1
            AND revoked_at IS NULL;
        `,
        [existing.project.id, user.id]
      );

      const writeKey = await this.createWriteKey(client, user, existing.project.id, 'Regenerated write key');

      return {
        hasSetup: true,
        organization: existing.organization,
        project: existing.project,
        writeKey,
        sdkSnippet: this.createSdkSnippet(existing.project.id, writeKey.value)
      };
    });

    await this.audit?.record({
      organizationId: transaction.organization.id,
      actorUserId: user.id,
      action: 'write_key.rotated',
      metadata: { projectId: transaction.project.id, projectName: transaction.project.name }
    });
    await this.notifyWriteKeyRotated(
      user,
      transaction.organization.id,
      transaction.organization.name,
      transaction.project.name ?? transaction.project.id
    );

    return transaction;
  }

  async renameOrganization(user: DashboardUser, input: BootstrapSetupRequest) {
    const organizationName = this.cleanName(input.organizationName, '');

    if (!organizationName) {
      throw new BadRequestException('Organization name is required.');
    }

    return this.database.transaction(async (client) => {
      const existing = await this.getExistingSetup(client, user);

      if (!existing.organization) {
        throw new BadRequestException('Create an organization before renaming it.');
      }

      if (!['owner', 'admin'].includes(existing.organization.role)) {
        throw new ForbiddenException('Only owners and admins can rename the organization.');
      }

      await client.query(
        `
          UPDATE organizations
          SET name = $2, updated_at = now()
          WHERE id = $1;
        `,
        [existing.organization.id, organizationName]
      );

      return {
        organization: {
          ...existing.organization,
          name: organizationName
        }
      };
    });
  }

  async listMembers(user: DashboardUser) {
    const existing = await this.getExistingSetup(this.database, user);

    if (!existing.organization) {
      throw new BadRequestException('Create an organization before managing members.');
    }

    const result = await this.database.query<MemberRow>(
      `
        SELECT user_id, role, email, created_at
        FROM organization_members
        WHERE organization_id = $1
        ORDER BY
          CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
          created_at ASC;
      `,
      [existing.organization.id]
    );

    return {
      organizationId: existing.organization.id,
      members: result.rows.map((row) => ({
        userId: row.user_id,
        role: row.role,
        email: row.email ?? null,
        createdAt: row.created_at
      }))
    };
  }

  async addMember(user: DashboardUser, input: { userId: string; email: string; role?: MemberRole }) {
    const role = this.normalizeRole(input.role ?? 'member');

    if (role === 'owner') {
      throw new BadRequestException("Ownership is granted by changing an existing member's role, not by adding a member.");
    }

    return this.database.transaction(async (client) => {
      const existing = await this.getExistingSetup(client, user);

      if (!existing.organization) {
        throw new BadRequestException('Create an organization before adding members.');
      }

      if (!['owner', 'admin'].includes(existing.organization.role)) {
        throw new ForbiddenException('Only owners and admins can add team members.');
      }

      await this.assertSeatAvailable(client, existing.organization.id);

      const duplicate = await client.query<{ exists: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1 FROM organization_members
            WHERE organization_id = $1 AND user_id = $2
          ) AS exists;
        `,
        [existing.organization.id, input.userId]
      );

      if (duplicate.rows[0]?.exists) {
        throw new ConflictException('That user is already a member of this organization.');
      }

      const result = await client.query<MemberRow>(
        `
          INSERT INTO organization_members (organization_id, user_id, role, email)
          VALUES ($1, $2, $3, $4)
          RETURNING user_id, role, email, created_at;
        `,
        [existing.organization.id, input.userId, role, input.email]
      );

      const member = this.toMember(result.rows[0]);

      await this.audit?.record({
        organizationId: existing.organization.id,
        actorUserId: user.id,
        action: 'member.added',
        targetUserId: input.userId,
        targetEmail: member.email,
        role: member.role
      });

      return { member };
    });
  }

  async updateMemberRole(user: DashboardUser, targetUserId: string, role?: MemberRole) {
    const newRole = this.normalizeRole(role);

    return this.database.transaction(async (client) => {
      const existing = await this.getExistingSetup(client, user);

      if (!existing.organization) {
        throw new BadRequestException('Create an organization before managing members.');
      }

      const actingRole = existing.organization.role;
      if (!['owner', 'admin'].includes(actingRole)) {
        throw new ForbiddenException('Only owners and admins can change member roles.');
      }

      const target = await client.query<{ role: MemberRole }>(
        `
          SELECT role FROM organization_members
          WHERE organization_id = $1 AND user_id = $2;
        `,
        [existing.organization.id, targetUserId]
      );

      const targetRole = target.rows[0]?.role;
      if (!targetRole) {
        throw new NotFoundException('That user is not a member of this organization.');
      }

      if (targetRole === newRole) {
        throw new BadRequestException('The member already has that role.');
      }

      if (actingRole === 'admin') {
        if (targetRole === 'owner' || newRole === 'owner') {
          throw new ForbiddenException('Only owners can change owner roles.');
        }
        if (targetRole === 'admin') {
          throw new ForbiddenException('Only owners can change other admins\u2019 roles.');
        }
      }

      if (newRole !== 'owner' && targetRole === 'owner') {
        const ownerCount = await client.query<{ count: string }>(
          `
            SELECT COUNT(*) AS count FROM organization_members
            WHERE organization_id = $1 AND role = 'owner';
          `,
          [existing.organization.id]
        );

        if (Number(ownerCount.rows[0]?.count) <= 1) {
          throw new BadRequestException('An organization must keep at least one owner.');
        }
      }

      await client.query(
        `
          UPDATE organization_members
          SET role = $3, updated_at = now()
          WHERE organization_id = $1 AND user_id = $2;
        `,
        [existing.organization.id, targetUserId, newRole]
      );

      await this.audit?.record({
        organizationId: existing.organization.id,
        actorUserId: user.id,
        action: 'member.role_changed',
        targetUserId,
        role: newRole,
        metadata: { from: targetRole, to: newRole }
      });

      return { userId: targetUserId, role: newRole };
    });
  }

  async removeMember(user: DashboardUser, targetUserId: string) {
    const transaction = await this.database.transaction(async (client) => {
      const existing = await this.getExistingSetup(client, user);

      if (!existing.organization) {
        throw new BadRequestException('Create an organization before managing members.');
      }

      const actingRole = existing.organization.role;
      if (!['owner', 'admin'].includes(actingRole)) {
        throw new ForbiddenException('Only owners and admins can remove team members.');
      }

      if (targetUserId === user.id) {
        throw new BadRequestException('Promote another owner or change your role instead of removing yourself.');
      }

      const target = await client.query<{ role: MemberRole; email: string | null }>(
        `
          SELECT role, email FROM organization_members
          WHERE organization_id = $1 AND user_id = $2;
        `,
        [existing.organization.id, targetUserId]
      );

      const targetRole = target.rows[0]?.role;
      if (!targetRole) {
        throw new NotFoundException('That user is not a member of this organization.');
      }

      if (targetRole === 'owner') {
        if (actingRole !== 'owner') {
          throw new ForbiddenException('Only owners can remove other owners.');
        }

        const ownerCount = await client.query<{ count: string }>(
          `
            SELECT COUNT(*) AS count FROM organization_members
            WHERE organization_id = $1 AND role = 'owner';
          `,
          [existing.organization.id]
        );

        if (Number(ownerCount.rows[0]?.count) <= 1) {
          throw new BadRequestException('An organization must keep at least one owner.');
        }
      }

      await client.query(
        `
          DELETE FROM organization_members
          WHERE organization_id = $1 AND user_id = $2;
        `,
        [existing.organization.id, targetUserId]
      );

      return {
        userId: targetUserId,
        removed: true,
        organizationId: existing.organization.id,
        organizationName: existing.organization.name,
        removedEmail: target.rows[0]?.email ?? null
      };
    });

    await this.audit?.record({
      organizationId: transaction.organizationId,
      actorUserId: user.id,
      action: 'member.removed',
      targetUserId,
      targetEmail: transaction.removedEmail,
      role: null
    });
    await this.notifyMemberRemoved(
      user,
      transaction.organizationId,
      transaction.organizationName,
      transaction.removedEmail
    );

    return transaction;
  }

  private normalizeRole(value: MemberRole | undefined): MemberRole {
    if (!value || !['owner', 'admin', 'member'].includes(value)) {
      throw new BadRequestException('Role must be one of owner, admin, or member.');
    }

    return value;
  }

  private toMember(row: MemberRow) {
    return {
      userId: row.user_id,
      role: row.role,
      email: row.email ?? null,
      createdAt: row.created_at
    };
  }

  /**
   * Enforces an optional paid-plan seat cap. When MAX_ORGANIZATION_SEATS is set,
   * the number of current members plus pending invites may not reach it. Counting
   * pending invites means an org can't stall on invites it never collected.
   */
  async assertSeatAvailable(client: QueryExecutor, organizationId: string) {
    const max = Number(process.env.MAX_ORGANIZATION_SEATS ?? 0);
    if (!Number.isFinite(max) || max <= 0) {
      return;
    }

    const result = await client.query<{ count: string }>(
      `
        SELECT
          (SELECT COUNT(*) FROM organization_members WHERE organization_id = $1)
          + (SELECT COUNT(*) FROM organization_invites WHERE organization_id = $1 AND status = 'pending')
          AS count;
      `,
      [organizationId]
    );

    const count = Number(result.rows[0]?.count ?? 0);
    if (count >= max) {
      throw new BadRequestException(
        `This organization is limited to ${max} seats. Remove a member or cancel a pending invite before adding more.`
      );
    }
  }

  private async memberEmails(organizationId: string) {
    const result = await this.database.query<{ email: string | null }>(
      `
        SELECT email FROM organization_members
        WHERE organization_id = $1 AND email IS NOT NULL;
      `,
      [organizationId]
    );

    return result.rows.map((row) => row.email).filter((email): email is string => Boolean(email));
  }

  /**
   * Best-effort notice to the team that the project write key was rotated, so
   * anyone depending on the old key knows to update their SDK/forwarder.
   */
  private async notifyWriteKeyRotated(
    user: DashboardUser,
    organizationId: string,
    organizationName: string,
    projectName: string
  ) {
    if (!this.email) {
      return;
    }

    const recipients = toUniqueEmails((await this.memberEmails(organizationId)).filter((email) => email !== user.email));
    if (recipients.length === 0) {
      return;
    }

    const actorLabel = user.email ?? 'An owner or admin';
    await this.email
      .send({
        to: recipients,
        subject: `Write key rotated for ${projectName} on ${organizationName}`,
        html: `
          <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#171717">
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6">
              ${escapeHtml(actorLabel)} rotated the project write key for
              <strong>${escapeHtml(projectName)}</strong> in
              <strong>${escapeHtml(organizationName)}</strong>.
            </p>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6">
              Any service using the previous key has stopped working. Update your SDK or forwarding setup with the
              new write key from the dashboard.
            </p>
            <p style="margin:0;font-size:13px;color:#737373;line-height:1.6">
              If you didn't expect this rotation, contact an owner of ${escapeHtml(organizationName)}.
            </p>
          </div>
        `
      })
      .catch(() => undefined);
  }

  /**
   * Best-effort notice to the remaining team that a member was removed.
   */
  private async notifyMemberRemoved(
    user: DashboardUser,
    organizationId: string,
    organizationName: string,
    removedEmail: string | null
  ) {
    if (!this.email) {
      return;
    }

    const recipients = toUniqueEmails((await this.memberEmails(organizationId)).filter((email) => email !== user.email));
    if (recipients.length === 0) {
      return;
    }

    const subjectEmail = removedEmail ?? 'A member';
    await this.email
      .send({
        to: recipients,
        subject: `${subjectEmail} left ${organizationName} on TraceIQ`,
        html: `
          <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#171717">
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6">
              ${escapeHtml(subjectEmail)} was removed from
              <strong>${escapeHtml(organizationName)}</strong> by ${escapeHtml(user.email ?? 'an owner or admin')} and
              no longer has access to its projects, flags, and analytics.
            </p>
            <p style="margin:0;font-size:13px;color:#737373;line-height:1.6">
              Anyone relying on them should be reached out to directly.
            </p>
          </div>
        `
      })
      .catch(() => undefined);
  }

  private async getExistingSetup(client: QueryExecutor, user: DashboardUser, organizationId?: string) {
    const orgId = this.optionalString(organizationId);
    const result = await client.query<
      QueryResultRow & {
        organization_id: string;
        organization_name: string;
        organization_slug: string;
        role: 'owner' | 'admin' | 'member';
        project_id: string | null;
        project_name: string | null;
        project_slug: string | null;
      }
    >(
      `
        SELECT
          o.id AS organization_id,
          o.name AS organization_name,
          o.slug AS organization_slug,
          om.role,
          p.id AS project_id,
          p.name AS project_name,
          p.slug AS project_slug
        FROM organization_members om
        JOIN organizations o ON o.id = om.organization_id
        LEFT JOIN projects p ON p.organization_id = o.id
        WHERE om.user_id = $1
          AND ($2::text IS NULL OR o.id = $2)
        ORDER BY o.created_at ASC, p.created_at ASC
        LIMIT 1;
      `,
      [user.id, orgId ?? null]
    );

    const row = result.rows[0];

    if (!row) {
      return {
        organization: null,
        project: null
      };
    }

    return {
      organization: {
        id: row.organization_id,
        name: row.organization_name,
        slug: row.organization_slug,
        role: row.role
      },
      project: row.project_id
        ? {
            id: row.project_id,
            organizationId: row.organization_id,
            name: row.project_name,
            slug: row.project_slug
          }
        : null
    };
  }

  private async createOrganization(client: QueryExecutor, user: DashboardUser, name: string) {
    const organization = {
      id: `org_${randomUUID()}`,
      name,
      slug: `${this.slugify(name)}-${randomBytes(3).toString('hex')}`
    };

    await client.query(
      `
        INSERT INTO organizations (id, name, slug, created_by_user_id)
        VALUES ($1, $2, $3, $4);
      `,
      [organization.id, organization.name, organization.slug, user.id]
    );

    await client.query(
      `
        INSERT INTO organization_members (organization_id, user_id, role)
        VALUES ($1, $2, 'owner')
        ON CONFLICT (organization_id, user_id)
        DO UPDATE SET role = 'owner', updated_at = now();
      `,
      [organization.id, user.id]
    );

    return {
      ...organization,
      role: 'owner' as const
    };
  }

  private async createProject(client: QueryExecutor, user: DashboardUser, organizationId: string, name: string) {
    const project = {
      id: `proj_${randomUUID()}`,
      organizationId,
      name,
      slug: `${this.slugify(name)}-${randomBytes(3).toString('hex')}`
    };

    await client.query(
      `
        INSERT INTO projects (id, organization_id, name, slug, created_by_user_id)
        VALUES ($1, $2, $3, $4, $5);
      `,
      [project.id, project.organizationId, project.name, project.slug, user.id]
    );

    return project;
  }

  private async createWriteKey(
    client: QueryExecutor,
    user: DashboardUser,
    projectId: string,
    name = 'Default write key'
  ) {
    const value = `trq_live_${randomBytes(24).toString('base64url')}`;
    const keyHash = createHash('sha256').update(value).digest('hex');

    await client.query(
      `
        INSERT INTO project_write_keys (id, project_id, key_prefix, key_hash, name, created_by_user_id)
        VALUES ($1, $2, $3, $4, $5, $6);
      `,
      [`pwk_${randomUUID()}`, projectId, value.slice(0, 16), keyHash, name, user.id]
    );

    return {
      prefix: value.slice(0, 16),
      value
    };
  }

  private createSdkSnippet(projectId: string, writeKey: string) {
    return [
      "import { traceiq } from 'traceiq-sdk-js';",
      '',
      'traceiq.initialize({',
      `  projectId: '${projectId}',`,
      `  writeKey: '${writeKey}',`,
      `  endpoint: '${process.env.NEXT_PUBLIC_API_URL ?? 'https://api.traceiq.run'}',`,
      '});',
      '',
      "traceiq.track('signup_completed', { plan: 'demo' });"
    ].join('\n');
  }

  private cleanName(value: string | undefined, fallback: string) {
    const name = value?.trim() || fallback;

    if (name.length > 80) {
      throw new BadRequestException('Name must be 80 characters or fewer.');
    }

    return name;
  }

  private optionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private slugify(value: string) {
    return (
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'project'
    );
  }
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
