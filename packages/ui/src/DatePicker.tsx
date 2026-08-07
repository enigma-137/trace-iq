'use client';

import * as Popover from '@radix-ui/react-popover';
import { useMemo, useState } from 'react';
import { cn } from './utils';

export interface DatePickerProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

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

function formatDisplay(value?: string): string {
  if (!value) return 'No date';
  const [year, month, day] = value.split('-').map(Number);
  return `${MONTH_NAMES[month - 1]?.slice(0, 3)} ${day}, ${year}`;
}

export function DatePicker({ value, onChange, placeholder = 'Select date', className, id }: DatePickerProps) {
  const today = new Date();
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [open, setOpen] = useState(false);

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

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          id={id}
          className={cn(
            'inline-flex min-h-10 w-full items-center justify-between gap-2 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-white dark:focus:ring-white/10',
            !value && 'text-neutral-400 dark:text-slate-500',
            className
          )}
        >
          <span className="truncate">{value ? formatDisplay(value) : placeholder}</span>
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
          className="z-50 w-[280px] rounded-md border border-neutral-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-slate-900"
        >
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
            {cells.map((cell, index) =>
              !cell.inMonth || !cell.key ? (
                <div key={index} />
              ) : (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => {
                    onChange(cell.key);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex aspect-square items-center justify-center rounded text-sm text-neutral-700 transition hover:bg-neutral-100 dark:text-slate-300 dark:hover:bg-slate-800',
                    cell.key === value && 'bg-neutral-900 text-white hover:bg-neutral-900 dark:bg-white dark:text-black dark:hover:bg-white'
                  )}
                >
                  {cell.date.getDate()}
                </button>
              )
            )}
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className="rounded px-2 py-1 text-xs font-medium text-neutral-500 transition hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white"
            >
              Clear
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}