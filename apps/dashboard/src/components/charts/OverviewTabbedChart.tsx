'use client';

import React, { useLayoutEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import ChartBarLineIcon from '@hugeicons/core-free-icons/ChartBarLineIcon';
import { ChartPointCard, pointChange, useChartPointer, type PointCardLink, type PointCardRow } from './ChartPointCard';

export interface TabbedChartPoint {
  /** Axis label, e.g. "Oct 3" or "2 PM". */
  bucket: string;
  /** Fuller label for the point card, e.g. "Fri, Oct 3, 2026"; defaults to `bucket`. */
  label?: string;
  events: number;
  apiCalls: number;
  errors: number;
  /** Shown on the card once the point is clicked, e.g. the requests in that bucket. */
  links?: PointCardLink[];
}

const SERIES = [
  { key: 'events', label: 'Total events', color: '#3b82f6', tab: 'events' },
  { key: 'apiCalls', label: 'API requests', color: '#10b981', tab: 'api' },
  { key: 'errors', label: 'Exceptions', color: '#f43f5e', tab: 'errors', invert: true }
] as const;

interface OverviewTabbedChartProps {
  data: TabbedChartPoint[];
  /** Window the chart covers, e.g. "7-day" or "24-hour". */
  windowLabel?: string;
  className?: string;
}

export function OverviewTabbedChart({ data = [], windowLabel = '14-day', className = '' }: OverviewTabbedChartProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'events' | 'api' | 'errors'>('all');
  const points = data;
  const pointer = useChartPointer(points.length);
  const [plotWidth, setPlotWidth] = useState(0);

  useLayoutEffect(() => {
    const element = pointer.containerRef.current;
    if (!element) return;
    const update = () => setPlotWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [pointer.containerRef]);

  const maxEvents = Math.max(...points.map((p) => p.events), 10);
  const maxApi = Math.max(...points.map((p) => p.apiCalls), 10);
  const maxErrors = Math.max(...points.map((p) => p.errors), 5);

  const activeMax =
    activeTab === 'events' ? maxEvents : activeTab === 'api' ? maxApi : activeTab === 'errors' ? maxErrors : Math.max(maxEvents, maxApi);

  const width = 640;
  const height = 220;
  const paddingX = 20;
  const paddingY = 25;
  const chartW = width - paddingX * 2;
  const chartH = height - paddingY * 2;

  const getCoordinates = (val: number, idx: number, max: number = activeMax) => {
    const x = paddingX + (idx / Math.max(1, points.length - 1)) * chartW;
    const y = paddingY + chartH - (val / Math.max(1, max)) * chartH;
    return { x, y };
  };

  const createSmoothPath = (key: 'events' | 'apiCalls' | 'errors', max: number = activeMax) => {
    return points
      .map((p, idx) => {
        const { x, y } = getCoordinates(p[key], idx, max);
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const createAreaPath = (key: 'events' | 'apiCalls' | 'errors', max: number = activeMax) => {
    const linePath = createSmoothPath(key, max);
    const lastX = paddingX + chartW;
    const firstX = paddingX;
    const bottomY = paddingY + chartH;
    return `${linePath} L ${lastX},${bottomY} L ${firstX},${bottomY} Z`;
  };

  const visibleSeries = SERIES.filter((series) => activeTab === 'all' || activeTab === series.tab);
  // The errors-only tab gets its own scale so small counts stay readable.
  const maxFor = (key: (typeof SERIES)[number]['key']) => (key === 'errors' && activeTab === 'errors' ? maxErrors : activeMax);

  // Point positions as fractions of the plot box; the SVG stretches to fill it.
  const xFraction = (idx: number) => (paddingX + (idx / Math.max(1, points.length - 1)) * chartW) / width;
  const yFraction = (value: number, max: number) => (paddingY + chartH - (value / Math.max(1, max)) * chartH) / height;

  const indexFromClientX = (clientX: number) => {
    const element = pointer.containerRef.current;
    if (!element || points.length === 0) return null;
    const rect = element.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * width;
    const idx = Math.round(((svgX - paddingX) / chartW) * Math.max(1, points.length - 1));
    return Math.max(0, Math.min(points.length - 1, idx));
  };

  const active = pointer.active !== null ? points[pointer.active] : null;
  const activeRows: PointCardRow[] =
    active && pointer.active !== null
      ? visibleSeries.map((series) => ({
          label: series.label,
          color: series.color,
          value: active[series.key].toLocaleString(),
          change: pointChange(active[series.key], points[pointer.active! - 1]?.[series.key]),
          invert: 'invert' in series ? series.invert : undefined
        }))
      : [];

  return (
    <div
      className={`flex flex-col justify-between overflow-hidden rounded-xl border border-neutral-200 bg-white p-5 sm:p-6 shadow-xs dark:border-white/[0.09] dark:bg-[#09090b] dark:shadow-none ${className}`}
    >
      <div>
        {/* Header with Title and Tabs */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-neutral-100 dark:border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-200">
              <HugeiconsIcon icon={ChartBarLineIcon} size={16} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Observability & Ingestion Trends</h3>
              <p className="text-xs text-neutral-500 dark:text-zinc-400">{windowLabel} stream volume and activity breakdown</p>
            </div>
          </div>

          {/* Tab Pill Switcher */}
          <div className="inline-flex rounded-md border border-neutral-200 bg-neutral-100/70 p-0.5 text-xs dark:border-white/[0.08] dark:bg-black/60">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`rounded px-2.5 py-1 font-medium transition ${
                activeTab === 'all'
                  ? 'bg-white text-neutral-900 shadow-xs dark:bg-white/[0.1] dark:text-white'
                  : 'text-neutral-500 hover:text-neutral-900 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              All Series
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('events')}
              className={`rounded px-2.5 py-1 font-medium transition ${
                activeTab === 'events'
                  ? 'bg-white text-blue-600 shadow-xs dark:bg-white/[0.1] dark:text-blue-400'
                  : 'text-neutral-500 hover:text-neutral-900 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              Events
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('api')}
              className={`rounded px-2.5 py-1 font-medium transition ${
                activeTab === 'api'
                  ? 'bg-white text-emerald-600 shadow-xs dark:bg-white/[0.1] dark:text-emerald-400'
                  : 'text-neutral-500 hover:text-neutral-900 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              API Load
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('errors')}
              className={`rounded px-2.5 py-1 font-medium transition ${
                activeTab === 'errors'
                  ? 'bg-white text-rose-600 shadow-xs dark:bg-white/[0.1] dark:text-rose-400'
                  : 'text-neutral-500 hover:text-neutral-900 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              Errors
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {(activeTab === 'all' || activeTab === 'events') && (
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-blue-500" />
                <span className="font-medium text-neutral-700 dark:text-slate-300">Total Events</span>
              </div>
            )}
            {(activeTab === 'all' || activeTab === 'api') && (
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-emerald-500" />
                <span className="font-medium text-neutral-700 dark:text-slate-300">API Requests</span>
              </div>
            )}
            {(activeTab === 'all' || activeTab === 'errors') && (
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-rose-500" />
                <span className="font-medium text-neutral-700 dark:text-slate-300">Exceptions</span>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* SVG Multi-Series Chart */}
      <div
        ref={pointer.containerRef}
        className="relative mt-4 h-60 w-full cursor-crosshair rounded-md outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        tabIndex={points.length > 0 ? 0 : -1}
        role="group"
        aria-label="Trend chart. Use the arrow keys to move between points and Enter to pin one."
        onMouseMove={(event) => pointer.setHover(indexFromClientX(event.clientX))}
        onMouseLeave={() => pointer.setHover(null)}
        onClick={(event) => pointer.togglePin(indexFromClientX(event.clientX))}
        onKeyDown={pointer.onKeyDown}
        onBlur={pointer.onBlur}
      >
        <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 h-full w-full overflow-visible" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="tab-events-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="tab-api-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="tab-err-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1={paddingX} y1={paddingY} x2={width - paddingX} y2={paddingY} stroke="currentColor" className="text-neutral-100 dark:text-slate-800" strokeDasharray="3 3" />
          <line x1={paddingX} y1={paddingY + chartH / 3} x2={width - paddingX} y2={paddingY + chartH / 3} stroke="currentColor" className="text-neutral-100 dark:text-slate-800" strokeDasharray="3 3" />
          <line x1={paddingX} y1={paddingY + (chartH * 2) / 3} x2={width - paddingX} y2={paddingY + (chartH * 2) / 3} stroke="currentColor" className="text-neutral-100 dark:text-slate-800" strokeDasharray="3 3" />
          <line x1={paddingX} y1={paddingY + chartH} x2={width - paddingX} y2={paddingY + chartH} stroke="currentColor" className="text-neutral-200 dark:text-slate-700" />

          {/* Area fills */}
          {(activeTab === 'all' || activeTab === 'events') && (
            <path d={createAreaPath('events')} fill="url(#tab-events-grad)" />
          )}
          {(activeTab === 'all' || activeTab === 'api') && (
            <path d={createAreaPath('apiCalls')} fill="url(#tab-api-grad)" />
          )}
          {(activeTab === 'all' || activeTab === 'errors') && (
            <path d={createAreaPath('errors', activeTab === 'errors' ? maxErrors : activeMax)} fill="url(#tab-err-grad)" />
          )}

          {/* Line paths */}
          {(activeTab === 'all' || activeTab === 'events') && (
            <path d={createSmoothPath('events')} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />
          )}
          {(activeTab === 'all' || activeTab === 'api') && (
            <path d={createSmoothPath('apiCalls')} fill="none" stroke="#10b981" strokeWidth="2" strokeDasharray="4 2" strokeLinecap="round" />
          )}
          {(activeTab === 'all' || activeTab === 'errors') && (
            <path d={createSmoothPath('errors', activeTab === 'errors' ? maxErrors : activeMax)} fill="none" stroke="#f43f5e" strokeWidth="1.75" strokeLinecap="round" />
          )}

        </svg>

        {pointer.active !== null && active ? (
          <>
            <div
              className="pointer-events-none absolute bottom-[11%] top-[11%] border-l border-dashed border-slate-400/80"
              style={{ left: `${xFraction(pointer.active) * 100}%` }}
              aria-hidden="true"
            />
            {visibleSeries.map((series) => (
              <span
                key={series.key}
                className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white dark:ring-slate-950"
                style={{
                  left: `${xFraction(pointer.active!) * 100}%`,
                  top: `${yFraction(active[series.key], maxFor(series.key)) * 100}%`,
                  background: series.color
                }}
                aria-hidden="true"
              />
            ))}
            <ChartPointCard
              title={active.label ?? active.bucket}
              rows={activeRows}
              pinned={pointer.pinned !== null}
              onClose={pointer.unpin}
              links={active.links}
              anchorX={xFraction(pointer.active) * plotWidth}
              containerWidth={plotWidth}
            />
          </>
        ) : null}
      </div>

      {points.length > 0 ? (
        <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-400 dark:text-slate-500">
          <span>{points[0].bucket}</span>
          <span>{points[Math.floor(points.length / 2)].bucket}</span>
          <span>{points[points.length - 1].bucket}</span>
        </div>
      ) : null}
    </div>
  );
}
