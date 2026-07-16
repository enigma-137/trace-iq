import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { QueryResultRow } from 'pg';
import { DatabaseService, QueryExecutor } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';

export interface BootstrapSetupRequest {
  organizationName?: string;
  projectName?: string;
}

interface SetupRow extends QueryResultRow {
  id: string;
  name: string;
  slug: string;
  role: 'owner' | 'admin' | 'member';
  project_id: string | null;
  project_name: string | null;
  project_slug: string | null;
}

@Injectable()
export class OrganizationsService {
  constructor(private readonly database: DatabaseService) {}

  async getSetup(user: DashboardUser) {
    const result = await this.database.query<SetupRow>(
      `
        SELECT
          o.id,
          o.name,
          o.slug,
          om.role,
          p.id AS project_id,
          p.name AS project_name,
          p.slug AS project_slug
        FROM organization_members om
        JOIN organizations o ON o.id = om.organization_id
        LEFT JOIN projects p ON p.organization_id = o.id
        WHERE om.user_id = $1
        ORDER BY o.created_at ASC, p.created_at ASC
        LIMIT 1;
      `,
      [user.id]
    );

    const row = result.rows[0];

    if (!row) {
      return {
        hasSetup: false,
        organization: null,
        project: null,
        writeKey: null,
        sdkSnippet: null
      };
    }

    const projectId = row.project_id as string | null;

    return {
      hasSetup: Boolean(projectId),
      organization: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        role: row.role
      },
      project: projectId
        ? {
            id: projectId,
            organizationId: row.id,
            name: row.project_name ?? '',
            slug: row.project_slug ?? ''
          }
        : null,
      writeKey: null,
      sdkSnippet: projectId ? this.createSdkSnippet(projectId, 'YOUR_PROJECT_WRITE_KEY') : null
    };
  }

  async bootstrapSetup(user: DashboardUser, input: BootstrapSetupRequest) {
    const organizationName = this.cleanName(input.organizationName, 'My Organization');
    const projectName = this.cleanName(input.projectName, 'Web App');

    return this.database.transaction(async (client) => {
      const existing = await this.getExistingSetup(client, user);

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
    return this.database.transaction(async (client) => {
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
  }

  private async getExistingSetup(client: QueryExecutor, user: DashboardUser) {
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
        ORDER BY o.created_at ASC, p.created_at ASC
        LIMIT 1;
      `,
      [user.id]
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
      "import { traceiq } from '@traceiq/sdk-js';",
      '',
      'traceiq.initialize({',
      `  projectId: '${projectId}',`,
      `  writeKey: '${writeKey}',`,
      `  endpoint: '${process.env.PUBLIC_API_URL ?? 'http://localhost:4000'}',`,
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
