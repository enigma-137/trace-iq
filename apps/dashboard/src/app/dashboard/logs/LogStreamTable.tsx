'use client';

import React from 'react';
import { ObservabilityLog } from './types';
import { LEVEL_BAR, LEVEL_TEXT, StatusTone, formatLogTimestamp, sourceLabel, statusLabel } from './log-format';

interface LogStreamTableProps {
  logs: ObservabilityLog[];
  selectedLogId: string | null;
  onSelectLog: (log: ObservabilityLog) => void;
  isLoading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

const GRID =
  'lg:grid-cols-[16px_184px_52px_72px_64px_minmax(0,1.1fr)_minmax(0,2fr)_72px_176px]';

const TONE_DOT: Record<StatusTone, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  error: 'bg-rose-500',
  neutral: 'bg-neutral-400 dark:bg-slate-500'
};

function StatusPill({ log }: { log: ObservabilityLog }) {
  const { text, tone } = statusLabel(log.status, log.statusCode);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[11px] text-neutral-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
      <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />
      {text}
    </span>
  );
}

function latencyClass(ms: number) {
  if (ms > 1000) return 'font-medium text-rose-600 dark:text-rose-400';
  if (ms > 300) return 'text-amber-600 dark:text-amber-400';
  return 'text-neutral-600 dark:text-slate-400';
}

export function LogStreamTable({
  logs,
  selectedLogId,
  onSelectLog,
  isLoading = false,
  hasMore = false,
  onLoadMore
}: LogStreamTableProps) {
  if (logs.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-neutral-300 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900/40">
        <svg className="h-8 w-8 text-neutral-300 dark:text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 4h7l4 4v12H7z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M14 4v4h4M10 12h5M10 15.5h5" />
        </svg>
        <h3 className="mt-3 text-sm font-medium text-neutral-900 dark:text-white">No logs match the current filters</h3>
        <p className="mt-1 max-w-md text-xs text-neutral-500 dark:text-slate-400">
          Widen the time range, clear the search, or switch the source back to All activity.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-900/70">
      <div
        className={`hidden items-center gap-3 border-b border-neutral-200 bg-neutral-50/70 py-2 pl-3 pr-4 text-xs text-neutral-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400 lg:grid ${GRID}`}
      >
        <span />
        <span className="inline-flex items-center gap-1.5">
          Timestamp
          <svg className="h-3 w-3 text-blue-600 dark:text-blue-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-label="Newest first">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v10m0 0-3.5-3.5M8 13l3.5-3.5" />
          </svg>
        </span>
        <span>Level</span>
        <span>Source</span>
        <span>Method</span>
        <span>Target</span>
        <span>Message</span>
        <span className="text-right">Latency</span>
        <span>Status</span>
      </div>

      <div className="divide-y divide-neutral-100 dark:divide-slate-800/80">
        {logs.map((log) => {
          const selected = selectedLogId === log.id;
          const { text: time, full } = formatLogTimestamp(log.timestamp);

          return (
            <button
              key={log.id}
              type="button"
              onClick={() => onSelectLog(log)}
              aria-label={`${log.level} ${log.message}`}
              className={`relative grid w-full grid-cols-1 items-center gap-1.5 py-2.5 pl-3 pr-4 text-left text-xs transition focus:outline-none focus-visible:bg-neutral-50 lg:gap-3 ${GRID} ${
                selected ? 'bg-blue-50/70 dark:bg-blue-950/30' : 'hover:bg-neutral-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <span className={`absolute inset-y-0 left-0 w-[3px] ${LEVEL_BAR[log.level] ?? LEVEL_BAR.info}`} aria-hidden="true" />

              <svg
                className="hidden h-3.5 w-3.5 text-neutral-400 dark:text-slate-500 lg:block"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m6 3.5 4.5 4.5L6 12.5" />
              </svg>

              <span className="font-mono text-[12px] text-neutral-800 dark:text-slate-200" title={full} suppressHydrationWarning>
                {time}
              </span>

              <span className={`hidden lowercase lg:inline ${LEVEL_TEXT[log.level] ?? LEVEL_TEXT.info}`}>{log.level}</span>

              <span className="text-neutral-700 dark:text-slate-300">{sourceLabel(log.source)}</span>

              <span>
                {log.method ? (
                  <span className="inline-block rounded-full border border-neutral-200 px-2 py-0.5 font-mono text-[11px] text-neutral-700 dark:border-slate-700 dark:text-slate-300">
                    {log.method}
                  </span>
                ) : null}
              </span>

              <span className="truncate font-mono text-[12px] text-neutral-600 dark:text-slate-400" title={log.route || log.model || log.service || undefined}>
                {log.route || log.model || log.service || '-'}
              </span>

              <span className="truncate text-neutral-900 dark:text-slate-100" title={log.message}>
                {log.message}
              </span>

              <span className="text-left font-mono text-[12px] lg:text-right">
                {log.durationMs !== undefined && log.durationMs !== null ? (
                  <span className={latencyClass(log.durationMs)}>{log.durationMs} ms</span>
                ) : (
                  <span className="text-neutral-300 dark:text-slate-600">-</span>
                )}
              </span>

              <span>
                <StatusPill log={log} />
              </span>
            </button>
          );
        })}
      </div>

      {hasMore && (
        <div className="border-t border-neutral-100 p-3 text-center dark:border-slate-800">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoading}
            className="rounded-md border border-neutral-200 bg-white px-4 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {isLoading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
