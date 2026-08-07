'use client';

import * as Popover from '@radix-ui/react-popover';
import { useMemo, useState } from 'react';
import { cn } from './utils';

export interface DateRange {
  from?: string;
  to?: string;
}

export interface DateRangePreset {
  label: string;
  days: number;
}

export interface DateRangePickerProps {
  value: DateRange;
  onChange: (next: DateRange) => void;
  presets?: DateRangePreset[];
  className?: string;
}

const DEFAULT_PRESETS: DateRangePreset[] = [
  { label: 'Last 24h', days: 1 },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 }
];

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function toDateKey(date: Date): string {
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

function shiftMonth(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function formatDisplay(range: DateRange): string {
  if (!range.from && !range.to) return 'Select range';
  if (range.from && range.to && range.from === range.to) return formatShort(range.from);
  if (range.from && range.to) return `${formatShort(range.from)} – ${formatShort(range.to)}`;
  if (range.from) return `From ${formatShort(range.from)}`;
  if (range.to) return `Until ${formatShort(range.to)}`;
  return 'Select range';
}

function formatShort(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  return `${MONTH_NAMES[month - 1]?.slice(0, 3)} ${day}, ${year}`;
}

export function DateRangePicker({ value, onChange, presets = DEFAULT_PRESETS, className }: DateRangePickerProps) {
  const today = new Date();
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [open, setOpen] = useState(false);

  const applyPreset = (days: number) => {
    onChange({ from: toDateKey(addDays(today, -(days - 1))), to: toDateKey(today) });
    setOpen(false);
  };

  const cells = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const result: Array<{ key: string; date: Date; inMonth: boolean }> = [];
    for (let i = 0; i < startWeekday; i += 1) {
      result.push({ key: '', date: addDays(first, -(startWeekday - i)), inMonth: false });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      result.push({ key: toDateKey(new Date(view.getFullYear(), view.getMonth(), day)), date: new Date(view.getFullYear(), view.getMonth(), day), inMonth: true });
    }
    return result;
  }, [view]);

  function handleDayClick(key: string) {
    if (!value.from || (value.from && value.to)) {
      onChange({ from: key, to: undefined });
    } else if (value.from && key < value.from) {
      onChange({ from: key, to: value.from });
    } else {
      onChange({ from: value.from, to: key });
    }
  }

  const isSelected = (key: string) => value.from === key || value.to === key;
  const isInRange = (key: string) => {
    if (!value.from || !value.to) return false;
    return key > value.from && key < value.to;
  };
  const isStartEdge = (key: string) => Boolean(value.from) && (value.to ? key === value.from : false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex min-h-10 w-full items-center justify-between gap-2 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-white dark:focus:ring-white/10',
            className
          )}
        >
          <span className={cn('truncate', !value.from && !value.to && 'text-neutral-400 dark:text-slate-500')}>
            {formatDisplay(value)}
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-neutral-400 dark:text-slate-500" aria-hidden>
            <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
          </svg>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="z-50 w-[320px] rounded-md border border-neutral-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="mb-3 flex flex-wrap gap-1.5">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset.days)}
                className="rounded border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-600 transition hover:border-neutral-300 hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between pb-2">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setView(shiftMonth(view, -1))}
              className="flex size-7 items-center justify-center rounded text-neutral-500 transition hover:bg-neutral-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-neutral-900 dark:text-white">
              {MONTH_NAMES[view.getMonth()]} {view.getFullYear()}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setView(shiftMonth(view, 1))}
              className="flex size-7 items-center justify-center rounded text-neutral-500 transition hover:bg-neutral-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 pb-1">
            {DAY_NAMES.map((day) => (
              <div key={day} className="text-center text-[10px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-slate-500">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell, index) => {
              if (!cell.inMonth || !cell.key) {
                return <div key={index} />;
              }
              const inRange = isInRange(cell.key);
              const startEdge = isStartEdge(cell.key);
              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => handleDayClick(cell.key)}
                  className={cn(
                    'flex aspect-square items-center justify-center rounded text-sm text-neutral-700 transition hover:bg-neutral-100 dark:text-slate-300 dark:hover:bg-slate-800',
                    inRange && 'bg-neutral-200/70 dark:bg-slate-700/60',
                    startEdge && 'rounded-l-full bg-neutral-900 text-white dark:bg-white dark:text-black',
                    isSelected(cell.key) && 'bg-neutral-900 text-white dark:bg-white dark:text-black'
                  )}
                >
                  {cell.date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                onChange({ from: undefined, to: undefined });
                setOpen(false);
              }}
              className="rounded px-2 py-1 text-xs font-medium text-neutral-500 transition hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-slate-200"
            >
              Apply
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}