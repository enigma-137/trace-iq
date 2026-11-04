'use client';

import React, { useState } from 'react';
import { HistogramBucket, HistogramSummary } from './types';
import { formatAxisNumber, formatTick, niceMax, xTickIndices, yTicks } from './log-format';

interface ObservabilityChartProps {
  buckets: HistogramBucket[];
  summary: HistogramSummary;
  onSelectBucket?: (bucket: HistogramBucket) => void;
  isLoading?: boolean;
}

const PLOT_HEIGHT = 176;

function LegendItem({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500 dark:text-slate-400">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
      <span className="font-medium tabular-nums text-neutral-900 dark:text-slate-100">{value.toLocaleString()}</span>
    </span>
  );
}

export function ObservabilityChart({ buckets, summary, onSelectBucket, isLoading = false }: ObservabilityChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const top = niceMax(Math.max(...buckets.map((bucket) => bucket.total), 0));
  const ticks = yTicks(top);
  // App logs are info/warn/error rather than HTTP success, so "healthy" means not a warning or an error.
  const healthy = Math.max(0, summary.total - summary.error - summary.warning);
  const spanMs =
    buckets.length > 1 ? new Date(buckets[buckets.length - 1].timestamp).getTime() - new Date(buckets[0].timestamp).getTime() : 0;
  const hovered = hoveredIndex !== null ? buckets[hoveredIndex] : null;
  const hoverPct = hoveredIndex !== null && buckets.length > 0 ? ((hoveredIndex + 0.5) / buckets.length) * 100 : 0;
  const tooltipShift = hoverPct < 18 ? '0%' : hoverPct > 82 ? '-100%' : '-50%';

  const fullLabel = (ts: string) => {
    const d = new Date(ts);
    return Number.isNaN(d.getTime())
      ? ts
      : d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="rounded-md border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-900/70">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 px-4 pt-3.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <h3 className="text-xs font-medium text-neutral-900 dark:text-slate-100">Activity over time</h3>
          <LegendItem dot="bg-emerald-500" label="Healthy" value={healthy} />
          <LegendItem dot="bg-amber-500" label="Warnings" value={summary.warning} />
          <LegendItem dot="bg-rose-500" label="Errors" value={summary.error} />
        </div>
        <div className="flex items-center gap-4 text-xs text-neutral-500 dark:text-slate-400">
          {summary.avgDuration > 0 ? (
            <span>
              Avg <span className="font-medium tabular-nums text-neutral-900 dark:text-slate-100">{summary.avgDuration}</span> ms
            </span>
          ) : null}
          {summary.p95Duration > 0 ? (
            <span>
              p95 <span className="font-medium tabular-nums text-neutral-900 dark:text-slate-100">{summary.p95Duration}</span> ms
            </span>
          ) : null}
          {buckets.length > 0 ? <span className="hidden text-neutral-400 dark:text-slate-500 sm:inline">Select a bar to zoom in</span> : null}
        </div>
      </div>

      <div className="relative px-4 pb-3 pt-3">
        {isLoading && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/60 dark:bg-slate-900/60">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent" />
          </div>
        )}

        {buckets.length === 0 ? (
          <div className="flex h-44 items-center justify-center rounded border border-dashed border-neutral-200 text-xs text-neutral-400 dark:border-slate-800 dark:text-slate-500">
            No activity in the selected time range.
          </div>
        ) : (
          <div className="grid grid-cols-[38px_1fr]">
            {/* y axis */}
            <div className="relative" style={{ height: PLOT_HEIGHT }}>
              {ticks.map((tick, index) => (
                <span
                  key={tick}
                  className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-neutral-400 dark:text-slate-500"
                  style={{ top: `${(index / (ticks.length - 1)) * 100}%` }}
                >
                  {formatAxisNumber(tick)}
                </span>
              ))}
            </div>

            <div>
              <div className="relative" style={{ height: PLOT_HEIGHT }}>
                {/* gridlines */}
                {ticks.map((tick, index) => (
                  <div
                    key={tick}
                    className={`absolute inset-x-0 border-t ${
                      index === ticks.length - 1 ? 'border-neutral-300 dark:border-slate-700' : 'border-dashed border-neutral-200 dark:border-slate-800'
                    }`}
                    style={{ top: `${(index / (ticks.length - 1)) * 100}%` }}
                  />
                ))}

                {/* bars */}
                <div className="absolute inset-0 flex items-end gap-[2px]" onMouseLeave={() => setHoveredIndex(null)}>
                  {buckets.map((bucket, index) => {
                    const heightPct = (bucket.total / top) * 100;
                    const healthyCount = Math.max(0, bucket.total - bucket.warning - bucket.error);
                    const isHovered = hoveredIndex === index;
                    return (
                      <button
                        key={bucket.timestamp}
                        type="button"
                        onClick={() => onSelectBucket?.(bucket)}
                        onMouseEnter={() => setHoveredIndex(index)}
                        onFocus={() => setHoveredIndex(index)}
                        aria-label={`${fullLabel(bucket.timestamp)}: ${bucket.total} entries, ${bucket.error} errors`}
                        className={`relative flex h-full min-w-0 flex-1 flex-col justify-end focus:outline-none ${isHovered ? 'bg-neutral-100/80 dark:bg-slate-800/60' : ''}`}
                      >
                        {bucket.total > 0 ? (
                          <div className="flex w-full flex-col-reverse overflow-hidden rounded-t-[2px]" style={{ height: `${heightPct}%`, minHeight: 2 }}>
                            <div className="bg-emerald-500/90" style={{ flexGrow: healthyCount }} />
                            <div className="bg-amber-500" style={{ flexGrow: bucket.warning }} />
                            <div className="bg-rose-500" style={{ flexGrow: bucket.error }} />
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                {hovered ? (
                  <div
                    className="pointer-events-none absolute top-1 z-20 whitespace-nowrap rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs shadow-md dark:border-slate-700 dark:bg-slate-950"
                    style={{ left: `${hoverPct}%`, transform: `translateX(${tooltipShift})` }}
                  >
                    <div className="font-medium text-neutral-900 dark:text-slate-100">{fullLabel(hovered.timestamp)}</div>
                    <dl className="mt-1.5 space-y-1 text-neutral-500 dark:text-slate-400">
                      <div className="flex items-center justify-between gap-6">
                        <dt className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-sm bg-emerald-500" />
                          Healthy
                        </dt>
                        <dd className="tabular-nums text-neutral-900 dark:text-slate-100">{Math.max(0, hovered.total - hovered.warning - hovered.error)}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-6">
                        <dt className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-sm bg-amber-500" />
                          Warnings
                        </dt>
                        <dd className="tabular-nums text-neutral-900 dark:text-slate-100">{hovered.warning}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-6">
                        <dt className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-sm bg-rose-500" />
                          Errors
                        </dt>
                        <dd className="tabular-nums text-neutral-900 dark:text-slate-100">{hovered.error}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-6 border-t border-neutral-100 pt-1 dark:border-slate-800">
                        <dt>Total</dt>
                        <dd className="tabular-nums font-medium text-neutral-900 dark:text-slate-100">{hovered.total}</dd>
                      </div>
                      {hovered.avgDuration > 0 ? (
                        <div className="flex items-center justify-between gap-6">
                          <dt>Avg latency</dt>
                          <dd className="tabular-nums text-neutral-900 dark:text-slate-100">{hovered.avgDuration} ms</dd>
                        </div>
                      ) : null}
                    </dl>
                  </div>
                ) : null}
              </div>

              {/* x axis */}
              <div className="relative mt-1.5 h-4">
                {xTickIndices(buckets.length).map((index, position) => {
                  const pct = ((index + 0.5) / buckets.length) * 100;
                  const shift = index === 0 ? '0%' : index === buckets.length - 1 ? '-100%' : '-50%';
                  return (
                    <span
                      key={index}
                      className={`absolute whitespace-nowrap text-[10px] text-neutral-400 dark:text-slate-500 ${position % 2 === 1 ? 'hidden sm:block' : ''}`}
                      style={{ left: `${pct}%`, transform: `translateX(${shift})` }}
                      suppressHydrationWarning
                    >
                      {formatTick(buckets[index].timestamp, spanMs)}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
