export interface NavItem {
  label: string;
  href: string;
  key: string;
}

export interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

export const topNavItems: NavItem[] = [
  { label: 'Overview', href: '/dashboard', key: 'overview' }
];

export const navGroups: NavGroup[] = [
  {
    key: 'analytics',
    label: 'Analytics',
    items: [
      { label: 'Insights', href: '/dashboard/insights', key: 'insights' },
      { label: 'Dashboards', href: '/dashboard/dashboards', key: 'dashboards' },
      { label: 'Events', href: '/dashboard/events', key: 'events' },
      { label: 'Funnels', href: '/dashboard/funnels', key: 'funnels' },
      { label: 'Retention', href: '/dashboard/retention', key: 'retention' },
      { label: 'Users', href: '/dashboard/users', key: 'users' },
      { label: 'Web analytics', href: '/dashboard/web', key: 'web' },
      { label: 'Cohorts', href: '/dashboard/cohorts', key: 'cohorts' }
    ]
  },
  {
    key: 'observability',
    label: 'Observability',
    items: [
      { label: 'API performance', href: '/dashboard/api-performance', key: 'api-performance' },
      { label: 'Requests', href: '/dashboard/requests', key: 'requests' },
      { label: 'Logs', href: '/dashboard/logs', key: 'logs' },
      { label: 'Errors', href: '/dashboard/errors', key: 'errors' },
      { label: 'Alerts', href: '/dashboard/alerts', key: 'alerts' },
      { label: 'Replays', href: '/dashboard/replays', key: 'replays' },
      { label: 'Synthetic monitors', href: '/dashboard/synthetic-monitors', key: 'synthetic-monitors' }
    ]
  },
  {
    key: 'product',
    label: 'Product',
    items: [
      { label: 'Feature flags', href: '/dashboard/flags', key: 'flags' },
      { label: 'Experiments', href: '/dashboard/experiments', key: 'experiments' },
      { label: 'Surveys', href: '/dashboard/surveys', key: 'surveys' },
      { label: 'Achievements', href: '/dashboard/achievements', key: 'achievements' }
    ]
  },
  {
    key: 'integrations',
    label: 'Integrations',
    items: [
      { label: 'Webhooks', href: '/dashboard/webhooks', key: 'webhooks' },
      { label: 'Export', href: '/dashboard/export', key: 'export' }
    ]
  }
];

export const navItems: NavItem[] = [
  ...topNavItems,
  ...navGroups.flatMap((group) => group.items)
];

export const bottomNavItems: NavItem[] = [
  { label: 'Settings', href: '/dashboard/settings', key: 'settings' },
  { label: 'Docs', href: '/docs', key: 'docs' }
];

export const allNavItems: NavItem[] = [...navItems, ...bottomNavItems];

export function findGroupForActiveItem(activeKey: string): string | null {
  for (const group of navGroups) {
    if (group.items.some((item) => item.key === activeKey)) {
      return group.key;
    }
  }
  return null;
}

export const navLinkClass = (isActive: boolean) =>
  `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition ${isActive
    ? 'text-blue-700 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.16)] dark:bg-neutral-800 dark:text-white dark:shadow-[inset_3px_0_0_0_rgba(255,255,255,0.92)]'
    : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white'
  }`;

export const childNavLinkClass = (isActive: boolean) =>
  `flex items-center gap-2 rounded-md py-1.5 pl-3 pr-2.5 text-[13px] font-medium transition ${isActive
    ? 'text-blue-700 bg-blue-50/60 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.16)] dark:bg-neutral-800 dark:text-white dark:shadow-[inset_3px_0_0_0_rgba(255,255,255,0.92)]'
    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white'
  }`;

export function withProjectId(href: string, projectId?: string | null): string {
  if (!projectId) return href;
  const [path, hash = ''] = href.split('#');
  const [pathname, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  params.set('projectId', projectId);
  const nextQuery = params.toString();
  return `${pathname}${nextQuery ? `?${nextQuery}` : ''}${hash ? `#${hash}` : ''}`;
}
