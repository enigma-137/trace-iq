import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { SavedInsightView, SavedInsightsService } from '../insights/saved-insights.service';

const PUBLIC_SHARE_PERMISSIONS = ['summary', 'chart', 'definition'] as const;
type PublicSharePermission = (typeof PUBLIC_SHARE_PERMISSIONS)[number];

export interface CreatePublicShareRequest {
  permissions?: unknown;
  expiresAt?: string | null;
  projectId?: string;
}

export type DashboardDefinition = Record<string, unknown>;

export interface DashboardWidgetView {
  id: string;
  dashboardId: string;
  insightId: string | null;
  title: string | null;
  description: string | null;
  widgetType: string;
  queryOverride: Record<string, unknown>;
  visualizationOverride: Record<string, unknown>;
  layout: Record<string, unknown>;
  position: number;
  insight?: SavedInsightView | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardView {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  ownerId: string;
  ownerEmail?: string;
  isShared: boolean;
  isPinned: boolean;
  tags: string[];
  filters: Record<string, unknown>;
  layout: unknown[];
  definition: DashboardDefinition;
  widgetsCount: number;
  widgets?: DashboardWidgetView[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateDashboardRequest {
  name: string;
  description?: string;
  isShared?: boolean;
  isPinned?: boolean;
  tags?: string[];
  filters?: Record<string, unknown>;
  layout?: unknown[];
  definition?: Record<string, unknown>;
  projectId?: string;
}

export interface UpdateDashboardRequest {
  name?: string;
  description?: string;
  isShared?: boolean;
  isPinned?: boolean;
  tags?: string[];
  filters?: Record<string, unknown>;
  layout?: unknown[];
  definition?: Record<string, unknown>;
  projectId?: string;
}

export interface AddWidgetRequest {
  insightId?: string;
  title?: string;
  description?: string;
  widgetType?: string;
  queryOverride?: Record<string, unknown>;
  visualizationOverride?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  position?: number;
  // If creating new insight inline with widget
  newInsight?: {
    name: string;
    description?: string;
    type: string;
    query: Record<string, unknown>;
    visualization: Record<string, unknown>;
  };
  projectId?: string;
}

export interface UpdateWidgetRequest {
  title?: string;
  description?: string;
  queryOverride?: Record<string, unknown>;
  visualizationOverride?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  position?: number;
  projectId?: string;
}

export interface InstantiateTemplateRequest {
  templateId: string;
  name?: string;
  description?: string;
  projectId?: string;
}

export const DASHBOARD_TEMPLATES = [
  {
    id: 'product-analytics',
    name: 'Product Analytics',
    description: 'Understand active users, product usage, retention, and important events.',
    image: '/dashboards/analytics.png',
    tags: ['Product', 'Usage', 'Retention'],
    widgets: [
      {
        title: '30-Day Active Users Trend',
        description: 'Daily unique active users',
        insight: {
          name: 'Active Users Trend (30d)',
          type: 'trend',
          query: { event: '$pageview', measure: 'unique', interval: 'day', days: '30' },
          visualization: { chartType: 'line' }
        },
        layout: { x: 0, y: 0, w: 8, h: 4 }
      },
      {
        title: 'Total Monthly Sessions',
        description: '30-day session volume',
        insight: {
          name: 'Total Sessions (30d)',
          type: 'kpi',
          query: { event: '$pageview', measure: 'unique', days: '30' },
          visualization: { chartType: 'number' }
        },
        layout: { x: 8, y: 0, w: 4, h: 2 }
      },
      {
        title: 'Total Event Volume',
        description: 'Overall activity count',
        insight: {
          name: 'Total Event Volume (30d)',
          type: 'kpi',
          query: { event: '$pageview', measure: 'count', days: '30' },
          visualization: { chartType: 'number' }
        },
        layout: { x: 8, y: 2, w: 4, h: 2 }
      },
      {
        title: 'Top Events Volume',
        description: 'Distribution of high-frequency events',
        insight: {
          name: 'Top Events by Day',
          type: 'trend',
          query: { event: '$pageview', measure: 'count', interval: 'day', days: '14' },
          visualization: { chartType: 'bar' }
        },
        layout: { x: 0, y: 4, w: 6, h: 4 }
      },
      {
        title: 'Browser Distribution',
        description: 'Client browser breakdown',
        insight: {
          name: 'Traffic by Browser',
          type: 'event_breakdown',
          query: { event: '$pageview', breakdown: '$browser', days: '30' },
          visualization: { chartType: 'pie' }
        },
        layout: { x: 6, y: 4, w: 6, h: 4 }
      },
      {
        title: 'Cohort Retention (4 Weeks)',
        description: 'Weekly user retention rate',
        insight: {
          name: 'Weekly Retention Matrix',
          type: 'retention',
          query: { weeks: '4' },
          visualization: { chartType: 'retention' }
        },
        layout: { x: 0, y: 8, w: 12, h: 4 }
      }
    ]
  },
  {
    id: 'funnels-growth',
    name: 'Funnels & Growth',
    description: 'Track conversion funnels, onboarding drop-offs, and acquisition growth.',
    image: '/dashboards/funnel.png',
    tags: ['Growth', 'Funnels', 'Conversion'],
    widgets: [
      {
        title: 'Primary User Funnel',
        description: 'Step-by-step conversion and drop-off rate',
        insight: {
          name: 'Core Conversion Funnel',
          type: 'funnel',
          query: { days: '30' },
          visualization: { chartType: 'funnel' }
        },
        layout: { x: 0, y: 0, w: 7, h: 5 }
      },
      {
        title: 'Daily Conversion Volume',
        description: 'Completed goal actions over time',
        insight: {
          name: 'Goal Completions Trend',
          type: 'trend',
          query: { event: '$pageview', measure: 'count', interval: 'day', days: '30' },
          visualization: { chartType: 'area' }
        },
        layout: { x: 7, y: 0, w: 5, h: 5 }
      },
      {
        title: 'Top Referrer Traffic',
        description: 'Acquisition channels and domains',
        insight: {
          name: 'Referrer Channel Breakdown',
          type: 'web_analytics',
          query: { days: '30' },
          visualization: { chartType: 'bar' }
        },
        layout: { x: 0, y: 5, w: 6, h: 4 }
      },
      {
        title: 'Device Type Adoption',
        description: 'Mobile vs Desktop vs Tablet split',
        insight: {
          name: 'Device Type Breakdown',
          type: 'event_breakdown',
          query: { event: '$pageview', breakdown: '$device', days: '30' },
          visualization: { chartType: 'pie' }
        },
        layout: { x: 6, y: 5, w: 6, h: 4 }
      }
    ]
  },
  {
    id: 'project-overview',
    name: 'Project Overview',
    description: 'Essential telemetry snapshot: traffic, errors, active users, and API health.',
    image: '/dashboards/overview.png',
    tags: ['Overview', 'Health', 'Executive'],
    widgets: [
      {
        title: 'Monthly Active Users',
        description: 'Total unique visitors in 30 days',
        insight: {
          name: 'Overview Active Users',
          type: 'kpi',
          query: { event: '$pageview', measure: 'unique', days: '30' },
          visualization: { chartType: 'number' }
        },
        layout: { x: 0, y: 0, w: 4, h: 2 }
      },
      {
        title: 'Total Ingested Events',
        description: 'Overall telemetry volume in 30 days',
        insight: {
          name: 'Overview Event Volume',
          type: 'kpi',
          query: { event: '$pageview', measure: 'count', days: '30' },
          visualization: { chartType: 'number' }
        },
        layout: { x: 4, y: 0, w: 4, h: 2 }
      },
      {
        title: 'API Reliability & Errors',
        description: 'Recent error counts across all services',
        insight: {
          name: 'Overview Error Count',
          type: 'errors',
          query: { days: '7' },
          visualization: { chartType: 'number' }
        },
        layout: { x: 8, y: 0, w: 4, h: 2 }
      },
      {
        title: 'Event Traffic Trend',
        description: 'Volume trendline over the last 30 days',
        insight: {
          name: 'Overview Traffic Trend',
          type: 'trend',
          query: { event: '$pageview', measure: 'count', interval: 'day', days: '30' },
          visualization: { chartType: 'area' }
        },
        layout: { x: 0, y: 2, w: 8, h: 4 }
      },
      {
        title: 'Operating System Split',
        description: 'User operating systems',
        insight: {
          name: 'Overview OS Split',
          type: 'event_breakdown',
          query: { event: '$pageview', breakdown: '$os', days: '30' },
          visualization: { chartType: 'pie' }
        },
        layout: { x: 8, y: 2, w: 4, h: 4 }
      }
    ]
  },
  {
    id: 'performance-reliability',
    name: 'Performance & Reliability',
    description: 'Monitor API latency percentiles, error spikes, slow endpoints, and health.',
    image: '/dashboards/performance.png',
    tags: ['Reliability', 'Latency', 'APIs'],
    widgets: [
      {
        title: 'API Request Latency',
        description: 'p50, p95, and p99 response times',
        insight: {
          name: 'API Latency Performance',
          type: 'api_performance',
          query: { days: '7' },
          visualization: { chartType: 'line' }
        },
        layout: { x: 0, y: 0, w: 8, h: 4 }
      },
      {
        title: 'Service Exceptions & Errors',
        description: 'Top error occurrences',
        insight: {
          name: 'Top Service Exceptions',
          type: 'errors',
          query: { days: '7' },
          visualization: { chartType: 'table' }
        },
        layout: { x: 8, y: 0, w: 4, h: 4 }
      },
      {
        title: 'API Status Code Breakdown',
        description: '2xx vs 4xx vs 5xx distribution',
        insight: {
          name: 'API Status Distribution',
          type: 'api_performance',
          query: { days: '7' },
          visualization: { chartType: 'bar' }
        },
        layout: { x: 0, y: 4, w: 6, h: 4 }
      },
      {
        title: 'Web Traffic Realtime Pulse',
        description: 'Hourly web request pacing',
        insight: {
          name: 'Web Analytics Pacing',
          type: 'web_analytics',
          query: { days: '7' },
          visualization: { chartType: 'area' }
        },
        layout: { x: 6, y: 4, w: 6, h: 4 }
      }
    ]
  },
  {
    id: 'user-analytics',
    name: 'User Analytics',
    description: 'Deep dive into user acquisition, geography, active cohorts, and retention.',
    image: '/dashboards/users.png',
    tags: ['Users', 'Cohorts', 'Geo'],
    widgets: [
      {
        title: 'Unique Active Users (30d)',
        description: 'Daily unique active users trend',
        insight: {
          name: 'Daily Active Users (DAU)',
          type: 'trend',
          query: { event: '$pageview', measure: 'unique', interval: 'day', days: '30' },
          visualization: { chartType: 'line' }
        },
        layout: { x: 0, y: 0, w: 8, h: 4 }
      },
      {
        title: 'User Geographic Distribution',
        description: 'Top visitor countries and regions',
        insight: {
          name: 'Visitor Geography',
          type: 'web_analytics',
          query: { days: '30' },
          visualization: { chartType: 'bar' }
        },
        layout: { x: 8, y: 0, w: 4, h: 4 }
      },
      {
        title: 'Weekly Retention Heatmap',
        description: 'Cohort activity retention',
        insight: {
          name: 'Weekly Cohort Retention',
          type: 'retention',
          query: { weeks: '6' },
          visualization: { chartType: 'retention' }
        },
        layout: { x: 0, y: 4, w: 12, h: 4 }
      }
    ]
  }
];

type DashboardRow = {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  ownerId: string;
  ownerEmail?: string;
  isShared: boolean;
  isPinned: boolean;
  tags: string[] | null;
  filters: Record<string, unknown> | null;
  layout: unknown[] | null;
  definition: DashboardDefinition | null;
  widgetsCount?: number | string;
  createdAt: string;
  updatedAt: string;
};

type WidgetRow = {
  id: string;
  dashboardId: string;
  insightId: string | null;
  title: string | null;
  description: string | null;
  widgetType: string;
  queryOverride: Record<string, unknown> | null;
  visualizationOverride: Record<string, unknown> | null;
  layout: Record<string, unknown> | null;
  position: number;
  insightName?: string | null;
  insightDescription?: string | null;
  insightType?: string | null;
  insightQuery?: Record<string, unknown> | null;
  insightVisualization?: Record<string, unknown> | null;
  insightFilters?: unknown[] | null;
  insightDateConfig?: Record<string, unknown> | null;
  insightTags?: string[] | null;
  insightIsPinned?: boolean;
  insightCreatedByUserId?: string;
  createdAt: string;
  updatedAt: string;
};

type PublicShareRow = {
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

function mapDashboardRow(row: DashboardRow): DashboardView {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    ownerId: row.ownerId,
    ownerEmail: row.ownerEmail,
    isShared: Boolean(row.isShared),
    isPinned: Boolean(row.isPinned),
    tags: Array.isArray(row.tags) ? row.tags : [],
    filters: row.filters ?? {},
    layout: Array.isArray(row.layout) ? row.layout : [],
    definition: row.definition ?? {},
    widgetsCount: Number(row.widgetsCount || 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapWidgetRow(row: WidgetRow): DashboardWidgetView {
  let insight: SavedInsightView | null = null;
  if (row.insightId && row.insightName) {
    insight = {
      id: row.insightId,
      projectId: '',
      name: row.insightName,
      description: row.insightDescription ?? null,
      type: (row.insightType as any) || 'trend',
      query: row.insightQuery ?? {},
      visualization: row.insightVisualization ?? {},
      filters: Array.isArray(row.insightFilters) ? row.insightFilters : [],
      dateConfig: row.insightDateConfig ?? {},
      tags: Array.isArray(row.insightTags) ? row.insightTags : [],
      isPinned: Boolean(row.insightIsPinned),
      createdByUserId: row.insightCreatedByUserId || '',
      usedInDashboardsCount: 1,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  return {
    id: row.id,
    dashboardId: row.dashboardId,
    insightId: row.insightId,
    title: row.title,
    description: row.description,
    widgetType: row.widgetType || 'insight',
    queryOverride: row.queryOverride ?? {},
    visualizationOverride: row.visualizationOverride ?? {},
    layout: row.layout ?? { w: 6, h: 4, x: 0, y: 0 },
    position: row.position,
    insight,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

@Injectable()
export class DashboardsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService,
    private readonly analytics: AnalyticsService,
    private readonly savedInsights: SavedInsightsService
  ) {}

  async listTemplates() {
    return DASHBOARD_TEMPLATES;
  }

  async list(
    user: DashboardUser,
    options?: {
      projectId?: string;
      search?: string;
      tab?: 'all' | 'mine' | 'shared' | 'pinned';
      tag?: string;
    }
  ) {
    const project = await this.projects.resolveActiveProject(user, options?.projectId);
    if (!project) {
      return { project: null, dashboards: [] as DashboardView[] };
    }

    const params: unknown[] = [project.id];
    let whereClause = `WHERE d.project_id = $1 AND (d.owner_id = $2 OR d.is_shared = true)`;
    params.push(user.id);

    if (options?.tab === 'mine') {
      whereClause = `WHERE d.project_id = $1 AND d.owner_id = $2`;
    } else if (options?.tab === 'shared') {
      whereClause = `WHERE d.project_id = $1 AND d.is_shared = true AND d.owner_id != $2`;
    } else if (options?.tab === 'pinned') {
      whereClause += ` AND d.is_pinned = true`;
    }

    if (options?.tag) {
      params.push(options.tag);
      whereClause += ` AND $${params.length} = ANY(d.tags)`;
    }

    if (options?.search?.trim()) {
      params.push(`%${options.search.trim()}%`);
      whereClause += ` AND (d.name ILIKE $${params.length} OR d.description ILIKE $${params.length})`;
    }

    const result = await this.database.query<DashboardRow>(
      `
        SELECT
          d.id,
          d.project_id AS "projectId",
          d.name,
          d.description,
          d.owner_id AS "ownerId",
          d.is_shared AS "isShared",
          d.is_pinned AS "isPinned",
          d.tags,
          d.filters,
          d.layout,
          d.definition,
          d.created_at AS "createdAt",
          d.updated_at AS "updatedAt",
          u.email AS "ownerEmail",
          (SELECT COUNT(*) FROM dashboard_widgets w WHERE w.dashboard_id = d.id) AS "widgetsCount"
        FROM dashboards d
        LEFT JOIN users u ON u.id = d.owner_id
        ${whereClause}
        ORDER BY d.is_pinned DESC, d.updated_at DESC
      `,
      params
    );

    return { project, dashboards: result.rows.map(mapDashboardRow) };
  }

  async get(user: DashboardUser, id: string, projectId?: string): Promise<DashboardView> {
    const project = await this.projects.requireActiveProject(user, projectId);
    const result = await this.database.query<DashboardRow>(
      `
        SELECT
          d.id,
          d.project_id AS "projectId",
          d.name,
          d.description,
          d.owner_id AS "ownerId",
          d.is_shared AS "isShared",
          d.is_pinned AS "isPinned",
          d.tags,
          d.filters,
          d.layout,
          d.definition,
          d.created_at AS "createdAt",
          d.updated_at AS "updatedAt",
          u.email AS "ownerEmail",
          (SELECT COUNT(*) FROM dashboard_widgets w WHERE w.dashboard_id = d.id) AS "widgetsCount"
        FROM dashboards d
        LEFT JOIN users u ON u.id = d.owner_id
        WHERE d.id = $1 AND d.project_id = $2
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

    // Fetch widgets joined with their insights
    const widgetsResult = await this.database.query<WidgetRow>(
      `
        SELECT
          w.id,
          w.dashboard_id AS "dashboardId",
          w.insight_id AS "insightId",
          w.title,
          w.description,
          w.widget_type AS "widgetType",
          w.query_override AS "queryOverride",
          w.visualization_override AS "visualizationOverride",
          w.layout,
          w.position,
          w.created_at AS "createdAt",
          w.updated_at AS "updatedAt",
          i.name AS "insightName",
          i.description AS "insightDescription",
          i.type AS "insightType",
          i.query AS "insightQuery",
          i.visualization AS "insightVisualization",
          i.filters AS "insightFilters",
          i.date_config AS "insightDateConfig",
          i.tags AS "insightTags",
          i.is_pinned AS "insightIsPinned",
          i.created_by_user_id AS "insightCreatedByUserId"
        FROM dashboard_widgets w
        LEFT JOIN insights i ON i.id = w.insight_id
        WHERE w.dashboard_id = $1
        ORDER BY w.position ASC, w.created_at ASC
      `,
      [id]
    );

    const dashboard = mapDashboardRow(row);
    dashboard.widgets = widgetsResult.rows.map(mapWidgetRow);
    return dashboard;
  }

  async create(user: DashboardUser, body: CreateDashboardRequest): Promise<DashboardView> {
    const project = await this.projects.requireWritableProject(user, body.projectId);
    const name = body.name?.trim();
    if (!name) {
      throw new BadRequestException('Dashboard name is required.');
    }

    const id = `dash_${randomUUID()}`;
    const description = body.description?.trim() || null;
    const isShared = body.isShared === true;
    const isPinned = body.isPinned === true;
    const tags = Array.isArray(body.tags) ? body.tags.map((t) => t.trim()).filter(Boolean) : [];
    const filters = body.filters ?? {};
    const layout = Array.isArray(body.layout) ? body.layout : [];
    const definition = body.definition ?? {};

    await this.database.query(
      `
        INSERT INTO dashboards (
          id, project_id, name, description, owner_id, is_shared, is_pinned, tags, filters, layout, definition
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb)
      `,
      [
        id,
        project.id,
        name,
        description,
        user.id,
        isShared,
        isPinned,
        tags,
        JSON.stringify(filters),
        JSON.stringify(layout),
        JSON.stringify(definition)
      ]
    );

    return this.get(user, id, project.id);
  }

  async instantiateTemplate(user: DashboardUser, body: InstantiateTemplateRequest): Promise<DashboardView> {
    const project = await this.projects.requireWritableProject(user, body.projectId);
    const template = DASHBOARD_TEMPLATES.find((t) => t.id === body.templateId);
    if (!template) {
      throw new BadRequestException(`Template '${body.templateId}' not found.`);
    }

    const dashboardName = body.name?.trim() || template.name;
    const dashboardDesc = body.description?.trim() || template.description;
    const dashboardId = `dash_${randomUUID()}`;

    // Create dashboard and its insights & widgets atomically in a transaction
    await this.database.transaction(async (client) => {
      await client.query(
        `
          INSERT INTO dashboards (
            id, project_id, name, description, owner_id, is_shared, is_pinned, tags, filters, layout, definition
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb)
        `,
        [
          dashboardId,
          project.id,
          dashboardName,
          dashboardDesc,
          user.id,
          false,
          false,
          template.tags,
          JSON.stringify({ days: '30' }),
          JSON.stringify([]),
          JSON.stringify({ templateId: template.id })
        ]
      );

      for (let i = 0; i < template.widgets.length; i++) {
        const item = template.widgets[i];
        const insightId = `ins_${randomUUID()}`;

        // 1. Create the reusable insight
        await client.query(
          `
            INSERT INTO insights (
              id, project_id, name, description, type, query, visualization, filters, date_config, tags, is_pinned, created_by_user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12)
          `,
          [
            insightId,
            project.id,
            item.insight.name,
            item.description || null,
            item.insight.type,
            JSON.stringify(item.insight.query),
            JSON.stringify(item.insight.visualization),
            JSON.stringify([]),
            JSON.stringify({ days: '30' }),
            template.tags,
            false,
            user.id
          ]
        );

        // 2. Attach widget referencing the insight
        const widgetId = `wid_${randomUUID()}`;
        await client.query(
          `
            INSERT INTO dashboard_widgets (
              id, dashboard_id, insight_id, title, description, widget_type, layout, position
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
          `,
          [
            widgetId,
            dashboardId,
            insightId,
            item.title,
            item.description || null,
            'insight',
            JSON.stringify(item.layout),
            i
          ]
        );
      }
    });

    return this.get(user, dashboardId, project.id);
  }

  async update(user: DashboardUser, id: string, body: UpdateDashboardRequest): Promise<DashboardView> {
    const project = await this.projects.requireWritableProject(user, body.projectId);
    const existing = await this.get(user, id, project.id);

    if (existing.ownerId !== user.id) {
      throw new ForbiddenException('Only the owner can edit this dashboard.');
    }

    const name = body.name !== undefined ? body.name.trim() : existing.name;
    if (!name) {
      throw new BadRequestException('Dashboard name is required.');
    }

    const description = body.description !== undefined ? body.description.trim() || null : existing.description;
    const isShared = body.isShared !== undefined ? body.isShared === true : existing.isShared;
    const isPinned = body.isPinned !== undefined ? body.isPinned === true : existing.isPinned;
    const tags = body.tags !== undefined ? body.tags : existing.tags;
    const filters = body.filters !== undefined ? body.filters : existing.filters;
    const layout = body.layout !== undefined ? body.layout : existing.layout;
    const definition = body.definition !== undefined ? body.definition : existing.definition;

    await this.database.query(
      `
        UPDATE dashboards
        SET
          name = $3,
          description = $4,
          is_shared = $5,
          is_pinned = $6,
          tags = $7,
          filters = $8::jsonb,
          layout = $9::jsonb,
          definition = $10::jsonb,
          updated_at = now()
        WHERE id = $1 AND project_id = $2
      `,
      [
        id,
        project.id,
        name,
        description,
        isShared,
        isPinned,
        tags,
        JSON.stringify(filters),
        JSON.stringify(layout),
        JSON.stringify(definition)
      ]
    );

    return this.get(user, id, project.id);
  }

  async duplicate(user: DashboardUser, id: string, projectId?: string): Promise<DashboardView> {
    const project = await this.projects.requireWritableProject(user, projectId);
    const source = await this.get(user, id, project.id);

    const newDashboardId = `dash_${randomUUID()}`;

    await this.database.transaction(async (client) => {
      await client.query(
        `
          INSERT INTO dashboards (
            id, project_id, name, description, owner_id, is_shared, is_pinned, tags, filters, layout, definition
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb)
        `,
        [
          newDashboardId,
          project.id,
          `${source.name} (Copy)`,
          source.description,
          user.id,
          false,
          false,
          source.tags,
          JSON.stringify(source.filters),
          JSON.stringify(source.layout),
          JSON.stringify(source.definition)
        ]
      );

      if (source.widgets && source.widgets.length > 0) {
        for (const w of source.widgets) {
          const newWidgetId = `wid_${randomUUID()}`;
          await client.query(
            `
              INSERT INTO dashboard_widgets (
                id, dashboard_id, insight_id, title, description, widget_type, query_override, visualization_override, layout, position
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10)
            `,
            [
              newWidgetId,
              newDashboardId,
              w.insightId, // points to the same reusable insight
              w.title,
              w.description,
              w.widgetType,
              JSON.stringify(w.queryOverride),
              JSON.stringify(w.visualizationOverride),
              JSON.stringify(w.layout),
              w.position
            ]
          );
        }
      }
    });

    return this.get(user, newDashboardId, project.id);
  }

  async remove(user: DashboardUser, id: string, projectId?: string): Promise<{ deleted: boolean }> {
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

  // Widget Operations
  async addWidget(user: DashboardUser, dashboardId: string, body: AddWidgetRequest): Promise<DashboardView> {
    const project = await this.projects.requireWritableProject(user, body.projectId);
    const dashboard = await this.get(user, dashboardId, project.id);

    let insightId = body.insightId || null;

    // If inline newInsight was provided, create it first
    if (!insightId && body.newInsight) {
      const createdInsight = await this.savedInsights.create(user, {
        projectId: project.id,
        name: body.newInsight.name,
        description: body.newInsight.description,
        type: body.newInsight.type as any,
        query: body.newInsight.query,
        visualization: body.newInsight.visualization
      });
      insightId = createdInsight.id;
    }

    const widgetId = `wid_${randomUUID()}`;
    const title = body.title?.trim() || null;
    const description = body.description?.trim() || null;
    const widgetType = body.widgetType || 'insight';
    const queryOverride = body.queryOverride ?? {};
    const visualizationOverride = body.visualizationOverride ?? {};
    const layout = body.layout ?? { w: 6, h: 4, x: 0, y: 0 };
    const position = body.position !== undefined ? body.position : (dashboard.widgets?.length || 0);

    await this.database.query(
      `
        INSERT INTO dashboard_widgets (
          id, dashboard_id, insight_id, title, description, widget_type, query_override, visualization_override, layout, position
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10)
      `,
      [
        widgetId,
        dashboardId,
        insightId,
        title,
        description,
        widgetType,
        JSON.stringify(queryOverride),
        JSON.stringify(visualizationOverride),
        JSON.stringify(layout),
        position
      ]
    );

    return this.get(user, dashboardId, project.id);
  }

  async updateWidget(
    user: DashboardUser,
    dashboardId: string,
    widgetId: string,
    body: UpdateWidgetRequest
  ): Promise<DashboardView> {
    const project = await this.projects.requireWritableProject(user, body.projectId);
    await this.get(user, dashboardId, project.id);

    const existingWidget = await this.database.query<WidgetRow>(
      `SELECT * FROM dashboard_widgets WHERE id = $1 AND dashboard_id = $2`,
      [widgetId, dashboardId]
    );
    const row = existingWidget.rows[0];
    if (!row) {
      throw new NotFoundException('Widget not found.');
    }

    const title = body.title !== undefined ? (body.title?.trim() || null) : row.title;
    const description = body.description !== undefined ? (body.description?.trim() || null) : row.description;
    const queryOverride = body.queryOverride !== undefined ? body.queryOverride : row.queryOverride;
    const visualizationOverride = body.visualizationOverride !== undefined ? body.visualizationOverride : row.visualizationOverride;
    const layout = body.layout !== undefined ? body.layout : row.layout;
    const position = body.position !== undefined ? body.position : row.position;

    await this.database.query(
      `
        UPDATE dashboard_widgets
        SET
          title = $3,
          description = $4,
          query_override = $5::jsonb,
          visualization_override = $6::jsonb,
          layout = $7::jsonb,
          position = $8,
          updated_at = now()
        WHERE id = $1 AND dashboard_id = $2
      `,
      [
        widgetId,
        dashboardId,
        title,
        description,
        JSON.stringify(queryOverride ?? {}),
        JSON.stringify(visualizationOverride ?? {}),
        JSON.stringify(layout ?? {}),
        position
      ]
    );

    return this.get(user, dashboardId, project.id);
  }

  async removeWidget(user: DashboardUser, dashboardId: string, widgetId: string, projectId?: string): Promise<DashboardView> {
    const project = await this.projects.requireWritableProject(user, projectId);
    await this.get(user, dashboardId, project.id);

    const result = await this.database.query(
      `DELETE FROM dashboard_widgets WHERE id = $1 AND dashboard_id = $2`,
      [widgetId, dashboardId]
    );
    if (result.rowCount === 0) {
      throw new NotFoundException('Widget not found.');
    }

    return this.get(user, dashboardId, project.id);
  }

  async updateLayout(
    user: DashboardUser,
    dashboardId: string,
    widgets: Array<{ id: string; layout: Record<string, unknown>; position?: number }>,
    projectId?: string
  ): Promise<DashboardView> {
    const project = await this.projects.requireWritableProject(user, projectId);
    await this.get(user, dashboardId, project.id);

    if (Array.isArray(widgets) && widgets.length > 0) {
      await this.database.transaction(async (client) => {
        for (let i = 0; i < widgets.length; i++) {
          const item = widgets[i];
          const pos = item.position !== undefined ? item.position : i;
          await client.query(
            `
              UPDATE dashboard_widgets
              SET layout = $3::jsonb, position = $4, updated_at = now()
              WHERE id = $1 AND dashboard_id = $2
            `,
            [item.id, dashboardId, JSON.stringify(item.layout || {}), pos]
          );
        }
      });
    }

    return this.get(user, dashboardId, project.id);
  }

  // Public Sharing Operations
  async listPublicShares(user: DashboardUser, dashboardId: string, projectId?: string) {
    const dashboard = await this.requireOwnedDashboard(user, dashboardId, projectId);
    const result = await this.database.query<PublicShareRow>(
      `SELECT id, dashboard_id AS "dashboardId", permissions, expires_at AS "expiresAt",
        created_at AS "createdAt", last_accessed_at AS "lastAccessedAt"
       FROM public_dashboard_shares
       WHERE dashboard_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC`,
      [dashboard.id]
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
       WHERE id = $1 AND dashboard_id = $2 AND revoked_at IS NULL`,
      [shareId, dashboard.id]
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
      const value = (key: string) => (typeof definition[key] === 'string' ? (definition[key] as string) : undefined);
      trends = await this.analytics.getTrends(
        { id: share.ownerId },
        {
          event: value('event'),
          interval: value('interval'),
          days: value('days'),
          from: value('from'),
          to: value('to'),
          breakdown: value('breakdown'),
          measure: value('measure'),
          property: value('property'),
          filters: value('filters'),
          projectId: share.projectId
        }
      );
    }
    return {
      name: share.dashboardName,
      permissions: share.permissions,
      expiresAt: share.expiresAt,
      definition: share.permissions.includes('definition') ? definition : undefined,
      summary: share.permissions.includes('summary') ? trends?.summary ?? null : undefined,
      chart:
        share.permissions.includes('chart') && trends
          ? {
              event: trends.event,
              interval: trends.interval,
              measure: trends.measure,
              property: trends.property,
              breakdown: trends.breakdown,
              buckets: trends.buckets,
              series: trends.series
            }
          : undefined
    };
  }

  private async requireOwnedDashboard(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const result = await this.database.query<{ id: string; ownerId: string }>(
      `SELECT id, owner_id AS "ownerId" FROM dashboards WHERE id = $1 AND project_id = $2`,
      [id, project.id]
    );
    const dashboard = result.rows[0];
    if (!dashboard) throw new NotFoundException('Dashboard not found.');
    if (dashboard.ownerId !== user.id) throw new ForbiddenException('Only the owner can manage public links.');
    return dashboard;
  }

  private normalizeSharePermissions(raw: unknown): PublicSharePermission[] {
    if (!Array.isArray(raw)) throw new BadRequestException('Select at least one public-share permission.');
    const permissions = [
      ...new Set(
        raw.filter((item): item is PublicSharePermission =>
          typeof item === 'string' && PUBLIC_SHARE_PERMISSIONS.includes(item as PublicSharePermission)
        )
      )
    ];
    if (permissions.length === 0 || permissions.length !== raw.length)
      throw new BadRequestException('Public-share permissions are invalid.');
    return permissions;
  }

  private normalizeExpiry(raw: unknown): string | null {
    if (raw === undefined || raw === null || raw === '') return null;
    if (typeof raw !== 'string') throw new BadRequestException('Expiry must be an ISO timestamp.');
    const date = new Date(raw);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now())
      throw new BadRequestException('Expiry must be in the future.');
    return date.toISOString();
  }

  private hashShareToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
