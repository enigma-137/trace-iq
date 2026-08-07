'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Select } from '@traceiq/ui';
import { SegmentFilters, FilterCondition, cleanFilters } from './SegmentFilters';

interface SegmentBarProps {
  basePath: string;
  cohorts: Array<{ id: string; name: string; filters: FilterCondition[] }>;
  initialFilters: FilterCondition[];
}

// Shared segmentation control: load a saved cohort or build ad-hoc filters, synced to the
// `filters` URL param so the server component re-fetches the segmented view.
export function SegmentBar({ basePath, cohorts, initialFilters }: SegmentBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<FilterCondition[]>(
    initialFilters.length ? initialFilters : [{ field: '', operator: 'is', value: '' }]
  );
  const [cohortId, setCohortId] = useState('');
  const [isPending, startTransition] = useTransition();

  function pushFilters(next: FilterCondition[]) {
    const params = new URLSearchParams(searchParams.toString());
    const cleaned = cleanFilters(next);
    if (cleaned.length) {
      params.set('filters', JSON.stringify(cleaned));
    } else {
      params.delete('filters');
    }
    startTransition(() => router.push(`${basePath}?${params.toString()}`));
  }

  function loadCohort(id: string) {
    const cohort = cohorts.find((item) => item.id === id);
    const next = cohort ? cohort.filters : [{ field: '', operator: 'is', value: '' }];
    setFilters(next);
    if (cohort) pushFilters(next);
  }

  const activeCount = cleanFilters(filters).length;

  return (
    <div className="grid gap-3 rounded-md border border-neutral-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
          Segment {activeCount > 0 ? `· ${activeCount} filter${activeCount === 1 ? '' : 's'} active` : ''}
        </span>
        {cohorts.length ? (
          <Select
            value={cohortId}
            onValueChange={(id) => {
              setCohortId(id);
              loadCohort(id);
            }}
            items={cohorts.map((cohort) => ({ value: cohort.id, label: cohort.name }))}
            placeholder="Load a saved cohort…"
            className="w-auto min-w-56"
            aria-label="Load a saved cohort"
          />
        ) : null}
      </div>

      <SegmentFilters value={filters} onChange={setFilters} />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => pushFilters(filters)}
          className="h-9 rounded-md bg-neutral-900 px-3.5 text-sm font-semibold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-slate-200"
        >
          Apply
        </button>
        {activeCount > 0 || searchParams.get('filters') ? (
          <button
            type="button"
            onClick={() => {
              setFilters([{ field: '', operator: 'is', value: '' }]);
              pushFilters([]);
            }}
            className="text-sm font-semibold text-neutral-500 transition hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white"
          >
            Clear
          </button>
        ) : null}
        {isPending ? <span className="text-xs text-neutral-500 dark:text-slate-500">Updating…</span> : null}
      </div>
    </div>
  );
}
