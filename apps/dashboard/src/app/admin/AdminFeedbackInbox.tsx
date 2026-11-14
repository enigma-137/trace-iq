'use client';

import { useCallback, useEffect, useState } from 'react';
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

type Filter = 'all' | 'unread' | FeedbackKind;

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'card_request', label: 'Card requests' },
  { value: 'idea', label: 'Ideas' },
  { value: 'problem', label: 'Problems' },
  { value: 'other', label: 'Other' }
];

const STATUSES: FeedbackStatus[] = ['new', 'planned', 'done', 'declined'];

/** Feedback and card requests from every workspace, to read and triage. */
export function AdminFeedbackInbox() {
  const [filter, setFilter] = useState<Filter>('all');
  const [inbox, setInbox] = useState<FeedbackInbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const { data, error: message } = await fetchInbox({
      unread: filter === 'unread',
      kind: filter === 'all' || filter === 'unread' ? null : filter,
      limit: 100
    });
    if (data) {
      setInbox(data);
      setError(null);
    } else {
      setError(message ?? 'Could not load the inbox.');
    }
  }, [filter]);

  useEffect(() => {
    void load();
    window.addEventListener(FEEDBACK_CHANGED, load);
    return () => window.removeEventListener(FEEDBACK_CHANGED, load);
  }, [load]);

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section id="inbox" className="mb-5 scroll-mt-6">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-3 px-0.5">
        <h2 className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-white">
          Inbox
          {inbox && inbox.unread > 0 ? (
            <span className="ml-2 rounded-full bg-rose-600 px-1.5 py-0.5 align-middle text-[10px] font-bold text-white">{inbox.unread} unread</span>
          ) : null}
        </h2>
        <p className="text-xs text-neutral-400 dark:text-slate-500">Feedback and card requests from every workspace</p>
      </div>

      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-3 dark:border-slate-800/70">
          <div role="tablist" aria-label="Filter inbox" className="flex flex-wrap gap-1">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={filter === option.value}
                onClick={() => setFilter(option.value)}
                className={
                  filter === option.value
                    ? 'h-7 rounded-md bg-neutral-900 px-2.5 text-xs font-medium text-white dark:bg-white dark:text-slate-950'
                    : 'h-7 rounded-md px-2.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
                }
              >
                {option.label}
              </button>
            ))}
          </div>
          {inbox && inbox.unread > 0 ? (
            <button
              type="button"
              onClick={() => void markAllFeedbackRead()}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              Mark all read
            </button>
          ) : null}
        </div>

        {error ? (
          <p className="py-8 text-center text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : !inbox ? (
          <div className="space-y-2 pt-3">
            <div className="h-14 animate-pulse rounded bg-neutral-100 dark:bg-slate-800" />
            <div className="h-14 animate-pulse rounded bg-neutral-100 dark:bg-slate-800" />
          </div>
        ) : inbox.items.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm font-semibold text-neutral-900 dark:text-white">
              {filter === 'all' ? 'Nothing yet' : filter === 'unread' ? 'All caught up' : `No ${FILTERS.find((f) => f.value === filter)?.label.toLowerCase()}`}
            </p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
              Feedback from the dashboard and card requests from the Overview land here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-slate-800/80">
            {inbox.items.map((item) => {
              const unread = !item.readAt;
              const isLong = item.message.length > 220 || item.message.includes('\n');
              const isOpen = expanded.has(item.id);
              return (
                <li key={item.id} className="flex gap-3 py-3">
                  <span
                    aria-label={unread ? 'Unread' : undefined}
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? 'bg-blue-600' : 'bg-transparent'}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${KIND_TONE[item.kind]}`}>{KIND_LABEL[item.kind]}</span>
                      <span className="truncate text-xs text-neutral-500 dark:text-slate-400">{feedbackSource(item)}</span>
                      <span className="ml-auto shrink-0 text-xs text-neutral-400 dark:text-slate-500" title={new Date(item.createdAt).toLocaleString()}>
                        {timeAgo(item.createdAt)}
                      </span>
                    </div>
                    <p
                      className={`mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed ${unread ? 'font-medium text-neutral-950 dark:text-white' : 'text-neutral-700 dark:text-slate-300'} ${isLong && !isOpen ? 'line-clamp-3' : ''}`}
                    >
                      {item.message}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                      {isLong ? (
                        <button type="button" onClick={() => toggle(item.id)} className="font-medium text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white">
                          {isOpen ? 'Show less' : 'Show all'}
                        </button>
                      ) : null}
                      <label className="flex items-center gap-1.5 text-neutral-500 dark:text-slate-400">
                        Status
                        <select
                          value={item.status}
                          onChange={(event) => void updateFeedback(item.id, { status: event.target.value as FeedbackStatus })}
                          className="h-7 rounded-md border border-neutral-200 bg-white px-1.5 text-xs text-neutral-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        >
                          {STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {STATUS_LABEL[status]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => void updateFeedback(item.id, { read: unread })}
                        className="font-medium text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white"
                      >
                        {unread ? 'Mark read' : 'Mark unread'}
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
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

const cardClass =
  'rounded-md border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]';
