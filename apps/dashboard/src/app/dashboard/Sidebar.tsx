'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { HugeiconsIcon } from '@hugeicons/react';
import AiBrain02Icon from '@hugeicons/core-free-icons/AiBrain02Icon';
import Alert02Icon from '@hugeicons/core-free-icons/Alert02Icon';
import SidebarLeftIcon from '@hugeicons/core-free-icons/SidebarLeftIcon';
import SidebarRightIcon from '@hugeicons/core-free-icons/SidebarRightIcon';
import Settings02Icon from '@hugeicons/core-free-icons/Settings02Icon';
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon';
import { NavIcon } from './NavIcon';
import { ThemeToggle } from './ThemeToggle';
import { SignOutButton } from './SignOutButton';
import { OrganizationSwitcher } from './OrganizationSwitcher';
import {
  topNavItems,
  navGroups,
  type NavGroup,
  bottomNavItems,
  navLinkClass,
  childNavLinkClass,
  findGroupForActiveItem,
  withProjectId
} from './nav';
import { useMfaStatus } from '@/lib/mfa';
import { DashboardPlanBadge } from './DashboardPlan';
import { useAskTraceIQ } from '@/components/ai/AskTraceIQContext';

interface SidebarProps {
  active: string;
  userEmail?: string | null;
  projectId?: string | null;
  organizationId?: string | null;
}

const STORAGE_KEY = 'traceiq-sidebar-groups';
const HIDDEN_ITEMS_KEY = 'traceiq-sidebar-hidden-items';

export function Sidebar({ active, userEmail, projectId, organizationId }: SidebarProps) {
  const { openAsk } = useAskTraceIQ();
  const [collapsed, setCollapsed] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  // Child links the user has switched off. Parent sections are never in here: they always show.
  const [hiddenItems, setHiddenItems] = useState<string[]>([]);
  const [customizing, setCustomizing] = useState<{ groupKey: string; top: number; left: number } | null>(null);
  const { enrolled } = useMfaStatus();
  const showMfaWarning = mounted && enrolled === false;

  const activeGroup = findGroupForActiveItem(active);

  // When collapsed, hovering previews the full sidebar without changing the
  // persisted preference. Clicking the toggle button pins/unpins it open.
  const expanded = !collapsed || isHovering;

  useEffect(() => {
    setMounted(true);
    const storedCollapsed = localStorage.getItem('traceiq-sidebar-collapsed');
    if (storedCollapsed === 'true') {
      setCollapsed(true);
    }

    // Initialize group states from localStorage
    let savedGroups: Record<string, boolean> = {};
    try {
      const storedGroups = localStorage.getItem(STORAGE_KEY);
      if (storedGroups) {
        savedGroups = JSON.parse(storedGroups);
      }
    } catch {
      // Ignore parse errors
    }

    // Default: only active group is expanded if no stored state, or restore stored
    const initialGroups: Record<string, boolean> = {};
    for (const group of navGroups) {
      if (typeof savedGroups[group.key] === 'boolean') {
        initialGroups[group.key] = savedGroups[group.key];
      } else {
        initialGroups[group.key] = group.key === activeGroup;
      }
    }

    // Active route always forces its parent group to be open
    if (activeGroup) {
      initialGroups[activeGroup] = true;
    }

    setOpenGroups(initialGroups);

    try {
      const storedHidden = JSON.parse(localStorage.getItem(HIDDEN_ITEMS_KEY) ?? '[]');
      if (Array.isArray(storedHidden)) setHiddenItems(storedHidden.filter((key): key is string => typeof key === 'string'));
    } catch {
      // Ignore parse/storage errors: show everything
    }
  }, []);

  // Ensure active route group automatically opens whenever active changes
  useEffect(() => {
    if (activeGroup) {
      setOpenGroups((prev) => {
        if (prev[activeGroup]) return prev;
        const next = { ...prev, [activeGroup]: true };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Ignore storage errors
        }
        return next;
      });
    }
  }, [activeGroup]);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('traceiq-sidebar-collapsed', String(next));
      return next;
    });
    setIsHovering(false);
  };

  // Saved as soon as it changes. The page you are on always stays visible so you never lose your place.
  const isItemHidden = (key: string) => key !== active && hiddenItems.includes(key);
  const visibleItems = (group: NavGroup) => group.items.filter((item) => !isItemHidden(item.key));

  const saveHiddenItems = (next: string[]) => {
    setHiddenItems(next);
    try {
      localStorage.setItem(HIDDEN_ITEMS_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage errors: applies for this visit only
    }
  };

  const toggleItemVisibility = (itemKey: string) => {
    saveHiddenItems(hiddenItems.includes(itemKey) ? hiddenItems.filter((key) => key !== itemKey) : [...hiddenItems, itemKey]);
  };

  const resetGroup = (group: NavGroup) => {
    const keys = group.items.map((item) => item.key);
    saveHiddenItems(hiddenItems.filter((key) => !keys.includes(key)));
  };

  const toggleGroup = (groupKey: string) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [groupKey]: !prev[groupKey] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  return (
    <aside
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      className={`sticky top-0 hidden h-screen shrink-0 flex-col overflow-y-auto overflow-x-hidden no-scrollbar border-r border-neutral-200 bg-white transition-[width] duration-200 ease-in-out dark:border-slate-800/90 dark:bg-slate-950 lg:flex [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${
        expanded ? 'w-60 px-4 py-5' : 'w-16 px-2 py-5'
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
          data-tour="ask"
          onClick={() => openAsk()}
          className="mt-5 flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50/50 px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-900 dark:border-slate-800/90 dark:bg-slate-900/40 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white"
        >
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={AiBrain02Icon} size={17} />
            <span>Ask TraceIQ</span>
          </div>
          <kbd className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-[10px] font-mono text-neutral-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
            ⌘ K
          </kbd>
        </button>
      ) : (
        <button
          type="button"
          data-tour="ask"
          onClick={() => openAsk()}
          className="mt-5 flex size-9 items-center justify-center self-center rounded-lg border border-neutral-200 text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
          title="Ask TraceIQ (⌘ K)"
        >
          <HugeiconsIcon icon={AiBrain02Icon} size={17} />
        </button>
      )}

      {/* Main Navigation */}
      <nav className="mt-4 flex-1 space-y-3 overflow-y-auto overflow-x-hidden no-scrollbar pr-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden" aria-label="Dashboard navigation">
        {/* Top Standalone Items (Overview) */}
        <div className="grid gap-0.5">
          {topNavItems.map((item) => {
            const isActive = item.key === active;
            return (
              <Link
                key={item.key}
                data-tour={`nav-${item.key}`}
                className={`${navLinkClass(isActive, true)} ${expanded ? '' : 'justify-center px-0'}`}
                href={withProjectId(item.href, projectId)}
                title={expanded ? undefined : item.label}
              >
                <NavIcon name={item.key} />
                {expanded && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </div>

        {/* Collapsible Groups */}
        {expanded ? (
          <div className="space-y-2 pt-1">
            {navGroups.map((group) => {
              const isOpen = openGroups[group.key] ?? false;
              const hasActiveChild = group.items.some((item) => item.key === active);

              return (
                <div key={group.key} className="space-y-0.5">
                  {/* Group Header Toggle + per-section customize gear */}
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.key)}
                      data-tour={`group-${group.key}`}
                      aria-expanded={isOpen}
                      aria-controls={`sidebar-group-${group.key}`}
                      className={`flex min-w-0 flex-1 items-center justify-between rounded-md px-3 py-1.5 text-xs font-semibold tracking-wide transition select-none ${
                        hasActiveChild
                          ? 'text-neutral-900 dark:text-slate-200 font-bold'
                          : 'text-neutral-500 hover:bg-neutral-100/70 hover:text-neutral-900 dark:text-slate-400 dark:hover:bg-slate-900/60 dark:hover:text-slate-200'
                      }`}
                    >
                      <span>{group.label}</span>
                      <svg
                        className={`size-3 text-neutral-400 transition-transform duration-150 ease-in-out dark:text-slate-500 ${
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
                    <button
                      type="button"
                      onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        const asideRight = event.currentTarget.closest('aside')?.getBoundingClientRect().right ?? rect.right;
                        setCustomizing((current) =>
                          current?.groupKey === group.key ? null : { groupKey: group.key, top: rect.top, left: asideRight + 8 }
                        );
                      }}
                      aria-haspopup="dialog"
                      aria-expanded={customizing?.groupKey === group.key}
                      aria-label={`Customize ${group.label}`}
                      title={`Customize ${group.label}`}
                      className="flex size-6 shrink-0 items-center justify-center rounded-md text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-300"
                    >
                      <HugeiconsIcon icon={Settings02Icon} size={15} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                  </div>

                  {/* Child Items */}
                  {isOpen && (
                    <div
                      id={`sidebar-group-${group.key}`}
                      className="ml-2.5 grid gap-0.5 border-l border-neutral-200/80 pl-2 my-0.5 dark:border-slate-800/80"
                    >
                      {visibleItems(group).map((item) => {
                        const isActive = item.key === active;
                        return (
                          <Link
                            key={item.key}
                            className={childNavLinkClass(isActive)}
                            href={withProjectId(item.href, projectId)}
                          >
                            <NavIcon name={item.key} />
                            <span className="truncate">{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Mini Sidebar: render icons with dividers between groups */
          <div className="space-y-2 pt-1">
            {navGroups.map((group) => (
              <div key={group.key} className="grid gap-0.5 border-t border-neutral-100 pt-1.5 dark:border-slate-900">
                {visibleItems(group).map((item) => {
                  const isActive = item.key === active;
                  return (
                    <Link
                      key={item.key}
                      className={`${navLinkClass(isActive)} justify-center px-0`}
                      href={withProjectId(item.href, projectId)}
                      title={`${group.label} → ${item.label}`}
                    >
                      <NavIcon name={item.key} />
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        )}
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
              data-tour={`nav-${item.key}`}
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
      {customizing ? (
        <CustomizePanel
          group={navGroups.find((group) => group.key === customizing.groupKey)!}
          top={customizing.top}
          left={customizing.left}
          activeKey={active}
          hiddenItems={hiddenItems}
          onToggle={toggleItemVisibility}
          onReset={resetGroup}
          onClose={() => setCustomizing(null)}
        />
      ) : null}
    </aside>
  );
}

/** Rendered in a portal on the page body, so it opens beside the sidebar instead of inside (and clipped by) it. */
function CustomizePanel({
  group,
  top,
  left,
  activeKey,
  hiddenItems,
  onToggle,
  onReset,
  onClose
}: {
  group: NavGroup;
  top: number;
  left: number;
  activeKey: string;
  hiddenItems: string[];
  onToggle: (itemKey: string) => void;
  onReset: (group: NavGroup) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Element | null;
      // The gear toggles the panel itself, so a press on it must not also close it first.
      if (panelRef.current?.contains(target as Node) || target?.closest('[aria-haspopup="dialog"]')) return;
      onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [onClose]);

  // Keep the panel on screen when the gear is near the bottom of the window.
  const maxTop = typeof window === 'undefined' ? top : Math.max(8, window.innerHeight - 40 - (group.items.length * 40 + 150));
  const hasHidden = group.items.some((item) => hiddenItems.includes(item.key));

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`Customize ${group.label}`}
      style={{ top: Math.min(top, maxTop), left }}
      className="fixed z-50 w-80 rounded-xl border border-neutral-200 bg-white p-4 shadow-2xl shadow-neutral-950/15 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-neutral-950 dark:text-white">Customize {group.label}</h2>
          <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-slate-400">Choose which items appear in this section.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>

      <ul className="mt-3 grid gap-0.5">
        {group.items.map((item) => {
          const locked = item.key === activeKey;
          const shown = locked || !hiddenItems.includes(item.key);
          return (
            <li key={item.key}>
              <button
                type="button"
                role="switch"
                aria-checked={shown}
                disabled={locked}
                title={locked ? 'You are on this page' : undefined}
                onClick={() => onToggle(item.key)}
                className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-sm text-neutral-800 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <NavIcon name={item.key} />
                  <span className="truncate">{item.label}</span>
                </span>
                <span
                  className={`relative h-5 w-9 shrink-0 rounded-full transition ${shown ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-slate-700'}`}
                  aria-hidden="true"
                >
                  <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${shown ? 'left-[18px]' : 'left-0.5'}`} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-neutral-200 pt-3 text-xs dark:border-slate-800">
        <button
          type="button"
          onClick={() => onReset(group)}
          disabled={!hasHidden}
          className="font-medium text-blue-600 transition hover:text-blue-700 disabled:cursor-default disabled:text-neutral-400 dark:text-blue-400 dark:disabled:text-slate-600"
        >
          Reset to default
        </button>
        <span className="text-neutral-500 dark:text-slate-400">Changes save automatically</span>
      </div>
    </div>,
    document.body
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
