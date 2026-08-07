'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { cn } from './utils';

export interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function Checkbox({ checked, onCheckedChange, label, disabled, className, 'aria-label': ariaLabel }: CheckboxProps) {
  return (
    <label
      className={cn(
        'flex items-center gap-2 text-sm text-neutral-700 dark:text-slate-300',
        disabled && 'cursor-not-allowed opacity-60',
        className
      )}
    >
      <CheckboxPrimitive.Root
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next === true)}
        disabled={disabled}
        aria-label={ariaLabel}
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded border border-neutral-300 bg-white text-white outline-none transition focus-visible:ring-2 focus-visible:ring-neutral-900/20 disabled:cursor-not-allowed data-[state=checked]:border-neutral-900 data-[state=checked]:bg-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:focus-visible:ring-white/20 dark:data-[state=checked]:border-white dark:data-[state=checked]:bg-white dark:data-[state=checked]:text-black'
        )}
      >
        <CheckboxPrimitive.Indicator>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {label ? <span>{label}</span> : null}
    </label>
  );
}