'use client';

import React, { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import Clock03Icon from '@hugeicons/core-free-icons/Clock03Icon';

export interface LatencyDataPoint {
  bucket: string;
  p50: number;
  p90: number;
  p99: number;
}

interface LatencyTimelineCardProps {
  data: LatencyDataPoint[];
  currentP99?: number;
  currentP90?: number;
  currentP50?: number;
  className?: string;
}

export function LatencyTimelineCard({
  data = [],
  currentP99,
  currentP90,
  currentP50,
  className = ''
}: LatencyTimelineCardProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const points = data;
  const p99Val = currentP99 ?? 0;
  const p90Val = currentP90 ?? 0;
  const p50Val = currentP50 ?? 0;
  const hasData = points.length > 0 && p99Val > 0;
  const maxVal = hasData ? Math.max(...points.map((p) => Math.max(p.p50, p.p90, p.p99)), 100) : 100;

  const width = 500;
  const height = 160;
  const paddingX = 15;
  const paddingY = 20;
  const chartW = width - paddingX * 2;
  const chartH = height - paddingY * 2;

  const getCoordinates = (val: number, idx: number) => {
    const x = paddingX + (idx / Math.max(1, points.length - 1)) * chartW;
    const y = paddingY + chartH - (val / maxVal) * chartH;
    return { x, y };
  };

  const createPath = (key: 'p50' | 'p90' | 'p99') => {
    if (points.length === 0) return '';
    return points
      .map((p, idx) => {
        const { x, y } = getCoordinates(p[key], idx);
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const createAreaPath = (key: 'p50' | 'p99') => {
    if (points.length === 0) return '';
    const linePath = createPath(key);
    const lastX = paddingX + chartW;
    const firstX = paddingX;
    const bottomY = paddingY + chartH;
    return `${linePath} L ${lastX},${bottomY} L ${firstX},${bottomY} Z`;
  };

  return (
    <div
      className={`flex flex-col justify-between overflow-hidden rounded-md border border-neutral-200 bg-white p-5 shadow-xs dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${className}`}
    >
      <div>
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-neutral-100 dark:border-slate-800/70">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200">
              <HugeiconsIcon icon={Clock03Icon} size={16} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Latency Timeline</h3>
              <p className="text-xs text-neutral-500 dark:text-slate-400">P50 / P90 / P99 percentile latency distribution</p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">
              {hasData ? `${p99Val}ms` : '--'}
            </span>
            <span className="text-sm font-medium text-neutral-500 dark:text-slate-400">
              {hasData ? '(P99 peak)' : 'No latency recorded'}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-rose-500" />
              <span className="font-medium text-neutral-700 dark:text-slate-300">P99 ({hasData ? `${p99Val}ms` : '--'})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-amber-500" />
              <span className="font-medium text-neutral-700 dark:text-slate-300">P90 ({hasData ? `${p90Val}ms` : '--'})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-blue-500" />
              <span className="font-medium text-neutral-700 dark:text-slate-300">P50 ({hasData ? `${p50Val}ms` : '--'})</span>
            </div>
          </div>
        </div>
      </div>

      <div className="relative mt-4 w-full">
        {!hasData ? (
          <div className="flex h-36 flex-col items-center justify-center rounded border border-dashed border-neutral-200 text-center dark:border-slate-800">
            <p className="text-xs font-medium text-neutral-400 dark:text-slate-500">No API latency traces recorded yet</p>
            <p className="mt-1 text-[11px] text-neutral-400 dark:text-slate-600">Events with durationMs will render live P50/P90/P99 curves</p>
          </div>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-36 overflow-visible"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="latency-p99-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="latency-p50-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid lines */}
              <line x1={paddingX} y1={paddingY} x2={width - paddingX} y2={paddingY} stroke="currentColor" className="text-neutral-100 dark:text-slate-800" strokeDasharray="3 3" />
              <line x1={paddingX} y1={paddingY + chartH / 2} x2={width - paddingX} y2={paddingY + chartH / 2} stroke="currentColor" className="text-neutral-100 dark:text-slate-800" strokeDasharray="3 3" />
              <line x1={paddingX} y1={paddingY + chartH} x2={width - paddingX} y2={paddingY + chartH} stroke="currentColor" className="text-neutral-200 dark:text-slate-700" />

              {/* Area fills */}
              <path d={createAreaPath('p99')} fill="url(#latency-p99-grad)" />
              <path d={createAreaPath('p50')} fill="url(#latency-p50-grad)" />

              {/* Lines */}
              <path d={createPath('p99')} fill="none" stroke="#f43f5e" strokeWidth="2" strokeLinecap="round" />
              <path d={createPath('p90')} fill="none" stroke="#f59e0b" strokeWidth="1.75" strokeDasharray="4 3" strokeLinecap="round" />
              <path d={createPath('p50')} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />

              {/* Hover indicator */}
              {hoverIdx !== null && points[hoverIdx] && (
                <g>
                  <line
                    x1={getCoordinates(points[hoverIdx].p99, hoverIdx).x}
                    y1={paddingY}
                    x2={getCoordinates(points[hoverIdx].p99, hoverIdx).x}
                    y2={paddingY + chartH}
                    stroke="#94a3b8"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                  />
                  <circle
                    cx={getCoordinates(points[hoverIdx].p99, hoverIdx).x}
                    cy={getCoordinates(points[hoverIdx].p99, hoverIdx).y}
                    r="4"
                    className="fill-rose-500 stroke-white dark:stroke-slate-900"
                    strokeWidth="2"
                  />
                  <circle
                    cx={getCoordinates(points[hoverIdx].p50, hoverIdx).x}
                    cy={getCoordinates(points[hoverIdx].p50, hoverIdx).y}
                    r="4"
                    className="fill-blue-500 stroke-white dark:stroke-slate-900"
                    strokeWidth="2"
                  />
                </g>
              )}
            </svg>

            {/* Hover interaction layer */}
            <div className="absolute inset-0 flex">
              {points.map((_, idx) => (
                <div
                  key={idx}
                  className="flex-1 cursor-crosshair"
                  onMouseEnter={() => setHoverIdx(idx)}
                  onMouseLeave={() => setHoverIdx(null)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {hasData && (
        <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-400 dark:text-slate-500">
          <span>{points[0]?.bucket?.slice(-5) ?? 'Start'}</span>
          <span>{points[Math.floor(points.length / 2)]?.bucket?.slice(-5) ?? 'Mid'}</span>
          <span>{points[points.length - 1]?.bucket?.slice(-5) ?? 'Latest'}</span>
        </div>
      )}
    </div>
  );
}
