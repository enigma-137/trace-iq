'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { Skeleton } from '@/components/Skeleton';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const POLL_MS = 15_000;

export interface NowEvent {
  id: string;
  eventName: string;
  actor: string | null;
  path: string | null;
  country: string | null;
  device: string | null;
  occurredAt: string;
}

interface NowActivityResponse {
  project: { id: string; name: string } | null;
  windowMinutes: number;
  total: number;
  uniques: number;
  events: NowEvent[];
}

const RESERVED_LABELS: Record<string, string> = {
  $page: 'Page view',
  $api_request: 'Api request',
  $exception: 'Exception',
  $rageclick: 'Rage click',
  $identify: 'Identify',
  $group: 'Group'
};

/**
 * Live activity panel for the overview. Polls the insights/now endpoint every
 * few seconds and renders the most recent events with a pulsing "live" badge.
 */
export function NowActivityPanel({ projectId }: { projectId?: string | null }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [data, setData] = useState<NowActivityResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const mountedRef = useRef(true);

  async function poll() {
    if (paused) return;

    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setError('Your dashboard session expired. Sign in again.');
      setIsLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams({ minutes: '15' });
      if (projectId) params.set('projectId', projectId);
      const response = await fetch(`${apiBaseUrl}/v1/dashboard/insights/now?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store'
      });

      if (!response.ok) {
        return;
      }

      const body = (await response.json()) as NowActivityResponse;
      if (mountedRef.current) {
        setData(body);
        setError(null);
      }
    } catch {
      // Silent on transient network blips; the next poll retries.
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }

  useEffect(() => {
    mountedRef.current = true;

    const initial = window.setTimeout(() => {
      void poll();
    }, 0);

    const timer = window.setInterval(() => {
      void poll();
    }, POLL_MS);

    return () => {
      mountedRef.current = false;
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, paused]);

  const hasActivity = (data?.total ?? 0) > 0;

  return (
    <section className="relative overflow-hidden rounded-md border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2.5">
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${hasActivity ? 'animate-ping bg-emerald-400' : 'bg-neutral-300 dark:bg-slate-600'}`}
            />
            <span
              className={`relative inline-flex size-2.5 rounded-full ${hasActivity ? 'bg-emerald-500' : 'bg-neutral-400 dark:bg-slate-600'}`}
            />
          </span>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">Now</p>
          {!isLoading && data ? (
            <p className="text-xs text-neutral-400 dark:text-slate-500">
              {data.total.toLocaleString()} events · {data.uniques.toLocaleString()} unique in the last {data.windowMinutes} min
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setPaused((current) => !current)}
          className="inline-flex h-8 items-center rounded-md border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-600 transition hover:bg-neutral-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          title={paused ? 'Resume live updates' : 'Pause live updates'}
        >
          {paused ? 'Resume' : 'Pause'}
        </button>
      </div>

      {error ? (
        <p className="relative mt-3 rounded-md border border-neutral-300 bg-neutral-100 px-3 py-2.5 text-sm text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {error}
        </p>
      ) : null}

      {isLoading && !data ? (
        <div className="relative mt-4 space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      ) : null}

      {!isLoading && data && !hasActivity ? (
        <div className="relative mt-4 rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-5 text-center dark:border-slate-700 dark:bg-slate-950/60">
          <p className="text-sm font-semibold text-neutral-900 dark:text-white">Quiet right now</p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
            No events in the last {data.windowMinutes} minutes. As soon as your SDK sends one, it appears here live.
          </p>
        </div>
      ) : null}

      {data && hasActivity ? (
        <ul className="relative mt-3 max-h-72 overflow-y-auto divide-y divide-neutral-100 pr-1 text-xs dark:divide-slate-800/80 [scrollbar-width:thin]">
          {data.events.slice(0, 10).map((event) => (
            <li key={event.id} className="flex items-start gap-3 px-0.5 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-neutral-900 dark:text-white">
                  {RESERVED_LABELS[event.eventName] ?? readableEventName(event.eventName)}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-neutral-500 dark:text-slate-400">
                  {event.path || `${event.actor ?? 'anonymous'} (${event.device ?? 'unknown device'})`}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[11px] font-medium tabular-nums text-neutral-600 dark:text-slate-300">{relativeTime(event.occurredAt)}</p>
                {event.country ? <p className="mt-0.5 text-[10px] text-neutral-400 dark:text-slate-500">{event.country}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function readableEventName(name: string): string {
  return name
    .replace(/[_.-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim() || name;
}

function relativeTime(iso: string): string {
  if (!iso) return '';
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}