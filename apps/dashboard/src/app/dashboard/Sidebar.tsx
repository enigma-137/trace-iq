'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { NavIcon } from './NavIcon';
import { ThemeToggle } from './ThemeToggle';
import { SignOutButton } from './SignOutButton';
import { navItems, bottomNavItems, navLinkClass, withProjectId } from './nav';
import { useMfaStatus } from '@/lib/mfa';
import { useOrganization } from '@/lib/organization';


interface SidebarProps {
  active: string;
  userEmail?: string | null;
  projectId?: string | null;
}

export function Sidebar({ active, userEmail, projectId }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { enrolled } = useMfaStatus();
  const { organization } = useOrganization();
  const showMfaWarning = mounted && enrolled === false;
  const organizationName = organization?.name || 'Your Organization';

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem('traceiq-sidebar-collapsed');
    if (stored === 'true') {
      setCollapsed(true);
    }
  }, []);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('traceiq-sidebar-collapsed', String(next));
      return next;
    });
  };

  const initial = (userEmail?.[0] || 'A').toUpperCase();

  return (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 flex-col overflow-y-auto border-r border-neutral-200 bg-white transition-[width] duration-200 ease-in-out dark:border-slate-800/90 dark:bg-slate-950 lg:flex ${collapsed ? 'w-16 px-2 py-5' : 'w-60 px-4 py-5'
        }`}
    >
      {/* Brand Header */}
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} min-h-8`}>
        <Link className="flex items-center gap-2.5 overflow-hidden" href="/" aria-label="TraceIQ home">
          <img className="h-7 w-7 shrink-0 dark:hidden" src="/brand/logo-black-no-bg.png" alt="TraceIQ" />
          <img className="hidden h-7 w-7 shrink-0 dark:block" src="/brand/logo-white-no-bg.png" alt="TraceIQ" />
          {!collapsed && (
            <span className="truncate text-lg font-bold tracking-tight text-neutral-900 dark:text-white">
              TraceIQ
            </span>
          )}
        </Link>

        {!collapsed && (
          <button
            type="button"
            onClick={toggleCollapse}
            className="flex size-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-300"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
              <path d="m14 15-3-3 3-3" />
            </svg>
          </button>
        )}
      </div>

      {/* Main Navigation */}
      <nav className="mt-6 grid gap-0.5" aria-label="Dashboard navigation">
        {navItems.map((item) => {
          const isActive = item.key === active;
          return (
            <Link
              key={item.key}
              className={`${navLinkClass(isActive)} ${collapsed ? 'justify-center px-0' : ''}`}
              href={withProjectId(item.href, projectId)}
              title={collapsed ? item.label : undefined}
            >
              <NavIcon name={item.key} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Settings Navigation */}
      <nav
        className="mt-auto grid gap-0.5 border-t border-neutral-200 pt-3 dark:border-slate-800/90"
        aria-label="Settings navigation"
      >
        {bottomNavItems.map((item) => {
          const isActive = item.key === active;
          const showWarning = item.key === 'settings' && showMfaWarning;
          return (
            <Link
              key={item.key}
              className={`${navLinkClass(isActive)} relative ${collapsed ? 'justify-center px-0' : ''}`}
              href={withProjectId(item.href, projectId)}
              title={collapsed ? item.label : undefined}
            >
              <NavIcon name={item.key} />
              {!collapsed && <span className="truncate">{item.label}</span>}
              {showWarning && (
                <WarningIcon
                  collapsed={collapsed}
                  title="Two-factor authentication is not enabled yet"
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer Profile & Actions */}
      <div className="mt-3 border-t border-neutral-200 pt-3 dark:border-slate-800/90">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-600 font-semibold text-white shadow-sm text-xs"
              title={userEmail || 'Account'}
            >
              {initial}
            </div>
            <ThemeToggle />
            <SignOutButton iconOnly />
            <button
              type="button"
              onClick={toggleCollapse}
              className="mt-1 flex size-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:border-slate-800 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-300"
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
                <path d="m12 9 3 3-3 3" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="grid gap-2.5">
            <div className="flex items-center gap-2.5 rounded-lg border border-neutral-200/80 bg-neutral-50/80 p-2 dark:border-slate-800/80 dark:bg-slate-900/60">
              {/* <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-600 font-semibold text-white text-xs shadow-sm">
                {initial}
              </div> */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-neutral-800 dark:text-slate-200" title={organizationName}>
                  {organizationName}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  <p className="text-[10px] text-neutral-400 dark:text-slate-400"> {userEmail || 'Account'}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5">
                <ThemeToggle />
                <SignOutButton />
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function WarningIcon({ collapsed, title }: { collapsed: boolean; title: string }) {
  if (collapsed) {
    return (
      <span className="absolute right-1 top-1 size-2 rounded-full bg-amber-400 ring-2 ring-white dark:ring-slate-950" title={title} aria-label={title} />
    );
  }

  return (
    <span
      className="ml-auto inline-flex text-amber-500"
      title={title}
      role="img"
      aria-label={title}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m10.3 3.9-8.2 14a2 2 0 0 0 1.7 3h16.4a2 2 0 0 0 1.7-3l-8.2-14a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
    </span>
  );
}
