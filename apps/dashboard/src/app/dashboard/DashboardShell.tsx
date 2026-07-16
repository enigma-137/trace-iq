import Link from 'next/link';
import type { ReactNode } from 'react';
import { SignOutButton } from './SignOutButton';
import { ThemeToggle } from './ThemeToggle';

const navItems = [
  { label: 'Overview', href: '/dashboard', key: 'overview' },
  { label: 'Setup', href: '/dashboard', key: 'setup' },
  { label: 'Events', href: '/dashboard/events', key: 'events' },
  { label: 'Users', href: '/dashboard', key: 'users' },
  { label: 'Funnels', href: '/dashboard', key: 'funnels' },
  { label: 'Docs', href: '/docs', key: 'docs' }
];

interface DashboardShellProps {
  active: string;
  title: string;
  userEmail?: string | null;
  children: ReactNode;
}

export function DashboardShell({ active, title, userEmail, children }: DashboardShellProps) {
  return (
    <main className="min-h-screen bg-white text-slate-950 dark:bg-black dark:text-slate-100">
      <div className="flex min-h-screen w-full">
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white px-5 py-6 dark:border-slate-800/80 dark:bg-slate-950/70 lg:block">
          <Link className="flex items-center gap-3" href="/" aria-label="TraceIQ home">
            <img className="h-9 w-auto dark:hidden" src="/brand/logo-black-no-bg.png" alt="TraceIQ" />
            <img className="hidden h-9 w-auto dark:block" src="/brand/logo-white-no-bg.png" alt="TraceIQ" />
          </Link>

          <nav className="mt-8 grid gap-1" aria-label="Dashboard navigation">
            {navItems.map((item) => (
              <Link
                key={item.key}
                className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                  item.key === active
                    ? 'bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100'
                }`}
                href={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-5 py-4 backdrop-blur dark:border-slate-800/80 dark:bg-black/90 md:px-8">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <img className="h-8 w-auto dark:hidden lg:hidden" src="/brand/logo-black-no-bg.png" alt="TraceIQ" />
                <img className="hidden h-8 w-auto dark:block lg:hidden" src="/brand/logo-white-no-bg.png" alt="TraceIQ" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-500">
                    Dashboard
                  </p>
                  <h1 id="dashboard-title" className="mt-1 truncate text-xl font-semibold tracking-normal text-slate-950 dark:text-white">
                    {title}
                  </h1>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden min-w-0 text-right sm:block">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{userEmail ?? 'Account'}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-500">Owner workspace</p>
                </div>
                <ThemeToggle />
                <SignOutButton />
              </div>
            </div>

            <nav className="mt-4 flex gap-2 overflow-x-auto lg:hidden" aria-label="Mobile dashboard navigation">
              {navItems.map((item) => (
                <Link
                  key={item.key}
                  className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ${
                    item.key === active
                      ? 'bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                  href={item.href}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </header>

          <div className="px-5 py-6 md:px-8 xl:px-10 2xl:px-12">{children}</div>
        </section>
      </div>
    </main>
  );
}
