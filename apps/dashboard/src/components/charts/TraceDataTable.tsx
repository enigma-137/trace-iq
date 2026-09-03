'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export interface TraceRowItem {
  id: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  occurredAt: string;
  actor: string | null;
}

interface TraceDataTableProps {
  traces: TraceRowItem[];
  projectId?: string | null;
  className?: string;
}

export function TraceDataTable({
  traces = [],
  projectId,
  className = ''
}: TraceDataTableProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | '200' | '429' | '500'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filtered = traces.filter((trace) => {
    const matchesSearch =
      search === '' ||
      trace.id.toLowerCase().includes(search.toLowerCase()) ||
      trace.path.toLowerCase().includes(search.toLowerCase()) ||
      (trace.actor && trace.actor.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === '200' && trace.status >= 200 && trace.status < 300) ||
      (statusFilter === '429' && trace.status === 429) ||
      (statusFilter === '500' && trace.status >= 500);

    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: number) => {
    if (status >= 200 && status < 300) {
      return (
        <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
          {status} OK
        </span>
      );
    }
    if (status === 429) {
      return (
        <span className="inline-flex items-center rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-600 dark:text-amber-400">
          429 Rate Limit
        </span>
      );
    }
    if (status >= 400 && status < 500) {
      return (
        <span className="inline-flex items-center rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-orange-600 dark:text-orange-400">
          {status} Client Err
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-rose-600 dark:text-rose-400">
        {status} Server Err
      </span>
    );
  };

  const getMethodBadge = (method: string) => {
    const colors: Record<string, string> = {
      GET: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/60',
      POST: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60',
      PUT: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60',
      DELETE: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60'
    };
    const style = colors[method.toUpperCase()] || 'text-neutral-600 bg-neutral-100 border-neutral-200 dark:text-slate-300 dark:bg-slate-800 dark:border-slate-700';
    return (
      <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${style}`}>
        {method.toUpperCase()}
      </span>
    );
  };

  const formatRelativeTime = (iso: string) => {
    const ms = Date.now() - new Date(iso).getTime();
    const min = Math.floor(ms / 60_000);
    if (min < 1) return 'Just now';
    if (min < 60) return `${min}m ago`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div
      className={`flex flex-col justify-between overflow-hidden rounded-md border border-neutral-200 bg-white shadow-xs dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${className}`}
    >
      {/* Header */}
      <div className="flex flex-col gap-3 p-5 pb-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-100 dark:border-slate-800/70">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200">
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Recent Ingestion & API Traces</h3>
            <p className="text-xs text-neutral-500 dark:text-slate-400">Live request telemetry stream with execution timings</p>
          </div>
        </div>

        <Link
          href={projectId ? `/dashboard/api-performance?projectId=${projectId}` : '/dashboard/api-performance'}
          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          <span>Full Performance Suite</span>
          <span>&rarr;</span>
        </Link>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 bg-neutral-50/50 px-5 py-3 dark:border-slate-800/70 dark:bg-slate-950/30">
        <div className="relative w-full max-w-xs">
          <svg
            className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-neutral-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search by Trace ID or path..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full rounded-md border border-neutral-200 bg-white pl-8 pr-3 text-xs placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
          />
        </div>

        <div className="flex items-center gap-1 text-xs">
          <span className="text-neutral-500 dark:text-slate-400 mr-1 font-medium">Status:</span>
          {(['all', '200', '429', '500'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded px-2 py-0.5 font-medium transition ${
                statusFilter === s
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-black font-semibold'
                  : 'text-neutral-600 hover:bg-neutral-200/60 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-neutral-200/80 bg-neutral-50/80 text-neutral-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
            <tr>
              <th className="px-5 py-2.5 font-semibold">Trace ID</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold">Method & Endpoint</th>
              <th className="px-3 py-2.5 font-semibold">Duration</th>
              <th className="px-3 py-2.5 font-semibold">Time</th>
              <th className="px-5 py-2.5 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-slate-800/60 text-neutral-700 dark:text-slate-300">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-neutral-400 dark:text-slate-500">
                  No matching telemetry traces found.
                </td>
              </tr>
            ) : (
              filtered.map((trace) => (
                <tr
                  key={trace.id}
                  className="transition hover:bg-neutral-50/80 dark:hover:bg-slate-800/40"
                >
                  <td className="px-5 py-3">
                    <button
                      type="button"
                      onClick={(e) => handleCopy(trace.id, e)}
                      className="group/copy flex items-center gap-1.5 font-mono text-neutral-600 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white"
                      title={trace.id}
                    >
                      <span className="truncate max-w-[120px]">
                        {trace.id.startsWith('trc_') ? trace.id.slice(0, 12) + '...' : trace.id.slice(0, 8)}
                      </span>
                      <svg
                        className="size-3 opacity-60 transition group-hover/copy:opacity-100"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      {copiedId === trace.id && (
                        <span className="text-[10px] font-sans font-bold text-emerald-600 dark:text-emerald-400">
                          Copied!
                        </span>
                      )}
                    </button>
                  </td>

                  <td className="px-3 py-3 whitespace-nowrap">{getStatusBadge(trace.status)}</td>

                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2 max-w-sm truncate">
                      {getMethodBadge(trace.method)}
                      <span className="font-mono text-neutral-900 dark:text-white truncate" title={trace.path}>
                        {trace.path}
                      </span>
                      {trace.actor && (
                        <span className="text-[10px] text-neutral-400 dark:text-slate-500 truncate">
                          ({trace.actor})
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="px-3 py-3 tabular-nums font-mono">
                    <span className={trace.durationMs > 250 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-neutral-600 dark:text-slate-400'}>
                      {trace.durationMs.toFixed(1)}ms
                    </span>
                  </td>

                  <td className="px-3 py-3 text-neutral-400 dark:text-slate-500 whitespace-nowrap">
                    {formatRelativeTime(trace.occurredAt)}
                  </td>

                  <td className="px-5 py-3 text-right">
                    <Link
                      href={projectId ? `/dashboard/events?projectId=${projectId}&search=${encodeURIComponent(trace.path)}` : `/dashboard/events?search=${encodeURIComponent(trace.path)}`}
                      className="inline-flex items-center gap-1 rounded border border-neutral-200 bg-white px-2 py-1 text-[11px] font-medium text-neutral-700 shadow-2xs hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <span>Inspect</span>
                      <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
