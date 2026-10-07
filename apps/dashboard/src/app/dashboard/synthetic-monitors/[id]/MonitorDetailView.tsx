'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SyntheticMonitor, SyntheticRun } from '@traceiq/types';

interface MonitorDetailViewProps {
  monitor: SyntheticMonitor;
  runs: SyntheticRun[];
  projectId?: string;
  token: string | null;
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function MonitorDetailView({
  monitor,
  runs: initialRuns,
  projectId,
  token
}: MonitorDetailViewProps) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<'journey' | 'runs'>('journey');
  const [error, setError] = useState<string | null>(null);

  const handleRunNow = async () => {
    if (!token || isRunning) return;
    setIsRunning(true);
    setError(null);

    try {
      const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
      const res = await fetch(`${apiBaseUrl}/v1/dashboard/synthetic-monitors/${monitor.id}/run${query}`, {
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

      router.refresh();
      setActiveTab('runs');
    } catch (err: any) {
      setError(err.message || 'Failed to trigger manual run');
    } finally {
      setIsRunning(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this synthetic monitor? All run history will be removed.')) {
      return;
    }

    try {
      const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
      const res = await fetch(`${apiBaseUrl}/v1/dashboard/synthetic-monitors/${monitor.id}${query}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) throw new Error('Failed to delete monitor');
      router.push(`/dashboard/synthetic-monitors${projectId ? `?projectId=${projectId}` : ''}`);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleStatus = async () => {
    const action = monitor.status === 'active' ? 'pause' : 'resume';
    try {
      const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
      const res = await fetch(`${apiBaseUrl}/v1/dashboard/synthetic-monitors/${monitor.id}/${action}${query}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) throw new Error(`Failed to ${action} monitor`);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const isFailing = monitor.lastRunStatus === 'failed' || monitor.lastRunStatus === 'timed_out';
  const isPassing = monitor.lastRunStatus === 'passed';

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Breadcrumb & Navigation */}
      <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-slate-400">
        <Link
          href={`/dashboard/synthetic-monitors${projectId ? `?projectId=${projectId}` : ''}`}
          className="hover:text-neutral-900 dark:hover:text-white"
        >
          Synthetic Monitors
        </Link>
        <span>/</span>
        <span className="font-semibold text-neutral-900 dark:text-white">{monitor.name}</span>
      </div>

      {/* Header Info Banner */}
      <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between shadow-xs">
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-2xl">
              {monitor.name}
            </h1>

            {/* Status indicator */}
            {monitor.status === 'paused' ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600 dark:bg-slate-800 dark:text-slate-400">
                Paused
              </span>
            ) : isPassing ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Passing
              </span>
            ) : isFailing ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                Failing
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-500 dark:bg-slate-800 dark:text-slate-400">
                Never run
              </span>
            )}
          </div>

          <p className="text-sm text-neutral-500 dark:text-slate-400">
            {monitor.description || 'Deterministic automated Playwright journey monitor.'}
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-600 dark:text-slate-300 pt-1">
            <span className="font-mono">{monitor.baseUrl}</span>
            <span>•</span>
            <span>⏱ Every {monitor.schedule}</span>
            <span>•</span>
            <span className="capitalize">{monitor.browser} ({monitor.viewportWidth}×{monitor.viewportHeight})</span>
            {monitor.lastRunDurationMs !== null && (
              <>
                <span>•</span>
                <span>Last run: {monitor.lastRunDurationMs}ms</span>
              </>
            )}
          </div>

          {monitor.sourceType === 'funnel' && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-md border border-purple-200/80 bg-purple-50/70 px-3 py-1.5 text-xs text-purple-900 dark:border-purple-900/50 dark:bg-purple-950/30 dark:text-purple-300">
              <span className="font-semibold flex items-center gap-1">
                <span>🔄</span> Converted from Funnel:
              </span>
              {monitor.sourceFunnelId ? (
                <Link
                  href={`/dashboard/funnels/${monitor.sourceFunnelId}${projectId ? `?projectId=${projectId}` : ''}`}
                  className="font-medium underline decoration-purple-400 underline-offset-2 hover:text-purple-700 dark:hover:text-purple-200"
                >
                  {monitor.sourceFunnelName || 'Source Funnel'}
                </Link>
              ) : (
                <span className="font-medium">{monitor.sourceFunnelName || 'Original Funnel (deleted)'}</span>
              )}
              <span className="text-purple-600/70 dark:text-purple-400/60">•</span>
              <span className="text-purple-700/80 dark:text-purple-300/80">
                Created {new Date(monitor.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                {monitor.sourceFunnelStepCount ? ` (${monitor.sourceFunnelStepCount} milestones)` : ''}
              </span>
            </div>
          )}
        </div>

        {/* Header Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleRunNow}
            disabled={isRunning}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50 shadow-xs"
          >
            {isRunning ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Executing...
              </>
            ) : (
              <>
                <span>▶</span>
                Run Now
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleToggleStatus}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {monitor.status === 'active' ? 'Pause' : 'Resume'}
          </button>

          <button
            type="button"
            onClick={handleDelete}
            className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:bg-slate-900 dark:text-rose-400 dark:hover:bg-rose-950/50"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-neutral-200 dark:border-slate-800 flex gap-6">
        <button
          type="button"
          onClick={() => setActiveTab('journey')}
          className={`pb-3 text-sm font-medium transition border-b-2 ${
            activeTab === 'journey'
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
          }`}
        >
          Journey Steps ({monitor.steps.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('runs')}
          className={`pb-3 text-sm font-medium transition border-b-2 ${
            activeTab === 'runs'
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
          }`}
        >
          Execution History ({initialRuns.length})
        </button>
      </div>

      {/* Tab 1: Journey Steps View */}
      {activeTab === 'journey' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950 shadow-xs">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white mb-4">
              Configured Step Sequence
            </h3>

            <div className="space-y-3">
              {monitor.steps.map((step, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3.5 rounded-lg border border-neutral-100 bg-neutral-50/60 p-3.5 dark:border-slate-800/80 dark:bg-slate-900/40"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                    {idx + 1}
                  </span>

                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-sm bg-neutral-200/70 px-2 py-0.5 text-[11px] font-mono uppercase text-neutral-800 dark:bg-slate-800 dark:text-slate-200">
                        {step.type}
                      </span>
                      {step.description && (
                        <span className="text-xs font-medium text-neutral-700 dark:text-slate-300">
                          {step.description}
                        </span>
                      )}
                    </div>

                    <div className="font-mono text-xs text-neutral-600 dark:text-slate-400">
                      {step.url && <div>URL: <span className="text-neutral-900 dark:text-slate-200">{step.url}</span></div>}
                      {step.selector && <div>Selector: <span className="text-neutral-900 dark:text-slate-200">{step.selector}</span></div>}
                      {step.value && <div>Value: <span className="text-neutral-900 dark:text-slate-200">"{step.value}"</span></div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Runs History */}
      {activeTab === 'runs' && (
        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden dark:border-slate-800 dark:bg-slate-950 shadow-xs">
          {initialRuns.length === 0 ? (
            <div className="p-12 text-center text-neutral-500 dark:text-slate-400">
              No runs recorded yet. Click "Run Now" to execute this journey.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Trigger</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Failed Step</th>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-slate-800/60">
                  {initialRuns.map((run) => (
                    <tr key={run.id} className="hover:bg-neutral-50/50 dark:hover:bg-slate-900/30 transition">
                      <td className="px-4 py-3">
                        {run.status === 'passed' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                            Passed
                          </span>
                        ) : run.status === 'running' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 animate-pulse">
                            Running
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                            {run.status === 'timed_out' ? 'Timed Out' : 'Failed'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {run.trigger === 'ci' ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 rounded-sm bg-purple-50 px-1.5 py-0.5 text-[11px] font-medium text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 w-fit">
                              <span className="font-mono">PR #{run.pullRequestNumber || run.branch || 'CI'}</span>
                            </span>
                            {run.branch && (
                              <span className="text-[10px] text-neutral-400 font-mono truncate max-w-[120px]">
                                {run.branch}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="capitalize text-neutral-600 dark:text-slate-400">
                            {run.trigger}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-neutral-700 dark:text-slate-300">
                        {run.durationMs !== null ? `${run.durationMs}ms` : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-600 dark:text-slate-400 max-w-xs truncate">
                        {run.failedStepIndex !== null && run.failedStepIndex !== undefined ? (
                          <span className="text-rose-600 dark:text-rose-400">
                            Step #{run.failedStepIndex + 1}: {run.failureReason || 'Error'}
                          </span>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-500 dark:text-slate-400">
                        {new Date(run.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/dashboard/synthetic-monitors/${monitor.id}/runs/${run.id}${projectId ? `?projectId=${projectId}` : ''}`}
                          className="rounded-md bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                        >
                          Debug
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
