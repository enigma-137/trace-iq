import React from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import ServerIcon from '@hugeicons/core-free-icons/ServerIcon';

interface RequestStatusBreakdown {
  ok200: number;
  rateLimit429: number;
  error500: number;
  other?: number;
}

interface RequestStatusCardProps {
  breakdown: RequestStatusBreakdown;
  totalRequests?: number;
  /** Short label for the window the counts cover. */
  windowLabel?: string;
  className?: string;
}

export function RequestStatusCard({
  breakdown,
  totalRequests,
  windowLabel = '14d',
  className = ''
}: RequestStatusCardProps) {
  const ok = breakdown.ok200 ?? 0;
  const rateLimit = breakdown.rateLimit429 ?? 0;
  const error = breakdown.error500 ?? 0;
  const other = breakdown.other ?? 0;
  const total = totalRequests ?? ok + rateLimit + error + other;
  const denominator = Math.max(1, total);

  const okPct = Math.round((ok / denominator) * 100);
  const rlPct = Math.round((rateLimit / denominator) * 100);
  const errPct = Math.round((error / denominator) * 100);
  const otherPct = Math.round((other / denominator) * 100);

  return (
    <div
      className={`flex flex-col justify-between overflow-hidden rounded-md border border-neutral-200 bg-white p-5 shadow-xs dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${className}`}
    >
      <div>
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-neutral-100 dark:border-slate-800/70">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200">
              <HugeiconsIcon icon={ServerIcon} size={16} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Request Status</h3>
              <p className="text-xs text-neutral-500 dark:text-slate-400">HTTP status distribution & occurrences</p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">
            {total.toLocaleString()}
          </span>
          <span className="text-sm font-medium text-neutral-500 dark:text-slate-400">Total requests ({windowLabel})</span>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-4">
        {/* 200 OK */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                200
              </span>
              <span className="font-medium text-neutral-800 dark:text-slate-200">Success OK</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                {ok.toLocaleString()}
              </span>
              <span className="text-neutral-400 dark:text-slate-500">({okPct}%)</span>
            </div>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${Math.max(2, okPct)}%` }}
            />
          </div>
        </div>

        {/* 429 Rate Limit */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                429
              </span>
              <span className="font-medium text-neutral-800 dark:text-slate-200">Rate Limited</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                {rateLimit.toLocaleString()}
              </span>
              <span className="text-neutral-400 dark:text-slate-500">({rlPct}%)</span>
            </div>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-amber-500 transition-all duration-500"
              style={{ width: `${Math.max(2, rlPct)}%` }}
            />
          </div>
        </div>

        {/* 500 Server Error */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                500
              </span>
              <span className="font-medium text-neutral-800 dark:text-slate-200">Server Errors</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                {error.toLocaleString()}
              </span>
              <span className="text-neutral-400 dark:text-slate-500">({errPct}%)</span>
            </div>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-rose-500 transition-all duration-500"
              style={{ width: `${Math.max(2, errPct)}%` }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-slate-500/20 bg-slate-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                Other
              </span>
              <span className="font-medium text-neutral-800 dark:text-slate-200">Other Responses</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                {other.toLocaleString()}
              </span>
              <span className="text-neutral-400 dark:text-slate-500">({otherPct}%)</span>
            </div>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-slate-500 transition-all duration-500"
              style={{ width: `${Math.max(2, otherPct)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
