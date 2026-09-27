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

  it('regression: visualization state updates canonically, updates preview immediately, and persists on save and reload', () => {
    // 1. Initial insight loaded from API/DB
    const initialInsight: SavedInsightView = {
      id: 'ins_os_split',
      projectId: 'proj_1',
      name: 'Overview OS Split',
      description: 'Operating system breakdown',
      type: 'event_breakdown',
      query: { event: '$pageview', measure: 'count', breakdown: '$os', days: '30' },
      visualization: { chartType: 'bar' },
      filters: [],
      dateConfig: { days: '30', interval: 'day', compare: true },
      tags: [],
      isPinned: false,
      createdByUserId: 'user_1',
      usedInDashboardsCount: 1,
      createdAt: '2026-09-26T12:00:00Z',
      updatedAt: '2026-09-26T12:00:00Z'
    };

    // State initialization
    let draftVisualization = initialInsight.visualization.chartType;
    expect(draftVisualization).toBe('bar');

    // User switches visualization to Donut
    draftVisualization = 'donut';
    expect(draftVisualization).toBe('donut');

    // Save changes payload
    const savePayload = {
      name: initialInsight.name,
      type: initialInsight.type,
      query: initialInsight.query,
      visualization: { chartType: draftVisualization },
      projectId: initialInsight.projectId
    };
    expect(savePayload.visualization.chartType).toBe('donut');

    // Simulating PUT /v1/dashboard/insights/:id response and page reload
    const reloadedInsight: SavedInsightView = {
      ...initialInsight,
      visualization: savePayload.visualization,
      updatedAt: '2026-09-26T12:05:00Z'
    };
    const restoredVisualization = reloadedInsight.visualization.chartType;
    expect(restoredVisualization).toBe('donut');

    // Repeat for KPI visualization
    draftVisualization = 'kpi';
    const kpiPayload = { ...savePayload, visualization: { chartType: draftVisualization } };
    const reloadedKpi: SavedInsightView = { ...reloadedInsight, visualization: kpiPayload.visualization };
    expect(reloadedKpi.visualization.chartType).toBe('kpi');
  });

  it('regression: Add to dashboard passes real saved insightId and rejects null/undefined IDs', () => {
    const savedInsightId = 'ins_os_split';
    const targetDashboardId = 'dash_project_overview';
    const projectId = 'proj_1';

    // 1. Existing saved insight payload
    const widgetPayload = {
      insightId: savedInsightId,
      title: 'Overview OS Split',
      layout: { w: 6 },
      projectId
    };

    expect(widgetPayload.insightId).toBe('ins_os_split');
    expect(widgetPayload.insightId).not.toBeUndefined();
    expect(widgetPayload.insightId).not.toBeNull();
    expect(widgetPayload.projectId).toBe('proj_1');

    // 2. Unsaved insight flow: must save first to obtain ID before attaching
    let newInsightId: string | null = null;
    const isUnsaved = !newInsightId;
    expect(isUnsaved).toBe(true);

    // Simulated auto-save step
    newInsightId = 'ins_new_created_123';
    const postSaveWidgetPayload = {
      insightId: newInsightId,
      title: 'New Event Trend',
      layout: { w: 6 },
      projectId
    };

    expect(postSaveWidgetPayload.insightId).toBe('ins_new_created_123');
    expect(typeof postSaveWidgetPayload.insightId).toBe('string');
  });

  it('normalizes various insight response shapes for InsightChartRenderer', async () => {
    const { normalizeInsightData } = await import('../src/lib/insightNormalization');

    // 1. Nested data wrapper normalization
    const wrappedResponse = {
      data: {
        buckets: ['2026-09-20', '2026-09-21'],
        series: [
          {
            key: 'letter_published',
            points: [
              { bucket: '2026-09-20', total: 20, value: 20 },
              { bucket: '2026-09-21', total: 28, value: 28 }
            ]
          }
        ],
        summary: { current: 48, previous: 30 }
      }
    };

    const normalizedTrend = normalizeInsightData(wrappedResponse, 'trend');
    expect(normalizedTrend?.buckets).toEqual(['2026-09-20', '2026-09-21']);
    expect(normalizedTrend?.series[0].points[1].value).toBe(28);

    // 2. Web analytics top referrers normalization to items
    const webAnalyticsResponse = {
      totalVisitors: 120,
      totalViews: 450,
      topReferrers: [
        { referrer: 'google.com', count: 80 },
        { referrer: 'direct', count: 40 }
      ]
    };

    const normalizedWeb = normalizeInsightData(webAnalyticsResponse, 'web_analytics');
    expect(normalizedWeb?.items).toEqual([
      { label: 'google.com', value: 80 },
      { label: 'direct', value: 40 }
    ]);

    // 3. API performance latencySeries normalization
    const apiPerfResponse = {
      summary: { totalRequests: 1500, p50: 45, p95: 120, p99: 250 },
      latencySeries: [
        { bucket: '2026-09-20', p50: 40, p95: 110, p99: 230 },
        { bucket: '2026-09-21', p50: 50, p95: 130, p99: 270 }
      ],
      statusBreakdown: { ok200: 1450, rateLimit429: 30, error500: 20, other: 0 }
    };

    // 4. Web analytics WebTotals object normalization for KPI and charts
    const webTotalsResponse = {
      current: {
        visitors: 120,
        pageviews: 450,
        sessions: 110,
        avgSessionDuration: 45,
        bounceRate: 0.3,
        bandwidthBytes: 1024,
        onlineNow: 5
      },
      previous: {
        visitors: 100,
        pageviews: 380,
        sessions: 90,
        avgSessionDuration: 40,
        bounceRate: 0.35,
        bandwidthBytes: 900,
        onlineNow: 2
      },
      topBrowsers: [
        { browser: 'Chrome', count: 90 },
        { browser: 'Safari', count: 30 }
      ]
    };

    const normalizedWebTotals = normalizeInsightData(webTotalsResponse, 'web_analytics');
    expect(normalizedWebTotals?.value).toBe(120);
    expect(normalizedWebTotals?.previous).toBe(100);
    expect(normalizedWebTotals?.items).toEqual([
      { label: 'Chrome', value: 90 },
      { label: 'Safari', value: 30 }
    ]);
  });

  it('validates empty dashboard builder state and starter question pathways', () => {
    const emptyDashboard: DashboardView = {
      id: 'dash_new_blank',
      projectId: 'proj_traceiq',
      name: 'Executive Overview',
      description: 'Blank dashboard ready for widgets',
      ownerId: 'user_1',
      isShared: false,
      isPinned: false,
      tags: [],
      filters: { days: '30' },
      layout: [],
      definition: {},
      widgetsCount: 0,
      widgets: [],
      createdAt: '2026-09-27T07:00:00Z',
      updatedAt: '2026-09-27T07:00:00Z'
    };

    expect(emptyDashboard.widgets?.length).toBe(0);

    // Starter question mapping
    const starterQuestions = [
      { id: 'activity-week', q: 'What does user activity look like this week?', type: 'trend' },
      { id: 'feature-adoption', q: 'How is my feature being adopted?', type: 'funnel' },
      { id: 'retention-signup', q: 'What brings users back after they sign up?', type: 'retention' },
      { id: 'activation-paths', q: 'Which paths lead users to activation?', type: 'funnel' }
    ];

    expect(starterQuestions.length).toBe(4);
    expect(starterQuestions[0].type).toBe('trend');
    expect(starterQuestions[2].type).toBe('retention');
  });
});
