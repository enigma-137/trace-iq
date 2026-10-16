'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { clientFetch } from '@/lib/analytics-api';
import { logsWindowQuery, type RecentLogsView } from '@/lib/recent-logs';
import type { HistogramResponse, ObservabilityLog } from './logs/types';

// Latest operational activity for the Overview, read from the existing Logs API
// (`/v1/dashboard/logs` + its histogram summary for counts). Refreshes on the same
// cadence idea as the Now panel, but only while the tab is visible.

const ROW_LIMIT = 6;
const REFRESH_MS = 30_000;

type View = RecentLogsView;

interface LogsResponse {
  logs: ObservabilityLog[];
}

function severity(level: ObservabilityLog['level']): { label: string; className: string } {
  switch (level) {
    case 'fatal':
    case 'error':
      return { label: level === 'fatal' ? 'FATAL' : 'ERROR', className: 'text-red-700 dark:text-red-300' };
    case 'warn':
      return { label: 'WARN', className: 'text-amber-700 dark:text-amber-300' };
    case 'debug':
      return { label: 'DEBUG', className: 'text-neutral-400 dark:text-slate-500' };
    default:
      return { label: 'INFO', className: 'text-blue-700 dark:text-blue-300' };
  }
}

function timeLabel(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function RecentLogsPanel({ projectId, className = '' }: { projectId?: string | null; className?: string }) {
  const [view, setView] = useState<View>('all');
  const [logs, setLogs] = useState<ObservabilityLog[]>([]);
  const [counts, setCounts] = useState<{ error: number; warning: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;

    const now = Date.now();
    const listParams = logsWindowQuery(projectId, view, now);
    listParams.set('limit', String(ROW_LIMIT));
    const countParams = logsWindowQuery(projectId, 'all', now);

    const [list, histogram] = await Promise.all([
      clientFetch<LogsResponse>(`/v1/dashboard/logs?${listParams.toString()}`, { signal: controller.signal }),
      clientFetch<HistogramResponse>(`/v1/dashboard/logs/histogram?${countParams.toString()}`, { signal: controller.signal })
    ]);
    if (controller.signal.aborted) return;

    if (list.error || !list.data) {
      setError(list.error ?? 'Could not load logs.');
    } else {
      setLogs(list.data.logs.slice(0, ROW_LIMIT));
      setError(null);
    }
    if (histogram.data?.summary) {
      setCounts({ error: histogram.data.summary.error, warning: histogram.data.summary.warning });
    }
    setLoading(false);
  }, [projectId, view]);

  useEffect(() => {
    setLoading(true);
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, REFRESH_MS);
    return () => {
      window.clearInterval(timer);
      inflight.current?.abort();
    };
  }, [load]);

  const project = projectId ? `projectId=${encodeURIComponent(projectId)}` : '';
  const allLogsHref = `/dashboard/logs${project ? `?${project}` : ''}`;

  return (
    <section
      className={`rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-xs dark:border-slate-800 dark:bg-slate-950 ${className}`}
      aria-label="Recent logs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-2.5 dark:border-slate-800/70">
        <div className="flex items-center gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">Recent logs</p>
          {counts ? (
            <p className="flex items-center gap-2.5 text-[11px] tabular-nums" title="Last 24 hours">
              <span className="text-red-700 dark:text-red-300">{counts.error.toLocaleString()} errors</span>
              <span className="text-amber-700 dark:text-amber-300">{counts.warning.toLocaleString()} warnings</span>
              <span className="text-neutral-400 dark:text-slate-500">24h</span>
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-7 items-center rounded-md border border-neutral-200 text-[11px] font-medium dark:border-slate-700" role="group" aria-label="Log filter">
            {(
              [
                ['all', 'All logs'],
                ['problems', 'Errors & Warnings']
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                aria-pressed={view === key}
                className={`h-full px-2.5 first:rounded-l-md last:rounded-r-md ${
                  view === key
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-slate-950'
                    : 'text-neutral-600 hover:bg-neutral-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <Link href={allLogsHref} className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400">
            View all logs &rarr;
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="py-4 text-xs text-neutral-500 dark:text-slate-400">Loading recent logs…</p>
      ) : error ? (
        <div className="flex items-center justify-between py-3 text-xs text-red-700 dark:text-red-300">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="font-semibold hover:underline">
            Retry
          </button>
        </div>
      ) : logs.length === 0 ? (
        <p className="py-4 text-xs text-neutral-500 dark:text-slate-400">
          {view === 'problems' ? 'No errors or warnings in the last 24 hours.' : 'No logs in the last 24 hours.'}
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 dark:divide-slate-800/70">
          {logs.map((log) => {
            const sev = severity(log.level);
            return (
              <li key={log.id}>
                <Link
                  href={`/dashboard/logs?logId=${encodeURIComponent(log.id)}${project ? `&${project}` : ''}`}
                  className="grid grid-cols-[64px_44px_minmax(0,110px)_minmax(0,1fr)] items-center gap-2.5 py-1.5 text-xs hover:bg-neutral-50 dark:hover:bg-slate-900"
                  title={log.message}
                >
                  <time dateTime={log.timestamp} className="font-mono text-[11px] tabular-nums text-neutral-500 dark:text-slate-400">
                    {timeLabel(log.timestamp)}
                  </time>
                  <span className={`font-mono text-[10px] font-semibold ${sev.className}`}>{sev.label}</span>
                  <span className="truncate text-neutral-600 dark:text-slate-300">{log.service || log.source}</span>
                  <span className="truncate text-neutral-900 dark:text-slate-100">{log.message}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
