'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Select } from '@traceiq/ui';
import { SegmentFilters, FilterCondition, cleanFilters } from '@/components/SegmentFilters';
import { DashboardDialog } from '../DashboardDialog';

interface RetentionFilterModalProps {
  basePath: string;
  cohorts: Array<{ id: string; name: string; filters: FilterCondition[] }>;
  initialFilters: FilterCondition[];
  currentWeeks: string;
}

export function RetentionFilterModal({
  basePath,
  cohorts,
  initialFilters,
  currentWeeks
}: RetentionFilterModalProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [filters, setFilters] = useState<FilterCondition[]>(
    initialFilters.length ? initialFilters : [{ field: '', operator: 'is', value: '' }]
  );
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const [isPending, startTransition] = useTransition();

  const activeFilters = cleanFilters(initialFilters);

  function pushFilters(nextFilters: FilterCondition[]) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('weeks', currentWeeks);
    const cleaned = cleanFilters(nextFilters);
    if (cleaned.length > 0) {
      params.set('filters', JSON.stringify(cleaned));
    } else {
      params.delete('filters');
    }
    startTransition(() => {
      router.push(`${basePath}?${params.toString()}`);
    });
  }

  function handleOpenModal() {
    setFilters(
      initialFilters.length
        ? JSON.parse(JSON.stringify(initialFilters))
        : [{ field: '', operator: 'is', value: '' }]
    );
    setSelectedCohortId('');
    setIsOpen(true);
  }

  function handleCloseModal() {
    setIsOpen(false);
  }

  function handleApply() {
    pushFilters(filters);
    setIsOpen(false);
  }

  function handleClearAll() {
    setFilters([{ field: '', operator: 'is', value: '' }]);
    setSelectedCohortId('');
    pushFilters([]);
    setIsOpen(false);
  }

  function handleRemoveSingleFilter(indexToRemove: number) {
    const next = activeFilters.filter((_, i) => i !== indexToRemove);
    pushFilters(next.length ? next : []);
  }

  function handleLoadCohort(id: string) {
    setSelectedCohortId(id);
    const cohort = cohorts.find((item) => item.id === id);
    if (cohort) {
      setFilters(cohort.filters);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleOpenModal}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${activeFilters.length > 0
              ? 'border-blue-500/40 text-blue-700 hover:bg-blue-100/70 dark:border-blue-500/40 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/50'
              : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-800'
            }`}
          aria-label="Open filter and segment dialog"
        >
          <svg
            className="h-4 w-4 text-neutral-500 dark:text-slate-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          <span>Filter / Segment</span>
          {activeFilters.length > 0 ? (
            <span className="flex h-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-bold text-white shadow-xs">
              {activeFilters.length}
            </span>
          ) : null}
        </button>

        {isPending ? (
          <span className="text-xs text-neutral-500 dark:text-slate-400 animate-pulse">
            Updating retention data…
          </span>
        ) : null}
      </div>

      {/* Active Filter Chips */}
      {activeFilters.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-slate-500">
            Filtered by:
          </span>
          {activeFilters.map((f, idx) => (
            <div
              key={idx}
              className="group inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50/70 py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200"
            >
              <button
                type="button"
                onClick={handleOpenModal}
                className="hover:underline text-left"
                title="Click to edit filter conditions"
              >
                <span className="font-semibold text-blue-950 dark:text-blue-100">{f.field}</span>
                <span className="mx-1 text-blue-600/70 dark:text-blue-400/80">{f.operator.replace(/_/g, ' ')}</span>
                {f.value ? <span className="font-mono text-blue-900 dark:text-blue-200">&ldquo;{f.value}&rdquo;</span> : null}
              </button>
              <button
                type="button"
                onClick={() => handleRemoveSingleFilter(idx)}
                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-blue-600 hover:bg-blue-200 hover:text-blue-900 dark:text-blue-400 dark:hover:bg-blue-900 dark:hover:text-blue-100 transition"
                aria-label={`Remove filter for ${f.field}`}
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={handleClearAll}
            className="text-xs font-semibold text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white underline underline-offset-2 transition"
          >
            Clear all
          </button>
        </div>
      ) : null}

      {/* Segment & Filter Modal Dialog */}
      <DashboardDialog
        open={isOpen}
        onClose={handleCloseModal}
        title="Filter & Segment Retention"
        description="Filter cohort calculations by user traits, geographic location, device properties, or custom event metadata."
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            {cleanFilters(filters).length > 0 || activeFilters.length > 0 ? (
              <button
                type="button"
                onClick={handleClearAll}
                className="text-xs font-semibold text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white transition"
              >
                Reset filters
              </button>
            ) : <div />}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCloseModal}
                className="h-9 rounded-lg border border-neutral-300 bg-white px-3.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 transition"
              >
                Apply Segment
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {cohorts.length > 0 ? (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/40">
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400 mb-1.5">
                Load Saved Cohort
              </label>
              <Select
                value={selectedCohortId}
                onValueChange={handleLoadCohort}
                items={cohorts.map((cohort) => ({ value: cohort.id, label: cohort.name }))}
                placeholder="Choose a saved cohort preset…"
                className="w-full"
                aria-label="Load a saved cohort"
              />
            </div>
          ) : null}

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">
                Segment Conditions
              </span>
              <span className="text-xs text-neutral-400 dark:text-slate-500">
                Users matching all conditions
              </span>
            </div>
            <SegmentFilters value={filters} onChange={setFilters} />
          </div>
        </div>
      </DashboardDialog>
    </div>
  );
}
