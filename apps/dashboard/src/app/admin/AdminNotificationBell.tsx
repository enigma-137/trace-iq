'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FEEDBACK_CHANGED,
  KIND_LABEL,
  KIND_TONE,
  STATUS_LABEL,
  feedbackSource,
  fetchInbox,
  markAllFeedbackRead,
  timeAgo,
  updateFeedback,
  type FeedbackInbox,
  type FeedbackKind,
  type FeedbackStatus
} from './feedback';

const POLL_MS = 60_000;

type Filter = 'unread' | 'all' | FeedbackKind;

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'unread', label: 'Unread' },
  { value: 'all', label: 'All' },
  { value: 'card_request', label: 'Cards' },
  { value: 'idea', label: 'Ideas' },
  { value: 'problem', label: 'Problems' },
  { value: 'other', label: 'Other' }
];

const STATUSES: FeedbackStatus[] = ['new', 'planned', 'done', 'declined'];

/** The admin header's bell: feedback and card requests from every workspace, read and triaged in place. */
export function AdminNotificationBell() {
  const [unread, setUnread] = useState(0);
  const [inbox, setInbox] = useState<FeedbackInbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('unread');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const loadCount = useCallback(async () => {
    const { data } = await fetchInbox({ unread: true, limit: 1 });
    if (data) setUnread(data.unread);
  }, []);

  const loadList = useCallback(async () => {
    const { data, error: message } = await fetchInbox({
      unread: filter === 'unread',
      kind: filter === 'all' || filter === 'unread' ? null : filter,
      limit: 50
    });
    if (data) {
      setInbox(data);
      setUnread(data.unread);
      setError(null);
    } else {
      setError(message ?? 'Could not load notifications.');
    }
  }, [filter]);

  // The badge stays current while the panel is closed.
  useEffect(() => {
    void loadCount();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadCount();
    }, POLL_MS);
    window.addEventListener(FEEDBACK_CHANGED, loadCount);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(FEEDBACK_CHANGED, loadCount);
    };
  }, [loadCount]);

  // The list loads when the panel opens or the filter changes. Items marked read stay put until then,
  // so the one being worked on doesn't vanish from the Unread tab mid-triage.
  useEffect(() => {
    if (open) void loadList();
  }, [open, loadList]);

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

  async function patch(id: string, body: { read?: boolean; status?: FeedbackStatus }) {
    const { data } = await updateFeedback(id, body);
    if (!data) return;
    setInbox((current) =>
      current
        ? { ...current, items: current.items.map((item) => (item.id === id ? { ...item, status: data.status, readAt: data.readAt } : item)) }
        : current
    );
  }

  async function markAll() {
    const { error: message } = await markAllFeedbackRead();
    if (!message) void loadList();
  }

  function toggle(id: string, wasUnread: boolean) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (wasUnread) void patch(id, { read: true });
  }

  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';
  const emptyText =
    filter === 'unread' ? "You're all caught up." : filter === 'all' ? 'No feedback yet.' : `No ${FILTERS.find((f) => f.value === filter)?.label.toLowerCase()} yet.`;

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
          className="absolute right-0 top-11 z-30 w-[min(28rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-950"
        >
          <div className="border-b border-neutral-100 px-3 pb-2 pt-2.5 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-neutral-900 dark:text-white">
                Notifications{unread > 0 ? ` · ${unread} unread` : ''}
              </p>
              {unread > 0 ? (
                <button type="button" onClick={() => void markAll()} className="text-[11px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
                  Mark all read
                </button>
              ) : null}
            </div>
            <div role="tablist" aria-label="Filter notifications" className="mt-2 flex flex-wrap gap-1">
              {FILTERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={filter === option.value}
                  onClick={() => setFilter(option.value)}
                  className={
                    filter === option.value
                      ? 'h-6 rounded px-2 text-[11px] font-medium text-white bg-neutral-900 dark:bg-white dark:text-slate-950'
                      : 'h-6 rounded px-2 text-[11px] font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <p className="px-3 py-8 text-center text-xs text-red-600 dark:text-red-400">{error}</p>
          ) : !inbox ? (
            <div className="space-y-2 p-3">
              <div className="h-12 animate-pulse rounded bg-neutral-100 dark:bg-slate-800" />
              <div className="h-12 animate-pulse rounded bg-neutral-100 dark:bg-slate-800" />
            </div>
          ) : inbox.items.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-neutral-500 dark:text-slate-400">{emptyText}</p>
          ) : (
            <ul className="max-h-[28rem] divide-y divide-neutral-100 overflow-y-auto dark:divide-slate-800/80">
              {inbox.items.map((item) => {
                const isUnread = !item.readAt;
                const isOpen = expanded.has(item.id);
                return (
                  <li key={item.id} className="px-3 py-2.5">
                    <button type="button" onClick={() => toggle(item.id, isUnread)} className="block w-full text-left">
                      <span className="flex items-center gap-2">
                        <span aria-label={isUnread ? 'Unread' : undefined} className={`h-1.5 w-1.5 shrink-0 rounded-full ${isUnread ? 'bg-blue-600' : 'bg-transparent'}`} />
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${KIND_TONE[item.kind]}`}>{KIND_LABEL[item.kind]}</span>
                        <span className="ml-auto text-[11px] text-neutral-400 dark:text-slate-500" title={new Date(item.createdAt).toLocaleString()}>
                          {timeAgo(item.createdAt)}
                        </span>
                      </span>
                      <span
                        className={`mt-1 block whitespace-pre-wrap break-words text-xs leading-relaxed ${isUnread ? 'font-medium text-neutral-950 dark:text-white' : 'text-neutral-700 dark:text-slate-300'} ${isOpen ? '' : 'line-clamp-2'}`}
                      >
                        {item.message}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-neutral-500 dark:text-slate-400">{feedbackSource(item)}</span>
                    </button>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px]">
                      <select
                        aria-label="Status"
                        value={item.status}
                        onChange={(event) => void patch(item.id, { status: event.target.value as FeedbackStatus })}
                        className="h-6 rounded border border-neutral-200 bg-white px-1 text-[11px] text-neutral-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      >
                        {STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {STATUS_LABEL[status]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void patch(item.id, { read: isUnread })}
                        className="font-medium text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white"
                      >
                        {isUnread ? 'Mark read' : 'Mark unread'}
                      </button>
                      {item.userEmail ? (
                        <a
                          href={`mailto:${item.userEmail}?subject=${encodeURIComponent('Re: your TraceIQ feedback')}`}
                          className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                        >
                          Reply by email
                        </a>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
