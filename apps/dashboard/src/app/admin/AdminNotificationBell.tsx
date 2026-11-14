'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FEEDBACK_CHANGED,
  KIND_LABEL,
  KIND_TONE,
  feedbackSource,
  fetchInbox,
  markAllFeedbackRead,
  timeAgo,
  updateFeedback,
  type FeedbackItem
} from './feedback';

const POLL_MS = 60_000;

/** The admin header's bell: unread feedback and card requests, with the latest few in a dropdown. */
export function AdminNotificationBell() {
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data } = await fetchInbox({ unread: true, limit: 6 });
    if (data) {
      setUnread(data.unread);
      setItems(data.items);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    window.addEventListener(FEEDBACK_CHANGED, load);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(FEEDBACK_CHANGED, load);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function openInbox() {
    setOpen(false);
    document.getElementById('inbox')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={label}
        title={label}
        aria-expanded={open}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-700 transition hover:bg-neutral-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <svg aria-hidden viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 8a5 5 0 0 1 10 0c0 4.5 1.75 6 1.75 6H3.25S5 12.5 5 8Z" />
          <path d="M8.5 17a1.75 1.75 0 0 0 3 0" />
        </svg>
        {unread > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-rose-600 px-1 text-center text-[10px] font-bold leading-[18px] text-white ring-2 ring-neutral-50 dark:ring-slate-950">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-11 z-30 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-950"
        >
          <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2.5 dark:border-slate-800">
            <p className="text-xs font-semibold text-neutral-900 dark:text-white">
              Notifications{unread > 0 ? ` · ${unread} unread` : ''}
            </p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => void markAllFeedbackRead()}
                className="text-[11px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                Mark all read
              </button>
            ) : null}
          </div>

          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-neutral-500 dark:text-slate-400">You&apos;re all caught up.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-neutral-100 overflow-y-auto dark:divide-slate-800/80">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      void updateFeedback(item.id, { read: true });
                      openInbox();
                    }}
                    className="block w-full px-3 py-2.5 text-left transition hover:bg-neutral-50 dark:hover:bg-slate-900"
                  >
                    <span className="flex items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${KIND_TONE[item.kind]}`}>{KIND_LABEL[item.kind]}</span>
                      <span className="ml-auto text-[11px] text-neutral-400 dark:text-slate-500">{timeAgo(item.createdAt)}</span>
                    </span>
                    <span className="mt-1 line-clamp-2 block text-xs text-neutral-800 dark:text-slate-200">{item.message}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-neutral-500 dark:text-slate-400">{feedbackSource(item)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-neutral-100 px-3 py-2 dark:border-slate-800">
            <button type="button" onClick={openInbox} className="text-[11px] font-medium text-neutral-600 hover:text-neutral-900 dark:text-slate-300 dark:hover:text-white">
              Open inbox →
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
