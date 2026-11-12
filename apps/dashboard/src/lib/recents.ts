'use client';

import { allNavItems, navGroups } from '@/app/dashboard/nav';

/** One dashboard section the user opened, newest first in storage. */
export interface RecentVisit {
  key: string;
  label: string;
  /** "Observability", "Analytics"…; empty for pages outside a group. */
  group: string;
  href: string;
  at: number;
}

const STORAGE_KEY = 'traceiq-recent-pages';
const CHANGE_EVENT = 'traceiq:recents';
const LIMIT = 8;

/** The sections a visit can be recorded for: everything in the nav except the Overview itself. */
function describe(key: string): Omit<RecentVisit, 'at'> | null {
  if (key === 'overview') return null;
  const item = allNavItems.find((entry) => entry.key === key);
  if (!item) return null;
  const group = navGroups.find((entry) => entry.items.some((child) => child.key === key));
  return { key, label: item.label, group: group?.label ?? '', href: item.href };
}

export function readRecents(): RecentVisit[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is RecentVisit =>
        typeof entry === 'object' && entry !== null && typeof entry.key === 'string' && typeof entry.href === 'string'
    );
  } catch {
    return [];
  }
}

/** Moves the section to the top of the list, one entry per section. */
export function recordVisit(key: string): void {
  const visit = describe(key);
  if (!visit) return;
  try {
    const next = [{ ...visit, at: Date.now() }, ...readRecents().filter((entry) => entry.key !== key)].slice(0, LIMIT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Storage blocked (private window): recents are a convenience, skip them.
  }
}

export function onRecentsChange(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}
