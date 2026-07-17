import Link from 'next/link';
import type { ReactNode } from 'react';
import { SignOutButton } from './SignOutButton';
import { ThemeToggle } from './ThemeToggle';
import { NavIcon } from './NavIcon';

const navItems = [
  { label: 'Overview', href: '/dashboard', key: 'overview' },
  { label: 'Web analytics', href: '/dashboard/web', key: 'web' },
  { label: 'Insights', href: '/dashboard/insights', key: 'insights' },
  { label: 'Events', href: '/dashboard/events', key: 'events' },
  { label: 'Funnels', href: '/dashboard/funnels', key: 'funnels' },
  { label: 'Users', href: '/dashboard/users', key: 'users' },
  { label: 'Errors', href: '/dashboard/errors', key: 'errors' },
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
    <main className="min-h-screen bg-white text-neutral-900 dark:bg-black dark:text-neutral-100">
      <div className="flex min-h-screen w-full">
        <aside className="hidden w-60 shrink-0 border-r border-neutral-200 bg-white px-4 py-6 dark:border-neutral-800 dark:bg-black lg:block">
          <Link className="flex items-center gap-2" href="/" aria-label="TraceIQ home">
            <img className="h-8 w-auto dark:hidden" src="/brand/logo-black-no-bg.png" alt="TraceIQ" />
            <img className="hidden h-8 w-auto dark:block" src="/brand/logo-white-no-bg.png" alt="TraceIQ" />
          </Link>

          <nav className="mt-8 grid gap-0.5" aria-label="Dashboard navigation">
            {navItems.map((item) => (
              <Link
                key={item.key}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition ${
                  item.key === active
                    ? 'bg-neutral-100 text-neutral-900 dark:bg-neutral-900 dark:text-white'
                    : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-100'
                }`}
                href={item.href}
              >
                <NavIcon name={item.key} />
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 px-5 py-4 backdrop-blur dark:border-neutral-800 dark:bg-black/90 md:px-8">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <img className="h-7 w-auto dark:hidden lg:hidden" src="/brand/logo-black-no-bg.png" alt="TraceIQ" />
                <img className="hidden h-7 w-auto dark:block lg:hidden" src="/brand/logo-white-no-bg.png" alt="TraceIQ" />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400 dark:text-neutral-500">
                    Dashboard
                  </p>
                  <h1 id="dashboard-title" className="mt-0.5 truncate text-xl font-semibold tracking-tight text-neutral-900 dark:text-white">
                    {title}
                  </h1>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden min-w-0 text-right sm:block">
                  <p className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-200">{userEmail ?? 'Account'}</p>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500">Owner workspace</p>
                </div>
                <ThemeToggle />
                <SignOutButton />
              </div>
            </div>

            <nav className="mt-4 flex gap-1.5 overflow-x-auto lg:hidden" aria-label="Mobile dashboard navigation">
              {navItems.map((item) => (
                <Link
                  key={item.key}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ${
                    item.key === active
                      ? 'bg-neutral-100 text-neutral-900 dark:bg-neutral-900 dark:text-white'
                      : 'text-neutral-500 dark:text-neutral-400'
                  }`}
                  href={item.href}
                >
                  <NavIcon name={item.key} />
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
