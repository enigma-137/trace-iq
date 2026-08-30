import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';
import { AnalyticsService } from '../analytics/analytics.service';

const PUBLIC_SHARE_PERMISSIONS = ['summary', 'chart', 'definition'] as const;
type PublicSharePermission = (typeof PUBLIC_SHARE_PERMISSIONS)[number];

export interface CreatePublicShareRequest {
  permissions?: unknown;
  expiresAt?: string | null;
  projectId?: string;
}

export type DashboardDefinition = Record<string, unknown>;

export interface CreateDashboardRequest {
  name?: string;
  definition?: unknown;
  isShared?: boolean;
  projectId?: string;
}

export interface UpdateDashboardRequest {
  name?: string;
  definition?: unknown;
  isShared?: boolean;
  projectId?: string;
}

export interface DashboardView {
  id: string;
  name: string;
  ownerId: string;
  isShared: boolean;
  definition: DashboardDefinition;
  createdAt: string;
  updatedAt: string;
}

type DashboardRow = {
  [column: string]: unknown;
  id: string;
  name: string;
  ownerId: string;
  isShared: boolean;
  definition: DashboardDefinition | null;
  createdAt: string;
  updatedAt: string;
};

type PublicShareRow = {
  [column: string]: unknown;
  id: string;
  dashboardId: string;
  projectId: string;
  dashboardName: string;
  ownerId: string;
  definition: DashboardDefinition;
  permissions: PublicSharePermission[];
  expiresAt: string | null;
  createdAt: string;
  lastAccessedAt: string | null;
};

function mapRow(row: DashboardRow): DashboardView {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    isShared: row.isShared,
    definition: row.definition ?? {},
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

@Injectable()
export class DashboardsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService,
    private readonly analytics: AnalyticsService
  ) {}

  async listPublicShares(user: DashboardUser, dashboardId: string, projectId?: string) {
    const dashboard = await this.requireOwnedDashboard(user, dashboardId, projectId);
    const result = await this.database.query<PublicShareRow>(
      `SELECT id, dashboard_id AS "dashboardId", permissions, expires_at AS "expiresAt",
        created_at AS "createdAt", last_accessed_at AS "lastAccessedAt"
       FROM public_dashboard_shares
       WHERE dashboard_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC`, [dashboard.id]
    );
    return { shares: result.rows };
  }

  async createPublicShare(user: DashboardUser, dashboardId: string, body: CreatePublicShareRequest) {
    const dashboard = await this.requireOwnedDashboard(user, dashboardId, body.projectId);
    const permissions = this.normalizeSharePermissions(body.permissions);
    const expiresAt = this.normalizeExpiry(body.expiresAt);
    const token = `tiq_share_${randomBytes(32).toString('base64url')}`;
    const id = `shr_${randomUUID()}`;
    await this.database.query(
      `INSERT INTO public_dashboard_shares
        (id, dashboard_id, token_prefix, token_hash, permissions, expires_at, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, dashboard.id, token.slice(0, 18), this.hashShareToken(token), permissions, expiresAt, user.id]
    );
    return { id, token, permissions, expiresAt, createdAt: new Date().toISOString() };
  }

  async revokePublicShare(user: DashboardUser, dashboardId: string, shareId: string, projectId?: string) {
    const dashboard = await this.requireOwnedDashboard(user, dashboardId, projectId);
    const result = await this.database.query(
      `UPDATE public_dashboard_shares SET revoked_at = now()
       WHERE id = $1 AND dashboard_id = $2 AND revoked_at IS NULL`, [shareId, dashboard.id]
    );
    if (result.rowCount === 0) throw new NotFoundException('Public share not found.');
    return { revoked: true };
  }

  async getPublicShare(token: string) {
    if (!token.startsWith('tiq_share_') || token.length > 100) throw new NotFoundException('Shared dashboard not found.');
    const result = await this.database.query<PublicShareRow>(
      `SELECT s.id, s.dashboard_id AS "dashboardId", d.project_id AS "projectId",
        d.name AS "dashboardName", d.owner_id AS "ownerId", d.definition,
        s.permissions, s.expires_at AS "expiresAt", s.created_at AS "createdAt",
        s.last_accessed_at AS "lastAccessedAt"
       FROM public_dashboard_shares s JOIN dashboards d ON d.id = s.dashboard_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL
         AND (s.expires_at IS NULL OR s.expires_at > now()) LIMIT 1`,
      [this.hashShareToken(token)]
    );
    const share = result.rows[0];
    if (!share) throw new NotFoundException('Shared dashboard not found or link expired.');
    await this.database.query(`UPDATE public_dashboard_shares SET last_accessed_at = now() WHERE id = $1`, [share.id]);

    const definition = share.definition ?? {};
    let trends: Awaited<ReturnType<AnalyticsService['getTrends']>> | null = null;
    if ((share.permissions.includes('summary') || share.permissions.includes('chart')) && definition.source === 'trend') {
      const value = (key: string) => typeof definition[key] === 'string' ? definition[key] as string : undefined;
      trends = await this.analytics.getTrends({ id: share.ownerId }, {
        event: value('event'), interval: value('interval'), days: value('days'), from: value('from'), to: value('to'),
        breakdown: value('breakdown'), measure: value('measure'), property: value('property'), filters: value('filters'),
        projectId: share.projectId
      });
    }
    return {
      name: share.dashboardName,
      permissions: share.permissions,
      expiresAt: share.expiresAt,
      definition: share.permissions.includes('definition') ? definition : undefined,
      summary: share.permissions.includes('summary') ? trends?.summary ?? null : undefined,
      chart: share.permissions.includes('chart') && trends ? {
        event: trends.event, interval: trends.interval, measure: trends.measure, property: trends.property,
        breakdown: trends.breakdown, buckets: trends.buckets, series: trends.series
      } : undefined
    };
  }

  async list(user: DashboardUser, projectId?: string) {
    const project = await this.projects.resolveActiveProject(user, projectId);
    if (!project) {
      return { project: null, dashboards: [] as DashboardView[] };
    }

    const result = await this.database.query<DashboardRow>(
      `
        SELECT id, name, owner_id AS "ownerId", is_shared AS "isShared",
          definition, created_at AS "createdAt", updated_at AS "updatedAt"
        FROM dashboards
        WHERE project_id = $1 AND (owner_id = $2 OR is_shared = true)
        ORDER BY created_at DESC
      `,
      [project.id, user.id]
    );

    return { project, dashboards: result.rows.map(mapRow) };
  }

  async get(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const result = await this.database.query<DashboardRow>(
      `
        SELECT id, name, owner_id AS "ownerId", is_shared AS "isShared",
          definition, created_at AS "createdAt", updated_at AS "updatedAt"
        FROM dashboards
        WHERE id = $1 AND project_id = $2
      `,
      [id, project.id]
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Dashboard not found.');
    }
    if (row.ownerId !== user.id && !row.isShared) {
      throw new ForbiddenException('This dashboard is not shared with you.');
    }
    return mapRow(row);
  }

  async create(user: DashboardUser, body: CreateDashboardRequest) {
    const project = await this.projects.requireWritableProject(user, body.projectId);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      throw new BadRequestException('Dashboard name is required.');
    }

    const definition = this.normalizeDefinition(body.definition);
    const id = `dash_${randomUUID()}`;
    await this.database.query(
      `
        INSERT INTO dashboards (id, project_id, name, owner_id, is_shared, definition)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [id, project.id, name, user.id, body.isShared === true, JSON.stringify(definition)]
    );

    return this.get(user, id, project.id);
  }

  async update(user: DashboardUser, id: string, body: UpdateDashboardRequest) {
    const project = await this.projects.requireWritableProject(user, body.projectId);
    const existing = await this.database.query<DashboardRow>(
      `
        SELECT id, name, owner_id AS "ownerId", is_shared AS "isShared",
          definition, created_at AS "createdAt", updated_at AS "updatedAt"
        FROM dashboards
        WHERE id = $1 AND project_id = $2
      `,
      [id, project.id]
    );
    const row = existing.rows[0];
    if (!row) {
      throw new NotFoundException('Dashboard not found.');
    }
    if (row.ownerId !== user.id) {
      throw new ForbiddenException('Only the owner can edit this dashboard.');
    }

    const name = body.name !== undefined ? (typeof body.name === 'string' ? body.name.trim() : '') : row.name;
    if (!name) {
      throw new BadRequestException('Dashboard name is required.');
    }
    const definition = body.definition !== undefined ? this.normalizeDefinition(body.definition) : row.definition;
    const isShared = body.isShared !== undefined ? body.isShared === true : row.isShared;

    await this.database.query(
      `
        UPDATE dashboards
        SET name = $3, is_shared = $4, definition = $5::jsonb, updated_at = now()
        WHERE id = $1 AND project_id = $2
      `,
      [id, project.id, name, isShared, JSON.stringify(definition)]
    );

    return this.get(user, id, project.id);
  }

  async remove(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const existing = await this.database.query(
      `SELECT owner_id FROM dashboards WHERE id = $1 AND project_id = $2`,
      [id, project.id]
    );
    const row = existing.rows[0];
    if (!row) {
      throw new NotFoundException('Dashboard not found.');
    }
    if (row.owner_id !== user.id) {
      throw new ForbiddenException('Only the owner can delete this dashboard.');
    }
    await this.database.query(`DELETE FROM dashboards WHERE id = $1`, [id]);
    return { deleted: true };
  }

  private normalizeDefinition(raw: unknown): DashboardDefinition {
    if (raw === undefined || raw === null) {
      throw new BadRequestException('Dashboard definition is required.');
    }
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      throw new BadRequestException('Dashboard definition must be a JSON object.');
    }
    return raw as DashboardDefinition;
  }

  private async requireOwnedDashboard(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const result = await this.database.query<{ id: string; ownerId: string }>(
      `SELECT id, owner_id AS "ownerId" FROM dashboards WHERE id = $1 AND project_id = $2`, [id, project.id]
    );
    const dashboard = result.rows[0];
    if (!dashboard) throw new NotFoundException('Dashboard not found.');
    if (dashboard.ownerId !== user.id) throw new ForbiddenException('Only the owner can manage public links.');
    return dashboard;
  }

  private normalizeSharePermissions(raw: unknown): PublicSharePermission[] {
    if (!Array.isArray(raw)) throw new BadRequestException('Select at least one public-share permission.');
    const permissions = [...new Set(raw.filter((item): item is PublicSharePermission =>
      typeof item === 'string' && PUBLIC_SHARE_PERMISSIONS.includes(item as PublicSharePermission)
    ))];
    if (permissions.length === 0 || permissions.length !== raw.length) throw new BadRequestException('Public-share permissions are invalid.');
    return permissions;
  }

  private normalizeExpiry(raw: unknown): string | null {
    if (raw === undefined || raw === null || raw === '') return null;
    if (typeof raw !== 'string') throw new BadRequestException('Expiry must be an ISO timestamp.');
    const date = new Date(raw);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) throw new BadRequestException('Expiry must be in the future.');
    return date.toISOString();
  }

  private hashShareToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
