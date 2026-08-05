'use client';

import { useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface AiSummaryResponse {
  summary: string;
  model: string;
  generatedAt: string;
}

export function FunnelAiSummary({ funnelId, days }: { funnelId: string; days: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [summary, setSummary] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExplain() {
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
      const response = await fetch(`${apiBaseUrl}/v1/dashboard/ai/funnels/${funnelId}/summary?days=${encodeURIComponent(days)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? `Request failed with ${response.status}`);
        return;
      }

      const body = (await response.json()) as AiSummaryResponse;
      setSummary(body.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="mt-6 rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">✨ Ask TraceIQ</h3>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">Get a plain-English explanation of this funnel's drop-off.</p>
        </div>
        <button
          type="button"
          onClick={handleExplain}
          disabled={isLoading}
          className="inline-flex h-9 shrink-0 items-center rounded-md border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {isLoading ? 'Thinking…' : summary ? 'Regenerate' : 'Explain this'}
        </button>
      </div>

      {error ? (
        <p className="mt-4 rounded-md border border-neutral-300 bg-neutral-100 px-3 py-2.5 text-sm text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {error}
        </p>
      ) : null}

      {summary ? (
        <p className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm leading-6 text-neutral-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
          {summary}
        </p>
      ) : null}
    </section>
  );
}
