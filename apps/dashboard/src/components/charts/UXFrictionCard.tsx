import React from 'react';
import Link from 'next/link';
import { HugeiconsIcon } from '@hugeicons/react';
import PlayCircle02Icon from '@hugeicons/core-free-icons/PlayCircle02Icon';

interface UXFrictionCardProps {
  rageClicks: number;
  deadClicks: number;
  errorSessions: number;
  replaysAvailable: number;
  projectId?: string | null;
  className?: string;
}

export function UXFrictionCard({
  rageClicks = 0,
  deadClicks = 0,
  errorSessions = 0,
  replaysAvailable = 0,
  projectId,
  className = ''
}: UXFrictionCardProps) {
  return (
    <div
      className={`flex flex-col justify-between overflow-hidden rounded-md border border-neutral-200 bg-white p-5 shadow-xs dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${className}`}
    >
      <div>
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-neutral-100 dark:border-slate-800/70">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200">
              <HugeiconsIcon icon={PlayCircle02Icon} size={16} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">UX Friction & Replays</h3>
              <p className="text-xs text-neutral-500 dark:text-slate-400">User struggle signals and full session recordings</p>
            </div>
          </div>

          <Link
            href={projectId ? `/dashboard/replays?projectId=${projectId}` : '/dashboard/replays'}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            Open Replays &rarr;
          </Link>
        </div>

        {/* 3-grid friction signals */}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md border border-neutral-100 bg-neutral-50/80 p-3 dark:border-slate-800/60 dark:bg-slate-950/40">
            <span className="block text-2xl font-bold text-neutral-900 dark:text-white tabular-nums">
              {rageClicks.toLocaleString()}
            </span>
            <span className="text-[11px] font-medium text-rose-600 dark:text-rose-400">Rage Clicks</span>
          </div>

          <div className="rounded-md border border-neutral-100 bg-neutral-50/80 p-3 dark:border-slate-800/60 dark:bg-slate-950/40">
            <span className="block text-2xl font-bold text-neutral-900 dark:text-white tabular-nums">
              {deadClicks.toLocaleString()}
            </span>
            <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">Dead Clicks</span>
          </div>

          <div className="rounded-md border border-neutral-100 bg-neutral-50/80 p-3 dark:border-slate-800/60 dark:bg-slate-950/40">
            <span className="block text-2xl font-bold text-neutral-900 dark:text-white tabular-nums">
              {errorSessions.toLocaleString()}
            </span>
            <span className="text-[11px] font-medium text-neutral-600 dark:text-slate-400">Error Sessions</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-md border border-neutral-200/80 bg-neutral-50/60 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-800/40">
        <div className="flex items-center gap-2">
          <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
          <span className="text-xs font-medium text-neutral-700 dark:text-slate-300">
            {replaysAvailable > 0 ? `${replaysAvailable.toLocaleString()} session replays recorded` : 'Session capture active'}
          </span>
        </div>

        <Link
          href={projectId ? `/dashboard/replays?projectId=${projectId}` : '/dashboard/replays'}
          className="inline-flex items-center gap-1 rounded bg-neutral-900 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-slate-200"
        >
          <span>Watch</span>
          <span>&rarr;</span>
        </Link>
      </div>
    </div>
  );
}
