'use client';

import React, { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import ChartBarLineIcon from '@hugeicons/core-free-icons/ChartBarLineIcon';

export interface TabbedChartPoint {
  bucket: string;
  events: number;
  apiCalls: number;
  errors: number;
}

interface OverviewTabbedChartProps {
  data: TabbedChartPoint[];
  className?: string;
}

export function OverviewTabbedChart({ data = [], className = '' }: OverviewTabbedChartProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'events' | 'api' | 'errors'>('all');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const points = data;

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

  const currentHover = hoverIdx !== null ? points[hoverIdx] : null;

  return (
    <div
      className={`flex flex-col justify-between overflow-hidden rounded-md border border-neutral-200 bg-white p-5 shadow-xs dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${className}`}
    >
      <div>
        {/* Header with Title and Tabs */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-neutral-100 dark:border-slate-800/70">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200">
              <HugeiconsIcon icon={ChartBarLineIcon} size={16} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Observability & Ingestion Trends</h3>
              <p className="text-xs text-neutral-500 dark:text-slate-400">14-day stream volume and activity breakdown</p>
            </div>
          </div>

          {/* Tab Pill Switcher */}
          <div className="inline-flex rounded-md border border-neutral-200 bg-neutral-100/70 p-0.5 text-xs dark:border-slate-800 dark:bg-slate-950/60">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`rounded px-2.5 py-1 font-medium transition ${
                activeTab === 'all'
                  ? 'bg-white text-neutral-900 shadow-xs dark:bg-slate-800 dark:text-white'
                  : 'text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              All Series
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('events')}
              className={`rounded px-2.5 py-1 font-medium transition ${
                activeTab === 'events'
                  ? 'bg-white text-blue-600 shadow-xs dark:bg-slate-800 dark:text-blue-400'
                  : 'text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Events
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('api')}
              className={`rounded px-2.5 py-1 font-medium transition ${
                activeTab === 'api'
                  ? 'bg-white text-emerald-600 shadow-xs dark:bg-slate-800 dark:text-emerald-400'
                  : 'text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              API Load
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('errors')}
              className={`rounded px-2.5 py-1 font-medium transition ${
                activeTab === 'errors'
                  ? 'bg-white text-rose-600 shadow-xs dark:bg-slate-800 dark:text-rose-400'
                  : 'text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
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

          {currentHover && (
            <div className="flex items-center gap-2 rounded border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs font-medium dark:border-slate-800 dark:bg-slate-800/80">
              <span className="text-neutral-500 dark:text-slate-400">{currentHover.bucket}:</span>
              <span className="text-blue-600 dark:text-blue-400 font-bold">{currentHover.events.toLocaleString()} ev</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">· {currentHover.apiCalls.toLocaleString()} api</span>
              {currentHover.errors > 0 && <span className="text-rose-600 dark:text-rose-400 font-bold">· {currentHover.errors} err</span>}
            </div>
          )}
        </div>
      </div>

      {/* SVG Multi-Series Chart */}
      <div className="relative mt-4 flex-1 flex flex-col justify-end min-h-[220px] w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full min-h-[200px] max-h-72 overflow-visible"
          preserveAspectRatio="none"
        >
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

          {/* Hover indicator crosshair */}
          {hoverIdx !== null && points[hoverIdx] && (
            <g>
              <line
                x1={getCoordinates(points[hoverIdx].events, hoverIdx).x}
                y1={paddingY}
                x2={getCoordinates(points[hoverIdx].events, hoverIdx).x}
                y2={paddingY + chartH}
                stroke="#94a3b8"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <circle
                cx={getCoordinates(points[hoverIdx].events, hoverIdx).x}
                cy={getCoordinates(points[hoverIdx].events, hoverIdx).y}
                r="4.5"
                className="fill-blue-500 stroke-white dark:stroke-slate-900"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>

        {/* Hover interaction overlay */}
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
