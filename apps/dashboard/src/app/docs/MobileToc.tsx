'use client';

import { createPortal } from 'react-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon';
import Menu01Icon from '@hugeicons/core-free-icons/Menu01Icon';
import Search01Icon from '@hugeicons/core-free-icons/Search01Icon';
import { useEffect, useState } from 'react';
import { TocNav, type DocsTocItem } from './toc';

export function MobileToc({
  sections,
  currentId,
  basePath,
  onOpenSearch
}: {
  sections: DocsTocItem[];
  currentId: string;
  basePath: string;
  onOpenSearch?: () => void;
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
    <div className="mb-6 flex items-center gap-2 lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex flex-1 items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-xs font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <span className="inline-flex items-center gap-2">
          <HugeiconsIcon icon={Menu01Icon} size={16} className="text-neutral-500" aria-hidden />
          <span>Documentation contents</span>
        </span>
        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500 dark:bg-slate-800 dark:text-slate-400">{currentId}</span>
      </button>

      <button
        type="button"
        onClick={onOpenSearch}
        className="flex shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white p-2.5 text-neutral-700 shadow-sm transition hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        aria-label="Search documentation"
      >
        <HugeiconsIcon icon={Search01Icon} size={16} />
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Table of contents">
            <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
            <div className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-white shadow-xl dark:bg-slate-950">
              <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-slate-800">
                <p className="text-sm font-semibold text-neutral-900 dark:text-white">Documentation</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={20} aria-hidden />
                  <span className="sr-only">Close table of contents</span>
                </button>
              </div>
              <div className="border-b border-neutral-200 p-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onOpenSearch?.();
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                >
                  <div className="flex items-center gap-2">
                    <HugeiconsIcon icon={Search01Icon} size={14} />
                    <span>Search docs...</span>
                  </div>
                  <kbd className="rounded border border-neutral-200 bg-white px-1 font-mono text-[10px] dark:border-slate-800 dark:bg-slate-950">Ctrl K</kbd>
                </button>
              </div>
              <div className="flex-1 px-3 py-4">
                <TocNav sections={sections} currentId={currentId} basePath={basePath} onItemClick={() => setOpen(false)} />
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
