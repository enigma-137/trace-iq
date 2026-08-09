export const navItems = [
  { label: 'Overview', href: '/dashboard', key: 'overview' },
  { label: 'Web analytics', href: '/dashboard/web', key: 'web' },
  { label: 'Insights', href: '/dashboard/insights', key: 'insights' },
  { label: 'Dashboards', href: '/dashboard/dashboards', key: 'dashboards' },
  { label: 'Events', href: '/dashboard/events', key: 'events' },
  { label: 'Funnels', href: '/dashboard/funnels', key: 'funnels' },
  { label: 'Retention', href: '/dashboard/retention', key: 'retention' },
  { label: 'Cohorts', href: '/dashboard/cohorts', key: 'cohorts' },
  { label: 'Users', href: '/dashboard/users', key: 'users' },
  { label: 'API performance', href: '/dashboard/api-performance', key: 'api-performance' },
  { label: 'Errors', href: '/dashboard/errors', key: 'errors' },
  { label: 'Alerts', href: '/dashboard/alerts', key: 'alerts' },
  { label: 'Feature flags', href: '/dashboard/flags', key: 'flags' },
  { label: 'Webhooks', href: '/dashboard/webhooks', key: 'webhooks' },
  { label: 'Export', href: '/dashboard/export', key: 'export' }
];

export const bottomNavItems = [
  { label: 'Settings', href: '/dashboard/settings', key: 'settings' },
  { label: 'Docs', href: '/docs', key: 'docs' }
];

export const allNavItems = [...navItems, ...bottomNavItems];

export const navLinkClass = (isActive: boolean) =>
  `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition ${
    isActive
      ? 'bg-blue-50 text-blue-700 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.16)] dark:bg-neutral-800 dark:text-white dark:shadow-[inset_3px_0_0_0_rgba(255,255,255,0.92)]'
      : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white'
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
