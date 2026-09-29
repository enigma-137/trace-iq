'use client';

import { useState, useEffect, FormEvent } from 'react';
import { Combobox, Select } from '@traceiq/ui';
import { DashboardDialog } from '../DashboardDialog';
import type { FilterCondition } from '@/components/SegmentFilters';
import { cleanFilters, operatorNeedsValue } from '@/components/SegmentFilters';

const OPERATORS = [
  { value: 'is', label: 'is' },
  { value: 'is_not', label: 'is not' },
  { value: 'contains', label: 'contains' },
  { value: 'is_set', label: 'is set' },
  { value: 'is_not_set', label: 'is not set' }
];

const PROPERTY_SUGGESTIONS = [
  { field: 'country', label: 'Country', example: 'e.g. Nigeria, US' },
  { field: 'plan', label: 'Plan', example: 'e.g. Pro, Enterprise' },
  { field: 'device_type', label: 'Device Type', example: 'e.g. mobile, desktop' },
  { field: 'os', label: 'Operating System', example: 'e.g. iOS, Windows' },
  { field: 'browser', label: 'Browser', example: 'e.g. Chrome, Safari' },
  { field: 'region', label: 'Region / State', example: 'e.g. Lagos, California' },
  { field: 'city', label: 'City', example: 'e.g. Abuja, London' }
];

interface CohortModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (name: string, filters: FilterCondition[]) => Promise<void>;
  initialName?: string;
  initialFilters?: FilterCondition[];
  isSubmitting: boolean;
  error?: string | null;
}

export function CohortModal({
  open,
  onClose,
  onSave,
  initialName = '',
  initialFilters = [{ field: '', operator: 'is', value: '' }],
  isSubmitting,
  error
}: CohortModalProps) {
  const [name, setName] = useState(initialName);
  const [filters, setFilters] = useState<FilterCondition[]>(initialFilters);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setFilters(
        initialFilters && initialFilters.length > 0
          ? JSON.parse(JSON.stringify(initialFilters))
          : [{ field: '', operator: 'is', value: '' }]
      );
      setValidationError(null);
    }
  }, [open, initialName, initialFilters]);

  function updateCondition(index: number, patch: Partial<FilterCondition>) {
    setFilters(filters.map((c, i) => (i === index ? { ...c, ...patch } : c)));
    setValidationError(null);
  }

  function addCondition(defaultField = '') {
    setFilters([...filters, { field: defaultField, operator: 'is', value: '' }]);
    setValidationError(null);
  }

  function removeCondition(index: number) {
    if (filters.length === 1) {
      setFilters([{ field: '', operator: 'is', value: '' }]);
    } else {
      setFilters(filters.filter((_, i) => i !== index));
    }
    setValidationError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setValidationError(null);

    if (!name.trim()) {
      setValidationError('Please provide a name for this cohort.');
      return;
    }

    const cleaned = cleanFilters(filters);
    if (cleaned.length === 0) {
      setValidationError('Please add at least one complete filter condition (field and value).');
      return;
    }

    await onSave(name.trim(), cleaned);
  }

  // Generate a human-readable live preview summary
  const readableSummary = filters
    .filter((f) => f.field.trim())
    .map((f) => {
      const op = f.operator.replace(/_/g, ' ');
      const val = operatorNeedsValue(f.operator) && f.value ? `"${f.value}"` : '';
      return `${f.field} ${op} ${val}`.trim();
    })
    .join(' AND ');

  return (
    <DashboardDialog
      open={open}
      onClose={onClose}
      title={initialName ? 'Create Cohort Copy' : 'Create User Cohort'}
      description="Define a reusable segment of users matching specific traits, metadata, or event properties."
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="h-9 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500 transition"
          >
            {isSubmitting ? 'Saving cohort…' : 'Save Cohort'}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Cohort Name Input */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400 mb-1.5">
            Cohort Name <span className="text-blue-600">*</span>
          </label>
          <input
            className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setValidationError(null);
            }}
            placeholder="e.g. Nigerian Pro Users, Mobile Checkout Dropoffs"
            autoFocus
          />
          <p className="mt-1 text-xs text-neutral-400 dark:text-slate-500">
            A descriptive name that makes this group recognizable in dropdowns across your dashboard.
          </p>
        </div>

        {/* Condition Builder Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">
              Targeting Criteria
            </label>
            <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 dark:bg-blue-950/60 px-2 py-0.5 rounded-md">
              Matches ALL conditions (AND logic)
            </span>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-900/30 space-y-3">
            {filters.map((condition, index) => {
              const needsValue = operatorNeedsValue(condition.operator);
              return (
                <div key={index} className="space-y-2">
                  {index > 0 ? (
                    <div className="relative my-1 flex items-center justify-center">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-neutral-200 dark:border-slate-800" />
                      </div>
                      <span className="relative rounded-full border border-blue-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-blue-700 dark:border-blue-900/60 dark:bg-blue-950 dark:text-blue-300">
                        AND
                      </span>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                    <div className="min-w-0 flex-1 basis-44">
                      <Combobox
                        items={PROPERTY_SUGGESTIONS.map((p) => ({ value: p.field, label: p.label }))}
                        value={condition.field}
                        onChange={(field) => updateCondition(index, { field })}
                        placeholder="Property (e.g. country, plan)"
                        aria-label="Filter property"
                        className="w-full"
                      />
                    </div>

                    <div className="w-32 shrink-0">
                      <Select
                        value={condition.operator}
                        onValueChange={(operator) => updateCondition(index, { operator })}
                        items={OPERATORS.map((op) => ({ value: op.value, label: op.label }))}
                        aria-label="Filter operator"
                        className="w-full"
                      />
                    </div>

                    {needsValue ? (
                      <div className="min-w-0 flex-1 basis-36">
                        <input
                          className="h-9 w-full rounded-md border border-neutral-300 bg-white px-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-blue-500"
                          placeholder="value (e.g. Nigeria, Pro)"
                          value={condition.value ?? ''}
                          onChange={(e) => updateCondition(index, { value: e.target.value })}
                        />
                      </div>
                    ) : (
                      <div className="hidden flex-1 basis-36 sm:block" aria-hidden />
                    )}

                    <button
                      type="button"
                      onClick={() => removeCondition(index)}
                      aria-label="Remove condition"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-neutral-200 text-neutral-400 transition hover:border-neutral-300 hover:bg-neutral-100 hover:text-neutral-700 dark:border-slate-800 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Quick Add Condition & Suggestion Pills */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200/60 dark:border-slate-800/60">
              <button
                type="button"
                onClick={() => addCondition()}
                className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 transition"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Add condition</span>
              </button>

              <div className="flex flex-wrap items-center gap-1 text-xs text-neutral-400 dark:text-slate-500">
                <span className="text-[11px]">Quick add:</span>
                {['country', 'plan', 'device_type', 'os'].map((prop) => (
                  <button
                    key={prop}
                    type="button"
                    onClick={() => addCondition(prop)}
                    className="rounded bg-neutral-200/60 px-1.5 py-0.5 text-[11px] font-medium text-neutral-700 hover:hover:text-blue-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-blue-950 dark:hover:text-blue-300 transition"
                  >
                    +{prop}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Live Readable Preview */}
        {readableSummary ? (
          <div className="rounded-lg border border-blue-200/60 bg-blue-50/50 p-3 text-xs dark:border-blue-900/40 dark:bg-blue-950/20">
            <span className="font-semibold text-blue-900 dark:text-blue-200">Segment definition: </span>
            <span className="text-blue-800 dark:text-blue-300">
              Users where {readableSummary}
            </span>
          </div>
        ) : null}

        {/* Error Banners */}
        {validationError || error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
            {validationError || error}
          </div>
        ) : null}
      </form>
    </DashboardDialog>
  );
}
