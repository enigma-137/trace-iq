import type { ReactNode } from 'react';

export interface MetricComparison {
  /** Formatted values, e.g. "46.7%" or "12.5K". */
  previous: string;
  current: string;
  /** Date ranges the values cover, e.g. "Aug 29 – Sep 28". */
  previousLabel: string;
  currentLabel: string;
  /** Signed percent change; null when the previous period was zero. */
  change: number | null;
  /** True for metrics where going up is bad (bounce rate, latency, errors). */
  invert?: boolean;
}

interface ComparisonHoverCardProps {
  title: string;
  icon?: ReactNode;
  comparison: MetricComparison;
  /** Where the card opens relative to the trigger. */
  align?: 'left' | 'right';
  children: ReactNode;
}

/**
 * Wraps a metric so hovering or focusing it shows the previous period next to the
 * current one. Pure CSS (group-hover / focus-within), so it works in server
 * components and needs no JS to open.
 */
export function ComparisonHoverCard({ title, icon, comparison, align = 'left', children }: ComparisonHoverCardProps) {
  return (
    <div className="group/compare relative h-full" tabIndex={0}>
      {children}
      <div
        role="tooltip"
        className={`pointer-events-none invisible absolute top-[calc(100%-0.5rem)] z-30 w-72 max-w-[calc(100vw-2rem)] translate-y-1 opacity-0 transition duration-150 group-focus-within/compare:visible group-focus-within/compare:translate-y-0 group-focus-within/compare:opacity-100 group-hover/compare:visible group-hover/compare:translate-y-0 group-hover/compare:opacity-100 ${
          align === 'right' ? 'right-2' : 'left-2'
        }`}
      >
        <ComparisonCard title={title} icon={icon} comparison={comparison} />
      </div>
    </div>
  );
}

export function ComparisonCard({ title, icon, comparison }: { title: string; icon?: ReactNode; comparison: MetricComparison }) {
  const { change, invert } = comparison;
  const rounded = change === null ? null : Math.round(change);
  const good = rounded === null || rounded === 0 ? null : invert ? rounded < 0 : rounded > 0;
  const tone = good === null ? 'text-neutral-500 dark:text-slate-400' : good ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white text-left shadow-xl dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center gap-2 border-b border-neutral-100 px-3 py-2.5 dark:border-slate-700">
        {icon ? (
          <span className="flex size-6 items-center justify-center rounded-md bg-neutral-100 text-neutral-600 dark:bg-slate-700 dark:text-slate-300">{icon}</span>
        ) : null}
        <p className="text-sm font-semibold text-neutral-900 dark:text-white">{title}</p>
      </div>
      <dl className="grid grid-cols-2 divide-x divide-neutral-100 dark:divide-slate-700">
        <Period label="Previous" value={comparison.previous} range={comparison.previousLabel} />
        <Period label="Current" value={comparison.current} range={comparison.currentLabel} />
      </dl>
      <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900/60">
        <span className="text-neutral-500 dark:text-slate-400">Change</span>
        <span className={`font-semibold tabular-nums ${tone}`}>
          {rounded === null ? 'n/a' : `${rounded > 0 ? '↗ +' : rounded < 0 ? '↘ ' : ''}${rounded}%`}
        </span>
      </div>
    </div>
  );
}

function Period({ label, value, range }: { label: string; value: string; range: string }) {
  return (
    <div className="px-3 py-2.5">
      <dt className="text-[11px] text-neutral-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-neutral-900 dark:text-white">{value}</dd>
      <dd className="text-[11px] text-neutral-400 dark:text-slate-500">{range}</dd>
    </div>
  );
}

/** "Sep 29 – Oct 29" for the window ending at `end` (exclusive) and the one before it. */
export function comparisonRanges(end: Date, days: number): { previousLabel: string; currentLabel: string } {
  const day = 86_400_000;
  const fmt = rangeDateFormatter(days);
  const currentStart = new Date(end.getTime() - days * day);
  const previousStart = new Date(end.getTime() - 2 * days * day);
  return {
    previousLabel: `${fmt(previousStart)} – ${fmt(currentStart)}`,
    currentLabel: `${fmt(currentStart)} – ${fmt(end)}`
  };
}

/** Labels for an all-time count compared with its value when the window started. */
export function snapshotLabels(end: Date, days: number): { previousLabel: string; currentLabel: string } {
  const start = new Date(end.getTime() - days * 86_400_000);
  return { previousLabel: `As of ${rangeDateFormatter(days)(start)}`, currentLabel: 'Now' };
}

function rangeDateFormatter(days: number) {
  return (date: Date) =>
    days <= 1
      ? date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', timeZone: 'UTC' })
      : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
