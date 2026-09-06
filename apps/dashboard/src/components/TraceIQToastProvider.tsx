'use client';

import { ReactNode, useSyncExternalStore } from 'react';
import { CheckCircle2, CircleX, TriangleAlert, X } from 'lucide-react';
import {
  getServerToastSnapshot,
  getToastSnapshot,
  subscribeToToasts,
  toast,
  type ToastTone,
  type TraceIQToast
} from '@/lib/toast';

const TONE_STYLES: Record<ToastTone, { icon: typeof CheckCircle2; iconClass: string; title: string }> = {
  success: { icon: CheckCircle2, iconClass: 'text-emerald-600 dark:text-emerald-400', title: 'Success' },
  warning: { icon: TriangleAlert, iconClass: 'text-amber-600 dark:text-amber-400', title: 'Attention' },
  error: { icon: CircleX, iconClass: 'text-red-600 dark:text-red-400', title: 'Something went wrong' }
};

export function TraceIQToastProvider({ children }: { children: ReactNode }) {
  const toasts = useSyncExternalStore(subscribeToToasts, getToastSnapshot, getServerToastSnapshot);

  return (
    <>
      {children}
      <section
        className="pointer-events-none fixed inset-x-4 top-4 z-[100] flex flex-col items-end gap-3 sm:left-auto sm:w-[min(26rem,calc(100vw-2rem))]"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((item) => (
          <ToastItem key={item.id} toastItem={item} />
        ))}
      </section>
    </>
  );
}

function ToastItem({ toastItem }: { toastItem: TraceIQToast }) {
  const style = TONE_STYLES[toastItem.tone];
  const Icon = style.icon;

  return (
    <article
      className="traceiq-toast pointer-events-auto flex w-full items-start gap-3 rounded-lg border border-neutral-200 bg-white p-4 text-neutral-950 shadow-xl shadow-neutral-950/15 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:shadow-black/40"
      role={toastItem.tone === 'error' ? 'alert' : 'status'}
      aria-live={toastItem.tone === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      <Icon className={`mt-0.5 size-5 shrink-0 ${style.iconClass}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{toastItem.title ?? style.title}</p>
        <p className="mt-1 break-words text-sm leading-5 text-neutral-600 dark:text-slate-300">{toastItem.message}</p>
      </div>
      <button
        type="button"
        className="-mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 focus:outline-none focus:ring-2 focus:ring-neutral-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
        aria-label="Dismiss notification"
        onClick={() => toast.dismiss(toastItem.id)}
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </article>
  );
}
