'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition, useState } from 'react';
import { Select } from '@traceiq/ui';
import { Combobox } from '@traceiq/ui';
import { DateRangePicker, type DateRange } from '@traceiq/ui';

interface TrendControlsProps {
  eventNames: string[];
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

const PROPERTY_SUGGESTIONS = ['amount', 'value', 'revenue', 'price', 'quantity'];
const BREAKDOWN_SUGGESTIONS = ['os', 'device_type', 'browser', 'platform', 'country', 'region', 'city'];

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

export function TrendControls({ eventNames, selected }: TrendControlsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [propertyDraft, setPropertyDraft] = useState(selected.property);
  const [breakdownDraft, setBreakdownDraft] = useState(selected.breakdown);

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

  // If the user hasn't set an explicit range, show one matching the `days` preset so the
  // picker reflects what the chart is actually showing.
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

  const needsProperty = selected.measure === 'sum' || selected.measure === 'avg';

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Event">
        <Select
          value={selected.event}
          onValueChange={(value) => update('event', value)}
          items={eventNames.map((name) => ({ value: name, label: name }))}
          placeholder={eventNames.length === 0 ? 'No events yet' : 'Select event'}
          disabled={eventNames.length === 0}
        />
      </Field>

      <Field label="Measure">
        <Select
          value={selected.measure}
          onValueChange={(value) => update('measure', value)}
          items={MEASURES.map((option) => ({ value: option.value, label: option.label }))}
        />
      </Field>

      {needsProperty ? (
        <Field label="Property">
          <Combobox
            value={propertyDraft}
            onChange={setPropertyDraft}
            onValueCommit={(value) => update('property', value.trim())}
            items={PROPERTY_SUGGESTIONS.map((name) => ({ value: name, label: name }))}
            placeholder="amount"
            aria-label="Property"
          />
        </Field>
      ) : null}

      <Field label="Interval">
        <Select
          value={selected.interval}
          onValueChange={(value) => update('interval', value)}
          items={INTERVALS.map((option) => ({ value: option.value, label: option.label }))}
        />
      </Field>

      <Field label="Date range">
        <DateRangePicker value={displayRange} onChange={commitRange} />
      </Field>

      <Field label="Break down by">
        <Combobox
          value={breakdownDraft}
          onChange={setBreakdownDraft}
          onValueCommit={(value) => update('breakdown', value.trim())}
          items={BREAKDOWN_SUGGESTIONS.map((name) => ({ value: name, label: name }))}
          placeholder="os, country, or a property"
          aria-label="Break down by"
        />
      </Field>

      {isPending ? <p className="text-xs text-neutral-500 dark:text-slate-500">Updating…</p> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
      {label}
      {children}
    </label>
  );
}
