'use client';

import { ReactNode, useSyncExternalStore } from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import Alert02Icon from '@hugeicons/core-free-icons/Alert02Icon';
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon';
import CancelCircleIcon from '@hugeicons/core-free-icons/CancelCircleIcon';
import CheckmarkCircle02Icon from '@hugeicons/core-free-icons/CheckmarkCircle02Icon';
import {
  getServerToastSnapshot,
  getToastSnapshot,
  subscribeToToasts,
  toast,
  type ToastTone,
  type TraceIQToast
} from '@/lib/toast';

const TONE_STYLES: Record<ToastTone, { icon: IconSvgElement; iconClass: string; title: string }> = {
  success: { icon: CheckmarkCircle02Icon, iconClass: 'text-emerald-600 dark:text-emerald-400', title: 'Success' },
  warning: { icon: Alert02Icon, iconClass: 'text-amber-600 dark:text-amber-400', title: 'Attention' },
  error: { icon: CancelCircleIcon, iconClass: 'text-red-600 dark:text-red-400', title: 'Something went wrong' }
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

  return (
    <article
      className="traceiq-toast pointer-events-auto flex w-full items-start gap-3 rounded-lg border border-neutral-200 bg-white p-4 text-neutral-950 shadow-xl shadow-neutral-950/15 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:shadow-black/40"
      role={toastItem.tone === 'error' ? 'alert' : 'status'}
      aria-live={toastItem.tone === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      <HugeiconsIcon icon={style.icon} size={20} className={`mt-0.5 shrink-0 ${style.iconClass}`} aria-hidden="true" />
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
        <HugeiconsIcon icon={Cancel01Icon} size={16} aria-hidden="true" />
      </button>
    </article>
  );
}
