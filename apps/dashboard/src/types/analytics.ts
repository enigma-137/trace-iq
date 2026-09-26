export type InsightType =
  | 'trend'
  | 'kpi'
  | 'funnel'
  | 'retention'
  | 'event_breakdown'
  | 'user_metric'
  | 'web_analytics'
  | 'revenue'
  | 'error_metric'
  | 'api_performance'
  | 'web_vitals'
  | 'feature_adoption'
  | 'table';

export type VisualizationType =
  | 'line'
  | 'bar'
  | 'area'
  | 'donut'
  | 'pie'
  | 'kpi'
  | 'funnel'
  | 'retention'
  | 'table';

export interface InsightDateConfig {
  days?: string;
  interval?: 'hour' | 'day' | 'week';
  from?: string;
  to?: string;
  compare?: boolean;
  [key: string]: any;
}

export interface InsightVisualizationConfig {
  chartType?: VisualizationType;
  type?: string;
  showLegend?: boolean;
  stacked?: boolean;
  unit?: string;
  precision?: number;
  colorScheme?: string;
  [key: string]: any;
}

export interface SavedInsightView {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  type: InsightType;
  query: Record<string, any>;
  visualization: InsightVisualizationConfig;
  filters: any[];
  dateConfig: InsightDateConfig;
  tags: string[];
  isPinned: boolean;
  createdByUserId: string;
  createdByUserEmail?: string;
  usedInDashboardsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInsightPayload {
  name: string;
  description?: string;
  type?: InsightType;
  query?: Record<string, any>;
  visualization?: InsightVisualizationConfig;
  filters?: any[];
  dateConfig?: InsightDateConfig;
  tags?: string[];
  isPinned?: boolean;
  projectId?: string;
}

export interface UpdateInsightPayload {
  name?: string;
  description?: string;
  type?: InsightType;
  query?: Record<string, any>;
  visualization?: InsightVisualizationConfig;
  filters?: any[];
  dateConfig?: InsightDateConfig;
  tags?: string[];
  isPinned?: boolean;
  projectId?: string;
}

export interface ExecuteInsightQueryPayload {
  insightId?: string;
  type?: InsightType;
  query?: Record<string, any>;
  visualization?: InsightVisualizationConfig;
  filters?: any[];
  dateConfig?: InsightDateConfig;
  globalOverrides?: {
    days?: string;
    from?: string;
    to?: string;
    interval?: string;
    filters?: any;
  };
  projectId?: string;
}

export interface DashboardWidgetLayout {
  w?: number; // 4 (1/3), 6 (1/2), 8 (2/3), 12 (full)
  h?: number;
  colSpan?: number;
  [key: string]: any;
}

export interface DashboardWidgetView {
  id: string;
  dashboardId: string;
  insightId: string | null;
  title: string | null;
  description: string | null;
  widgetType: string;
  queryOverride: Record<string, any>;
  visualizationOverride: Record<string, any>;
  layout: DashboardWidgetLayout;
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
  filters: {
    days?: string;
    from?: string;
    to?: string;
    interval?: string;
    [key: string]: any;
  };
  layout: any[];
  definition: Record<string, any>;
  widgetsCount: number;
  widgets?: DashboardWidgetView[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateDashboardPayload {
  name: string;
  description?: string;
  isShared?: boolean;
  isPinned?: boolean;
  tags?: string[];
  filters?: Record<string, any>;
  layout?: any[];
  definition?: Record<string, any>;
  projectId?: string;
}

export interface UpdateDashboardPayload {
  name?: string;
  description?: string;
  isShared?: boolean;
  isPinned?: boolean;
  tags?: string[];
  filters?: Record<string, any>;
  layout?: any[];
  definition?: Record<string, any>;
  projectId?: string;
}

export interface AddWidgetPayload {
  insightId?: string;
  title?: string;
  description?: string;
  widgetType?: string;
  queryOverride?: Record<string, any>;
  visualizationOverride?: Record<string, any>;
  layout?: DashboardWidgetLayout;
  position?: number;
  newInsight?: {
    name: string;
    description?: string;
    type: InsightType;
    query: Record<string, any>;
    visualization: Record<string, any>;
    filters?: any[];
    dateConfig?: Record<string, any>;
  };
  projectId?: string;
}

export interface UpdateWidgetPayload {
  title?: string;
  description?: string;
  queryOverride?: Record<string, any>;
  visualizationOverride?: Record<string, any>;
  layout?: DashboardWidgetLayout;
  position?: number;
  projectId?: string;
}

export interface DashboardTemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  image: string;
  badge: string;
  widgets: Array<{
    title: string;
    description?: string;
    type: InsightType;
    chartType: VisualizationType;
    layout: DashboardWidgetLayout;
    query: Record<string, any>;
    visualization?: Record<string, any>;
    filters?: any[];
    dateConfig?: Record<string, any>;
  }>;
}
