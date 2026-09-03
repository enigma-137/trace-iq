import React from 'react';
import Link from 'next/link';

interface ActiveAlertsBannerProps {
  firing: number;
  total: number;
  projectId?: string | null;
  className?: string;
}

export function ActiveAlertsBanner({
  firing = 0,
  total = 0,
  projectId,
  className = ''
}: ActiveAlertsBannerProps) {
  if (total === 0 && firing === 0) return null;

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border p-3.5 sm:px-4 text-xs ${
        firing > 0
          ? 'border-rose-300 bg-rose-50/80 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200'
          : 'border-emerald-200 bg-emerald-50/60 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200'
      } ${className}`}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`size-2 shrink-0 rounded-full ${
            firing > 0 ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'
          }`}
        />
        <div className="flex items-center gap-2">
          <span className="font-semibold">
            {firing > 0 ? `${firing} alert${firing === 1 ? '' : 's'} currently firing!` : 'All alert rules healthy'}
          </span>
          <span className="text-neutral-500 dark:text-slate-400">
            ({total} active monitor{total === 1 ? '' : 's'})
          </span>
        </div>
      </div>

      <Link
        href={projectId ? `/dashboard/alerts?projectId=${projectId}` : '/dashboard/alerts'}
        className={`inline-flex items-center gap-1 font-semibold underline-offset-4 hover:underline ${
          firing > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'
        }`}
      >
        <span>Manage monitors</span>
        <span>&rarr;</span>
      </Link>
    </div>
  );
}
