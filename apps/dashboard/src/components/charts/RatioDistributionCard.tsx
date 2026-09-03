import React from 'react';

interface RatioDistributionCardProps {
  title?: string;
  leftLabel?: string;
  leftValue?: number;
  rightLabel?: string;
  rightValue?: number;
  stat1Label?: string;
  stat1Value?: string;
  stat2Label?: string;
  stat2Value?: string;
  footerHighlight?: string;
  className?: string;
}

export function RatioDistributionCard({
  title = 'Autocapture vs Custom',
  leftLabel = 'Autocapture ($page)',
  leftValue = 0,
  rightLabel = 'Custom Telemetry',
  rightValue = 0,
  stat1Label = 'Avg Session Duration',
  stat1Value = '0s',
  stat2Label = 'Pipeline Health',
  stat2Value = 'Active',
  footerHighlight = '',
  className = ''
}: RatioDistributionCardProps) {
  const total = (leftValue || 0) + (rightValue || 0);
  const leftPct = total > 0 ? Math.round(((leftValue || 0) / total) * 100) : 0;
  const rightPct = total > 0 ? 100 - leftPct : 0;

  return (
    <div
      className={`flex flex-col justify-between overflow-hidden rounded-md border border-neutral-200 bg-white p-5 shadow-xs dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${className}`}
    >
      <div>
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-neutral-100 dark:border-slate-800/70">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200">
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">{title}</h3>
              <p className="text-xs text-neutral-500 dark:text-slate-400">Stream distribution & volume share</p>
            </div>
          </div>
        </div>

        {/* Big percentage headline */}
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">{leftPct}%</span>
          <span className="text-lg font-semibold text-neutral-400 dark:text-slate-600">/</span>
          <span className="text-2xl font-bold tracking-tight text-neutral-700 dark:text-slate-300">{rightPct}%</span>
        </div>

        {/* Dual Segmented Bar */}
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex h-3 w-full overflow-hidden rounded-md bg-neutral-100 dark:bg-slate-800">
            <div
              className="bg-blue-600 transition-all duration-500 dark:bg-blue-500"
              style={{ width: `${leftPct}%` }}
            />
            <div
              className="bg-emerald-500 transition-all duration-500"
              style={{ width: `${rightPct}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-blue-600 dark:bg-blue-500" />
              <span className="font-medium text-neutral-600 dark:text-slate-400">{leftLabel}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500" />
              <span className="font-medium text-neutral-600 dark:text-slate-400">{rightLabel}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {/* Metric tiles row */}
        <div className="grid grid-cols-2 gap-2 rounded-md border border-neutral-100 bg-neutral-50/80 p-3 dark:border-slate-800/80 dark:bg-slate-950/40">
          <div className="flex flex-col items-center justify-center text-center">
            <span className="text-lg font-bold text-neutral-900 dark:text-white tabular-nums">{stat1Value}</span>
            <span className="text-[11px] text-neutral-500 dark:text-slate-400">{stat1Label}</span>
          </div>
          <div className="flex flex-col items-center justify-center border-l border-neutral-200 text-center dark:border-slate-800">
            <span className="text-lg font-bold text-neutral-900 dark:text-white tabular-nums">{stat2Value}</span>
            <span className="text-[11px] text-neutral-500 dark:text-slate-400">{stat2Label}</span>
          </div>
        </div>

        {/* Footer info pill */}
        <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-slate-400">
          <div className="flex items-center gap-1">
            <svg className="size-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="font-medium text-neutral-700 dark:text-slate-300">{footerHighlight}</span>
          </div>
          {total > 0 ? (
            <span className="font-mono text-[11px] text-neutral-400 dark:text-slate-500">
              Ratio {(leftPct / Math.max(1, rightPct)).toFixed(1)}:1
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
