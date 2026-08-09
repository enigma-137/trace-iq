import type { ReactNode } from 'react';
import { TocNav, type DocsTocItem } from './toc';

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
  return (
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

      {/* Content column */}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
