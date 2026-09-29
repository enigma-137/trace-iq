'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import {
  ObservabilityLog,
  TraceSpan,
  TraceWaterfallResponse
} from './types';

const defaultApiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface LogDetailDrawerProps {
  log: ObservabilityLog | null;
  onClose: () => void;
  apiBaseUrl?: string;
  projectId?: string | null;
}

export function LogDetailDrawer({
  log,
  onClose,
  apiBaseUrl = defaultApiBaseUrl,
  projectId
}: LogDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'payload' | 'error' | 'trace'>('overview');
  const [traceData, setTraceData] = useState<TraceWaterfallResponse | null>(null);
  const [loadingTrace, setLoadingTrace] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!log) {
      setTraceData(null);
      return;
    }

    let isMounted = true;
    const fetchTrace = async () => {
      setLoadingTrace(true);
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session }
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;

        const queryParams = new URLSearchParams();
        if (projectId) queryParams.set('projectId', projectId);
        const res = await fetch(`${apiBaseUrl}/v1/dashboard/logs/${log.id}/trace?${queryParams.toString()}`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (isMounted) setTraceData(data);
        }
      } catch {
        // Trace fetch failure handled gracefully
      } finally {
        if (isMounted) setLoadingTrace(false);
      }
    };

    fetchTrace();
    return () => {
      isMounted = false;
    };
  }, [log, projectId, apiBaseUrl]);

  if (!log) return null;

  const copyToClipboard = (text: string, keyName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyName);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const hasErrors = !!log.errorDetails;

  return (
    <div
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-neutral-200 bg-white shadow-2xl transition-transform dark:border-slate-800 dark:bg-slate-900"
      role="dialog"
      aria-modal="true"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-slate-800">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <span
            className={`rounded px-2 py-0.5 font-mono text-xs font-bold ${log.level === 'error' || log.level === 'fatal'
              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
              : log.level === 'warn'
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                : 'text-blue-800 dark:bg-blue-950 dark:text-blue-300'
              }`}
          >
            {log.level.toUpperCase()}
          </span>
          <h2 className="truncate text-sm font-semibold text-neutral-900 dark:text-white">
            {log.method ? `${log.method} ` : ''}{log.route || log.service || log.message}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          title="Close drawer"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-200 px-5 text-xs font-medium dark:border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`border-b-2 py-3 px-3 transition ${activeTab === 'overview'
            ? 'border-blue-600 font-semibold text-blue-600 dark:border-blue-400 dark:text-blue-400'
            : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
            }`}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('trace')}
          className={`flex items-center gap-1.5 border-b-2 py-3 px-3 transition ${activeTab === 'trace'
            ? 'border-blue-600 font-semibold text-blue-600 dark:border-blue-400 dark:text-blue-400'
            : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
            }`}
        >
          <span>Trace Waterfall</span>
          {traceData?.spans && (
            <span className="rounded-full bg-neutral-100 px-1.5 py-0.2 text-[10px] text-neutral-600 dark:bg-slate-800 dark:text-slate-300">
              {traceData.spans.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('payload')}
          className={`border-b-2 py-3 px-3 transition ${activeTab === 'payload'
            ? 'border-blue-600 font-semibold text-blue-600 dark:border-blue-400 dark:text-blue-400'
            : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
            }`}
        >
          Metadata & Headers
        </button>
        {hasErrors && (
          <button
            type="button"
            onClick={() => setActiveTab('error')}
            className={`flex items-center gap-1 border-b-2 py-3 px-3 transition ${activeTab === 'error'
              ? 'border-rose-600 font-semibold text-rose-600 dark:border-rose-400 dark:text-rose-400'
              : 'border-transparent text-rose-600 hover:text-rose-700 dark:text-rose-400'
              }`}
          >
            <span>Error Details</span>
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 text-xs">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Primary Details Grid */}
            <div className="grid grid-cols-2 gap-4 rounded-lg border border-neutral-100 bg-neutral-50/60 p-4 dark:border-slate-800/80 dark:bg-slate-900/40">
              <div>
                <span className="text-[11px] text-neutral-400 dark:text-slate-500">Timestamp</span>
                <div className="mt-0.5 font-mono font-medium text-neutral-900 dark:text-slate-100">
                  {new Date(log.timestamp).toLocaleString()}
                </div>
              </div>
              <div>
                <span className="text-[11px] text-neutral-400 dark:text-slate-500">Status / Code</span>
                <div className="mt-0.5 font-medium text-neutral-900 dark:text-slate-100">
                  {log.statusCode ? `${log.statusCode} (${log.status})` : log.status}
                </div>
              </div>
              <div>
                <span className="text-[11px] text-neutral-400 dark:text-slate-500">Latency / Duration</span>
                <div className="mt-0.5 font-mono font-medium text-neutral-900 dark:text-slate-100">
                  {log.durationMs !== undefined && log.durationMs !== null ? `${log.durationMs}ms` : 'N/A'}
                </div>
              </div>
              <div>
                <span className="text-[11px] text-neutral-400 dark:text-slate-500">Service / Source</span>
                <div className="mt-0.5 font-medium text-neutral-900 dark:text-slate-100">
                  {log.service} ({log.source})
                </div>
              </div>
              <div>
                <span className="text-[11px] text-neutral-400 dark:text-slate-500">Environment</span>
                <div className="mt-0.5 font-medium text-neutral-900 dark:text-slate-100">
                  {log.environment}
                </div>
              </div>
              <div>
                <span className="text-[11px] text-neutral-400 dark:text-slate-500">Client IP</span>
                <div className="mt-0.5 font-mono font-medium text-neutral-900 dark:text-slate-100">
                  {log.clientIp || 'N/A'}
                </div>
              </div>
            </div>

            {/* AI Execution Details (if applicable) */}
            {(log.provider || log.model || log.inputTokens || log.outputTokens || log.costUsd) && (
              <div className="rounded-lg border border-purple-200 bg-purple-50/40 p-4 dark:border-purple-900/50 dark:bg-purple-950/20">
                <h3 className="text-xs font-semibold text-purple-900 dark:text-purple-300">AI Execution Telemetry</h3>
                <div className="mt-2.5 grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[11px] text-purple-700/70 dark:text-purple-400/70">Provider & Model</span>
                    <div className="font-mono text-purple-900 dark:text-purple-200">
                      {log.provider || 'AI'}: {log.model || 'unknown'}
                    </div>
                  </div>
                  <div>
                    <span className="text-[11px] text-purple-700/70 dark:text-purple-400/70">Cost</span>
                    <div className="font-mono text-purple-900 dark:text-purple-200">
                      {log.costUsd !== null && log.costUsd !== undefined ? `$${log.costUsd.toFixed(6)}` : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <span className="text-[11px] text-purple-700/70 dark:text-purple-400/70">Tokens (In / Out)</span>
                    <div className="font-mono text-purple-900 dark:text-purple-200">
                      {log.inputTokens ?? 0} in / {log.outputTokens ?? 0} out ({(log.inputTokens ?? 0) + (log.outputTokens ?? 0)} total)
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Correlation Identifiers */}
            <div>
              <h3 className="mb-2 text-xs font-semibold text-neutral-900 dark:text-white">Correlation Identifiers</h3>
              <div className="space-y-2">
                {log.traceId && (
                  <div className="flex items-center justify-between rounded-md border border-neutral-200 p-2.5 dark:border-slate-800">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-neutral-400 dark:text-slate-500">Trace ID</span>
                      <div className="font-mono text-xs text-neutral-800 dark:text-slate-200">{log.traceId}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(log.traceId!, 'traceId')}
                      className="rounded border border-neutral-200 px-2 py-1 text-[11px] hover:bg-neutral-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      {copiedKey === 'traceId' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                )}

                {log.requestId && (
                  <div className="flex items-center justify-between rounded-md border border-neutral-200 p-2.5 dark:border-slate-800">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-neutral-400 dark:text-slate-500">Request ID</span>
                      <div className="font-mono text-xs text-neutral-800 dark:text-slate-200">{log.requestId}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(log.requestId!, 'requestId')}
                      className="rounded border border-neutral-200 px-2 py-1 text-[11px] hover:bg-neutral-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      {copiedKey === 'requestId' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                )}

                {log.sessionId && (
                  <div className="flex items-center justify-between rounded-md border border-neutral-200 p-2.5 dark:border-slate-800">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-neutral-400 dark:text-slate-500">Session ID</span>
                      <div className="font-mono text-xs text-neutral-800 dark:text-slate-200">{log.sessionId}</div>
                    </div>
                    <Link
                      href={`/dashboard/replays?session=${log.sessionId}`}
                      className="rounded px-2 py-1 text-[11px] font-medium text-blue-700 hover:dark:bg-blue-950/60 dark:text-blue-300"
                    >
                      View Session Replay →
                    </Link>
                  </div>
                )}

                {log.distinctId && (
                  <div className="flex items-center justify-between rounded-md border border-neutral-200 p-2.5 dark:border-slate-800">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-neutral-400 dark:text-slate-500">User / Distinct ID</span>
                      <div className="font-mono text-xs text-neutral-800 dark:text-slate-200">{log.distinctId}</div>
                    </div>
                    <Link
                      href={`/dashboard/users?userId=${log.distinctId}`}
                      className="rounded bg-neutral-100 px-2 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-200 dark:bg-slate-800 dark:text-slate-300"
                    >
                      View User Profile →
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* User Agent */}
            {log.userAgent && (
              <div>
                <span className="text-[11px] text-neutral-400 dark:text-slate-500">User Agent</span>
                <div className="mt-1 rounded-md border border-neutral-200 bg-neutral-50 p-2.5 font-mono text-[11px] text-neutral-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                  {log.userAgent}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TRACE WATERFALL TAB */}
        {activeTab === 'trace' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-500 dark:text-slate-400">
                Correlated execution spans ({traceData?.spans.length || 0} total)
              </span>
              <span className="text-[11px] text-neutral-400 dark:text-slate-500">
                Window: ±15 mins
              </span>
            </div>

            {loadingTrace ? (
              <div className="flex h-32 items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              </div>
            ) : !traceData || traceData.spans.length === 0 ? (
              <div className="rounded-md border border-dashed border-neutral-200 p-8 text-center text-xs text-neutral-400 dark:border-slate-800 dark:text-slate-500">
                No related traces found for this record.
              </div>
            ) : (
              <div className="relative space-y-2 border-l-2 border-neutral-200 pl-4 dark:border-slate-800">
                {traceData.spans.map((span: TraceSpan) => {
                  const isCurrent = span.id === log.id;
                  return (
                    <div
                      key={span.id}
                      className={`relative rounded-md border p-3 transition ${isCurrent
                        ? 'border-blue-500 bg-blue-50/50 shadow-sm dark:border-blue-500/50 dark:bg-blue-950/30'
                        : 'border-neutral-200 bg-white hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:bg-slate-800/40'
                        }`}
                    >
                      {/* Left dot indicator */}
                      <span
                        className={`absolute -left-[21px] top-4 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-slate-900 ${span.status === 'error'
                          ? 'bg-rose-500'
                          : span.status === 'warning'
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                          }`}
                      />

                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="rounded bg-neutral-100 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-neutral-700 dark:bg-slate-800 dark:text-slate-300">
                              {span.source.toUpperCase()}
                            </span>
                            <span className="font-semibold text-neutral-900 dark:text-slate-100">
                              {span.service}
                            </span>
                            {isCurrent && (
                              <span className="rounded bg-blue-600 px-1.5 py-0.2 text-[9px] font-bold text-white">
                                CURRENT
                              </span>
                            )}
                          </div>
                          <div className="mt-1 font-mono text-[11px] text-neutral-600 dark:text-slate-400">
                            {span.operation}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-mono text-xs font-semibold text-neutral-800 dark:text-slate-200">
                            {span.durationMs !== undefined && span.durationMs !== null ? `${span.durationMs}ms` : '-'}
                          </div>
                          <div className="text-[10px] text-neutral-400 dark:text-slate-500">
                            +{span.offsetMs}ms
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* METADATA & HEADERS TAB */}
        {activeTab === 'payload' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-neutral-500 dark:text-slate-400">
                🔒 Sensitive tokens, keys and headers automatically redacted
              </span>
              <button
                type="button"
                onClick={() =>
                  copyToClipboard(
                    JSON.stringify(log.metadata ?? {}, null, 2),
                    'metadataJson'
                  )
                }
                className="rounded border border-neutral-200 px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {copiedKey === 'metadataJson' ? 'Copied JSON!' : 'Copy JSON'}
              </button>
            </div>

            <pre className="max-h-[460px] overflow-auto rounded-lg border border-neutral-200 bg-neutral-950 p-4 font-mono text-xs leading-5 text-emerald-400 shadow-inner dark:border-slate-800">
              <code>{JSON.stringify(log.metadata ?? {}, null, 2)}</code>
            </pre>
          </div>
        )}

        {/* ERROR DETAILS TAB */}
        {activeTab === 'error' && log.errorDetails && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                Exception Diagnostic Details
              </span>
              <button
                type="button"
                onClick={() =>
                  copyToClipboard(
                    JSON.stringify(log.errorDetails ?? {}, null, 2),
                    'errorJson'
                  )
                }
                className="rounded border border-rose-300 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300"
              >
                {copiedKey === 'errorJson' ? 'Copied Error!' : 'Copy Error Stack'}
              </button>
            </div>

            <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3 text-xs dark:border-rose-900/60 dark:bg-rose-950/20">
              <div className="font-semibold text-rose-900 dark:text-rose-300">
                {(log.errorDetails.name as string) || 'Error'}: {(log.errorDetails.message as string) || log.message}
              </div>
            </div>

            <pre className="max-h-[400px] overflow-auto rounded-lg border border-neutral-800 bg-neutral-950 p-4 font-mono text-xs leading-5 text-rose-300 shadow-inner">
              <code>{(log.errorDetails.stack as string) || JSON.stringify(log.errorDetails, null, 2)}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
