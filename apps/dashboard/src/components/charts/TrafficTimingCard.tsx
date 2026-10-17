'use client';

import React from 'react';
import { DonutChart } from './DonutChart';

export interface TrafficWindowItem {
  rank: number;
  window: string;
  total: number;
  percentage: number;
}

interface TrafficTimingCardProps {
  timing: TrafficWindowItem[];
  className?: string;
}

const TIMING_PALETTE = [
  '#2563eb', // blue-600
  '#0ea5e9', // sky-500
  '#06b6d4', // cyan-500
  '#10b981', // emerald-500
  '#6366f1', // indigo-500
  '#64748b'  // slate-500
];

function formatCount(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}k`;
  return val.toLocaleString();
}

export function TrafficTimingCard({ timing = [], className = '' }: TrafficTimingCardProps) {
  const donutItems = timing.slice(0, 5).map((item, i) => ({
    label: item.window,
    value: item.total,
    color: TIMING_PALETTE[i % TIMING_PALETTE.length]
  }));

  const totalEvents = timing.reduce((sum, item) => sum + item.total, 0);
  const peakItem = timing[0];

  return (
    <div
      className={`overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)] dark:border-slate-800 dark:bg-slate-900/40 dark:shadow-none ${className}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
            Busiest hours
          </h3>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">
            Top hourly windows (UTC)
          </p>
        </div>
        {peakItem && peakItem.total > 0 && (
          <span className="text-xs text-neutral-500 dark:text-slate-400">
            Peak: {peakItem.window}
          </span>
        )}
      </div>

      {timing.length === 0 || totalEvents === 0 ? (
        <div className="flex min-h-48 items-center justify-center px-4 text-sm text-neutral-500 dark:text-slate-500">
          No traffic timing data recorded yet for this period.
        </div>
      ) : (
        <div className="grid grid-cols-1 items-center gap-6 p-4 lg:grid-cols-12">
          {/* Donut Chart Visual */}
          <div className="flex justify-center lg:col-span-5">
            <DonutChart
              items={donutItems}
              size={128}
              thickness={16}
              centerValue={formatCount(totalEvents)}
              centerLabel="events"
              className="flex-col sm:flex-col"
            />
          </div>

          {/* Ranked Peak Windows List (2 columns on wide screens) */}
          <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:col-span-7">
            {timing.slice(0, 6).map((item) => {
              const padRank = item.rank.toString().padStart(2, '0');
              const maxVal = timing[0]?.total || 1;
              const relativeBar = Math.max(6, Math.min(100, (item.total / maxVal) * 100));

              return (
                <div key={item.window} className="group flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold text-neutral-400 dark:text-slate-500">
                        {padRank}
                      </span>
                      <span className="font-mono font-medium text-neutral-800 dark:text-slate-200">
                        {item.window}
                      </span>
                    </div>
                    <span className="font-mono font-semibold text-neutral-900 dark:text-white">
                      {item.total.toLocaleString()}
                    </span>
                  </div>

                  {/* Visual accent mini-bar */}
                  <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-blue-600 dark:bg-blue-500 transition-all duration-300"
                      style={{ width: `${relativeBar}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default TrafficTimingCard;
