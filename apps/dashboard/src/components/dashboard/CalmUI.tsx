'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';

/**
 * Small building blocks for calm settings pages: one solid blue for the main action,
 * one solid orange for attention actions, explanations tucked behind a "?" popover,
 * and forms in dialogs instead of on the page.
 */

export const buttonClass = {
  blue: 'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/40 disabled:cursor-not-allowed disabled:opacity-50',
  orange:
    'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 disabled:cursor-not-allowed disabled:opacity-50',
  quiet:
    'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
  link: 'text-sm font-semibold text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400'
} as const;

export const fieldClass = {
  label: 'grid gap-1.5 text-xs font-semibold text-neutral-700 dark:text-slate-300',
  input:
    'h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm font-normal text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-blue-500',
  hint: 'text-xs font-normal text-neutral-500 dark:text-slate-400'
} as const;

/** A "?" button that opens a small popover with the explanation. */
export function HelpTip({ label, children, align = 'start' }: { label: string; children: ReactNode; align?: 'start' | 'end' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-bold leading-none transition ${
          open
            ? 'border-blue-600 bg-blue-600 text-white'
            : 'border-neutral-300 bg-white text-neutral-500 hover:border-blue-600 hover:text-blue-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-blue-400 dark:hover:text-blue-400'
        }`}
      >
        ?
      </button>
      {open ? (
        <span
          id={id}
          role="dialog"
          aria-label={label}
          className={`absolute top-7 z-40 block w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-neutral-200 bg-white p-3.5 text-left text-xs font-normal leading-relaxed text-neutral-600 shadow-xl shadow-neutral-950/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 ${
            align === 'end' ? 'right-0' : 'left-0'
          }`}
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}

/** A card that offers one action: icon, title, one line, a "?" for details, and a button. */
export function ActionCard({
  icon,
  logo,
  tone,
  title,
  description,
  help,
  helpLabel,
  children
}: {
  icon?: IconSvgElement;
  /** A brand mark shown on a white tile instead of the coloured icon tile. */
  logo?: { src: string; alt: string };
  tone: 'blue' | 'orange';
  title: string;
  description: string;
  help?: ReactNode;
  helpLabel?: string;
  children?: ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start gap-4">
        {logo ? (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white p-1.5 dark:border-slate-700">
            {/* eslint-disable-next-line @next/next/no-img-element -- a small static SVG mark */}
            <img src={logo.src} alt={logo.alt} className="h-auto w-full" />
          </span>
        ) : (
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white ${tone === 'blue' ? 'bg-blue-600' : 'bg-orange-500'}`}
            aria-hidden="true"
          >
            {icon ? <HugeiconsIcon icon={icon} size={22} strokeWidth={1.8} /> : null}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">{title}</h2>
            {help ? <HelpTip label={helpLabel ?? `About ${title}`}>{help}</HelpTip> : null}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-neutral-500 dark:text-slate-400">{description}</p>
        </div>
      </div>
      {children ? <div className="mt-5 flex flex-1 flex-wrap items-end gap-3">{children}</div> : null}
    </section>
  );
}

/** A one-line result message. */
export function Notice({ tone, children }: { tone: 'ok' | 'error' | 'warn'; children: ReactNode }) {
  const styles =
    tone === 'ok'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
      : tone === 'warn'
        ? 'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-200'
        : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300';
  return <p className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${styles}`}>{children}</p>;
}
