'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { List, X } from 'lucide-react';

export interface DocsTocItem {
  id: string;
  label: string;
  category: string;
}

function TocNav({
  sections,
  currentId,
  basePath
}: {
  sections: DocsTocItem[];
  currentId: string;
  basePath: string;
}) {
  return (
    <div className="grid gap-5">
      {Array.from(new Set(sections.map((s) => s.category))).map((category) => (
        <div key={category}>
          <p className="mb-1 pl-3 text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
            {category}
          </p>
          <ul className="grid gap-1 text-sm">
            {sections
              .filter((s) => s.category === category)
              .map((s) => {
                const isActive = s.id === currentId;
                return (
                  <li key={s.id}>
                    <Link
                      className={`block border-l-2 py-1 pl-3 transition ${
                        isActive
                          ? 'font-semibold text-neutral-900 dark:text-white border-slate-900 dark:border-white'
                          : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
                      }`}
                      href={`${basePath}?page=${s.id}`}
                    >
                      {s.label}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function DocsLayout({
  sections,
  currentId,
  basePath,
  children
}: {
  sections: DocsTocItem[];
  currentId: string;
  basePath: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // Lock the page behind the mobile contents drawer and let Escape dismiss it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      {/* Mobile toggle — first thing on the page, so the contents are reachable
          above any page heading. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-6 inline-flex h-9 w-full items-center justify-between rounded-md border border-neutral-200 px-3 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900 lg:hidden"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2">
          <List className="size-4" />
          Table of contents
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
          {sections.findIndex((s) => s.id === currentId) + 1}/{sections.length}
        </span>
      </button>

      <div className="gap-10 lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Desktop sidebar — always visible on lg+ */}
        <aside className="hidden lg:block">
          <nav className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-1">
            <p className="mb-1 pl-3 text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
              Contents
            </p>
            <TocNav sections={sections} currentId={currentId} basePath={basePath} />
          </nav>
        </aside>

        {open && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Table of contents">
            <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden="true" />
            <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-neutral-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-slate-800">
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
                  Contents
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close table of contents"
                  className="inline-flex size-8 items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
                >
                  <X className="size-4" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto px-3 py-5">
                <TocNav sections={sections} currentId={currentId} basePath={basePath} />
              </nav>
            </div>
          </div>
        )}

        {/* Content column */}
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}
