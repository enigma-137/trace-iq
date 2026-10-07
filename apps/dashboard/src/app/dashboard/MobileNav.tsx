'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { HugeiconsIcon } from '@hugeicons/react';
import Alert02Icon from '@hugeicons/core-free-icons/Alert02Icon';
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon';
import Menu01Icon from '@hugeicons/core-free-icons/Menu01Icon';
import { NavIcon } from './NavIcon';
import { SignOutButton } from './SignOutButton';
import { ThemeToggle } from './ThemeToggle';
import { OrganizationSwitcher } from './OrganizationSwitcher';
import {
  topNavItems,
  navGroups,
  bottomNavItems,
  navLinkClass,
  childNavLinkClass,
  findGroupForActiveItem,
  withProjectId
} from './nav';
import { useMfaStatus } from '@/lib/mfa';
import { DashboardPlanBadge } from './DashboardPlan';

export function MobileNav({
  active,
  projectId,
  userEmail,
  organizationId
}: {
  active: string;
  projectId?: string | null;
  userEmail?: string | null;
  organizationId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const { enrolled } = useMfaStatus();
  const showMfaWarning = enrolled === false;

  const activeGroup = findGroupForActiveItem(active);

  // Initialize and keep active group expanded
  useEffect(() => {
    const initialGroups: Record<string, boolean> = {};
    for (const group of navGroups) {
      initialGroups[group.key] = group.key === activeGroup;
    }
    setOpenGroups(initialGroups);
  }, [activeGroup]);

  // Lock the page behind the drawer and let Escape dismiss it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  const toggleGroup = (groupKey: string) => {
    setOpenGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }));
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-neutral-200 text-neutral-700 transition hover:bg-neutral-100 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900 lg:hidden"
      >
        <HugeiconsIcon icon={Menu01Icon} size={20} strokeWidth={1.8} aria-hidden="true" />
      </button>

      {/* Portaled to <body> so the header's backdrop-blur (which creates a
          containing block for fixed elements) can't confine the drawer. */}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Dashboard navigation"
          >
            <div className="absolute inset-0 bg-black/40" onClick={close} aria-hidden="true" />
            <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between px-4 py-4">
                <Link href="/" className="flex items-center gap-2" onClick={close} aria-label="TraceIQ home">
                  <img className="h-8 w-auto dark:hidden" src="/brand/logo-black-no-bg.png" alt="TraceIQ" />
                  <img className="hidden h-8 w-auto dark:block" src="/brand/logo-white-no-bg.png" alt="TraceIQ" />
                  <span className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">TraceIQ</span>
                  <DashboardPlanBadge />
                </Link>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close navigation menu"
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.8} aria-hidden="true" />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar px-3 py-2 space-y-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden" aria-label="Dashboard navigation">
                {/* Top Standalone Items (Overview) */}
                <div className="grid gap-0.5">
                  {topNavItems.map((item) => (
                    <Link
                      key={item.key}
                      className={navLinkClass(item.key === active)}
                      href={withProjectId(item.href, projectId)}
                      onClick={close}
                    >
                      <NavIcon name={item.key} />
                      {item.label}
                    </Link>
                  ))}
                </div>

                {/* Collapsible Groups */}
                <div className="space-y-2 pt-1">
                  {navGroups.map((group) => {
                    const isOpen = openGroups[group.key] ?? false;
                    const hasActiveChild = group.items.some((item) => item.key === active);

                    return (
                      <div key={group.key} className="space-y-0.5">
                        {/* Group Header Toggle */}
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.key)}
                          aria-expanded={isOpen}
                          aria-controls={`mobile-group-${group.key}`}
                          className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-semibold tracking-wide transition select-none ${
                            hasActiveChild
                              ? 'text-neutral-900 dark:text-slate-200 font-bold'
                              : 'text-neutral-500 hover:bg-neutral-100/70 hover:text-neutral-900 dark:text-slate-400 dark:hover:bg-slate-900/60 dark:hover:text-slate-200'
                          }`}
                        >
                          <span>{group.label}</span>
                          <svg
                            className={`size-3.5 text-neutral-400 transition-transform duration-150 ease-in-out dark:text-slate-500 ${
                              isOpen ? 'rotate-90' : ''
                            }`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2.2}
                            aria-hidden="true"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>

                        {/* Child Items */}
                        {isOpen && (
                          <div
                            id={`mobile-group-${group.key}`}
                            className="ml-2.5 grid gap-0.5 border-l border-neutral-200/80 pl-2 my-0.5 dark:border-slate-800/80"
                          >
                            {group.items.map((item) => {
                              const isActive = item.key === active;
                              return (
                                <Link
                                  key={item.key}
                                  className={childNavLinkClass(isActive)}
                                  href={withProjectId(item.href, projectId)}
                                  onClick={close}
                                >
                                  <NavIcon name={item.key} />
                                  <span>{item.label}</span>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </nav>

              <nav
                className="border-t border-neutral-200 px-3 py-3 dark:border-slate-800"
                aria-label="Settings navigation"
              >
                <div className="grid gap-0.5">
                  {bottomNavItems.map((item) => (
                    <Link
                      key={item.key}
                      className={navLinkClass(item.key === active)}
                      href={withProjectId(item.href, projectId)}
                      onClick={close}
                    >
                      <NavIcon name={item.key} />
                      {item.label}
                      {item.key === 'settings' && showMfaWarning ? (
                        <span className="ml-auto inline-flex text-amber-500" title="Two-factor authentication is not enabled yet">
                          <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={1.9} aria-hidden="true" />
                        </span>
                      ) : null}
                    </Link>
                  ))}
                </div>
              </nav>

              <div className="border-t border-neutral-200 px-4 py-4 dark:border-slate-800">
                <OrganizationSwitcher projectId={projectId} organizationId={organizationId} />
                <p className="mt-2 truncate text-xs text-neutral-400 dark:text-slate-500" title={userEmail ?? undefined}>
                  {userEmail ?? 'Account'}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <ThemeToggle />
                  <SignOutButton />
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
