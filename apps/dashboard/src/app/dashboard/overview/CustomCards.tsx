'use client';

import { useEffect, useState } from 'react';
import { clientFetch, fetchEventNames } from '@/lib/analytics-api';
import { Sparkline } from '@/components/charts/Sparkline';

/** A card someone built themselves: one event, counted or by unique people, over the Overview's range. */
export interface CustomCard {
  id: string;
  title: string;
  event: string;
  measure: 'count' | 'unique';
  display: 'number' | 'trend';
}

/** Ids in the Overview layout are prefixed so they never collide with built-in cards. */
export const CUSTOM_PREFIX = 'custom:';

const STORAGE_KEY = 'traceiq-overview-custom-cards-v1';

export function readCustomCards(): CustomCard[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (card): card is CustomCard =>
        !!card &&
        typeof card.id === 'string' &&
        typeof card.title === 'string' &&
        typeof card.event === 'string' &&
        (card.measure === 'count' || card.measure === 'unique') &&
        (card.display === 'number' || card.display === 'trend')
    );
  } catch {
    return [];
  }
}

export function writeCustomCards(cards: CustomCard[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  } catch {
    // Storage blocked: the cards still show until the page reloads.
  }
}

export function eventLabel(event: string): string {
  return event === '*' ? 'All events' : event;
}

export function defaultTitle(event: string, measure: CustomCard['measure']): string {
  return measure === 'unique' ? `People who did ${eventLabel(event)}` : eventLabel(event);
}

const REQUEST_MAX = 1000;

/** "Request a card": sends what someone wants to the TraceIQ team, from inside the menu. */
export function CardRequestForm({ projectId, onBack }: { projectId?: string | null; onBack: () => void }) {
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const trimmed = text.trim();

  async function submit() {
    if (trimmed.length < 5 || state === 'sending') return;
    setState('sending');
    setError(null);
    const { error: message } = await clientFetch<{ id: string }>('/v1/feedback', {
      method: 'POST',
      body: JSON.stringify({ kind: 'card_request', message: trimmed, projectId: projectId ?? undefined, page: window.location.pathname })
    });
    if (message) {
      // Our own messages (too short, daily limit) help; framework ones ("Cannot POST …",
      // "Request failed (502)") don't, so those get a plain retry line instead.
      const technical = /^(Cannot \w+ \/|Request failed \(\d+\)|Internal server error|Failed to fetch)/i.test(message);
      setError(technical ? "Couldn't send your request just now. Try again in a minute." : message);
      setState('idle');
    } else {
      setState('sent');
    }
  }

  if (state === 'sent') {
    return (
      <div className="px-3 py-6 text-center">
        <p className="text-sm font-semibold text-neutral-900 dark:text-white">Thanks, we got it</p>
        <p className="mx-auto mt-1 max-w-[15rem] text-[11px] leading-snug text-neutral-500 dark:text-slate-400">
          The TraceIQ team reads every request. Meanwhile, you can build a card from any event yourself.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 inline-flex h-7 items-center rounded-md border border-neutral-200 px-3 text-xs font-medium text-neutral-800 hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
        >
          Back to cards
        </button>
      </div>
    );
  }

  return (
    <form
      className="space-y-3 px-3 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label className="block text-[11px] font-semibold text-neutral-700 dark:text-slate-300">
        What should the card show?
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value.slice(0, REQUEST_MAX))}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void submit();
          }}
          rows={4}
          autoFocus
          placeholder="e.g. Revenue by country, or how many people finish onboarding each day"
          className="mt-1 block w-full resize-none rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs font-normal leading-relaxed text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
        />
      </label>
      <p className="flex justify-between text-[10px] text-neutral-500 dark:text-slate-500">
        <span>Goes to the TraceIQ team with your email and project.</span>
        <span className="tabular-nums">{text.length > REQUEST_MAX - 100 ? `${text.length}/${REQUEST_MAX}` : ''}</span>
      </p>
      {error ? <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p> : null}
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="text-[11px] font-medium text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white">
          ← Back
        </button>
        <button
          type="submit"
          disabled={trimmed.length < 5 || state === 'sending'}
          className="inline-flex h-7 items-center rounded-md bg-neutral-900 px-3 text-xs font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-950"
        >
          {state === 'sending' ? 'Sending…' : 'Send request'}
        </button>
      </div>
    </form>
  );
}

interface TrendResponse {
  series: Array<{ points: Array<{ bucket: string; total: number; value: number }> }>;
  summary?: { current: number; previous: number; days: number };
}

const number = new Intl.NumberFormat('en-US');

export function CustomCardView({
  card,
  projectId,
  days,
  windowLabel,
  cardClass
}: {
  card: CustomCard;
  projectId?: string | null;
  days: number;
  windowLabel: string;
  cardClass: string;
}) {
  const [data, setData] = useState<TrendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    const params = new URLSearchParams({
      event: card.event,
      measure: card.measure,
      interval: days === 1 ? 'hour' : 'day',
      days: String(days)
    });
    if (projectId) params.set('projectId', projectId);
    void clientFetch<TrendResponse>(`/v1/dashboard/insights/trends?${params.toString()}`, { cache: 'no-store' }).then(
      ({ data: response, error: message }) => {
        if (cancelled) return;
        if (response) setData(response);
        else setError(message ?? 'Could not load this card.');
      }
    );
    return () => {
      cancelled = true;
    };
  }, [card.event, card.measure, days, projectId]);

  const points = (data?.series[0]?.points ?? []).map((point) => ({ bucket: point.bucket, total: point.value ?? point.total }));
  const current = data?.summary?.current ?? points.reduce((sum, point) => sum + point.total, 0);
  const previous = data?.summary?.previous;
  const delta = previous && previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;

  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-neutral-500 dark:text-slate-400" title={card.title}>
          {card.title}
        </p>
        <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 dark:bg-slate-800 dark:text-slate-400">
          Custom
        </span>
      </div>
      {error ? (
        <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : !data ? (
        <div className="mt-3 h-8 w-24 animate-pulse rounded bg-neutral-100 dark:bg-slate-800" />
      ) : (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-2xl font-semibold tabular-nums text-neutral-900 dark:text-white">{number.format(current)}</p>
            {delta !== null ? (
              <span className={`text-xs font-medium ${delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {delta >= 0 ? '+' : ''}
                {delta}%
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-slate-400">
            {card.measure === 'unique' ? 'people' : 'times'} in the last {windowLabel}
          </p>
          {card.display === 'trend' && points.length > 1 ? <Sparkline points={points} className="mt-3 h-12 w-full" filled /> : null}
        </>
      )}
    </div>
  );
}

/** The "Build a card" form inside the Add card menu. */
export function CustomCardBuilder({
  projectId,
  onSave,
  onBack
}: {
  projectId?: string | null;
  onSave: (card: Omit<CustomCard, 'id'>) => void;
  onBack: () => void;
}) {
  const [events, setEvents] = useState<string[] | null>(null);
  const [event, setEvent] = useState('*');
  const [measure, setMeasure] = useState<CustomCard['measure']>('count');
  const [display, setDisplay] = useState<CustomCard['display']>('trend');
  const [title, setTitle] = useState('');

  useEffect(() => {
    let cancelled = false;
    void fetchEventNames(projectId ?? undefined).then(({ data }) => {
      if (!cancelled) setEvents((data?.eventNames ?? []).map((entry) => entry.eventName));
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const fieldClass =
    'mt-1 h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-900 outline-none focus:border-neutral-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white';
  const labelClass = 'block text-[11px] font-semibold text-neutral-700 dark:text-slate-300';

  return (
    <form
      className="space-y-3 px-3 py-3"
      onSubmit={(submit) => {
        submit.preventDefault();
        onSave({ event, measure, display, title: title.trim() || defaultTitle(event, measure) });
      }}
    >
      <label className={labelClass}>
        Event
        <select value={event} onChange={(change) => setEvent(change.target.value)} className={fieldClass} disabled={!events}>
          <option value="*">All events</option>
          {(events ?? []).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend className={labelClass}>Count</legend>
        <Segmented
          value={measure}
          onChange={setMeasure}
          options={[
            { value: 'count', label: 'Every time' },
            { value: 'unique', label: 'Unique people' }
          ]}
        />
      </fieldset>

      <fieldset>
        <legend className={labelClass}>Show</legend>
        <Segmented
          value={display}
          onChange={setDisplay}
          options={[
            { value: 'trend', label: 'Number + trend' },
            { value: 'number', label: 'Number only' }
          ]}
        />
      </fieldset>

      <label className={labelClass}>
        Title <span className="font-normal text-neutral-500 dark:text-slate-500">(optional)</span>
        <input
          value={title}
          onChange={(change) => setTitle(change.target.value)}
          placeholder={defaultTitle(event, measure)}
          maxLength={60}
          className={fieldClass}
        />
      </label>

      <div className="flex items-center justify-between pt-1">
        <button type="button" onClick={onBack} className="text-[11px] font-medium text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white">
          ← Back
        </button>
        <button
          type="submit"
          className="inline-flex h-7 items-center rounded-md bg-neutral-900 px-3 text-xs font-medium text-white dark:bg-white dark:text-slate-950"
        >
          Add to Overview
        </button>
      </div>
    </form>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="mt-1 grid grid-cols-2 rounded-md border border-neutral-200 p-0.5 dark:border-slate-700">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={
            option.value === value
              ? 'h-6 rounded-[4px] bg-neutral-900 text-[11px] font-medium text-white dark:bg-white dark:text-slate-950'
              : 'h-6 text-[11px] font-medium text-neutral-600 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
