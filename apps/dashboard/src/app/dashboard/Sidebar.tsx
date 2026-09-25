'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { HugeiconsIcon } from '@hugeicons/react';
import AiBrain02Icon from '@hugeicons/core-free-icons/AiBrain02Icon';
import Alert02Icon from '@hugeicons/core-free-icons/Alert02Icon';
import SidebarLeftIcon from '@hugeicons/core-free-icons/SidebarLeftIcon';
import SidebarRightIcon from '@hugeicons/core-free-icons/SidebarRightIcon';
import { NavIcon } from './NavIcon';
import { ThemeToggle } from './ThemeToggle';
import { SignOutButton } from './SignOutButton';
import { OrganizationSwitcher } from './OrganizationSwitcher';
import { navItems, bottomNavItems, navLinkClass, withProjectId } from './nav';
import { useMfaStatus } from '@/lib/mfa';
import { DashboardPlanBadge } from './DashboardPlan';
import { useAskTraceIQ } from '@/components/ai/AskTraceIQContext';


interface SidebarProps {
  active: string;
  userEmail?: string | null;
  projectId?: string | null;
  organizationId?: string | null;
}

export function Sidebar({ active, userEmail, projectId, organizationId }: SidebarProps) {
  const { openAsk } = useAskTraceIQ();
  const [collapsed, setCollapsed] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { enrolled } = useMfaStatus();
  const showMfaWarning = mounted && enrolled === false;

  // When collapsed, hovering previews the full sidebar without changing the
  // persisted preference. Clicking the toggle button pins/unpins it open.
  const expanded = !collapsed || isHovering;

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
    setIsHovering(false);
  };

  return (
    <aside
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      className={`sticky top-0 hidden h-screen shrink-0 flex-col overflow-y-auto border-r border-neutral-200 bg-white transition-[width] duration-200 ease-in-out dark:border-slate-800/90 dark:bg-slate-950 lg:flex ${expanded ? 'w-60 px-4 py-5' : 'w-16 px-2 py-5'
        }`}
    >
      {/* Brand Header */}
      <div className={`flex min-h-8 ${expanded ? 'items-center justify-between' : 'flex-col items-center gap-2'}`}>
        <Link className="flex items-center gap-2.5 overflow-hidden" href="/" aria-label="TraceIQ home">
          <img className="h-7 w-7 shrink-0 dark:hidden" src="/brand/logo-black-no-bg.png" alt="TraceIQ" />
          <img className="hidden h-7 w-7 shrink-0 dark:block" src="/brand/logo-white-no-bg.png" alt="TraceIQ" />
          {expanded && (
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-lg font-bold tracking-tight text-neutral-900 dark:text-white">TraceIQ</span>
              <DashboardPlanBadge />
            </span>
          )}
        </Link>

        <button
          type="button"
          onClick={toggleCollapse}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-300"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <HugeiconsIcon
            icon={collapsed ? SidebarRightIcon : SidebarLeftIcon}
            size={17}
            strokeWidth={1.8}
            aria-hidden="true"
          />
        </button>
      </div>

      {/* Ask TraceIQ Launcher */}
      {expanded ? (
        <button
          type="button"
          onClick={() => openAsk()}
          className="mt-5 flex w-full items-center justify-between rounded-lg border border-neutral-100 dark:border-slate-800/90 px-3 py-2 text-xs font-semibold transition"
        >
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={AiBrain02Icon} size={17} />
            <span>Ask TraceIQ</span>
          </div>
          <kbd className="rounded px-1.5 py-0.5 text-[10px] font-mono ">
            ⌘ K
          </kbd>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => openAsk()}
          className="mt-5 flex size-9 items-center justify-center self-center rounded-lg border-neutral-100 transition"
          title="Ask TraceIQ (⌘ K)"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </button>
      )}

      {/* Main Navigation */}
      <nav className="mt-4 grid gap-0.5" aria-label="Dashboard navigation">
        {navItems.map((item) => {
          const isActive = item.key === active;
          return (
            <Link
              key={item.key}
              className={`${navLinkClass(isActive)} ${expanded ? '' : 'justify-center px-0'}`}
              href={withProjectId(item.href, projectId)}
              title={expanded ? undefined : item.label}
            >
              <NavIcon name={item.key} />
              {expanded && <span className="truncate">{item.label}</span>}
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
              className={`${navLinkClass(isActive)} relative ${expanded ? '' : 'justify-center px-0'}`}
              href={withProjectId(item.href, projectId)}
              title={expanded ? undefined : item.label}
            >
              <NavIcon name={item.key} />
              {expanded && <span className="truncate">{item.label}</span>}
              {showWarning && (
                <WarningIcon
                  collapsed={!expanded}
                  title="Two-factor authentication is not enabled yet"
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer Profile & Actions */}
      <div className="mt-3 border-t border-neutral-200 pt-3 dark:border-slate-800/90">
        {expanded ? (
          <div className="grid gap-2.5">
            <OrganizationSwitcher projectId={projectId} organizationId={organizationId} />
            <p className="truncate px-1 text-[10px] text-neutral-400 dark:text-slate-500" title={userEmail ?? undefined}>
              {userEmail || 'Account'}
            </p>

            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5">
                <ThemeToggle />
                <SignOutButton />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <OrganizationSwitcher collapsed projectId={projectId} organizationId={organizationId} />
            <ThemeToggle />
            <SignOutButton iconOnly />
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
      <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={1.9} aria-hidden="true" />
    </span>
  );
}
