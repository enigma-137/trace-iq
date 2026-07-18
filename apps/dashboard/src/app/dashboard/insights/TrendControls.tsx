'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

interface TrendControlsProps {
  eventNames: string[];
  selected: {
    event: string;
    interval: string;
    days: string;
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

const RANGES = [
  { value: '1', label: 'Last 24h' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' }
];

export function TrendControls({ eventNames, selected }: TrendControlsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    startTransition(() => {
      router.push(`/dashboard/insights?${params.toString()}`);
    });
  }

  const needsProperty = selected.measure === 'sum' || selected.measure === 'avg';

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Event">
        <select
          className={selectClass}
          value={selected.event}
          onChange={(event) => update('event', event.target.value)}
          disabled={eventNames.length === 0}
        >
          {eventNames.length === 0 ? <option value="">No events yet</option> : null}
          {eventNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Measure">
        <select className={selectClass} value={selected.measure} onChange={(event) => update('measure', event.target.value)}>
          {MEASURES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>

      {needsProperty ? (
        <Field label="Property">
          <input
            className={selectClass}
            list="trend-measure-properties"
            placeholder="amount"
            defaultValue={selected.property}
            onBlur={(event) => update('property', event.target.value.trim())}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                update('property', (event.target as HTMLInputElement).value.trim());
              }
            }}
          />
          <datalist id="trend-measure-properties">
            <option value="amount" />
            <option value="value" />
            <option value="revenue" />
            <option value="price" />
            <option value="quantity" />
          </datalist>
        </Field>
      ) : null}

      <Field label="Interval">
        <select className={selectClass} value={selected.interval} onChange={(event) => update('interval', event.target.value)}>
          {INTERVALS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Range">
        <select className={selectClass} value={selected.days} onChange={(event) => update('days', event.target.value)}>
          {RANGES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Break down by">
        <input
          className={selectClass}
          list="trend-breakdown-dimensions"
          placeholder="os, country, or a property"
          defaultValue={selected.breakdown}
          onBlur={(event) => update('breakdown', event.target.value.trim())}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              update('breakdown', (event.target as HTMLInputElement).value.trim());
            }
          }}
        />
        <datalist id="trend-breakdown-dimensions">
          <option value="os" />
          <option value="device_type" />
          <option value="browser" />
          <option value="platform" />
          <option value="country" />
          <option value="region" />
          <option value="city" />
        </datalist>
      </Field>

      {isPending ? <p className="text-xs text-neutral-500 dark:text-neutral-500">Updating…</p> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
      {label}
      {children}
    </label>
  );
}

const selectClass =
  'min-h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm font-normal normal-case text-neutral-900 outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-white dark:focus:ring-white/10';
