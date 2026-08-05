import Link from 'next/link';
import { ThemeToggle } from '../dashboard/ThemeToggle';

export function PublicDocsHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 md:px-8">
        <Link href="/" className="flex items-center gap-2" aria-label="TraceIQ home">
          <img className="h-7 w-auto dark:hidden" src="/brand/logo-black-no-bg.png" alt="TraceIQ" />
          <img className="hidden h-7 w-auto dark:block" src="/brand/logo-white-no-bg.png" alt="TraceIQ" />
          <span className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">TraceIQ</span>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/waitlist"
            className="hidden h-9 items-center justify-center rounded-md border border-neutral-300 px-3 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900 sm:inline-flex"
          >
            Request early access
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
