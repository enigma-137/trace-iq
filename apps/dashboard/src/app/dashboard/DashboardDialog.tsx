'use client';

import { ReactNode, useEffect } from 'react';

interface DashboardDialogProps {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}

export function DashboardDialog({
  open,
  title,
  description,
  children,
  footer,
  onClose
}: DashboardDialogProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm dark:bg-black/70"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-950/20 dark:border-slate-800 dark:bg-slate-950 dark:shadow-black/40"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-dialog-title"
        aria-describedby={description ? 'dashboard-dialog-description' : undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="dashboard-dialog-title" className="text-lg font-semibold tracking-normal text-slate-950 dark:text-white">
              {title}
            </h2>
            {description ? (
              <p id="dashboard-dialog-description" className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                {description}
              </p>
            ) : null}
          </div>
          <button
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-lg leading-none text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-800 dark:hover:text-white"
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            x
          </button>
        </div>

        {children ? <div className="mt-5">{children}</div> : null}

        {footer ? <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">{footer}</div> : null}
      </section>
    </div>
  );
}
