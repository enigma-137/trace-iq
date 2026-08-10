import Link from 'next/link';
import type { ReactNode } from 'react';
import { SignOutButton } from './SignOutButton';
import { ThemeToggle } from './ThemeToggle';
import { NavIcon } from './NavIcon';
import { MobileNav } from './MobileNav';
import { bottomNavItems, navItems, navLinkClass, withProjectId } from './nav';

interface DashboardShellProps {
  active: string;
  title: string;
  userEmail?: string | null;
  projectId?: string | null;
  children: ReactNode;
}

export function DashboardShell({ active, title, userEmail, projectId, children }: DashboardShellProps) {
  return (
    <main className="min-h-screen bg-white text-neutral-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex min-h-screen w-full">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto border-r border-neutral-200 bg-white px-4 py-6 dark:border-slate-800 dark:bg-slate-950 lg:flex">
          <Link className="flex items-center gap-2" href="/" aria-label="TraceIQ home">
            <img className="h-8 w-auto dark:hidden" src="/brand/logo-black-no-bg.png" alt="TraceIQ" />
            <img className="hidden h-8 w-auto dark:block" src="/brand/logo-white-no-bg.png" alt="TraceIQ" />
            <span className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">TraceIQ</span>
          </Link>

          <nav className="mt-8 grid gap-0.5" aria-label="Dashboard navigation">
            {navItems.map((item) => (
              <Link key={item.key} className={navLinkClass(item.key === active)} href={withProjectId(item.href, projectId)}>
                <NavIcon name={item.key} />
                {item.label}
              </Link>
            ))}
          </nav>

          <nav className="mt-auto grid gap-0.5 border-t border-neutral-200 pt-3 dark:border-slate-800" aria-label="Settings navigation">
            {bottomNavItems.map((item) => (
              <Link key={item.key} className={navLinkClass(item.key === active)} href={withProjectId(item.href, projectId)}>
                <NavIcon name={item.key} />
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-3 border-t border-neutral-200 pt-3 dark:border-slate-800">
            <p className="truncate text-sm font-medium text-neutral-800 dark:text-slate-200">{userEmail ?? 'Account'}</p>
            <p className="text-xs text-neutral-400 dark:text-slate-500">Owner workspace</p>
            <div className="mt-3 flex items-center gap-2">
              <ThemeToggle />
              <SignOutButton />
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 md:px-8">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <img className="h-7 w-auto dark:hidden lg:hidden" src="/brand/logo-black-no-bg.png" alt="TraceIQ" />
                {/* <img className="hidden h-7 w-auto dark:block lg:hidden" src="/brand/logo-white-no-bg.png" alt="TraceIQ" /> */}
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400 dark:text-slate-500">
                    Dashboard
                  </p>
                  <h1 id="dashboard-title" className="mt-0.5 truncate text-xl font-semibold tracking-tight text-neutral-900 dark:text-white">
                    {title}
                  </h1>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <MobileNav active={active} projectId={projectId} userEmail={userEmail} />
              </div>
            </div>
          </header>

          <div className="px-5 py-6 md:px-8 xl:px-10 2xl:px-12">{children}</div>
        </section>
      </div>
    </main>
  );
}
