import { describe, expect, it, beforeEach } from 'vitest';
import {
  topNavItems,
  navGroups,
  navItems,
  bottomNavItems,
  allNavItems,
  findGroupForActiveItem,
  withProjectId
} from '../src/app/dashboard/nav';

describe('Sidebar Grouped Navigation Structure & Routing', () => {
  const storageMock: Record<string, string> = {};

  beforeEach(() => {
    for (const key of Object.keys(storageMock)) {
      delete storageMock[key];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).localStorage = {
      getItem: (key: string) => storageMock[key] ?? null,
      setItem: (key: string, value: string) => {
        storageMock[key] = value;
      },
      removeItem: (key: string) => {
        delete storageMock[key];
      },
      clear: () => {
        for (const key of Object.keys(storageMock)) {
          delete storageMock[key];
        }
      }
    };
  });

  it('maintains top standalone Overview item', () => {
    expect(topNavItems).toHaveLength(1);
    expect(topNavItems[0]).toEqual({
      label: 'Overview',
      href: '/dashboard',
      key: 'overview'
    });
  });

  it('Analytics group renders all 8 core analytics items in order', () => {
    const analytics = navGroups.find((g) => g.key === 'analytics');
    expect(analytics).toBeDefined();
    expect(analytics?.label).toBe('Analytics');

    const expectedAnalytics = [
      { label: 'Insights', href: '/dashboard/insights', key: 'insights' },
      { label: 'Dashboards', href: '/dashboard/dashboards', key: 'dashboards' },
      { label: 'Events', href: '/dashboard/events', key: 'events' },
      { label: 'Funnels', href: '/dashboard/funnels', key: 'funnels' },
      { label: 'Retention', href: '/dashboard/retention', key: 'retention' },
      { label: 'Users', href: '/dashboard/users', key: 'users' },
      { label: 'Web analytics', href: '/dashboard/web', key: 'web' },
      { label: 'Cohorts', href: '/dashboard/cohorts', key: 'cohorts' }
    ];

    expect(analytics?.items).toEqual(expectedAnalytics);
  });

  it('Observability group includes Synthetic Monitors alongside logs, API performance, errors, alerts, replays', () => {
    const obs = navGroups.find((g) => g.key === 'observability');
    expect(obs).toBeDefined();
    expect(obs?.label).toBe('Observability');

    const keys = obs?.items.map((i) => i.key);
    expect(keys).toEqual([
      'logs',
      'api-performance',
      'errors',
      'alerts',
      'replays',
      'synthetic-monitors'
    ]);

    const syntheticItem = obs?.items.find((i) => i.key === 'synthetic-monitors');
    expect(syntheticItem).toEqual({
      label: 'Synthetic monitors',
      href: '/dashboard/synthetic-monitors',
      key: 'synthetic-monitors'
    });
  });

  it('Product group includes Feature flags, Experiments, Surveys, Achievements', () => {
    const prod = navGroups.find((g) => g.key === 'product');
    expect(prod).toBeDefined();
    expect(prod?.label).toBe('Product');

    const keys = prod?.items.map((i) => i.key);
    expect(keys).toEqual(['flags', 'experiments', 'surveys', 'achievements']);
  });

  it('Integrations group renders Webhooks and Export', () => {
    const integrations = navGroups.find((g) => g.key === 'integrations');
    expect(integrations).toBeDefined();
    expect(integrations?.label).toBe('Integrations');

    const keys = integrations?.items.map((i) => i.key);
    expect(keys).toEqual(['webhooks', 'export']);
  });

  it('preserves all bottom navigation items for Settings and Docs', () => {
    expect(bottomNavItems).toEqual([
      { label: 'Settings', href: '/dashboard/settings', key: 'settings' },
      { label: 'Docs', href: '/docs', key: 'docs' }
    ]);
  });

  it('navItems and allNavItems contain all grouped and standalone items without omissions', () => {
    expect(navItems).toHaveLength(21);
    expect(allNavItems).toHaveLength(23);
  });

  it('findGroupForActiveItem maps active child keys to their parent group', () => {
    // Analytics
    expect(findGroupForActiveItem('insights')).toBe('analytics');
    expect(findGroupForActiveItem('dashboards')).toBe('analytics');
    expect(findGroupForActiveItem('events')).toBe('analytics');
    expect(findGroupForActiveItem('funnels')).toBe('analytics');
    expect(findGroupForActiveItem('retention')).toBe('analytics');
    expect(findGroupForActiveItem('users')).toBe('analytics');
    expect(findGroupForActiveItem('web')).toBe('analytics');
    expect(findGroupForActiveItem('cohorts')).toBe('analytics');

    // Observability
    expect(findGroupForActiveItem('logs')).toBe('observability');
    expect(findGroupForActiveItem('api-performance')).toBe('observability');
    expect(findGroupForActiveItem('errors')).toBe('observability');
    expect(findGroupForActiveItem('alerts')).toBe('observability');
    expect(findGroupForActiveItem('replays')).toBe('observability');
    expect(findGroupForActiveItem('synthetic-monitors')).toBe('observability');

    // Product
    expect(findGroupForActiveItem('flags')).toBe('product');
    expect(findGroupForActiveItem('experiments')).toBe('product');
    expect(findGroupForActiveItem('surveys')).toBe('product');
    expect(findGroupForActiveItem('achievements')).toBe('product');

    // Integrations
    expect(findGroupForActiveItem('webhooks')).toBe('integrations');
    expect(findGroupForActiveItem('export')).toBe('integrations');

    // Top-level or Unknown
    expect(findGroupForActiveItem('overview')).toBeNull();
    expect(findGroupForActiveItem('settings')).toBeNull();
  });

  it('active route overrides stored collapsed state for that group', () => {
    const STORAGE_KEY = 'traceiq-sidebar-groups';
    const storedState = {
      analytics: false,
      observability: false,
      product: false,
      integrations: false
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedState));

    // When navigating to an error or monitor route
    const activeKey = 'errors';
    const activeGroup = findGroupForActiveItem(activeKey);
    expect(activeGroup).toBe('observability');

    // Simulating the Sidebar hydration logic
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const resolvedGroups: Record<string, boolean> = {};
    for (const group of navGroups) {
      resolvedGroups[group.key] = typeof saved[group.key] === 'boolean' ? saved[group.key] : false;
    }
    if (activeGroup) {
      resolvedGroups[activeGroup] = true;
    }

    expect(resolvedGroups.observability).toBe(true);
    expect(resolvedGroups.analytics).toBe(false);
    expect(resolvedGroups.product).toBe(false);
  });

  it('preserves query parameters such as projectId across grouped navigation links', () => {
    const projId = 'proj_alpha_99';
    expect(withProjectId('/dashboard/synthetic-monitors', projId)).toBe(
      '/dashboard/synthetic-monitors?projectId=proj_alpha_99'
    );
    expect(withProjectId('/dashboard/experiments', projId)).toBe(
      '/dashboard/experiments?projectId=proj_alpha_99'
    );
    expect(withProjectId('/dashboard/export', projId)).toBe(
      '/dashboard/export?projectId=proj_alpha_99'
    );
  });
});
