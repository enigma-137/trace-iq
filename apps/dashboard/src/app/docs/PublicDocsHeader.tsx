'use client';

import Link from 'next/link';
import { Search } from 'lucide-react';
import { ThemeToggle } from '../dashboard/ThemeToggle';

export function PublicDocsHeader({ onOpenSearch }: { onOpenSearch?: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label="TraceIQ home">
            <img className="h-7 w-auto dark:hidden" src="/brand/logo-black-no-bg.png" alt="TraceIQ" />
            <img className="hidden h-7 w-auto dark:block" src="/brand/logo-white-no-bg.png" alt="TraceIQ" />
            <span className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">TraceIQ</span>
            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-blue-600 dark:bg-cyan-500/10 dark:text-cyan-400">
              Docs
            </span>
          </Link>
        </div>

        {/* Central Search Button Trigger */}
        <div className="flex flex-1 max-w-md items-center justify-center px-4">
          <button
            type="button"
            onClick={onOpenSearch}
            className="group flex w-full max-w-md items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-500 transition-all hover:border-neutral-300 hover:bg-neutral-100 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-900"
          >
            <div className="flex items-center gap-2">
              <Search className="size-3.5 text-neutral-400 group-hover:text-neutral-600 dark:text-slate-500 dark:group-hover:text-slate-300" />
              <span>Search docs...</span>
            </div>
            <kbd className="inline-flex items-center gap-0.5 rounded border border-neutral-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-neutral-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              Ctrl K
            </kbd>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span
            className="hidden cursor-not-allowed items-center justify-center rounded-md p-2 text-neutral-500 opacity-50 dark:text-slate-400 sm:inline-flex"
            aria-label="GitHub Repository"
            aria-disabled="true"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
              <path d="M9 18c-4.51 2-5-2-7-2" />
            </svg>
          </span>

          <Link
            href="/waitlist"
            className="hidden h-8 items-center justify-center rounded-md bg-neutral-900 px-3 text-xs font-semibold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 sm:inline-flex"
          >
            Request Access
          </Link>

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
