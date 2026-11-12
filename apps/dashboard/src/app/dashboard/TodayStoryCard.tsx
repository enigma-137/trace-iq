'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { Skeleton } from '@/components/Skeleton';
import { useAskTraceIQ } from '@/components/ai/AskTraceIQContext';
import type { FailureFacts } from '@/lib/health';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface StoryFacts {
  eventsToday: number;
  eventsYesterday: number;
  deltaPct: number | null;
  uniquesToday: number;
  topEvent: { name: string; count: number } | null;
  topCountry: { name: string; count: number; pct: number } | null;
  activeNow: number;
  /** Missing from older API versions. */
  failures?: FailureFacts;
}

interface TodayStoryResponse {
  project: { id: string; name: string; organizationName: string } | null;
  narrative: string;
  model: string;
  generatedAt: string;
  facts: StoryFacts;
}

/**
 * Today's story as one column of the Overview hero: a headline, the narrative cut to
 * a few lines, and a link that opens the full story in Ask TraceIQ.
 */
export function TodayStoryCard({ projectId }: { projectId?: string | null }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { openAsk } = useAskTraceIQ();
  const [story, setStory] = useState<TodayStoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

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

  const projectName = story?.project?.name ?? 'your project';
  const delta = story?.facts.deltaPct;
  const failures = story?.facts.failures;
  const failedCount = failures ? failures.failedRequests + failures.exceptions + failures.failedActions : 0;
  // The backend went unreachable earlier but has answered since: the outage is history.
  const recovered = !!failures && failures.networkErrors > 0 && !!failures.recoveredAt;
  // Ongoing failures lead the headline: nobody should read "activity is up" during an outage.
  const ongoing = Boolean(failures && failedCount > 0 && !recovered);
  const headline = !story
    ? 'Reading today…'
    : ongoing && failures
      ? failures.networkErrors > 0
        ? `${failures.networkErrors} request${failures.networkErrors === 1 ? '' : 's'} got no response`
        : `${failedCount} failure${failedCount === 1 ? '' : 's'} today`
      : delta !== null && delta !== undefined && delta > 0
        ? `Activity is up ${delta}%`
        : delta !== null && delta !== undefined && delta < 0
          ? `Activity is down ${Math.abs(delta)}%`
          : 'A steady day';

  function handleOpenAi() {
    openAsk({
      surface: 'overview',
      contextTitle: "Today's Story",
      initialQuestion: `Explain today's activity story and trends for ${projectName}. What were the key events and user patterns?`
    });
  }

  return (
    <div className="flex h-full flex-col">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900 dark:text-white">
        {ongoing ? <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-rose-500" /> : null}
        {headline}
      </p>

      {error ? (
        <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : isLoading && !story ? (
        <div className="mt-2 space-y-1.5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ) : (
        <p
          className={`mt-1.5 text-[13px] leading-relaxed text-neutral-600 dark:text-slate-300 ${expanded ? '' : 'line-clamp-4'}`}
        >
          {story?.narrative}
        </p>
      )}

      <div className="mt-auto flex items-center gap-3 pt-3 text-xs font-medium">
        {story && !error ? (
          <button type="button" onClick={() => setExpanded((value) => !value)} className="text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white">
            {expanded ? 'Show less' : 'Read all'}
          </button>
        ) : null}
        <button type="button" onClick={handleOpenAi} className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
          Ask about today →
        </button>
        <button
          type="button"
          onClick={() => void load()}
          disabled={isLoading}
          className="ml-auto text-neutral-400 hover:text-neutral-700 disabled:opacity-50 dark:text-slate-500 dark:hover:text-slate-300"
        >
          {isLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
    </div>
  );
}
