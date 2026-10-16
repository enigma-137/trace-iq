'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { SyntheticMonitor, SyntheticRun } from '@traceiq/types';
import { requestsSearchHref } from '@/lib/requests';

interface RunDetailViewProps {
  run: SyntheticRun;
  monitor: SyntheticMonitor | null;
  projectId?: string;
}

export function RunDetailView({ run, monitor, projectId }: RunDetailViewProps) {
  const [activeTab, setActiveTab] = useState<'timeline' | 'screenshot' | 'console' | 'network' | 'errors'>('timeline');

  const isFailed = run.status === 'failed' || run.status === 'timed_out';
  const isPassed = run.status === 'passed';

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-slate-400">
        <Link
          href={`/dashboard/synthetic-monitors${projectId ? `?projectId=${projectId}` : ''}`}
          className="hover:text-neutral-900 dark:hover:text-white"
        >
          Synthetic Monitors
        </Link>
        <span>/</span>
        {monitor ? (
          <Link
            href={`/dashboard/synthetic-monitors/${monitor.id}${projectId ? `?projectId=${projectId}` : ''}`}
            className="hover:text-neutral-900 dark:hover:text-white truncate max-w-xs"
          >
            {monitor.name}
          </Link>
        ) : (
          <span>Monitor</span>
        )}
        <span>/</span>
        <span className="font-semibold text-neutral-900 dark:text-white font-mono">{run.id}</span>
      </div>

      {/* Execution Summary Banner */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950 space-y-4 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              {isPassed ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  PASSED
                </span>
              ) : isFailed ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  {run.status === 'timed_out' ? 'TIMED OUT' : 'FAILED'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 animate-pulse">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  RUNNING
                </span>
              )}

              <h1 className="text-lg font-bold text-neutral-900 dark:text-white sm:text-xl">
                Synthetic Execution #{run.id.slice(-8)}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-slate-400 pt-1">
              <span>Trigger: <strong className="capitalize text-neutral-800 dark:text-slate-200">{run.trigger}</strong></span>
              <span>•</span>
              <span>Duration: <strong className="font-mono text-neutral-800 dark:text-slate-200">{run.durationMs ?? '—'}ms</strong></span>
              <span>•</span>
              <span>Browser: <strong className="capitalize text-neutral-800 dark:text-slate-200">{run.browser} ({run.viewport.width}×{run.viewport.height})</strong></span>
              <span>•</span>
              <span>Time: <strong>{new Date(run.createdAt).toLocaleString()}</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {monitor && (
              <Link
                href={`/dashboard/synthetic-monitors/${monitor.id}${projectId ? `?projectId=${projectId}` : ''}`}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
              >
                Back to Monitor
              </Link>
            )}
          </div>
        </div>

        {/* CI Provenance Card */}
        {run.trigger === 'ci' && (
          <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-4 dark:border-purple-900/50 dark:bg-purple-950/20 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-semibold text-purple-900 dark:text-purple-200">
                  CI Preview Run
                </span>
                {run.pullRequestNumber && (
                  <span className="rounded bg-purple-100 px-2 py-0.5 font-mono font-medium text-purple-800 dark:bg-purple-900/80 dark:text-purple-200">
                    PR #{run.pullRequestNumber}
                  </span>
                )}
                {run.branch && (
                  <span className="text-neutral-600 dark:text-slate-400">
                    Branch: <strong className="font-mono text-neutral-800 dark:text-slate-200">{run.branch}</strong>
                  </span>
                )}
                {run.commitSha && (
                  <span className="text-neutral-600 dark:text-slate-400">
                    Commit: <strong className="font-mono text-neutral-800 dark:text-slate-200">{run.commitSha.slice(0, 7)}</strong>
                  </span>
                )}
                {run.repository && (
                  <span className="text-neutral-600 dark:text-slate-400">
                    Repo: <strong className="font-mono text-neutral-800 dark:text-slate-200">{run.repository}</strong>
                  </span>
                )}
              </div>
              <div className="font-mono text-neutral-600 dark:text-slate-300">
                Target: <span className="text-blue-600 dark:text-blue-400 underline">{run.targetUrl}</span>
              </div>
            </div>
          </div>
        )}

        {/* Failure Box */}
        {isFailed && run.failureReason && (
          <div className="rounded-lg border border-rose-200 bg-rose-50/80 p-4 dark:border-rose-900/60 dark:bg-rose-950/40">
            <div className="flex items-start gap-2">
              <span className="text-rose-600 dark:text-rose-400 font-bold text-sm">✕</span>
              <div className="space-y-1 flex-1">
                <div className="text-xs font-bold text-rose-800 dark:text-rose-200">
                  {run.failedStepIndex !== null && run.failedStepIndex !== undefined
                    ? `Execution halted on Step #${run.failedStepIndex + 1}`
                    : 'Execution Failure'}
                </div>
                <div className="font-mono text-xs text-rose-700 dark:text-rose-300 whitespace-pre-wrap">
                  {run.failureReason}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-neutral-200 dark:border-slate-800 flex flex-wrap gap-6 text-sm font-medium">
        <button
          type="button"
          onClick={() => setActiveTab('timeline')}
          className={`pb-3 transition border-b-2 ${
            activeTab === 'timeline'
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
          }`}
        >
          Step Timeline ({run.stepResults.length})
        </button>

        {run.screenshotBase64 && (
          <button
            type="button"
            onClick={() => setActiveTab('screenshot')}
            className={`pb-3 transition border-b-2 flex items-center gap-1.5 ${
              activeTab === 'screenshot'
                ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <span>📷 Failure Screenshot</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setActiveTab('console')}
          className={`pb-3 transition border-b-2 ${
            activeTab === 'console'
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
          }`}
        >
          Console Logs ({run.consoleLogs.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('network')}
          className={`pb-3 transition border-b-2 ${
            activeTab === 'network'
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
          }`}
        >
          Network Requests ({run.networkRequests.length})
        </button>

        {run.httpErrors.length > 0 && (
          <button
            type="button"
            onClick={() => setActiveTab('errors')}
            className={`pb-3 transition border-b-2 text-rose-600 dark:text-rose-400 ${
              activeTab === 'errors' ? 'border-rose-600' : 'border-transparent'
            }`}
          >
            HTTP Errors ({run.httpErrors.length})
          </button>
        )}
      </div>

      {/* Tab Content 1: Step Timeline */}
      {activeTab === 'timeline' && (
        <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950 space-y-3 shadow-xs">
          {run.stepResults.length === 0 ? (
            <div className="text-center py-6 text-sm text-neutral-500 dark:text-slate-400">
              No step execution records available.
            </div>
          ) : (
            run.stepResults.map((st, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-3.5 rounded-lg border p-4 transition ${
                  st.status === 'passed'
                    ? 'border-emerald-100 bg-emerald-50/30 dark:border-emerald-950/40 dark:bg-emerald-950/20'
                    : st.status === 'failed'
                    ? 'border-rose-200 bg-rose-50/50 dark:border-rose-900/50 dark:bg-rose-950/30'
                    : 'border-neutral-200 bg-neutral-50/40 dark:border-slate-800 dark:bg-slate-900/20 opacity-60'
                }`}
              >
                {/* Status icon badge */}
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    st.status === 'passed'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                      : st.status === 'failed'
                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200'
                      : 'bg-neutral-200 text-neutral-600 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {st.status === 'passed' ? '✓' : st.status === 'failed' ? '✕' : '–'}
                </span>

                <div className="flex-1 space-y-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-sm bg-neutral-200/80 px-2 py-0.5 text-[11px] font-mono uppercase text-neutral-800 dark:bg-slate-800 dark:text-slate-200">
                        {st.stepType}
                      </span>
                      <span className="text-xs font-semibold text-neutral-900 dark:text-white">
                        {st.description || `Step #${idx + 1}`}
                      </span>
                    </div>

                    <span className="font-mono text-xs text-neutral-500 dark:text-slate-400 shrink-0">
                      {st.durationMs}ms
                    </span>
                  </div>

                  {st.error && (
                    <div className="mt-2 rounded-md bg-white/80 p-2.5 font-mono text-xs text-rose-700 dark:bg-slate-950/80 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50">
                      {st.error}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab Content 2: Screenshot */}
      {activeTab === 'screenshot' && run.screenshotBase64 && (
        <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950 space-y-3 shadow-xs">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
            DOM Visual Capture at Failure Moment
          </h3>
          <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-slate-800 bg-neutral-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={run.screenshotBase64}
              alt="Synthetic failure screenshot"
              className="w-full h-auto object-contain max-h-[700px] mx-auto"
            />
          </div>
        </div>
      )}

      {/* Tab Content 3: Console Logs */}
      {activeTab === 'console' && (
        <div className="rounded-xl border border-neutral-200 bg-neutral-950 p-4 font-mono text-xs text-neutral-300 dark:border-slate-800 shadow-xs max-h-[500px] overflow-y-auto">
          {run.consoleLogs.length === 0 ? (
            <div className="text-neutral-500 p-4 text-center">No console output recorded during this session.</div>
          ) : (
            <div className="space-y-1.5">
              {run.consoleLogs.map((log, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className={`px-1.5 py-0.2 rounded uppercase text-[10px] ${
                    log.type === 'error'
                      ? 'bg-rose-950 text-rose-300'
                      : log.type === 'warn'
                      ? 'bg-amber-950 text-amber-300'
                      : 'bg-neutral-800 text-neutral-400'
                  }`}>
                    {log.type}
                  </span>
                  <span className="text-neutral-500">{log.timestamp.slice(11, 19)}</span>
                  <span className={log.type === 'error' ? 'text-rose-400' : 'text-neutral-200'}>
                    {log.text}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab Content 4: Network Requests */}
      {activeTab === 'network' && (
        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden dark:border-slate-800 dark:bg-slate-950 shadow-xs">
          {run.networkRequests.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-500">No network requests captured.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-neutral-200 bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 text-neutral-600 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2">Method</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">URL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-slate-800/60 font-mono">
                  {run.networkRequests.map((req, i) => (
                    <tr key={i} className="hover:bg-neutral-50 dark:hover:bg-slate-900/40">
                      <td className="px-4 py-2 font-semibold text-neutral-700 dark:text-slate-300">{req.method}</td>
                      <td className="px-4 py-2">
                        {req.status ? (
                          <span className={req.status >= 400 ? 'text-rose-600 font-bold' : 'text-emerald-600'}>
                            {req.status}
                          </span>
                        ) : (
                          <span className="text-rose-500">FAILED</span>
                        )}
                      </td>
                      <td className="px-4 py-2 truncate max-w-lg text-neutral-600 dark:text-slate-400">
                        {req.url}
                        {req.requestId ? (
                          <Link
                            href={requestsSearchHref(req.requestId, projectId)}
                            className="ml-2 font-sans text-[11px] font-medium text-blue-700 hover:underline dark:text-blue-300"
                            title={`Request ID ${req.requestId}`}
                          >
                            View request →
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab Content 5: HTTP Errors */}
      {activeTab === 'errors' && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-6 dark:border-rose-950 dark:bg-rose-950/30 space-y-3 shadow-xs">
          <h3 className="text-sm font-semibold text-rose-900 dark:text-rose-200">
            HTTP 4xx / 5xx Network Failures Encountered
          </h3>
          <div className="space-y-2 font-mono text-xs">
            {run.httpErrors.map((err, i) => (
              <div key={i} className="rounded-md bg-white p-3 border border-rose-200 dark:bg-slate-950 dark:border-rose-900/50 flex items-center justify-between gap-4">
                <div className="truncate flex-1">
                  <span className="font-bold text-rose-600 mr-2">{err.status}</span>
                  <span className="text-neutral-500 mr-2">{err.method}</span>
                  <span className="text-neutral-800 dark:text-slate-200">{err.url}</span>
                </div>
                {err.statusText && <span className="text-rose-700 dark:text-rose-300 shrink-0">{err.statusText}</span>}
                {err.requestId ? (
                  <Link
                    href={requestsSearchHref(err.requestId, projectId)}
                    className="shrink-0 font-sans text-[11px] font-medium text-blue-700 hover:underline dark:text-blue-300"
                  >
                    View request →
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
