'use client';

import { useEffect, useState } from 'react';

/** The newest changelog entry this browser has seen, so the "What's new" dot can clear. */
const SEEN_KEY = 'traceiq-changelog-seen';
const CHANGED_EVENT = 'traceiq:changelog-seen';

function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

/** Records that the visitor has seen everything up to `slug`. Call it from /changelog. */
export function markChangelogSeen(slug: string) {
  try {
    localStorage.setItem(SEEN_KEY, slug);
  } catch {
    // Storage blocked: the dot just stays, which is harmless.
  }
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

/**
 * True when the changelog has an entry newer than the last one this browser saw.
 * Entry slugs start with their date, so comparing them as strings orders them by date.
 * Someone who has never opened the changelog sees the dot once, for the latest entry.
 */
export function useChangelogUnseen(): boolean {
  const [latest, setLatest] = useState<string | null>(null);
  const [seen, setSeen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSeen(readSeen());
    fetch('/changelog/entries.json')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { entries?: Array<{ slug: string }> } | null) => {
        if (!cancelled) setLatest(data?.entries?.[0]?.slug ?? null);
      })
      .catch(() => undefined);
    const refresh = () => setSeen(readSeen());
    window.addEventListener(CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return latest !== null && (seen === null || latest > seen);
}
