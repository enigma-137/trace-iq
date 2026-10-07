'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SyntheticMonitorSummary } from '@traceiq/types';

interface SyntheticMonitorListProps {
  initialMonitors: SyntheticMonitorSummary[];
  projectId?: string;
  token: string | null;
  error?: string | null;
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function SyntheticMonitorList({
  initialMonitors,
  projectId,
  token,
  error: initialError
}: SyntheticMonitorListProps) {
  const router = useRouter();
  const [monitors, setMonitors] = useState<SyntheticMonitorSummary[]>(initialMonitors);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'failing'>('all');
  const [runningId, setRunningId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filteredMonitors = monitors.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.baseUrl.toLowerCase().includes(search.toLowerCase()) ||
      (m.description && m.description.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) return false;

    if (statusFilter === 'active') return m.status === 'active';
    if (statusFilter === 'paused') return m.status === 'paused';
    if (statusFilter === 'failing') return m.lastRunStatus === 'failed' || m.lastRunStatus === 'timed_out';
    return true;
  });

  const handleRunNow = async (monitorId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!token || runningId) return;

    setRunningId(monitorId);
    setActionError(null);

    try {
      const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
      const res = await fetch(`${apiBaseUrl}/v1/dashboard/synthetic-monitors/${monitorId}/run${query}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to trigger run');
      }

      // Refresh data
      router.refresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to run monitor');
    } finally {
      setRunningId(null);
    }
  };

  const handleToggleStatus = async (monitor: SyntheticMonitorSummary, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!token) return;

    const action = monitor.status === 'active' ? 'pause' : 'resume';
    try {
      const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
      const res = await fetch(`${apiBaseUrl}/v1/dashboard/synthetic-monitors/${monitor.id}/${action}${query}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) throw new Error(`Failed to ${action} monitor`);

      setMonitors((prev) =>
        prev.map((m) =>
          m.id === monitor.id
            ? { ...m, status: monitor.status === 'active' ? 'paused' : 'active' }
            : m
        )
      );
      router.refresh();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Error Banner */}
      {(initialError || actionError) && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
          {actionError || initialError}
        </div>
      )}

      {/* Controls Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search monitors or URLs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-72 rounded-lg border border-neutral-200 bg-white px-3.5 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-hidden dark:border-slate-800 dark:bg-slate-900 dark:text-white"
          />

          <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-100 p-0.5 dark:border-slate-800 dark:bg-slate-900">
            {(['all', 'active', 'failing', 'paused'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setStatusFilter(filter)}
                className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition ${statusFilter === filter
                    ? 'bg-white text-neutral-900 shadow-xs dark:bg-slate-800 dark:text-white'
                    : 'text-neutral-600 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        <Link
          href={`/dashboard/synthetic-monitors/new${projectId ? `?projectId=${projectId}` : ''}`}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 dark:bg-blue-600 dark:hover:bg-blue-500 shadow-xs"
        >
          <span className="text-base leading-none">+</span>
          Create Monitor
        </Link>
      </div>

      {/* Monitors List / Cards */}
      {filteredMonitors.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-950">
          {/* <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div> */}
          <h3 className="mt-4 text-base font-semibold text-neutral-900 dark:text-white">
            {search ? 'No matching synthetic monitors' : 'No synthetic monitors configured yet'}
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500 dark:text-slate-400">
            {search
              ? 'Try adjusting your search query or filter criteria.'
              : 'Create automated Playwright checks to continuously test your critical user flows around the clock.'}
          </p>
          {!search && (
            <div className="mt-6">
              <Link
                href={`/dashboard/synthetic-monitors/new${projectId ? `?projectId=${projectId}` : ''}`}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 shadow-xs"
              >
                + Create Your First Monitor
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredMonitors.map((mon) => {
            const isFailing = mon.lastRunStatus === 'failed' || mon.lastRunStatus === 'timed_out';
            const isPassing = mon.lastRunStatus === 'passed';
            const isRunning = mon.lastRunStatus === 'running' || runningId === mon.id;

            return (
              <div
                key={mon.id}
                className="group relative flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-5 transition hover:border-neutral-300 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700 sm:flex-row sm:items-center sm:justify-between shadow-xs"
              >
                {/* Left info */}
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/dashboard/synthetic-monitors/${mon.id}${projectId ? `?projectId=${projectId}` : ''}`}
                      className="font-semibold text-neutral-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400 truncate max-w-md text-base"
                    >
                      {mon.name}
                    </Link>

                    {/* Status Badge */}
                    {isRunning ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 animate-pulse">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Running
                      </span>
                    ) : mon.status === 'paused' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-slate-800 dark:text-slate-400">
                        Paused
                      </span>
                    ) : isPassing ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Passing
                      </span>
                    ) : isFailing ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                        Failing
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500 dark:bg-slate-800 dark:text-slate-400">
                        Never run
                      </span>
                    )}

                    {/* Schedule Badge */}
                    <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-mono text-neutral-600 dark:bg-slate-900 dark:text-slate-400">
                      ⏱ {mon.schedule === 'manual' ? 'Manual' : `Every ${mon.schedule}`}
                    </span>

                    {/* Browser Badge */}
                    <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-mono text-neutral-600 dark:bg-slate-900 dark:text-slate-400 capitalize">
                      {mon.browser}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-slate-400">
                    <span className="font-mono truncate max-w-sm text-neutral-700 dark:text-slate-300">
                      {mon.baseUrl}
                    </span>
                    <span>•</span>
                    <span>{mon.steps.length} {mon.steps.length === 1 ? 'step' : 'steps'}</span>
                    {mon.lastRunDurationMs !== null && mon.lastRunDurationMs !== undefined && (
                      <>
                        <span>•</span>
                        <span>{mon.lastRunDurationMs}ms</span>
                      </>
                    )}
                    {mon.successRate24h !== undefined && (
                      <>
                        <span>•</span>
                        <span className={mon.successRate24h >= 90 ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-rose-600 dark:text-rose-400 font-medium'}>
                          {mon.successRate24h}% 24h uptime
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => handleRunNow(mon.id, e)}
                    disabled={isRunning}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {isRunning ? (
                      <>
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                        Running...
                      </>
                    ) : (
                      <>
                        <span>▶</span>
                        Run now
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleToggleStatus(mon, e)}
                    className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {mon.status === 'active' ? 'Pause' : 'Resume'}
                  </button>

                  <Link
                    href={`/dashboard/synthetic-monitors/${mon.id}${projectId ? `?projectId=${projectId}` : ''}`}
                    className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    View
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
