import { CAPTURE_LABELS, type CaptureState, type StatusTone, statusTone } from '@/lib/requests';

// Status codes are the one place the explorer breaks the neutral palette, matching
// API Performance: green = success, amber = client error, red = server error.

const methodTone: Record<string, string> = {
  GET: 'text-neutral-700 dark:text-slate-200',
  POST: 'text-blue-700 dark:text-blue-300',
  PUT: 'text-violet-700 dark:text-violet-300',
  PATCH: 'text-violet-700 dark:text-violet-300',
  DELETE: 'text-red-700 dark:text-red-300'
};

export function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={`inline-flex w-[52px] shrink-0 justify-center rounded border border-neutral-200 bg-neutral-50 px-1 py-px font-mono text-[10px] font-semibold uppercase tracking-wide dark:border-slate-700 dark:bg-slate-900 ${
        methodTone[method] ?? 'text-neutral-600 dark:text-slate-300'
      }`}
    >
      {method}
    </span>
  );
}

const statusClasses = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
  redirect: 'border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
  client: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
  server: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
  none: 'border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
};

export function StatusBadge({ status }: { status: number }) {
  return (
    <span
      className={`inline-flex min-w-[38px] justify-center rounded border px-1.5 py-px font-mono text-[11px] font-semibold tabular-nums ${statusClasses[statusTone(status)]}`}
      title={status === 0 ? 'No response (network error or aborted)' : undefined}
    >
      {status || '—'}
    </span>
  );
}

const captureClasses: Record<CaptureState, string> = {
  captured: 'text-emerald-700 dark:text-emerald-300',
  redacted: 'text-amber-700 dark:text-amber-300',
  metadata_only: 'text-neutral-500 dark:text-slate-400',
  unavailable: 'text-neutral-400 dark:text-slate-500'
};

const captureDot: Record<CaptureState, string> = {
  captured: 'bg-emerald-500',
  redacted: 'bg-amber-500',
  metadata_only: 'bg-neutral-300 dark:bg-slate-600',
  unavailable: 'border border-neutral-300 dark:border-slate-600'
};

export function CaptureBadge({ state }: { state: CaptureState }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${captureClasses[state]}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${captureDot[state]}`} aria-hidden />
      {CAPTURE_LABELS[state] ?? state}
    </span>
  );
}

const pillClasses = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/60 dark:text-emerald-300',
  redirect: 'border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
  client: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/60 dark:text-amber-300',
  server: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/60 dark:text-red-300',
  none: 'border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
};

/** Rounded status pill with an icon, used in the request drawer summaries. */
export function StatusPill({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${pillClasses[tone]}`}>
      <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <circle cx="8" cy="8" r="6.25" />
        {tone === 'success' ? (
          <path d="M5.5 8.2l1.7 1.7 3.3-3.6" strokeLinecap="round" strokeLinejoin="round" />
        ) : tone === 'redirect' ? (
          <path d="M5.5 8h5m-2-2 2 2-2 2" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M8 5v3.5M8 10.8v.01" strokeLinecap="round" />
        )}
      </svg>
      {label}
    </span>
  );
}
