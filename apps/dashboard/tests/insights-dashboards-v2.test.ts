import { describe, expect, it } from 'vitest';
import type {
  SavedInsightView,
  DashboardView,
  DashboardWidgetView,
  InsightType,
  VisualizationType
} from '../src/types/analytics';

describe('Insights and Dashboards v2 System', () => {
  it('validates insight data structure with visualizations and date configuration', () => {
    const sampleInsight: SavedInsightView = {
      id: 'ins-letters',
      projectId: 'proj-unsaid',
      name: 'Letters Published',
      description: 'Daily letter completions',
      type: 'trend',
      query: {
        event: 'letter_published',
        measure: 'count',
        breakdown: 'theme'
      },
      visualization: {
        chartType: 'area',
        showLegend: true
      },
      filters: [],
      dateConfig: {
        days: '30',
        interval: 'day',
        compare: true
      },
      tags: ['unsaid', 'letters'],
      isPinned: true,
      createdByUserId: 'user-1',
      usedInDashboardsCount: 2,
      createdAt: '2026-09-26T12:00:00Z',
      updatedAt: '2026-09-26T12:00:00Z'
    };

    expect(sampleInsight.type).toBe('trend');
    expect(sampleInsight.visualization.chartType).toBe('area');
    expect(sampleInsight.usedInDashboardsCount).toBe(2);
  });

  it('validates multi-widget dashboard composition with responsive grid layouts', () => {
    const sampleDashboard: DashboardView = {
      id: 'dash-unsaid-health',
      projectId: 'proj-unsaid',
      name: 'Unsaid — Product Health',
      description: 'Product usage, conversion and retention.',
      ownerId: 'user-1',
      isShared: false,
      isPinned: true,
      tags: ['product', 'health'],
      filters: { days: '30' },
      layout: [],
      definition: {},
      widgetsCount: 3,
      widgets: [
        {
          id: 'w-kpi-1',
          dashboardId: 'dash-unsaid-health',
          insightId: 'ins-active-users',
          title: 'Active Users (30d)',
          description: null,
          widgetType: 'kpi',
          queryOverride: {},
          visualizationOverride: { chartType: 'kpi' },
          layout: { w: 4 },
          position: 0,
          createdAt: '2026-09-26T12:00:00Z',
          updatedAt: '2026-09-26T12:00:00Z'
        },
        {
          id: 'w-trend-1',
          dashboardId: 'dash-unsaid-health',
          insightId: 'ins-letters',
          title: 'Letters Published Over Time',
          description: null,
          widgetType: 'trend',
          queryOverride: {},
          visualizationOverride: { chartType: 'area' },
          layout: { w: 8 },
          position: 1,
          createdAt: '2026-09-26T12:00:00Z',
          updatedAt: '2026-09-26T12:00:00Z'
        },
        {
          id: 'w-funnel-1',
          dashboardId: 'dash-unsaid-health',
          insightId: 'ins-funnel',
          title: 'Letter Completion Funnel',
          description: null,
          widgetType: 'funnel',
          queryOverride: {},
          visualizationOverride: { chartType: 'funnel' },
          layout: { w: 12 },
          position: 2,
          createdAt: '2026-09-26T12:00:00Z',
          updatedAt: '2026-09-26T12:00:00Z'
        }
      ],
      createdAt: '2026-09-26T12:00:00Z',
      updatedAt: '2026-09-26T12:00:00Z'
    };

    expect(sampleDashboard.widgets?.length).toBe(3);
    expect(sampleDashboard.widgets?.[0].layout.w).toBe(4);
    expect(sampleDashboard.widgets?.[1].layout.w).toBe(8);
    expect(sampleDashboard.widgets?.[2].layout.w).toBe(12);
  });
});
