'use client';

import { createPortal } from 'react-dom';
import { List, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TocNav, type DocsTocItem } from './toc';

export function MobileToc({
  sections,
  currentId,
  basePath
}: {
  sections: DocsTocItem[];
  currentId: string;
  basePath: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <div className="mb-6 lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-full items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <span className="inline-flex items-center gap-2">
          <List className="h-4 w-4" aria-hidden />
          Table of contents
        </span>
        <span className="text-xs text-neutral-400 dark:text-slate-500">{currentId}</span>
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Table of contents">
            <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
            <div className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-white shadow-xl dark:bg-slate-950">
              <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-slate-800">
                <p className="text-sm font-semibold text-neutral-900 dark:text-white">Table of contents</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                  <X className="h-5 w-5" aria-hidden />
                  <span className="sr-only">Close table of contents</span>
                </button>
              </div>
              <div className="flex-1 px-2 py-4">
                <TocNav sections={sections} currentId={currentId} basePath={basePath} />
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
