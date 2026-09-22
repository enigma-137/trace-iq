'use client';

import React from 'react';
import { useAskTraceIQ } from '@/components/ai/AskTraceIQContext';

export function FunnelAiSummary({ funnelId, days }: { funnelId: string; days: string }) {
  const { openAsk } = useAskTraceIQ();

  function handleInvestigate() {
    openAsk({
      surface: 'funnel',
      entityId: funnelId,
      contextTitle: `Funnel (Last ${days} days)`,
      initialQuestion: 'Why did users drop off in this funnel?'
    });
  }

  return (
    <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Ask TraceIQ</h3>
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
              Intelligence
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
            Investigate conversion drop-offs, correlated errors, feature flags, and affected user sessions.
          </p>
        </div>
        <button
          type="button"
          onClick={handleInvestigate}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Investigate with TraceIQ
        </button>
      </div>
    </section>
  );
}
