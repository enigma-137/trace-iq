'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

export function formatLibraryDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/** The page title itself comes from DashboardShell, so this only adds context and the main action. */
export function LibraryHeader({ description, action }: { description: string; action: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">{description}</p>
      {action}
    </div>
  );
}

export function LibraryToolbar<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  search,
  onSearchChange,
  searchPlaceholder,
  children
}: {
  tabs: Array<{ id: T; label: string }>;
  activeTab: T;
  onTabChange: (tab: T) => void;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-neutral-200 sm:flex-row sm:items-end sm:justify-between dark:border-neutral-800">
      <div role="tablist" className="order-2 flex gap-5 sm:order-1">
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(tab.id)}
              className={`-mb-px border-b-2 pb-2.5 text-xs font-medium transition ${
                active
                  ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="order-1 flex items-center gap-2 pb-2 sm:order-2">
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="w-full min-w-0 rounded-md border border-neutral-200 bg-transparent px-2.5 py-1.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none sm:w-56 dark:border-neutral-800 dark:text-white dark:focus:border-neutral-600"
        />
        {children}
      </div>
    </div>
  );
}

export function LibrarySkeleton() {
  return (
    <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-center justify-between px-4 py-3.5">
          <div className="h-3 w-48 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
          <div className="h-3 w-16 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
        </div>
      ))}
    </div>
  );
}

export interface RowAction {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

const MENU_WIDTH = 176;
const MENU_ITEM_HEIGHT = 30;

/** Row "..." menu. Fixed-positioned so it isn't clipped by the table's rounded container. */
export function RowActionsMenu({ label, actions }: { label: string; actions: RowAction[] }) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!position) return;

    const close = () => setPosition(null);
    function handleMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        close();
        buttonRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [position]);

  function toggle() {
    if (position) {
      setPosition(null);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const height = actions.length * MENU_ITEM_HEIGHT + 8;
    const fitsBelow = rect.bottom + 4 + height <= window.innerHeight;
    setPosition({
      top: fitsBelow ? rect.bottom + 4 : rect.top - height - 4,
      left: Math.max(8, rect.right - MENU_WIDTH)
    });
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={Boolean(position)}
        className="relative z-10 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>

      {position && (
        <div
          ref={menuRef}
          role="menu"
          style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
          className="fixed z-40 rounded-md border border-neutral-200 bg-white p-1 text-left shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              onClick={() => {
                setPosition(null);
                action.onSelect();
              }}
              className={`block w-full rounded px-2.5 py-1.5 text-left text-xs transition disabled:opacity-50 ${
                action.danger
                  ? 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30'
                  : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
