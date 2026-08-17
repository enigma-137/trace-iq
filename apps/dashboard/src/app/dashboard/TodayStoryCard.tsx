'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { Skeleton } from '@/components/Skeleton';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface StoryFacts {
  eventsToday: number;
  eventsYesterday: number;
  deltaPct: number | null;
  uniquesToday: number;
  topEvent: { name: string; count: number } | null;
  topCountry: { name: string; count: number; pct: number } | null;
  activeNow: number;
}

interface TodayStoryResponse {
  project: { id: string; name: string; organizationName: string } | null;
  narrative: string;
  model: string;
  generatedAt: string;
  facts: StoryFacts;
}

/**
 * Today's Story — the plain-English headline for the overview. Fetches on mount,
 * regenerates when the button is clicked, and falls back to a template narrative
 * server-side, so this card is cheap even without GROQ_API_KEY.
 */
export function TodayStoryCard({ projectId }: { projectId?: string | null }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [story, setStory] = useState<TodayStoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    setError(null);

    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setError('Your dashboard session expired. Sign in again.');
      setIsLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams();
      if (projectId) params.set('projectId', projectId);
      const query = params.toString();
      const response = await fetch(`${apiBaseUrl}/v1/dashboard/insights/story${query ? `?${query}` : ''}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? 'Could not load today\'s story.');
        return;
      }

      setStory((await response.json()) as TodayStoryResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <section className="relative mb-5 overflow-hidden rounded-md border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800/90 dark:bg-slate-950 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_20%,rgba(59,130,246,0.10),transparent_36%)] dark:bg-[radial-gradient(circle_at_82%_20%,rgba(59,130,246,0.18),transparent_36%)]" />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
              Today&apos;s story
            </p>
            <p className="mt-0.5 text-sm text-neutral-500 dark:text-slate-400">
              {story?.project ? `${story.project.organizationName} / ${story.project.name}` : 'Your workspace in plain English'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={isLoading}
            className="inline-flex h-8 shrink-0 items-center rounded-md border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-900 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {isLoading ? 'Writing…' : 'Refresh'}
          </button>
        </div>

        {error ? (
          <p className="mt-4 rounded-md border border-neutral-300 bg-neutral-100 px-3 py-2.5 text-sm text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            {error}
          </p>
        ) : null}

        {!story && !error ? (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="mt-4 h-3 w-40" />
          </div>
        ) : null}

        {story ? (
          <div className="mt-4">
            <p className="max-w-3xl text-[15px] leading-6 text-neutral-700 dark:text-slate-200">{story.narrative}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <FactChip label="Today" value={story.facts.eventsToday.toLocaleString()} />
              <FactChip label="Delta" value={deltaLabel(story.facts.deltaPct)} tone={deltaTone(story.facts.deltaPct)} />
              <FactChip label="Users today" value={story.facts.uniquesToday.toLocaleString()} />
              {story.facts.topEvent ? <FactChip label="Top event" value={story.facts.topEvent.name} title={`${story.facts.topEvent.count.toLocaleString()} events`} /> : null}
              {story.facts.topCountry && story.facts.topCountry.name !== 'unknown' ? (
                <FactChip label="Top region" value={story.facts.topCountry.name} title={`${story.facts.topCountry.pct}% of activity`} />
              ) : null}
              {story.facts.activeNow > 0 ? <FactChip label="Active now" value={String(story.facts.activeNow)} tone="green" /> : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function FactChip({
  label,
  value,
  tone = 'blue',
  title
}: {
  label: string;
  value: string;
  tone?: 'blue' | 'green' | 'red' | 'neutral';
  title?: string;
}) {
  const tones = {
    blue: 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-300',
    green: 'border-emerald-400/15 bg-emerald-400/10 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300',
    red: 'border-red-400/15 bg-red-400/10 text-red-600 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300',
    neutral: 'border-neutral-300 bg-neutral-100 text-neutral-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone]}`} title={title}>
      <span className="text-neutral-400 dark:text-slate-500">{label}</span>
      <span>{value}</span>
    </span>
  );
}

function deltaLabel(delta: number | null): string {
  if (delta === null) return 'new';
  if (delta === 0) return 'flat';
  return `${delta > 0 ? '+' : ''}${delta}%`;
}

function deltaTone(delta: number | null): 'blue' | 'green' | 'red' | 'neutral' {
  if (delta === null) return 'blue';
  if (delta > 0) return 'green';
  if (delta < 0) return 'red';
  return 'neutral';
}