'use client';

import React from 'react';
import { ObservabilityLog, LogLevel, LogStatus } from './types';

interface LogStreamTableProps {
  logs: ObservabilityLog[];
  selectedLogId: string | null;
  onSelectLog: (log: ObservabilityLog) => void;
  isLoading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

const LEVEL_BADGES: Record<LogLevel, { label: string; className: string }> = {
  fatal: {
    label: 'FATAL',
    className: 'bg-rose-950 text-rose-300 border border-rose-800'
  },
  error: {
    label: 'ERROR',
    className: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60'
  },
  warn: {
    label: 'WARN',
    className: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60'
  },
  info: {
    label: 'INFO',
    className: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-200 dark:border-blue-900/60'
  },
  debug: {
    label: 'DEBUG',
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
  }
};

const SOURCE_ICONS: Record<string, string> = {
  api: '⚡',
  webhook: '🪝',
  ai: '✨',
  alert: '🔔',
  error: '⚠️',
  auth: '🔒',
  job: '⏱️',
  sdk: '📦',
  custom: '📝'
};

function formatTimestamp(ts: string) {
  try {
    const d = new Date(ts);
    return {
      time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0'),
      full: d.toLocaleString()
    };
  } catch {
    return { time: ts, full: ts };
  }
}

function getStatusBadge(status: LogStatus, code?: number | null) {
  if (code) {
    if (code >= 500) {
      return (
        <span className="rounded bg-rose-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-900/60">
          {code}
        </span>
      );
    }
    if (code >= 400) {
      return (
        <span className="rounded bg-amber-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-900/60">
          {code}
        </span>
      );
    }
    return (
      <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-900/60">
        {code}
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-900/60">
        FAILED
      </span>
    );
  }
  if (status === 'warning') {
    return (
      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-900/60">
        WARN
      </span>
    );
  }
  return (
    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-900/60">
      OK
    </span>
  );
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
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50/50 p-12 text-center dark:border-slate-800 dark:bg-slate-900/40">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-xl dark:bg-slate-800">
          📜
        </div>
        <h3 className="mt-3 text-sm font-semibold text-neutral-900 dark:text-white">
          No logs match the current criteria
        </h3>
        <p className="mt-1 max-w-md text-xs text-neutral-500 dark:text-slate-400">
          Try expanding your time window, clearing the search query, or selecting "All activity" in the source filter.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
      {/* Dense Table Header */}
      <div className="hidden grid-cols-[110px_70px_100px_1.4fr_2fr_80px_70px] items-center gap-3 border-b border-neutral-200 bg-neutral-50/80 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-500 lg:grid">
        <span>Time</span>
        <span>Level</span>
        <span>Source</span>
        <span>Service / Target</span>
        <span>Message / Operation</span>
        <span className="text-right">Latency</span>
        <span className="text-right">Status</span>
      </div>

      {/* Rows stream */}
      <div className="divide-y divide-neutral-100 dark:divide-slate-800/80">
        {logs.map((log) => {
          const isSelected = selectedLogId === log.id;
          const { time, full } = formatTimestamp(log.timestamp);
          const lvl = LEVEL_BADGES[log.level] || LEVEL_BADGES.info;
          const icon = SOURCE_ICONS[log.source] || '📝';

          return (
            <button
              key={log.id}
              type="button"
              onClick={() => onSelectLog(log)}
              className={`grid w-full grid-cols-1 items-center gap-2 px-3.5 py-2.5 text-left text-xs transition focus:outline-none lg:grid-cols-[110px_70px_100px_1.4fr_2fr_80px_70px] lg:gap-3 ${
                isSelected
                  ? 'bg-blue-50/80 dark:bg-blue-950/40 ring-1 ring-inset ring-blue-500/50'
                  : 'hover:bg-neutral-50 dark:hover:bg-slate-800/50'
              }`}
            >
              {/* Timestamp */}
              <span
                className="font-mono text-[11px] text-neutral-500 dark:text-slate-400"
                title={full}
              >
                {time}
              </span>

              {/* Level */}
              <div>
                <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold leading-tight ${lvl.className}`}>
                  {lvl.label}
                </span>
              </div>

              {/* Source */}
              <div className="flex items-center gap-1.5 font-medium text-neutral-700 dark:text-slate-300">
                <span>{icon}</span>
                <span className="capitalize">{log.source}</span>
              </div>

              {/* Service / Target */}
              <div className="truncate font-mono text-[11px] text-neutral-600 dark:text-slate-400">
                {log.route || log.model || log.service || '-'}
              </div>

              {/* Message */}
              <div className="truncate font-medium text-neutral-900 dark:text-slate-100">
                {log.method && (
                  <span className="mr-1.5 rounded bg-neutral-100 px-1 py-0.5 font-mono text-[10px] font-bold text-neutral-700 dark:bg-slate-800 dark:text-slate-300">
                    {log.method}
                  </span>
                )}
                <span>{log.message}</span>
              </div>

              {/* Latency */}
              <div className="text-right font-mono text-[11px]">
                {log.durationMs !== undefined && log.durationMs !== null ? (
                  <span
                    className={
                      log.durationMs > 1000
                        ? 'text-rose-600 dark:text-rose-400 font-semibold'
                        : log.durationMs > 300
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-neutral-600 dark:text-slate-400'
                    }
                  >
                    {log.durationMs}ms
                  </span>
                ) : (
                  <span className="text-neutral-400 dark:text-slate-600">-</span>
                )}
              </div>

              {/* Status */}
              <div className="text-right">
                {getStatusBadge(log.status, log.statusCode)}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer / Load More */}
      {hasMore && (
        <div className="border-t border-neutral-100 p-3 text-center dark:border-slate-800">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoading}
            className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-1.5 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            {isLoading ? 'Loading records...' : 'Load more logs'}
          </button>
        </div>
      )}
    </div>
  );
}
