import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService, ResolvedProject } from '../projects/projects.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { FunnelsService } from '../funnels/funnels.service';
import { ErrorsService } from '../errors/errors.service';

export type InsightType =
  | 'trend'
  | 'kpi'
  | 'funnel'
  | 'retention'
  | 'event_breakdown'
  | 'top_events'
  | 'user_metric'
  | 'web_analytics'
  | 'revenue'
  | 'error_metric'
  | 'errors'
  | 'api_performance'
  | 'web_vitals'
  | 'feature_adoption'
  | 'table';

export interface SavedInsightView {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  type: InsightType;
  query: Record<string, unknown>;
  visualization: Record<string, unknown>;
  filters: unknown[];
  dateConfig: Record<string, unknown>;
  tags: string[];
  isPinned: boolean;
  createdByUserId: string;
  createdByUserEmail?: string;
  usedInDashboardsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInsightRequest {
  name: string;
  description?: string;
  type?: InsightType;
  query?: Record<string, unknown>;
  visualization?: Record<string, unknown>;
  filters?: unknown[];
  dateConfig?: Record<string, unknown>;
  tags?: string[];
  isPinned?: boolean;
  projectId?: string;
}

export interface UpdateInsightRequest {
  name?: string;
  description?: string;
  type?: InsightType;
  query?: Record<string, unknown>;
  visualization?: Record<string, unknown>;
  filters?: unknown[];
  dateConfig?: Record<string, unknown>;
  tags?: string[];
  isPinned?: boolean;
  projectId?: string;
}

export interface ExecuteInsightQueryRequest {
  insightId?: string;
  type?: InsightType;
  query?: Record<string, unknown>;
  visualization?: Record<string, unknown>;
  filters?: unknown[];
  dateConfig?: Record<string, unknown>;
  globalOverrides?: {
    days?: string;
    from?: string;
    to?: string;
    interval?: string;
    filters?: string | unknown[];
  };
  projectId?: string;
}

type InsightRow = {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  type: string;
  query: Record<string, unknown> | null;
  visualization: Record<string, unknown> | null;
  filters: unknown[] | null;
  dateConfig: Record<string, unknown> | null;
  tags: string[] | null;
  isPinned: boolean;
  createdByUserId: string;
  createdByUserEmail?: string;
  usedInDashboardsCount?: number | string;
  createdAt: string;
  updatedAt: string;
};

function mapRow(row: InsightRow): SavedInsightView {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    type: (row.type as InsightType) || 'trend',
    query: row.query ?? {},
    visualization: row.visualization ?? {},
    filters: Array.isArray(row.filters) ? row.filters : [],
    dateConfig: row.dateConfig ?? {},
    tags: Array.isArray(row.tags) ? row.tags : [],
    isPinned: Boolean(row.isPinned),
    createdByUserId: row.createdByUserId,
    createdByUserEmail: row.createdByUserEmail,
    usedInDashboardsCount: Number(row.usedInDashboardsCount || 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

@Injectable()
export class SavedInsightsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService,
    private readonly analytics: AnalyticsService,
    private readonly funnels: FunnelsService,
    private readonly errors: ErrorsService
  ) {}

  async list(
    user: DashboardUser,
    options: {
      projectId?: string;
      search?: string;
      type?: string;
      tab?: 'all' | 'mine' | 'pinned';
      tag?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    const project = await this.projects.resolveActiveProject(user, options.projectId);
    if (!project) {
      return { project: null, insights: [] as SavedInsightView[], total: 0 };
    }

    const params: unknown[] = [project.id];
    let whereClause = `WHERE i.project_id = $1`;

    if (options.tab === 'mine') {
      params.push(user.id);
      whereClause += ` AND i.created_by_user_id = $${params.length}`;
    } else if (options.tab === 'pinned') {
      whereClause += ` AND i.is_pinned = true`;
    }

    if (options.type && options.type !== 'all') {
      params.push(options.type);
      whereClause += ` AND i.type = $${params.length}`;
    }

    if (options.tag) {
      params.push(options.tag);
      whereClause += ` AND $${params.length} = ANY(i.tags)`;
    }

    if (options.search?.trim()) {
      params.push(`%${options.search.trim()}%`);
      whereClause += ` AND (i.name ILIKE $${params.length} OR i.description ILIKE $${params.length})`;
    }

    const result = await this.database.query<InsightRow>(
      `
        SELECT
          i.id,
          i.project_id AS "projectId",
          i.name,
          i.description,
          i.type,
          i.query,
          i.visualization,
          i.filters,
          i.date_config AS "dateConfig",
          i.tags,
          i.is_pinned AS "isPinned",
          i.created_by_user_id AS "createdByUserId",
          i.created_at AS "createdAt",
          i.updated_at AS "updatedAt",
          (SELECT COUNT(DISTINCT w.dashboard_id) FROM dashboard_widgets w WHERE w.insight_id = i.id) AS "usedInDashboardsCount"
        FROM insights i
        ${whereClause}
        ORDER BY i.is_pinned DESC, i.updated_at DESC
        LIMIT ${Number(options.limit) || 100} OFFSET ${Number(options.offset) || 0}
      `,
      params
    );

    return {
      project,
      insights: result.rows.map(mapRow),
      total: result.rowCount ?? result.rows.length
    };
  }

  async get(user: DashboardUser, id: string, projectId?: string): Promise<SavedInsightView> {
    const project = await this.projects.requireActiveProject(user, projectId);
    const result = await this.database.query<InsightRow>(
      `
        SELECT
          i.id,
          i.project_id AS "projectId",
          i.name,
          i.description,
          i.type,
          i.query,
          i.visualization,
          i.filters,
          i.date_config AS "dateConfig",
          i.tags,
          i.is_pinned AS "isPinned",
          i.created_by_user_id AS "createdByUserId",
          i.created_at AS "createdAt",
          i.updated_at AS "updatedAt",
          (SELECT COUNT(DISTINCT w.dashboard_id) FROM dashboard_widgets w WHERE w.insight_id = i.id) AS "usedInDashboardsCount"
        FROM insights i
        WHERE i.id = $1 AND i.project_id = $2
      `,
      [id, project.id]
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Insight not found.');
    }
    return mapRow(row);
  }

  async create(user: DashboardUser, body: CreateInsightRequest): Promise<SavedInsightView> {
    const project = await this.projects.requireWritableProject(user, body.projectId);
    const name = body.name?.trim();
    if (!name) {
      throw new BadRequestException('Insight name is required.');
    }

    const id = `ins_${randomUUID()}`;
    const type = body.type || 'trend';
    const description = body.description?.trim() || null;
    const query = body.query ?? {};
    const visualization = body.visualization ?? { chartType: 'line' };
    const filters = Array.isArray(body.filters) ? body.filters : [];
    const dateConfig = body.dateConfig ?? { days: '30' };
    const tags = Array.isArray(body.tags) ? body.tags.map((t) => t.trim()).filter(Boolean) : [];
    const isPinned = body.isPinned === true;

    await this.database.query(
      `
        INSERT INTO insights (
          id, project_id, name, description, type, query, visualization, filters, date_config, tags, is_pinned, created_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12)
      `,
      [
        id,
        project.id,
        name,
        description,
        type,
        JSON.stringify(query),
        JSON.stringify(visualization),
        JSON.stringify(filters),
        JSON.stringify(dateConfig),
        tags,
        isPinned,
        user.id
      ]
    );

    return this.get(user, id, project.id);
  }

  async update(user: DashboardUser, id: string, body: UpdateInsightRequest): Promise<SavedInsightView> {
    const project = await this.projects.requireWritableProject(user, body.projectId);
    const existing = await this.get(user, id, project.id);

    const name = body.name !== undefined ? body.name.trim() : existing.name;
    if (!name) {
      throw new BadRequestException('Insight name is required.');
    }

    const description = body.description !== undefined ? body.description.trim() || null : existing.description;
    const type = body.type !== undefined ? body.type : existing.type;
    const query = body.query !== undefined ? body.query : existing.query;
    const visualization = body.visualization !== undefined ? body.visualization : existing.visualization;
    const filters = body.filters !== undefined ? body.filters : existing.filters;
    const dateConfig = body.dateConfig !== undefined ? body.dateConfig : existing.dateConfig;
    const tags = body.tags !== undefined ? body.tags : existing.tags;
    const isPinned = body.isPinned !== undefined ? body.isPinned === true : existing.isPinned;

    await this.database.query(
      `
        UPDATE insights
        SET
          name = $3,
          description = $4,
          type = $5,
          query = $6::jsonb,
          visualization = $7::jsonb,
          filters = $8::jsonb,
          date_config = $9::jsonb,
          tags = $10,
          is_pinned = $11,
          updated_at = now()
        WHERE id = $1 AND project_id = $2
      `,
      [
        id,
        project.id,
        name,
        description,
        type,
        JSON.stringify(query),
        JSON.stringify(visualization),
        JSON.stringify(filters),
        JSON.stringify(dateConfig),
        tags,
        isPinned
      ]
    );

    return this.get(user, id, project.id);
  }

  async duplicate(user: DashboardUser, id: string, projectId?: string): Promise<SavedInsightView> {
    const project = await this.projects.requireWritableProject(user, projectId);
    const source = await this.get(user, id, project.id);

    return this.create(user, {
      projectId: project.id,
      name: `${source.name} (Copy)`,
      description: source.description || undefined,
      type: source.type,
      query: source.query,
      visualization: source.visualization,
      filters: source.filters,
      dateConfig: source.dateConfig,
      tags: source.tags,
      isPinned: false
    });
  }

  async remove(user: DashboardUser, id: string, projectId?: string): Promise<{ deleted: boolean }> {
    const project = await this.projects.requireWritableProject(user, projectId);
    const result = await this.database.query(
      `DELETE FROM insights WHERE id = $1 AND project_id = $2`,
      [id, project.id]
    );
    if (result.rowCount === 0) {
      throw new NotFoundException('Insight not found.');
    }
    return { deleted: true };
  }

  /**
   * Executes an insight calculation on demand against the current project dataset.
   */
  async executeQuery(user: DashboardUser, request: ExecuteInsightQueryRequest) {
    const project = await this.projects.requireActiveProject(user, request.projectId);

    let query = request.query ?? {};
    let type = request.type || 'trend';
    let filters = request.filters ?? [];
    let dateConfig = request.dateConfig ?? {};

    if (request.insightId) {
      const saved = await this.get(user, request.insightId, project.id);
      query = { ...saved.query, ...query };
      type = request.type || saved.type;
      filters = request.filters ?? saved.filters;
      dateConfig = { ...saved.dateConfig, ...dateConfig };
    }

    const overrides = request.globalOverrides ?? {};
    const days = overrides.days || (query.days as string) || (dateConfig.days as string) || '30';
    const from = overrides.from || (query.from as string) || (dateConfig.from as string);
    const to = overrides.to || (query.to as string) || (dateConfig.to as string);
    const interval = overrides.interval || (query.interval as string) || 'day';
    const event = (query.event as string) || '*';
    const measure = (query.measure as string) || 'count';
    const property = (query.property as string) || undefined;
    const breakdown = (query.breakdown as string) || (type === 'top_events' ? '$event_name' : undefined);

    let mergedFiltersStr: string | undefined = undefined;
    if (overrides.filters) {
      mergedFiltersStr = typeof overrides.filters === 'string' ? overrides.filters : JSON.stringify(overrides.filters);
    } else if (filters && filters.length > 0) {
      mergedFiltersStr = JSON.stringify(filters);
    }

    switch (type) {
      case 'funnel': {
        const funnelId = (query.funnelId as string) || undefined;
        if (funnelId) {
          const funnelData = await this.funnels.getResults(user, funnelId, days, project.id);
          return { type: 'funnel', data: funnelData };
        }
        return { type: 'funnel', data: { funnel: null, steps: [], days: Number(days) || 30 } };
      }

      case 'retention': {
        const weeks = (query.weeks as string) || '4';
        const retentionData = await this.analytics.getRetention(user, {
          weeks,
          filters: mergedFiltersStr,
          projectId: project.id
        });
        return { type: 'retention', data: retentionData };
      }

      case 'web_analytics': {
        const webData = await this.analytics.getWebAnalytics(user, {
          days,
          filters: mergedFiltersStr,
          projectId: project.id
        });
        return { type: 'web_analytics', data: webData };
      }

      case 'api_performance': {
        const apiData = await this.analytics.getApiPerformance(user, days, project.id);
        return { type: 'api_performance', data: apiData };
      }

      case 'errors':
      case 'error_metric': {
        const errorData = await this.errors.listIssues(user, days, project.id);
        return { type: 'error_metric', data: errorData };
      }

      case 'top_events':
      case 'trend':
      case 'kpi':
      case 'event_breakdown':
      case 'table':
      default: {
        const trendsData = await this.analytics.getTrends(user, {
          event,
          interval,
          days,
          from,
          to,
          breakdown,
          measure,
          property,
          filters: mergedFiltersStr,
          projectId: project.id
        });
        return { type, data: trendsData };
      }
    }
  }
}
