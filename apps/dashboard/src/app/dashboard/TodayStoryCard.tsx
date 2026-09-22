'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import RefreshIcon from '@hugeicons/core-free-icons/RefreshIcon';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { Skeleton } from '@/components/Skeleton';
import { useAskTraceIQ } from '@/components/ai/AskTraceIQContext';

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
 * Today's Story — Highlighted insight banner matching the modern TraceIQ workspace.
 * Features dynamic headline, key factual chips, and a "View more" action that
 * opens the AskTraceIQ AI chat panel.
 */
export function TodayStoryCard({ projectId }: { projectId?: string | null }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { openAsk } = useAskTraceIQ();
  const [story, setStory] = useState<TodayStoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

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
        setError(body?.message ?? "Could not load today's story.");
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

  if (isDismissed) return null;

  const projectName = story?.project?.name ?? 'your project';
  const delta = story?.facts.deltaPct;
  const isUp = delta !== null && delta !== undefined && delta > 0;
  const isDown = delta !== null && delta !== undefined && delta < 0;

  const headline = story
    ? isUp
      ? `Activity is up ${delta}% on ${projectName}`
      : isDown
      ? `Activity decreased by ${Math.abs(delta)}% on ${projectName}`
      : `Daily activity overview on ${projectName}`
    : `Analyzing activity on ${projectName}…`;

  function handleOpenAi() {
    openAsk({
      surface: 'overview',
      contextTitle: "Today's Story",
      initialQuestion: `Explain today's activity story and trends for ${projectName}. What were the key events and user patterns?`
    });
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-neutral-200/85 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] transition hover:border-neutral-300 dark:border-slate-800/90 dark:bg-slate-950 dark:shadow-none dark:hover:border-slate-700 sm:p-6">
      {/* Top right actions: Dismiss & Refresh */}
      <div className="absolute right-4 top-4 flex items-center gap-1.5 z-10">
        <button
          type="button"
          onClick={() => void load()}
          disabled={isLoading}
          title="Regenerate story"
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-50 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-300"
        >
          <HugeiconsIcon icon={RefreshIcon} size={13} className={isLoading ? 'animate-spin' : ''} />
        </button>
        <button
          type="button"
          onClick={() => setIsDismissed(true)}
          title="Dismiss banner"
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-300 text-sm font-semibold"
        >
          ×
        </button>
      </div>

      <div className="flex flex-col gap-5 md:flex-row md:items-center">
        {/* Left: Sleek Brand Visual Anchor */}
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-blue-600 shadow-sm relative overflow-hidden sm:h-24 sm:w-24">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.22),transparent)]" />
          <div className="relative flex flex-col items-center justify-center text-white">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-white/20 backdrop-blur-xs border border-white/30 flex items-center justify-center shadow-xs p-2">
              <Image
                src="/brand/logo-white-no-bg.png"
                alt="TraceIQ"
                width={28}
                height={28}
                className="h-full w-full object-contain"
                priority
              />
            </div>
          </div>
        </div>

        {/* Middle: Content */}
        <div className="min-w-0 flex-1 pr-6 md:pr-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            TODAY&apos;S STORY
          </p>

          <h3 className="mt-1 text-base font-bold text-neutral-900 dark:text-white sm:text-lg">
            {headline}
          </h3>

          {error ? (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
          ) : isLoading && !story ? (
            <div className="mt-2 space-y-2">
              <Skeleton className="h-3.5 w-full max-w-xl" />
              <Skeleton className="h-3.5 w-4/5 max-w-lg" />
            </div>
          ) : (
            <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-neutral-600 dark:text-slate-300 sm:text-sm">
              {story?.narrative}
            </p>
          )}

          {story ? (
            <div className="mt-3.5 flex flex-wrap items-center gap-2">
              {delta !== null && delta !== undefined ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                  Today {delta > 0 ? `+${delta}%` : `${delta}%`}
                </span>
              ) : null}

              <span className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50/70 px-2.5 py-1 text-xs font-normal text-neutral-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                Users today <span className="font-medium text-neutral-800 dark:text-slate-200">{story.facts.uniquesToday.toLocaleString()}</span>
              </span>

              {story.facts.topEvent ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50/70 px-2.5 py-1 text-xs font-normal text-neutral-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                  Top event: <span className="font-mono text-neutral-700 dark:text-slate-300">{story.facts.topEvent.name}</span>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Right: "View more" CTA Button */}
        <div className="flex shrink-0 items-center md:self-center">
          <button
            type="button"
            onClick={handleOpenAi}
            className="inline-flex h-9 sm:h-10 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 sm:px-5 text-xs sm:text-sm font-semibold text-white shadow-xs transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <span>View more</span>
            <span aria-hidden>&rarr;</span>
          </button>
        </div>
      </div>
    </section>
  );
}
