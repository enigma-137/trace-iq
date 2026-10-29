import Link from 'next/link';
import { ComparisonHoverCard, type MetricComparison } from '@/components/charts/ComparisonHoverCard';
import type { ReactNode } from 'react';

/**
 * Compact building blocks for analytics pages: a bordered card with a soft
 * shadow, a KPI strip, and a segmented date-range control. Server-safe.
 */

/**
 * Dark-mode card surface: a grey panel lifted off the near-black page, with a
 * faint top highlight. Shared so every analytics card reads the same.
 */
export const darkCardSurface = 'dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]';

export const cardShell =
  `overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)] ${darkCardSurface}`;

export function DashCard({
  title,
  description,
  actions,
  footer,
  padded = true,
  className = '',
  children
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  /** Pad the body. Turn off for tables and lists that run edge to edge. */
  padded?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section className={`${cardShell} ${className}`}>
      {title ? (
        <header className="flex items-start justify-between gap-3 border-b border-neutral-100 px-4 py-3 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={padded ? 'p-4' : undefined}>{children}</div>
      {footer ? (
        <footer className="border-t border-neutral-100 px-4 py-2.5 text-xs text-neutral-500 dark:border-slate-800 dark:text-slate-400">{footer}</footer>
      ) : null}
    </section>
  );
}

export interface Kpi {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** Percent change vs. the previous period; omitted when there is nothing to compare. */
  delta?: number | null;
  /** Set when a rising number is bad (e.g. bounce rate, error rate). */
  invertDelta?: boolean;
  /** Previous vs. current period, shown in a card on hover or focus. */
  comparison?: MetricComparison;
}

/** One card split into equal cells, instead of a row of large separate tiles. */
export function KpiStrip({ items, className = '' }: { items: Kpi[]; className?: string }) {
  const cols =
    items.length >= 5 ? 'lg:grid-cols-5' : items.length === 4 ? 'lg:grid-cols-4' : items.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2';
  return (
    // No overflow-hidden here: the comparison cards open below the strip.
    <section className={`${cardShell.replace('overflow-hidden ', '')} ${className}`} aria-label="Key metrics">
      <dl className={`grid grid-cols-2 ${cols} [&>div]:border-neutral-100 dark:[&>div]:border-slate-800`}>
        {items.map((item, index) => (
          <div
            key={item.label}
            className={`min-w-0 px-4 py-3.5 ${index > 0 ? 'lg:border-l' : ''} ${index % 2 === 1 ? 'border-l' : ''} ${index >= 2 ? 'border-t lg:border-t-0' : ''}`}
          >
            {item.comparison ? (
              <ComparisonHoverCard title={item.label} comparison={item.comparison} align={index >= items.length - 2 ? 'right' : 'left'}>
                <KpiCell item={item} />
              </ComparisonHoverCard>
            ) : (
              <KpiCell item={item} />
            )}
          </div>
        ))}
      </dl>
    </section>
  );
}

function KpiCell({ item }: { item: Kpi }) {
  return (
    <>
      <dt className="truncate text-xs font-medium text-neutral-500 dark:text-slate-400">{item.label}</dt>
      <dd className="mt-1 flex items-baseline gap-2">
        <span className="truncate text-xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-white">{item.value}</span>
        {item.delta !== undefined && item.delta !== null && Number.isFinite(item.delta) ? (
          <DeltaBadge value={item.delta} invert={item.invertDelta} />
        ) : null}
      </dd>
      {item.hint ? <dd className="mt-0.5 truncate text-xs text-neutral-500 dark:text-slate-500">{item.hint}</dd> : null}
    </>
  );
}

function DeltaBadge({ value, invert = false }: { value: number; invert?: boolean }) {
  const rounded = Math.round(value);
  if (rounded === 0) return <span className="text-xs tabular-nums text-neutral-400 dark:text-slate-500">0%</span>;
  const good = invert ? rounded < 0 : rounded > 0;
  return (
    <span className={`text-xs font-medium tabular-nums ${good ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
      {rounded > 0 ? '+' : ''}
      {rounded}%
    </span>
  );
}

export function percentChange(current: number | undefined, previous: number | undefined): number | null {
  if (current === undefined || previous === undefined || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function RangeTabs({ ranges, active, hrefFor }: { ranges: Array<{ value: string; label: string }>; active: string; hrefFor: (value: string) => string }) {
  return (
    <nav aria-label="Date range" className="inline-flex items-center rounded-lg border border-neutral-200 bg-white p-0.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {ranges.map((range) => {
        const current = active === range.value;
        return (
          <Link
            key={range.value}
            href={hrefFor(range.value)}
            aria-current={current ? 'page' : undefined}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              current
                ? 'bg-neutral-900 text-white dark:bg-white dark:text-slate-950'
                : 'text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            {range.label}
          </Link>
        );
      })}
    </nav>
  );
}

export const secondaryButtonSm =
  'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white';

export const primaryButtonSm =
  'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-neutral-900 px-3 text-xs font-medium text-white shadow-sm transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200';

export const inputSm =
  'h-8 rounded-lg border border-neutral-200 bg-white px-2.5 text-xs text-neutral-900 shadow-sm outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-400 dark:focus:ring-white/10';
