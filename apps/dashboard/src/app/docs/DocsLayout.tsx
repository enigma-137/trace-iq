'use client';

import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { TocNav, type DocsTocItem } from './toc';
import { OnThisPageToc } from './OnThisPageToc';

export function DocsLayout({
  sections,
  currentId,
  basePath,
  onOpenSearch,
  children
}: {
  sections: DocsTocItem[];
  currentId: string;
  basePath: string;
  onOpenSearch?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-8 lg:gap-12">
      {/* Left Sidebar — always visible on desktop */}
      <aside className="hidden lg:block w-60 shrink-0">
        <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2">
          {/* Search Trigger Shortcut */}
          <div className="mb-4">
            <button
              type="button"
              onClick={onOpenSearch}
              className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500 transition hover:border-neutral-300 hover:bg-neutral-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-700"
            >
              <div className="flex items-center gap-2">
                <Search className="size-3.5 text-neutral-400 dark:text-slate-500" />
                <span>Search docs...</span>
              </div>
              <kbd className="rounded border border-neutral-200 bg-white px-1.5 font-mono text-[10px] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                Ctrl K
              </kbd>
            </button>
          </div>

          <TocNav sections={sections} currentId={currentId} basePath={basePath} />
        </div>
      </aside>

      {/* Main Content Column */}
      <div className="min-w-0 flex-1">{children}</div>

      {/* Right Table of Contents Column (On this page) */}
      <OnThisPageToc currentId={currentId} />
    </div>
  );
}
