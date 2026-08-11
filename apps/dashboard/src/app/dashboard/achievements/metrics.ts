export interface MetricCopy {
  progressText: (progress: number, target: number) => string;
  remainingText: (progress: number, target: number) => string;
}

// "42 / 100 events" + "58 more events" (with singular handling).
function noun(singular: string, plural: string): MetricCopy {
  return {
    progressText: (progress, target) => `${formatCount(progress)} / ${formatCount(target)} ${plural}`,
    remainingText: (progress, target) =>
      target - progress === 1 ? `1 more ${singular}` : `${formatCount(target - progress)} more ${plural}`
  };
}

const METRIC_COPY: Record<string, MetricCopy> = {
  'events.all_time': noun('event', 'events'),
  'events.24h': {
    progressText: (progress, target) => `${formatCount(progress)} / ${formatCount(target)} events today`,
    remainingText: (progress, target) =>
      target - progress === 1 ? '1 more event today' : `${formatCount(target - progress)} more events today`
  },
  'users.all_time': noun('user', 'users'),
  'projects.count': noun('project', 'projects'),
  'flags.count': noun('flag', 'flags'),
  'alerts.count': noun('alert', 'alerts'),
  'webhooks.count': noun('webhook', 'webhooks'),
  'funnels.count': noun('funnel', 'funnels'),
  'dashboards.count': noun('dashboard', 'dashboards'),
  'cohorts.count': noun('cohort', 'cohorts'),
  'org.tenure_months': noun('month', 'months')
};

const FALLBACK: MetricCopy = {
  progressText: (progress, target) => `${formatCount(progress)} / ${formatCount(target)}`,
  remainingText: (progress, target) => `${formatCount(target - progress)} more`
};

export function metricCopy(metric: string): MetricCopy {
  return METRIC_COPY[metric] ?? FALLBACK;
}

export function formatCount(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

export function formatDate(value: string | null): string {
  if (!value) return 'Earned';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Earned';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function progressPercent(progress: number, target: number): number {
  if (!Number.isFinite(target) || target <= 0) return 0;
  return Math.min(100, Math.round((Math.max(0, progress) / target) * 100));
}
