'use client';

import { Combobox } from '@traceiq/ui';
import { Select } from '@traceiq/ui';

export interface FilterCondition {
  field: string;
  operator: string;
  value?: string;
}

const OPERATORS = [
  { value: 'is', label: 'is' },
  { value: 'is_not', label: 'is not' },
  { value: 'contains', label: 'contains' },
  { value: 'is_set', label: 'is set' },
  { value: 'is_not_set', label: 'is not set' }
];

// Known dimensions resolve to device/location; anything else is treated as an event property.
const FIELD_SUGGESTIONS = ['country', 'region', 'city', 'device_type', 'os', 'browser', 'platform', 'plan', 'amount'];

export function operatorNeedsValue(operator: string): boolean {
  return operator !== 'is_set' && operator !== 'is_not_set';
}

interface SegmentFiltersProps {
  value: FilterCondition[];
  onChange: (next: FilterCondition[]) => void;
}

export function SegmentFilters({ value, onChange }: SegmentFiltersProps) {
  function update(index: number, patch: Partial<FilterCondition>) {
    onChange(value.map((condition, i) => (i === index ? { ...condition, ...patch } : condition)));
  }

  function add() {
    onChange([...value, { field: '', operator: 'is', value: '' }]);
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="grid gap-2">
      {value.length === 0 ? (
        <p className="text-sm text-neutral-400 dark:text-neutral-500">No filters — showing all users.</p>
      ) : null}

      {value.map((condition, index) => {
        const needsValue = operatorNeedsValue(condition.operator);
        return (
          <div key={index} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <Combobox
              items={FIELD_SUGGESTIONS.map((field) => ({ value: field, label: field }))}
              value={condition.field}
              onChange={(field) => update(index, { field })}
              placeholder="e.g. country, plan"
              aria-label="Filter field"
              className="min-w-0 flex-1 basis-40"
            />
            <Select
              value={condition.operator}
              onValueChange={(operator) => update(index, { operator })}
              items={OPERATORS.map((operator) => ({ value: operator.value, label: operator.label }))}
              className="w-32 shrink-0"
              aria-label="Filter operator"
            />
            {needsValue ? (
              <input
                className={`${fieldClass} min-w-0 flex-1 basis-32`}
                placeholder="value"
                value={condition.value ?? ''}
                onChange={(event) => update(index, { value: event.target.value })}
              />
            ) : (
              <span className="hidden flex-1 basis-32 sm:block" aria-hidden />
            )}
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label="Remove condition"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-neutral-300 text-neutral-400 transition hover:border-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:border-slate-700 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-300"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        );
      })}

      <div>
        <button
          type="button"
          onClick={add}
          className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          + Add condition
        </button>
      </div>
    </div>
  );
}

// Keeps only complete, meaningful conditions (mirrors the server's sanitize step).
export function cleanFilters(filters: FilterCondition[]): FilterCondition[] {
  return filters
    .map((condition) => ({ ...condition, field: condition.field.trim() }))
    .filter((condition) => condition.field && (!operatorNeedsValue(condition.operator) || (condition.value ?? '').trim() !== ''));
}

const fieldClass =
  'min-h-9 rounded-md border border-neutral-300 bg-white px-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-white dark:focus:ring-white/10';
