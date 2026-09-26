import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardsService, DASHBOARD_TEMPLATES } from './dashboards.service';

describe('DashboardsService', () => {
  let service: DashboardsService;
  let mockDatabase: any;
  let mockProjects: any;
  let mockAnalytics: any;
  let mockSavedInsights: any;

  const mockUser = {
    id: 'user-1',
    email: 'user@example.com',
    role: 'owner',
    scopes: ['dashboards:read', 'dashboards:write']
  };

  const mockProject = {
    id: 'proj-unsaid',
    name: 'Unsaid',
    organizationId: 'org-1'
  };

  beforeEach(() => {
    mockDatabase = {
      query: vi.fn(),
      withTransaction: vi.fn(async (cb) => cb(mockDatabase))
    };

    mockProjects = {
      resolveActiveProject: vi.fn().mockResolvedValue(mockProject)
    };

    mockAnalytics = {
      getTrends: vi.fn()
    };

    mockSavedInsights = {
      create: vi.fn().mockResolvedValue({
        insight: {
          id: 'insight-created-1',
          name: 'Active Users',
          type: 'trend'
        }
      })
    };

    service = new DashboardsService(
      mockDatabase,
      mockProjects,
      mockAnalytics,
      mockSavedInsights
    );
  });

  describe('listTemplates', () => {
    it('returns the 5 configured templates with valid images and widget definitions', async () => {
      const templates = await service.listTemplates();
      expect(templates.length).toBe(5);

      const templateIds = templates.map((t) => t.id);
      expect(templateIds).toContain('product-analytics');
      expect(templateIds).toContain('funnels-growth');
      expect(templateIds).toContain('project-overview');
      expect(templateIds).toContain('performance-reliability');
      expect(templateIds).toContain('user-analytics');

      // Verify each template references its corresponding image artwork
      const productTpl = templates.find((t) => t.id === 'product-analytics');
      expect(productTpl?.image).toBe('/dashboards/analytics.png');
      expect(productTpl?.widgets.length).toBeGreaterThan(0);

      const funnelTpl = templates.find((t) => t.id === 'funnels-growth');
      expect(funnelTpl?.image).toBe('/dashboards/funnel.png');

      const overviewTpl = templates.find((t) => t.id === 'project-overview');
      expect(overviewTpl?.image).toBe('/dashboards/overview.png');

      const perfTpl = templates.find((t) => t.id === 'performance-reliability');
      expect(perfTpl?.image).toBe('/dashboards/performance.png');

      const userTpl = templates.find((t) => t.id === 'user-analytics');
      expect(userTpl?.image).toBe('/dashboards/users.png');
    });
  });

  describe('instantiateTemplate', () => {
    it('instantiates Product Analytics template by creating reusable insights and dashboard widgets', async () => {
      // Mock dashboard insert
      mockDatabase.query.mockResolvedValueOnce([
        {
          id: 'dash-tpl-1',
          project_id: 'proj-unsaid',
          name: 'Product Analytics',
          description: 'Understand active users...',
          owner_id: 'user-1',
          is_shared: false,
          is_pinned: false,
          tags: ['product'],
          filters: {},
          layout: [],
          definition: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]);

      // Mock widget inserts
      mockDatabase.query.mockResolvedValue([
        {
          id: 'widget-1',
          dashboard_id: 'dash-tpl-1',
          insight_id: 'insight-created-1',
          title: 'Active Users (30d)',
          widget_type: 'trend',
          query_override: {},
          visualization_override: {},
          layout: { w: 6 },
          position: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]);

      const result = await service.instantiateTemplate(mockUser as any, {
        templateId: 'product-analytics',
        projectId: 'proj-unsaid'
      });

      expect(mockSavedInsights.create).toHaveBeenCalled();
      expect(result.name).toBe('Product Analytics');
      expect(result.projectId).toBe('proj-unsaid');
    });
  });

  describe('create blank dashboard', () => {
    it('creates an empty dashboard from scratch', async () => {
      mockDatabase.query.mockResolvedValueOnce([
        {
          id: 'dash-blank-1',
          project_id: 'proj-unsaid',
          name: 'Executive Dashboard',
          description: 'Key business metrics',
          owner_id: 'user-1',
          is_shared: false,
          is_pinned: false,
          tags: ['exec'],
          filters: {},
          layout: [],
          definition: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]);

      const result = await service.create(mockUser as any, {
        name: 'Executive Dashboard',
        description: 'Key business metrics',
        tags: ['exec'],
        projectId: 'proj-unsaid'
      });

      expect(result.name).toBe('Executive Dashboard');
      expect(result.projectId).toBe('proj-unsaid');
    });
  });

  describe('addWidget & layout', () => {
    it('adds an existing insight widget to dashboard', async () => {
      // Mock existing dashboard get
      mockDatabase.query
        .mockResolvedValueOnce([
          {
            id: 'dash-1',
            project_id: 'proj-unsaid',
            name: 'Main Board',
            owner_id: 'user-1',
            is_shared: false,
            is_pinned: false,
            tags: [],
            filters: {},
            layout: [],
            definition: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ])
        // Mock widget insert
        .mockResolvedValueOnce([
          {
            id: 'widget-101',
            dashboard_id: 'dash-1',
            insight_id: 'insight-existing',
            title: 'Weekly Letters Published',
            widget_type: 'trend',
            query_override: {},
            visualization_override: {},
            layout: { w: 6 },
            position: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]);

      const result = await service.addWidget(mockUser as any, 'dash-1', {
        insightId: 'insight-existing',
        title: 'Weekly Letters Published',
        layout: { w: 6 },
        projectId: 'proj-unsaid'
      });

      expect(result.id).toBe('dash-1');
    });

    it('updates widget layout (resizing width)', async () => {
      mockDatabase.query
        // Mock dashboard get
        .mockResolvedValueOnce([
          {
            id: 'dash-1',
            project_id: 'proj-unsaid',
            name: 'Main Board',
            owner_id: 'user-1',
            is_shared: false,
            is_pinned: false,
            tags: [],
            filters: {},
            layout: [],
            definition: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ])
        // Mock widget update
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'widget-101',
              dashboard_id: 'dash-1',
              insight_id: 'insight-existing',
              title: 'Weekly Letters Published',
              widget_type: 'trend',
              query_override: {},
              visualization_override: {},
              layout: { w: 12 },
              position: 0,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }
          ]
        });

      const result = await service.updateWidget(mockUser as any, 'dash-1', 'widget-101', {
        layout: { w: 12 },
        projectId: 'proj-unsaid'
      });

      expect(result.id).toBe('dash-1');
    });
  });

  describe('delete widget', () => {
    it('removes widget from dashboard', async () => {
      mockDatabase.query
        .mockResolvedValueOnce([
          {
            id: 'dash-1',
            project_id: 'proj-unsaid',
            name: 'Main Board',
            owner_id: 'user-1',
            is_shared: false,
            is_pinned: false,
            tags: [],
            filters: {},
            layout: [],
            definition: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ])
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await service.removeWidget(mockUser as any, 'dash-1', 'widget-101', 'proj-unsaid');
      expect(result.id).toBe('dash-1');
    });
  });
});
