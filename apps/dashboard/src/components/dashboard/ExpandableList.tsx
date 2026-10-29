'use client';

import { useState, type ReactNode } from 'react';

interface ExpandableListProps {
  /** Rendered `<li>` rows; server components can pass them as-is. */
  items: ReactNode[];
  /** Rows shown before "View more". */
  initial?: number;
  className?: string;
}

/** A list that shows its first rows and expands in place for the rest. */
export function ExpandableList({ items, initial = 10, className = '' }: ExpandableListProps) {
  const [expanded, setExpanded] = useState(false);
  const hidden = items.length - initial;

  return (
    <>
      <ul className={className}>{expanded || hidden <= 0 ? items : items.slice(0, initial)}</ul>
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="flex w-full items-center justify-center gap-1.5 border-t border-neutral-100 px-4 py-2.5 text-xs font-medium text-neutral-600 transition hover:bg-neutral-50 hover:text-neutral-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-white"
        >
          {expanded ? 'Show less' : `View ${hidden.toLocaleString()} more`}
          <span aria-hidden="true" className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>
            ▾
          </span>
        </button>
      ) : null}
    </>
  );
}
