'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Select } from '@traceiq/ui';

const RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' }
];

export function OverviewRangePicker({ days }: { days: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function change(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('days', value);
    startTransition(() => {
      router.push(`/dashboard?${params.toString()}`);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
        Range
      </span>
      <Select
        value={RANGES.some((option) => option.value === days) ? days : '14'}
        onValueChange={change}
        items={RANGES}
        className="w-40"
        aria-label="Time range"
      />
      {isPending ? <span className="text-xs text-neutral-500 dark:text-slate-500">Updating…</span> : null}
    </div>
  );
}