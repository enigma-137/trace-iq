'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition, useState } from 'react';
import { Select } from '@traceiq/ui';
import { Combobox } from '@traceiq/ui';
import { DateRangePicker, type DateRange } from '@traceiq/ui';
import { SegmentFilters, cleanFilters, type FilterCondition } from '@/components/SegmentFilters';

interface CohortOption {
  id: string;
  name: string;
  filters: FilterCondition[];
}

interface TrendControlsProps {
  eventNames: string[];
  cohorts?: CohortOption[];
  initialFilters?: FilterCondition[];
  selected: {
    event: string;
    interval: string;
    days: string;
    from: string;
    to: string;
    breakdown: string;
    measure: string;
    property: string;
  };
}

const INTERVALS = [
  { value: 'hour', label: 'Hourly' },
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' }
];

const MEASURES = [
  { value: 'count', label: 'Total count' },
  { value: 'unique', label: 'Unique users' },
  { value: 'sum', label: 'Sum of property' },
  { value: 'avg', label: 'Average of property' }
];

const PROPERTY_SUGGESTIONS = ['amount', 'value', 'revenue', 'price', 'quantity', 'duration_ms', 'latency'];
const BREAKDOWN_SUGGESTIONS = ['os', 'device_type', 'browser', 'platform', 'country', 'region', 'city', 'plan'];

function toKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function TrendControls({ eventNames, cohorts = [], initialFilters = [], selected }: TrendControlsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Collapsible toggle for advanced filters & breakdown
  const [isExpanded, setIsExpanded] = useState(false);
  const [propertyDraft, setPropertyDraft] = useState(selected.property);
  const [breakdownDraft, setBreakdownDraft] = useState(selected.breakdown);

  // Filters state
  const [filters, setFilters] = useState<FilterCondition[]>(
    initialFilters.length ? initialFilters : [{ field: '', operator: 'is', value: '' }]
  );
  const [cohortId, setCohortId] = useState('');

  const activeFiltersCount = cleanFilters(filters).length;
  const hasActiveBreakdown = Boolean(selected.breakdown);
  const hasAdvancedOptions = activeFiltersCount > 0 || hasActiveBreakdown;

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    commit(params);
  }

  function commit(params: URLSearchParams) {
    startTransition(() => {
      router.push(`/dashboard/insights?${params.toString()}`);
    });
  }

  const displayRange: DateRange = (() => {
    if (selected.from || selected.to) return { from: selected.from || undefined, to: selected.to || undefined };
    const today = new Date();
    const daysCount = Number(selected.days) > 0 ? Number(selected.days) : 30;
    return { from: toKey(addDays(today, -(daysCount - 1))), to: toKey(today) };
  })();

  function commitRange(range: DateRange) {
    const params = new URLSearchParams(searchParams.toString());
    if (range.from) {
      params.set('from', range.from);
    } else {
      params.delete('from');
    }
    if (range.to) {
      params.set('to', range.to);
    } else {
      params.delete('to');
    }
    params.delete('days');
    commit(params);
  }

  function applyFilters() {
    const params = new URLSearchParams(searchParams.toString());
    const cleaned = cleanFilters(filters);
    if (cleaned.length) {
      params.set('filters', JSON.stringify(cleaned));
    } else {
      params.delete('filters');
    }
    commit(params);
  }

  function clearAllFilters() {
    setFilters([{ field: '', operator: 'is', value: '' }]);
    setCohortId('');
    const params = new URLSearchParams(searchParams.toString());
    params.delete('filters');
    commit(params);
  }

  function loadCohort(id: string) {
    const cohort = cohorts.find((item) => item.id === id);
    const next = cohort ? cohort.filters : [{ field: '', operator: 'is', value: '' }];
    setFilters(next);
    if (cohort) {
      const params = new URLSearchParams(searchParams.toString());
      const cleaned = cleanFilters(next);
      if (cleaned.length) {
        params.set('filters', JSON.stringify(cleaned));
      } else {
        params.delete('filters');
      }
      commit(params);
    }
  }

  const needsProperty = selected.measure === 'sum' || selected.measure === 'avg';

  return (
    <div className="rounded-xl border border-neutral-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-950">
      {/* Primary Query Toolbar */}
      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {/* Event Picker */}
          <div className="sm:col-span-2 lg:col-span-1 xl:col-span-1">
            <label className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
              <span>Event</span>
              {eventNames.length > 0 ? (
                <span className="text-[10px] font-normal text-neutral-400 dark:text-slate-500">
                  {eventNames.length} available
                </span>
              ) : null}
            </label>
            <Select
              value={selected.event}
              onValueChange={(value) => update('event', value)}
              items={eventNames.map((name) => ({ value: name, label: name }))}
              placeholder={eventNames.length === 0 ? 'No events yet' : 'Select event'}
              disabled={eventNames.length === 0}
            />
          </div>

          {/* Measure Picker */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
              Measure
            </label>
            <Select
              value={selected.measure}
              onValueChange={(value) => update('measure', value)}
              items={MEASURES.map((option) => ({ value: option.value, label: option.label }))}
            />
          </div>

          {/* Numeric Property (Conditional) */}
          {needsProperty ? (
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
                Property
              </label>
              <Combobox
                value={propertyDraft}
                onChange={setPropertyDraft}
                onValueCommit={(value) => update('property', value.trim())}
                items={PROPERTY_SUGGESTIONS.map((name) => ({ value: name, label: name }))}
                placeholder="amount"
                aria-label="Property"
              />
            </div>
          ) : null}

          {/* Date Range Picker */}
          <div className={needsProperty ? '' : 'sm:col-span-1 lg:col-span-1'}>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
              Date Range
            </label>
            <DateRangePicker value={displayRange} onChange={commitRange} />
          </div>

          {/* Interval */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
              Interval
            </label>
            <Select
              value={selected.interval}
              onValueChange={(value) => update('interval', value)}
              items={INTERVALS.map((option) => ({ value: option.value, label: option.label }))}
            />
          </div>
        </div>

        {/* Secondary Toggle Bar: Filters & Breakdown in the middle */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-3 dark:border-slate-800/80">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50/70 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            <span>Filters & Breakdown</span>
            {hasAdvancedOptions ? (
              <span className="rounded-full px-1.5 py-0.2 text-[10px] font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                {activeFiltersCount > 0 ? `${activeFiltersCount} filter${activeFiltersCount === 1 ? '' : 's'}` : 'Breakdown active'}
              </span>
            ) : null}
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`text-neutral-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              aria-hidden
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          <div className="flex items-center gap-2 text-xs text-neutral-400 dark:text-slate-500">
            {isPending ? (
              <span className="inline-flex items-center gap-1.5 text-neutral-500 dark:text-slate-400">
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Calculating metrics…
              </span>
            ) : (
              <span>Real-time trend analysis</span>
            )}
          </div>
        </div>
      </div>

      {/* Expandable Filters & Breakdown Section in the Middle */}
      {isExpanded ? (
        <div className="border-t border-neutral-200 bg-neutral-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/30 sm:p-5">
          <div className="space-y-4">
            {/* Breakdown Property */}
            <div className="max-w-md">
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
                Break Down By (Property)
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Combobox
                    value={breakdownDraft}
                    onChange={setBreakdownDraft}
                    onValueCommit={(value) => update('breakdown', value.trim())}
                    items={BREAKDOWN_SUGGESTIONS.map((name) => ({ value: name, label: name }))}
                    placeholder="e.g. browser, country, plan"
                    aria-label="Break down by"
                  />
                </div>
                {selected.breakdown ? (
                  <button
                    type="button"
                    onClick={() => {
                      setBreakdownDraft('');
                      update('breakdown', '');
                    }}
                    className="inline-flex h-9 items-center rounded-lg border border-neutral-200 bg-white px-2.5 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>

            {/* Segmentation & Cohort Filters */}
            <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-3 dark:border-slate-800">
                <div>
                  <h4 className="text-xs font-semibold text-neutral-900 dark:text-white">Segment & Cohort Filters</h4>
                  <p className="text-[11px] text-neutral-500 dark:text-slate-400">
                    Filter trends to specific user properties, devices, or saved cohorts.
                  </p>
                </div>
                {cohorts.length > 0 ? (
                  <div className="w-48">
                    <Select
                      value={cohortId}
                      onValueChange={(id) => {
                        setCohortId(id);
                        loadCohort(id);
                      }}
                      items={cohorts.map((cohort) => ({ value: cohort.id, label: cohort.name }))}
                      placeholder="Load saved cohort…"
                    />
                  </div>
                ) : null}
              </div>

              <SegmentFilters value={filters} onChange={setFilters} />

              <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white"
                >
                  Reset filters
                </button>
                <button
                  type="button"
                  onClick={applyFilters}
                  className="inline-flex h-8 items-center justify-center rounded-md bg-blue-600 px-3 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700"
                >
                  Apply filters
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
