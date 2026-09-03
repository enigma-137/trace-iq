import React from 'react';
import Link from 'next/link';

export interface TopErrorItem {
  type: string;
  message: string;
  occurrences: number;
  users: number;
  firstSeen: string;
  lastSeen: string;
  sparkline?: number[];
}

interface TopErrorsListProps {
  errors: TopErrorItem[];
  projectId?: string | null;
  className?: string;
}

export function TopErrorsList({
  errors = [],
  projectId,
  className = ''
}: TopErrorsListProps) {
  return (
    <div
      className={`flex flex-col justify-between overflow-hidden rounded-md border border-neutral-200 bg-white p-5 shadow-xs dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${className}`}
    >
      <div>
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-neutral-100 dark:border-slate-800/70">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200">
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Top Impacting Exceptions</h3>
              <p className="text-xs text-neutral-500 dark:text-slate-400">Unhandled errors affecting active sessions</p>
            </div>
          </div>

          <Link
            href={projectId ? `/dashboard/errors?projectId=${projectId}` : '/dashboard/errors'}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            All Errors &rarr;
          </Link>
        </div>

        {errors.length === 0 ? (
          <p className="py-8 text-center text-xs text-neutral-400 dark:text-slate-500">
            No exceptions recorded in this window. Ingestion is healthy!
          </p>
        ) : (
          <div className="mt-4 flex flex-col divide-y divide-neutral-100 dark:divide-slate-800/60">
            {errors.map((err, idx) => (
              <div key={idx} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex rounded border border-rose-500/20 bg-rose-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-rose-600 dark:text-rose-400">
                      {err.type}
                    </span>
                    <span className="truncate text-xs font-medium text-neutral-900 dark:text-slate-200" title={err.message}>
                      {err.message}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[11px] text-neutral-400 dark:text-slate-500">
                    <span>{err.users} {err.users === 1 ? 'user' : 'users'} affected</span>
                    <span>·</span>
                    <span className="tabular-nums">{err.occurrences.toLocaleString()} events</span>
                  </div>
                </div>

                <Link
                  href={projectId ? `/dashboard/errors?projectId=${projectId}&type=${encodeURIComponent(err.type)}&message=${encodeURIComponent(err.message)}` : `/dashboard/errors?type=${encodeURIComponent(err.type)}&message=${encodeURIComponent(err.message)}`}
                  className="shrink-0 rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  View
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
