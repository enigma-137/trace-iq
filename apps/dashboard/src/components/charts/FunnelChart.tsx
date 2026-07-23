import Link from 'next/link';

interface FunnelResultStep {
  order: number;
  eventName: string;
  label: string | null;
  count: number;
  conversionFromStart: number;
  conversionFromPrevious: number;
  droppedFromPrevious: number;
}

interface Drilldown {
  funnelId: string;
  days: string;
  activeStep?: number;
  activeStatus?: 'reached' | 'dropped';
}

interface FunnelChartProps {
  steps: FunnelResultStep[];
  drilldown?: Drilldown;
}

export function FunnelChart({ steps, drilldown }: FunnelChartProps) {
  if (steps.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-6 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/40">
        This funnel has no steps.
      </div>
    );
  }

  function stepHref(index: number, status: 'reached' | 'dropped'): string | null {
    if (!drilldown) return null;
    return `/dashboard/funnels/${drilldown.funnelId}?days=${drilldown.days}&step=${index}&status=${status}`;
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {steps.map((step, index) => {
        const pct = Math.max(step.conversionFromStart * 100, step.count > 0 ? 1.5 : 0);
        const reachedHref = stepHref(index, 'reached');
        const isActiveReached = drilldown?.activeStep === index && drilldown?.activeStatus === 'reached';
        const barInner = (
          <div className="relative flex h-56 items-end overflow-hidden rounded-md border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900/50">
            <div className="w-full bg-blue-600 transition-all dark:bg-blue-500" style={{ height: `${Math.min(pct, 100)}%` }} />
          </div>
        );

        return (
          <div key={step.order} className="flex min-w-[128px] flex-1 flex-col">
            <div className="mb-2 text-center">
              <div className="text-xl font-semibold tabular-nums text-neutral-900 dark:text-white">{step.count.toLocaleString()}</div>
              <div className="font-mono text-xs text-neutral-500 dark:text-neutral-400">{formatPct(step.conversionFromStart)} of start</div>
            </div>

            {reachedHref ? (
              <Link
                href={reachedHref}
                title="See users who reached this step"
                className={`rounded-md outline-none transition ${
                  isActiveReached ? 'ring-2 ring-blue-600 dark:ring-blue-500' : 'hover:opacity-80'
                }`}
              >
                {barInner}
              </Link>
            ) : (
              barInner
            )}

            <div className="mt-3 px-1 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">
                Step {index + 1}
              </div>
              <div className="mt-0.5 truncate text-sm font-semibold text-neutral-900 dark:text-white" title={step.label ?? step.eventName}>
                {step.label ?? step.eventName}
              </div>
              <div className="truncate font-mono text-xs text-neutral-500 dark:text-neutral-400" title={step.eventName}>
                {step.eventName}
              </div>
              {index > 0 ? (
                <div className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">{formatPct(step.conversionFromPrevious)}</span> from
                  prev
                  {step.droppedFromPrevious > 0 ? (
                    <>
                      {' · '}
                      <DroppedLink href={stepHref(index, 'dropped')} count={step.droppedFromPrevious} />
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DroppedLink({ href, count }: { href: string | null; count: number }) {
  const label = `−${count.toLocaleString()} dropped`;
  if (!href) {
    return <span className="text-red-600 dark:text-red-400">{label}</span>;
  }
  return (
    <Link href={href} className="text-red-600 underline-offset-2 hover:underline dark:text-red-400" title="See users who dropped here">
      {label}
    </Link>
  );
}

function formatPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}
