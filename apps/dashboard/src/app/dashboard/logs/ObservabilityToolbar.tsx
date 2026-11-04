'use client';

import React from 'react';
import { LogSource, LogLevel, LogStatus, ObservabilityFilterState } from './types';

interface ObservabilityToolbarProps {
  filters: ObservabilityFilterState;
  onFilterChange: (filters: ObservabilityFilterState) => void;
  isLive: boolean;
  onToggleLive: () => void;
  onRefresh: () => void;
  isLoading?: boolean;
  sourceCounts?: Record<string, number>;
}

const SOURCES: { id: LogSource; label: string }[] = [
  { id: 'all', label: 'All activity' },
  { id: 'api', label: 'API requests' },
  { id: 'webhook', label: 'Webhooks' },
  { id: 'ai', label: 'AI requests' },
  { id: 'alert', label: 'Alerts' },
  { id: 'error', label: 'Errors' },
  { id: 'auth', label: 'Auth & security' },
  { id: 'job', label: 'Jobs & triggers' },
  { id: 'sdk', label: 'App logs (SDK)' },
  { id: 'event', label: 'User actions' },
  { id: 'custom', label: 'Custom logs' }
];

const TIME_RANGES: { id: ObservabilityFilterState['timeRange']; label: string }[] = [
  { id: '15m', label: '15m' },
  { id: '1h', label: '1h' },
  { id: '6h', label: '6h' },
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' }
];

const LEVELS: { id: LogLevel | ''; label: string; dot?: string }[] = [
  { id: '', label: 'All' },
  { id: 'error', label: 'Error', dot: 'bg-rose-500' },
  { id: 'warn', label: 'Warn', dot: 'bg-amber-500' },
  { id: 'info', label: 'Info', dot: 'bg-sky-500' },
  { id: 'debug', label: 'Debug', dot: 'bg-neutral-400' }
];

const STATUSES: { id: LogStatus | ''; label: string; dot?: string }[] = [
  { id: '', label: 'All' },
  { id: 'success', label: 'Success', dot: 'bg-emerald-500' },
  { id: 'warning', label: 'Warning', dot: 'bg-amber-500' },
  { id: 'error', label: 'Error', dot: 'bg-rose-500' }
];

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange
}: {
  label?: string;
  options: { id: T; label: string; dot?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {label ? <span className="text-xs text-neutral-500 dark:text-slate-400">{label}</span> : null}
      <div className="inline-flex items-center rounded-md border border-neutral-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
        {options.map((option) => {
          const active = value === option.id;
          return (
            <button
              key={option.id || 'all'}
              type="button"
              onClick={() => onChange(option.id)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition ${
                active
                  ? 'bg-neutral-100 font-medium text-neutral-900 dark:bg-slate-800 dark:text-white'
                  : 'text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {option.dot ? <span className={`h-1.5 w-1.5 rounded-full ${option.dot}`} /> : null}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ObservabilityToolbar({
  filters,
  onFilterChange,
  isLive,
  onToggleLive,
  onRefresh,
  isLoading = false,
  sourceCounts = {}
}: ObservabilityToolbarProps) {
  const activeFilterCount =
    (filters.source !== 'all' ? 1 : 0) + (filters.level ? 1 : 0) + (filters.status ? 1 : 0) + (filters.search ? 1 : 0);

  const handleResetFilters = () => {
    onFilterChange({ ...filters, source: 'all', level: '', status: '', search: '' });
  };

  const control =
    'h-8 rounded-md border border-neutral-200 bg-white text-xs text-neutral-800 transition hover:bg-neutral-50 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <label htmlFor="log-source-select" className="sr-only">
            Source
          </label>
          <select
            id="log-source-select"
            value={filters.source}
            onChange={(e) => onFilterChange({ ...filters, source: e.target.value as LogSource })}
            className={`${control} cursor-pointer appearance-none py-1 pl-3 pr-8 font-medium`}
          >
            {SOURCES.map((s) => {
              const count = s.id === 'all' ? undefined : sourceCounts[s.id];
              return (
                <option key={s.id} value={s.id}>
                  {s.label}
                  {count !== undefined ? ` (${count})` : ''}
                </option>
              );
            })}
          </select>
          <svg
            className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400 dark:text-slate-500"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </div>

        <div className="relative min-w-[220px] flex-1">
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400 dark:text-slate-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            aria-label="Search logs"
            placeholder="Search route, message, trace ID, model, status..."
            value={filters.search}
            onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
            className={`${control} w-full pl-8 pr-8 placeholder:text-neutral-400 dark:placeholder:text-slate-500`}
          />
          {filters.search ? (
            <button
              type="button"
              onClick={() => onFilterChange({ ...filters, search: '' })}
              className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-neutral-400 hover:text-neutral-700 dark:text-slate-500 dark:hover:text-slate-200"
              aria-label="Clear search"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path strokeLinecap="round" d="m4 4 8 8M12 4l-8 8" />
              </svg>
            </button>
          ) : null}
        </div>

        <Segmented
          options={TIME_RANGES}
          value={filters.timeRange === 'custom' ? ('' as ObservabilityFilterState['timeRange']) : filters.timeRange}
          onChange={(timeRange) => onFilterChange({ ...filters, timeRange })}
        />

        <button
          type="button"
          onClick={onToggleLive}
          aria-pressed={isLive}
          className={`${control} inline-flex items-center gap-1.5 px-3 font-medium ${
            isLive ? 'border-emerald-500/60 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : ''
          }`}
          title={isLive ? 'Live updates on (every 3s)' : 'Turn on live updates'}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${isLive ? 'animate-pulse bg-emerald-500' : 'bg-neutral-400 dark:bg-slate-500'}`} />
          Live
        </button>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className={`${control} flex w-8 items-center justify-center disabled:opacity-50`}
          title="Refresh"
          aria-label="Refresh logs"
        >
          <svg className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 21h5v-5" />
          </svg>
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Segmented label="Level" options={LEVELS} value={(filters.level || '') as LogLevel | ''} onChange={(level) => onFilterChange({ ...filters, level })} />
          <Segmented label="Status" options={STATUSES} value={(filters.status || '') as LogStatus | ''} onChange={(status) => onFilterChange({ ...filters, status })} />
        </div>

        <div className="flex items-center gap-4 text-xs">
          {activeFilterCount > 0 ? (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-neutral-500 underline-offset-2 transition hover:text-neutral-900 hover:underline dark:text-slate-400 dark:hover:text-white"
            >
              Clear {activeFilterCount} {activeFilterCount === 1 ? 'filter' : 'filters'}
            </button>
          ) : null}
          <a href="/docs" className="text-neutral-500 underline-offset-2 transition hover:text-neutral-900 hover:underline dark:text-slate-400 dark:hover:text-white">
            Telemetry docs
          </a>
        </div>
      </div>
    </div>
  );
}
