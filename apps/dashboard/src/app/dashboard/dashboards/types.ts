// Shared types + helpers for saved dashboards. A dashboard stores *one* saved query.
// For v1 the only supported query is a trends view (`source: 'trend'`), which the
// dashboard can reopen (as a URL) or render for comparison (as a chart).

export interface TrendDefinition {
  source: 'trend';
  event: string;
  interval?: string;
  days?: string;
  from?: string;
  to?: string;
  measure?: string;
  property?: string;
  breakdown?: string;
  filters?: string;
}

export type DashboardDefinition = TrendDefinition | Record<string, unknown>;

export interface DashboardView {
  id: string;
  name: string;
  ownerId: string;
  isShared: boolean;
  definition: DashboardDefinition;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  badge: string;
  iconName: 'product' | 'acquisition' | 'retention' | 'errors';
  definition: TrendDefinition;
}

export const RECOMMENDED_TEMPLATES: DashboardTemplate[] = [
  {
    id: 'product-overview',
    name: 'Product Overview',
    description: 'Track daily active users, overall event volume, and core user interactions across your product.',
    category: 'Core Analytics',
    badge: '30d · Unique users',
    iconName: 'product',
    definition: {
      source: 'trend',
      event: '*',
      interval: 'day',
      days: '30',
      measure: 'unique'
    }
  },
  {
    id: 'acquisition',
    name: 'Acquisition',
    description: 'Monitor incoming traffic channels, referral sources, top landing paths, and first-touch discovery.',
    category: 'Traffic',
    badge: '30d · By referrer',
    iconName: 'acquisition',
    definition: {
      source: 'trend',
      event: '*',
      interval: 'day',
      days: '30',
      measure: 'count',
      breakdown: '$referrer'
    }
  },
  {
    id: 'retention',
    name: 'Retention',
    description: 'Measure user return cadence, weekly cohort stickiness, and recurring feature engagement over time.',
    category: 'Engagement',
    badge: '30d · Active users',
    iconName: 'retention',
    definition: {
      source: 'trend',
      event: '*',
      interval: 'day',
      days: '30',
      measure: 'unique'
    }
  },
  {
    id: 'errors-performance',
    name: 'Errors & Performance',
    description: 'Detect exception spikes, unhandled client errors, and latency telemetry to protect application reliability.',
    category: 'Reliability',
    badge: '7d · Exception count',
    iconName: 'errors',
    definition: {
      source: 'trend',
      event: '$exception',
      interval: 'day',
      days: '7',
      measure: 'count'
    }
  }
];

// Turn a trends definition back into the insights URL that renders the same view.
export function dashboardToUrl(def: DashboardDefinition): string {
  if (def.source !== 'trend') return '/dashboard/insights';
  const other = def as TrendDefinition;
  const q = new URLSearchParams();
  if (other.event) q.set('event', other.event);
  if (other.interval) q.set('interval', other.interval);
  q.set('measure', other.measure ?? 'count');
  if (other.from) q.set('from', other.from);
  if (other.to) q.set('to', other.to);
  if (!other.from && !other.to) q.set('days', other.days ?? '30');
  if (other.property) q.set('property', other.property);
  if (other.breakdown) q.set('breakdown', other.breakdown);
  if (other.filters) q.set('filters', other.filters);
  return `/dashboard/insights?${q.toString()}`;
}

// Human-readable one-liner describing what the saved view shows.
export function dashboardSummary(def: DashboardDefinition): string {
  if (def.source !== 'trend') return 'Analytics view';
  const other = def as TrendDefinition;
  const measureLabel =
    other.measure === 'unique' ? 'unique users' : other.measure === 'sum' ? `sum ${other.property ?? ''}` : other.measure === 'avg' ? `avg ${other.property ?? ''}` : 'count';
  const range = other.from && other.to ? `${other.from} → ${other.to}` : other.days === '1' ? 'last 24h' : other.days ? `last ${other.days}d` : 'all time';
  const breakdown = other.breakdown ? ` by ${other.breakdown}` : '';
  return `${measureLabel} of ${other.event ?? 'events'} · ${range}${breakdown}`;
}