import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SavedInsightsService } from './saved-insights.service';

describe('SavedInsightsService', () => {
  let service: SavedInsightsService;
  let mockDatabase: any;
  let mockProjects: any;
  let mockAnalytics: any;
  let mockFunnels: any;
  let mockErrors: any;

  const mockUser = {
    id: 'user-1',
    email: 'user@example.com',
    role: 'owner',
    scopes: ['insights:read', 'insights:write']
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
      getTrends: vi.fn().mockResolvedValue({
        event: 'letter_published',
        interval: 'day',
        measure: 'count',
        buckets: ['2026-09-01', '2026-09-02'],
        series: [{ key: 'all', points: [{ bucket: '2026-09-01', total: 10, value: 10 }] }],
        summary: { current: 100, previous: 80, days: 30 }
      }),
      getWebAnalytics: vi.fn().mockResolvedValue({ visitors: 500, pageviews: 2000 }),
      getApiPerformance: vi.fn().mockResolvedValue({ totalRequests: 1000, errorRate: 0.5, p95: 120 })
    };

    mockFunnels = {
      getResults: vi.fn().mockResolvedValue({
        funnel: { id: 'funnel-1', name: 'Letter Funnel' },
        days: 30,
        steps: [
          { order: 1, eventName: 'letter_viewed', count: 100, conversionFromStart: 1.0, conversionFromPrevious: 1.0, droppedFromPrevious: 0 },
          { order: 2, eventName: 'letter_published', count: 45, conversionFromStart: 0.45, conversionFromPrevious: 0.45, droppedFromPrevious: 55 }
        ]
      })
    };

    mockErrors = {
      listIssues: vi.fn().mockResolvedValue({
        issues: [{ type: 'TypeError', message: 'Cannot read properties of null', occurrences: 12 }]
      })
    };

    service = new SavedInsightsService(
      mockDatabase,
      mockProjects,
      mockAnalytics,
      mockFunnels,
      mockErrors
    );
  });

  describe('create', () => {
    it('creates and returns a new saved insight with project scoping', async () => {
      mockDatabase.query.mockResolvedValueOnce([
        {
          id: 'insight-123',
          project_id: 'proj-unsaid',
          name: 'Letters Published',
          description: 'Daily volume of letters created',
          type: 'trend',
          query: { event: 'letter_published', measure: 'count' },
          visualization: { chartType: 'line' },
          filters: [],
          date_config: { days: '30' },
          tags: ['letters', 'publishing'],
          is_pinned: false,
          created_by_user_id: 'user-1',
          created_by_user_email: 'user@example.com',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]);

      const result = await service.create(mockUser as any, {
        name: 'Letters Published',
        description: 'Daily volume of letters created',
        type: 'trend',
        query: { event: 'letter_published', measure: 'count' },
        tags: ['letters', 'publishing'],
        projectId: 'proj-unsaid'
      });

      expect(mockProjects.resolveActiveProject).toHaveBeenCalledWith(mockUser, 'proj-unsaid');
      expect(result.name).toBe('Letters Published');
      expect(result.projectId).toBe('proj-unsaid');
      expect(result.tags).toEqual(['letters', 'publishing']);
    });
  });

  describe('update', () => {
    it('updates existing insight and returns updated view', async () => {
      // Mock existing get
      mockDatabase.query
        .mockResolvedValueOnce([
          {
            id: 'insight-123',
            project_id: 'proj-unsaid',
            name: 'Letters Published',
            description: 'Original desc',
            type: 'trend',
            query: { event: 'letter_published' },
            visualization: {},
            filters: [],
            date_config: {},
            tags: [],
            is_pinned: false,
            created_by_user_id: 'user-1',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ])
        // Mock update
        .mockResolvedValueOnce([
          {
            id: 'insight-123',
            project_id: 'proj-unsaid',
            name: 'Letters Published (Updated)',
            description: 'Updated desc',
            type: 'trend',
            query: { event: 'letter_published', measure: 'unique' },
            visualization: {},
            filters: [],
            date_config: {},
            tags: ['core'],
            is_pinned: true,
            created_by_user_id: 'user-1',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]);

      const result = await service.update(mockUser as any, 'insight-123', {
        name: 'Letters Published (Updated)',
        description: 'Updated desc',
        query: { event: 'letter_published', measure: 'unique' },
        isPinned: true
      });

      expect(result.name).toBe('Letters Published (Updated)');
      expect(result.isPinned).toBe(true);
    });
  });

  describe('duplicate', () => {
    it('duplicates existing insight with Copy name', async () => {
      mockDatabase.query
        .mockResolvedValueOnce([
          {
            id: 'insight-123',
            project_id: 'proj-unsaid',
            name: 'Letters Published',
            description: 'Original desc',
            type: 'trend',
            query: { event: 'letter_published' },
            visualization: {},
            filters: [],
            date_config: {},
            tags: ['letters'],
            is_pinned: false,
            created_by_user_id: 'user-1',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ])
        .mockResolvedValueOnce([
          {
            id: 'insight-duplicated',
            project_id: 'proj-unsaid',
            name: 'Letters Published (Copy)',
            description: 'Original desc',
            type: 'trend',
            query: { event: 'letter_published' },
            visualization: {},
            filters: [],
            date_config: {},
            tags: ['letters'],
            is_pinned: false,
            created_by_user_id: 'user-1',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]);

      const result = await service.duplicate(mockUser as any, 'insight-123', 'proj-unsaid');
      expect(result.name).toBe('Letters Published (Copy)');
    });
  });

  describe('delete', () => {
    it('deletes insight if project matches', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rowCount: 1 });
      const result = await service.remove(mockUser as any, 'insight-123', 'proj-unsaid');
      expect(result.deleted).toBe(true);
    });
  });

  describe('executeQuery', () => {
    it('executes trend query calculation against analytics service', async () => {
      const result: any = await service.executeQuery(mockUser as any, {
        type: 'trend',
        query: { event: 'letter_published', measure: 'count', days: '30' },
        projectId: 'proj-unsaid'
      });

      expect(mockAnalytics.getTrends).toHaveBeenCalled();
      expect(result.data.summary.current).toBe(100);
    });

    it('executes funnel calculation through funnels service', async () => {
      const result: any = await service.executeQuery(mockUser as any, {
        type: 'funnel',
        query: { funnelId: 'funnel-1', days: '30' },
        projectId: 'proj-unsaid'
      });

      expect(mockFunnels.getResults).toHaveBeenCalled();
      expect(result.data.steps.length).toBe(2);
    });
  });
});
