'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import Activity01Icon from '@hugeicons/core-free-icons/Activity01Icon';

interface TelemetryGaugeTileProps {
  title?: string;
  percentage?: number;
  label?: string;
  subtext?: string;
  statusText?: string;
  tone?: 'emerald' | 'blue' | 'amber';
}

const toneStyles = {
  emerald: {
    dot: 'bg-emerald-500',
    ping: 'bg-emerald-400',
    bar: 'bg-gradient-to-r from-emerald-500 to-teal-400',
    badge: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  },
  blue: {
    dot: 'bg-blue-500',
    ping: 'bg-blue-400',
    bar: 'bg-gradient-to-r from-blue-600 to-cyan-400',
    badge: 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300'
  },
  amber: {
    dot: 'bg-amber-500',
    ping: 'bg-amber-400',
    bar: 'bg-gradient-to-r from-amber-500 to-orange-400',
    badge: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  }
};

export function TelemetryGaugeTile({
  title = 'System Health',
  percentage = 88,
  label = 'Capacity',
  subtext = 'Healthy telemetry volume',
  statusText = 'Live',
  tone = 'emerald'
}: TelemetryGaugeTileProps) {
  const currentTone = toneStyles[tone];
  const clampedPct = Math.max(0, Math.min(100, percentage));

  return (
    <div className="relative overflow-hidden rounded-md border border-neutral-200 bg-white p-5 shadow-sm transition-all hover:border-neutral-300 dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:hover:border-slate-700/80">
      {/* Top Title Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Activity01Icon} size={16} className="text-neutral-400 dark:text-slate-500" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
            {title}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="relative flex size-2">
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${currentTone.ping}`} />
            <span className={`relative inline-flex size-2 rounded-full ${currentTone.dot}`} />
          </span>
          <span className="text-[11px] font-semibold text-neutral-500 dark:text-slate-400">{statusText}</span>
        </div>
      </div>

      {/* Main Big Percentage Readout */}
      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white tabular-nums">
          {clampedPct}%
        </span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${currentTone.badge}`}>
          {label}
        </span>
      </div>

      {/* Horizontal Progress Bar */}
      <div className="mt-3.5 h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${currentTone.bar}`}
          style={{ width: `${clampedPct}%` }}
        />
      </div>

      {/* Sub-metadata readout */}
      {subtext ? (
        <p className="mt-2.5 truncate text-xs text-neutral-500 dark:text-slate-400">
          {subtext}
        </p>
      ) : null}
    </div>
  );
}
