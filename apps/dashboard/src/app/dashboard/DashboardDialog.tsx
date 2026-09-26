'use client';

import { ReactNode, useEffect } from 'react';

export interface DashboardDialogProps {
  open?: boolean;
  isOpen?: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  maxWidthClass?: string;
  onClose: () => void;
}

export function DashboardDialog({
  open,
  isOpen,
  title,
  description,
  children,
  footer,
  maxWidthClass = 'max-w-lg',
  onClose
}: DashboardDialogProps) {
  const isShown = open ?? isOpen ?? false;

  useEffect(() => {
    if (!isShown) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isShown]);

  if (!isShown) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-neutral-950/45 px-4 py-6 backdrop-blur-sm dark:bg-black/70"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className={`w-full ${maxWidthClass} rounded-lg border border-neutral-200 bg-white p-5 shadow-2xl shadow-neutral-950/20 dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-black/40`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-dialog-title"
        aria-describedby={description ? 'dashboard-dialog-description' : undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="dashboard-dialog-title" className="text-base font-semibold tracking-normal text-neutral-950 dark:text-white">
              {title}
            </h2>
            {description ? (
              <p id="dashboard-dialog-description" className="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
                {description}
              </p>
            ) : null}
          </div>
          <button
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-xs font-semibold text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 dark:border-neutral-800 dark:bg-neutral-850 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {children ? <div className="mt-4">{children}</div> : null}

        {footer ? <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">{footer}</div> : null}
      </section>
    </div>
  );
}
