'use client';

import React from 'react';
import {
  LogSource,
  LogLevel,
  LogStatus,
  ObservabilityFilterState
} from './types';

interface ObservabilityToolbarProps {
  filters: ObservabilityFilterState;
  onFilterChange: (filters: ObservabilityFilterState) => void;
  isLive: boolean;
  onToggleLive: () => void;
  onRefresh: () => void;
  isLoading?: boolean;
  sourceCounts?: Record<string, number>;
}

const SOURCES: { id: LogSource; label: string; icon: string }[] = [
  { id: 'all', label: 'All activity', icon: '🌐' },
  { id: 'api', label: 'API requests', icon: '⚡' },
  { id: 'webhook', label: 'Webhooks', icon: '🪝' },
  { id: 'ai', label: 'AI requests', icon: '✨' },
  { id: 'alert', label: 'Alerts', icon: '🔔' },
  { id: 'error', label: 'Errors', icon: '⚠️' },
  { id: 'auth', label: 'Auth & Security', icon: '🔒' },
  { id: 'job', label: 'Jobs & Triggers', icon: '⏱️' },
  { id: 'sdk', label: 'SDK Telemetry', icon: '📦' },
  { id: 'custom', label: 'Custom logs', icon: '📝' }
];

const TIME_RANGES: { id: ObservabilityFilterState['timeRange']; label: string }[] = [
  { id: '15m', label: '15m' },
  { id: '1h', label: '1h' },
  { id: '6h', label: '6h' },
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' }
];

const LEVELS: { id: LogLevel | ''; label: string; color: string }[] = [
  { id: '', label: 'All levels', color: 'bg-neutral-100 dark:bg-slate-800 text-neutral-600 dark:text-slate-300' },
  { id: 'error', label: 'Error', color: ' text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60' },
  { id: 'warn', label: 'Warn', color: ' text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60' },
  { id: 'info', label: 'Info', color: ' text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900/60' },
  { id: 'debug', label: 'Debug', color: ' text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700' }
];

const STATUSES: { id: LogStatus | ''; label: string; color: string }[] = [
  { id: '', label: 'All status', color: 'bg-neutral-100 dark:bg-slate-800 text-neutral-600 dark:text-slate-300' },
  { id: 'success', label: 'Success (2xx)', color: ' text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60' },
  { id: 'warning', label: 'Warning (4xx)', color: ' text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60' },
  { id: 'error', label: 'Error (5xx)', color: ' text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60' }
];

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
    (filters.source !== 'all' ? 1 : 0) +
    (filters.level ? 1 : 0) +
    (filters.status ? 1 : 0) +
    (filters.search ? 1 : 0);

  const handleResetFilters = () => {
    onFilterChange({
      ...filters,
      source: 'all',
      level: '',
      status: '',
      search: ''
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
      {/* Top row: Source, Search, Time range & Live mode */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Source Dropdown */}
        <div className="flex items-center gap-2">
          <label htmlFor="log-source-select" className="sr-only">Source</label>
          <div className="relative">
            <select
              id="log-source-select"
              value={filters.source}
              onChange={(e) =>
                onFilterChange({
                  ...filters,
                  source: e.target.value as LogSource
                })
              }
              className="h-9 cursor-pointer appearance-none rounded-md border border-neutral-200 bg-neutral-50 py-1.5 pl-3 pr-8 text-xs font-semibold text-neutral-800 shadow-sm transition hover:bg-neutral-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/80"
            >
              {SOURCES.map((s) => {
                const count = s.id === 'all' ? undefined : sourceCounts[s.id];
                return (
                  <option key={s.id} value={s.id}>
                    {s.label} {count !== undefined ? `(${count})` : ''}
                  </option>
                );
              })}
            </select>
            <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-slate-500">
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
        </div>

        {/* Search input with live filter */}
        <div className="relative min-w-[240px] flex-1 max-w-md">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400 dark:text-slate-500">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search route, message, trace ID, model, status..."
            value={filters.search}
            onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
            className="h-9 w-full rounded-md border border-neutral-200 bg-neutral-50 pl-8 pr-8 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-900"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onFilterChange({ ...filters, search: '' })}
              className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-neutral-400 hover:text-neutral-600 dark:text-slate-500 dark:hover:text-slate-300"
              title="Clear search"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>

        {/* Right side: Time range selector, Live toggle, Refresh */}
        <div className="flex items-center gap-2">
          {/* Time range pills */}
          <div className="flex items-center rounded-md border border-neutral-200 bg-neutral-100 p-0.5 dark:border-slate-800 dark:bg-slate-950">
            {TIME_RANGES.map((t) => {
              const active = filters.timeRange === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onFilterChange({ ...filters, timeRange: t.id })}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition ${active
                    ? 'bg-white text-neutral-900 shadow-sm dark:bg-slate-800 dark:text-white'
                    : 'text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
                    }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Live mode toggle */}
          <button
            type="button"
            onClick={onToggleLive}
            className={`flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition ${isLive
              ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm dark:border-emerald-500/40 dark:bg-emerald-950/50 dark:text-emerald-300'
              : 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            title={isLive ? 'Live stream active (polling every 3s)' : 'Enable live streaming'}
          >
            <span
              className={`h-2 w-2 rounded-full ${isLive
                ? 'animate-pulse bg-emerald-500'
                : 'bg-neutral-400 dark:bg-slate-500'
                }`}
            />
            <span>Live</span>
          </button>

          {/* Manual Refresh */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 text-neutral-600 transition hover:bg-neutral-100 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 disabled:opacity-50"
            title="Refresh logs"
          >
            <svg
              className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-blue-600' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Bottom row: Level pills, Status pills, Clear filters */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-2.5 text-xs dark:border-slate-800/80">
        <div className="flex flex-wrap items-center gap-3">
          {/* Level Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-neutral-400 dark:text-slate-500">Level:</span>
            <div className="flex items-center gap-1">
              {LEVELS.map((lvl) => {
                const isSelected = (filters.level || '') === lvl.id;
                return (
                  <button
                    key={lvl.id || 'all'}
                    type="button"
                    onClick={() =>
                      onFilterChange({
                        ...filters,
                        level: lvl.id as LogLevel | ''
                      })
                    }
                    className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${isSelected
                      ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-900 ' + lvl.color
                      : 'opacity-70 hover:opacity-100 ' + lvl.color
                      }`}
                  >
                    {lvl.label}
                  </button>
                );
              })}
            </div>
          </div>

          <span className="hidden h-3 w-px bg-neutral-200 dark:bg-slate-700 sm:inline" />

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-neutral-400 dark:text-slate-500">Status:</span>
            <div className="flex items-center gap-1">
              {STATUSES.map((st) => {
                const isSelected = (filters.status || '') === st.id;
                return (
                  <button
                    key={st.id || 'all'}
                    type="button"
                    onClick={() =>
                      onFilterChange({
                        ...filters,
                        status: st.id as LogStatus | ''
                      })
                    }
                    className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${isSelected
                      ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-900 ' + st.color
                      : 'opacity-70 hover:opacity-100 ' + st.color
                      }`}
                  >
                    {st.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Clear Filters indicator */}
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={handleResetFilters}
            className="flex items-center gap-1 rounded bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600 transition hover:bg-neutral-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <span>Reset {activeFilterCount} active {activeFilterCount === 1 ? 'filter' : 'filters'}</span>
            <span className="text-neutral-400 dark:text-slate-500">✕</span>
          </button>
        )}
      </div>
    </div>
  );
}
