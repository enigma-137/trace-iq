'use client';

import { useState, type ReactNode } from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import Copy01Icon from '@hugeicons/core-free-icons/Copy01Icon';
import Tick02Icon from '@hugeicons/core-free-icons/Tick02Icon';

/**
 * Shared building blocks for the settings pages: a titled section, a bordered
 * card with a soft shadow, and label/value rows inside it. Keeping these in one
 * place is what keeps the panels visually consistent.
 */

export function SettingsSection({
  id,
  title,
  description,
  actions,
  children
}: {
  id: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="grid scroll-mt-24 gap-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-white">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-500 dark:text-slate-400">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function SettingsCard({
  icon,
  title,
  description,
  actions,
  footer,
  tone = 'default',
  className = '',
  children
}: {
  icon?: IconSvgElement;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  tone?: 'default' | 'danger';
  className?: string;
  children?: ReactNode;
}) {
  const border = tone === 'danger' ? 'border-red-200 dark:border-red-900/60' : 'border-neutral-200 dark:border-slate-800';
  const divider = tone === 'danger' ? 'border-red-100 dark:border-red-900/40' : 'border-neutral-100 dark:border-slate-800';

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)] dark:bg-slate-900/40 dark:shadow-none ${border} ${className}`}
    >
      {title ? (
        <div className={`flex flex-col justify-between gap-3 px-5 py-4 sm:flex-row sm:items-center ${children ? `border-b ${divider}` : ''}`}>
          <div className="flex min-w-0 items-start gap-3">
            {icon ? (
              <HugeiconsIcon
                icon={icon}
                size={18}
                strokeWidth={1.8}
                className={`mt-0.5 shrink-0 ${tone === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-neutral-500 dark:text-slate-400'}`}
              />
            ) : null}
            <div className="min-w-0">
              <h3 className={`text-sm font-semibold ${tone === 'danger' ? 'text-red-700 dark:text-red-300' : 'text-neutral-900 dark:text-white'}`}>
                {title}
              </h3>
              {description ? <p className="mt-0.5 text-sm leading-6 text-neutral-500 dark:text-slate-400">{description}</p> : null}
            </div>
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
      {footer ? (
        <div className={`flex flex-col justify-between gap-3 border-t bg-neutral-50/70 px-5 py-3 text-xs text-neutral-500 dark:bg-slate-900/60 dark:text-slate-400 sm:flex-row sm:items-center ${divider}`}>
          {footer}
        </div>
      ) : null}
    </div>
  );
}

/** A label/value row inside a SettingsCard. Rows stack and get dividers automatically. */
export function SettingsRow({
  label,
  hint,
  actions,
  children
}: {
  label: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="grid gap-3 border-b border-neutral-100 px-5 py-4 last:border-b-0 dark:border-slate-800 md:grid-cols-[200px_minmax(0,1fr)_auto] md:items-center md:gap-6">
      <div>
        <p className="text-sm font-medium text-neutral-900 dark:text-white">{label}</p>
        {hint ? <p className="mt-0.5 text-xs leading-5 text-neutral-500 dark:text-slate-400">{hint}</p> : null}
      </div>
      <div className="min-w-0 text-sm text-neutral-700 dark:text-slate-300">{children}</div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">{actions}</div> : <span className="hidden md:block" />}
    </div>
  );
}

export function StatusPill({ tone, children }: { tone: 'success' | 'warning' | 'neutral' | 'danger'; children: ReactNode }) {
  const styles = {
    success: 'border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300',
    warning: 'border-amber-200 text-amber-700 dark:border-amber-900 dark:text-amber-300',
    danger: 'border-red-200 text-red-700 dark:border-red-900 dark:text-red-300',
    neutral: 'border-neutral-200 text-neutral-600 dark:border-slate-700 dark:text-slate-300'
  }[tone];
  const dot = {
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-red-500',
    neutral: 'bg-neutral-400'
  }[tone];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${styles}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {children}
    </span>
  );
}

export function Notice({ tone, children }: { tone: 'success' | 'error' | 'warning' | 'info'; children: ReactNode }) {
  const styles = {
    error: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
    warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/20 dark:text-amber-200',
    info: 'border-neutral-200 bg-white text-neutral-700 shadow-sm dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300'
  }[tone];

  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-3.5 py-2.5 text-sm leading-6 ${styles}`}>
      {children}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  disabled = false,
  label
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/20 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-white/20 ${
        checked
          ? 'border-neutral-900 bg-neutral-900 dark:border-white dark:bg-white'
          : 'border-neutral-300 bg-neutral-200 dark:border-slate-700 dark:bg-slate-800'
      }`}
    >
      <span
        className={`inline-block h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform dark:bg-slate-950 ${
          checked ? 'translate-x-[22px]' : 'translate-x-[2px] dark:bg-slate-400'
        }`}
      />
    </button>
  );
}

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button className={secondaryButton} type="button" onClick={handleCopy}>
      <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} size={14} strokeWidth={1.8} />
      {copied ? 'Copied' : label}
    </button>
  );
}

export const primaryButton =
  'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200';

export const secondaryButton =
  'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white';

export const dangerButton =
  'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-sm font-medium text-red-600 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/70 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/30';

export const inputClass =
  'h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 shadow-sm outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-slate-400 dark:focus:ring-white/10';

export const fieldLabelClass = 'grid gap-1.5 text-sm font-medium text-neutral-700 dark:text-slate-300';
