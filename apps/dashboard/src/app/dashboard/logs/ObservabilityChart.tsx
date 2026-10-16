'use client';

import React, { useState } from 'react';
import { HistogramBucket, HistogramSummary } from './types';

interface ObservabilityChartProps {
  buckets: HistogramBucket[];
  summary: HistogramSummary;
  onSelectBucket?: (bucket: HistogramBucket) => void;
  isLoading?: boolean;
}

export function ObservabilityChart({
  buckets,
  summary,
  onSelectBucket,
  isLoading = false
}: ObservabilityChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const maxTotal = Math.max(...buckets.map((b) => b.total), 1);
  // App logs are info/warn/error rather than HTTP success, so "healthy" means
  // anything that is not a warning or an error.
  const healthy = Math.max(0, summary.total - summary.error - summary.warning);
  const healthyRate = summary.total > 0 ? ((healthy / summary.total) * 100).toFixed(1) : null;
  // 0 means no entry carried a duration (most app logs don't); show a dash instead of "0 ms".
  const formatLatency = (value: number) => (value > 0 ? `${value}` : null);

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return ts;
    }
  };

  const formatDate = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return ts;
    }
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
      {/* Top Metrics Row */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-md border border-neutral-100 bg-neutral-50/50 p-2.5 dark:border-slate-800/80 dark:bg-slate-900/40">
          <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-400 dark:text-slate-500">Total Activity</div>
          <div className="mt-1 text-lg font-semibold text-neutral-900 dark:text-white">
            {summary.total.toLocaleString()}
          </div>
        </div>

        <div className="rounded-md border border-neutral-100 bg-neutral-50/50 p-2.5 dark:border-slate-800/80 dark:bg-slate-900/40">
          <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-400 dark:text-slate-500" title="Entries that are not warnings or errors">Healthy</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
              {healthyRate === null ? '—' : `${healthyRate}%`}
            </span>
            <span className="text-[11px] text-neutral-400 dark:text-slate-500">
              ({healthy.toLocaleString()})
            </span>
          </div>
        </div>

        <div className="rounded-md border border-neutral-100 bg-neutral-50/50 p-2.5 dark:border-slate-800/80 dark:bg-slate-900/40">
          <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-400 dark:text-slate-500" title="Error and fatal logs, including HTTP 5xx">Errors</div>
          <div className="mt-1 text-lg font-semibold text-rose-600 dark:text-rose-400">
            {summary.error.toLocaleString()}
          </div>
        </div>

        <div className="rounded-md border border-neutral-100 bg-neutral-50/50 p-2.5 dark:border-slate-800/80 dark:bg-slate-900/40">
          <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-400 dark:text-slate-500" title="Warning logs, including HTTP 4xx">Warnings</div>
          <div className="mt-1 text-lg font-semibold text-amber-600 dark:text-amber-400">
            {summary.warning.toLocaleString()}
          </div>
        </div>

        <div className="rounded-md border border-neutral-100 bg-neutral-50/50 p-2.5 dark:border-slate-800/80 dark:bg-slate-900/40">
          <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-400 dark:text-slate-500">Avg Latency</div>
          <div className="mt-1 text-lg font-semibold text-neutral-900 dark:text-white">
            {formatLatency(summary.avgDuration) ?? '—'}{' '}
            {formatLatency(summary.avgDuration) ? <span className="text-xs font-normal text-neutral-500">ms</span> : null}
          </div>
        </div>

        <div className="rounded-md border border-neutral-100 bg-neutral-50/50 p-2.5 dark:border-slate-800/80 dark:bg-slate-900/40">
          <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-400 dark:text-slate-500">p95 Latency</div>
          <div className="mt-1 text-lg font-semibold text-neutral-900 dark:text-white">
            {formatLatency(summary.p95Duration) ?? '—'}{' '}
            {formatLatency(summary.p95Duration) ? <span className="text-xs font-normal text-neutral-500">ms</span> : null}
          </div>
        </div>
      </div>

      {/* Chart Canvas Area */}
      <div className="relative">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-[1px] dark:bg-slate-900/60">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        )}

        {buckets.length === 0 ? (
          <div className="flex h-36 items-center justify-center rounded-md border border-dashed border-neutral-200 text-xs text-neutral-400 dark:border-slate-800 dark:text-slate-500">
            No activity records in the selected time range.
          </div>
        ) : (
          <div className="relative">
            {/* Tooltip Overlay */}
            {hoveredIndex !== null && buckets[hoveredIndex] && (
              <div
                className="pointer-events-none absolute -top-12 z-20 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-xs text-white shadow-lg transition-all"
                style={{
                  left: `${((hoveredIndex + 0.5) / buckets.length) * 100}%`
                }}
              >
                <div className="font-semibold text-neutral-200">
                  {formatDate(buckets[hoveredIndex].timestamp)}
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-[11px]">
                  <span className="text-neutral-300">Total: {buckets[hoveredIndex].total}</span>
                  <span className="text-emerald-400">✓ {buckets[hoveredIndex].success}</span>
                  {buckets[hoveredIndex].warning > 0 && (
                    <span className="text-amber-400">⚠ {buckets[hoveredIndex].warning}</span>
                  )}
                  {buckets[hoveredIndex].error > 0 && (
                    <span className="text-rose-400">✕ {buckets[hoveredIndex].error}</span>
                  )}
                  <span className="text-slate-400">{buckets[hoveredIndex].avgDuration}ms</span>
                </div>
              </div>
            )}

            {/* Bars container */}
            <div className="flex h-36 items-end gap-1 pt-4">
              {buckets.map((bucket, index) => {
                const totalPct = (bucket.total / maxTotal) * 100;
                const successPct = bucket.total > 0 ? (bucket.success / bucket.total) * 100 : 0;
                const warningPct = bucket.total > 0 ? (bucket.warning / bucket.total) * 100 : 0;
                const errorPct = bucket.total > 0 ? (bucket.error / bucket.total) * 100 : 0;

                const isHovered = hoveredIndex === index;

                return (
                  <button
                    key={bucket.timestamp}
                    type="button"
                    onClick={() => onSelectBucket?.(bucket)}
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    className="group relative flex h-full flex-1 flex-col justify-end transition focus:outline-none"
                    title={`${formatDate(bucket.timestamp)}: ${bucket.total} events`}
                  >
                    <div
                      className={`relative flex w-full flex-col-reverse overflow-hidden rounded-t-sm transition ${
                        isHovered
                          ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-900'
                          : 'opacity-85 hover:opacity-100'
                      }`}
                      style={{ height: `${Math.max(totalPct, 3)}%` }}
                    >
                      {/* Success bar segment */}
                      <div
                        className="bg-emerald-500 dark:bg-emerald-400"
                        style={{ height: `${successPct}%` }}
                      />
                      {/* Warning bar segment */}
                      <div
                        className="bg-amber-500 dark:bg-amber-400"
                        style={{ height: `${warningPct}%` }}
                      />
                      {/* Error bar segment */}
                      <div
                        className="bg-rose-500 dark:bg-rose-500"
                        style={{ height: `${errorPct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Time Axis Labels */}
            <div className="mt-2 flex justify-between border-t border-neutral-100 pt-1.5 text-[10px] text-neutral-400 dark:border-slate-800 dark:text-slate-500">
              <span>{formatTime(buckets[0].timestamp)}</span>
              {buckets.length > 2 && (
                <span>{formatTime(buckets[Math.floor(buckets.length / 2)].timestamp)}</span>
              )}
              <span>{formatTime(buckets[buckets.length - 1].timestamp)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
