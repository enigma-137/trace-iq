'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import type { FilterCondition } from '@/components/SegmentFilters';
import { CohortModal } from './CohortModal';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Cohort {
  id: string;
  name: string;
  filters: FilterCondition[];
  createdAt: string;
}

const TEMPLATE_COHORTS = [
  {
    name: 'Pro Plan Customers',
    description: 'Track retention and feature usage specifically for paying Pro users.',
    filters: [{ field: 'plan', operator: 'is', value: 'Pro' }]
  },
  {
    name: 'Mobile Web Traffic',
    description: 'Isolate user behavior, load performance, and conversion on mobile devices.',
    filters: [{ field: 'device_type', operator: 'is', value: 'mobile' }]
  },
  {
    name: 'Nigerian Audience',
    description: 'Measure engagement and event activity for users located in Nigeria.',
    filters: [{ field: 'country', operator: 'is', value: 'Nigeria' }]
  }
];

function formatDate(iso: string): string {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date);
  } catch {
    return iso;
  }
}

export function CohortManager({ cohorts }: { cohorts: Cohort[] }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalInitialName, setModalInitialName] = useState('');
  const [modalInitialFilters, setModalInitialFilters] = useState<FilterCondition[]>([
    { field: '', operator: 'is', value: '' }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function getToken(): Promise<string | null> {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  function handleOpenCreate(initialName = '', initialFilters?: FilterCondition[]) {
    setModalInitialName(initialName);
    setModalInitialFilters(
      initialFilters && initialFilters.length > 0
        ? initialFilters
        : [{ field: '', operator: 'is', value: '' }]
    );
    setError(null);
    setIsModalOpen(true);
  }

  function handleDuplicate(cohort: Cohort) {
    handleOpenCreate(`${cohort.name} (Copy)`, cohort.filters);
  }

  async function handleSaveCohort(name: string, filters: FilterCondition[]) {
    setIsSubmitting(true);
    setError(null);
    const token = await getToken();
    if (!token) {
      setError('Your dashboard session expired. Please sign in again.');
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/v1/dashboard/cohorts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), filters })
      });

      if (!response.ok) {
        setError(await readError(response));
        setIsSubmitting(false);
        return;
      }

      setIsModalOpen(false);
      setIsSubmitting(false);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not save cohort.');
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const token = await getToken();
    if (!token) {
      setDeletingId(null);
      return;
    }
    try {
      await fetch(`${apiBaseUrl}/v1/dashboard/cohorts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      setConfirmDeleteId(null);
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Concepts: Solid Blue Cards with White Text */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Solid Blue Card 1 */}
        <div className="relative overflow-hidden rounded-xl border border-blue-500 bg-blue-600 p-5 text-white shadow-sm dark:border-blue-600 dark:bg-blue-600">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-100">
              Cross-Dashboard Reusability
            </span>
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white">
              Instant
            </span>
          </div>
          <h3 className="mt-3 text-lg font-bold tracking-tight text-white">
            Define once, analyze everywhere
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-blue-50/90">
            Saved cohorts instantly appear as filter presets in <strong>Retention</strong>, <strong>Insights</strong>, and <strong>Web Analytics</strong>. Never retype complex segment filters again.
          </p>
        </div>

        {/* Solid Blue Card 2 */}
        <div className="relative overflow-hidden rounded-xl border border-blue-500 bg-blue-600 p-5 text-white shadow-sm dark:border-blue-600 dark:bg-blue-600">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-100">
              Behavioral Comparison
            </span>
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white">
              Insights
            </span>
          </div>
          <h3 className="mt-3 text-lg font-bold tracking-tight text-white">
            Isolate target user behaviors
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-blue-50/90">
            Compare how specific user segments convert, retain, and engage over time. Identify what drives your power users and pinpoint friction points in onboarding.
          </p>
        </div>

        {/* Neutral Summary Card */}
        <div className="flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-950 sm:col-span-2 lg:col-span-1">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
                Saved Segments
              </span>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600 dark:bg-slate-900 dark:text-slate-300">
                Library
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-neutral-900 tabular-nums dark:text-white">
                {cohorts.length}
              </span>
              <span className="text-xs text-neutral-500 dark:text-slate-400 font-medium">
                {cohorts.length === 1 ? 'active cohort' : 'active cohorts'}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-neutral-500 dark:text-slate-400">
              {cohorts.length > 0
                ? 'All segments are active and available for filtering across dashboard views.'
                : 'No cohorts created yet. Build your first segment below.'}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-slate-800/80">
            <button
              type="button"
              onClick={() => handleOpenCreate()}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-slate-200"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Create New Cohort</span>
            </button>
          </div>
        </div>
      </section>

      {/* Main Saved Cohorts Section */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-5 border-b border-neutral-200/80 dark:border-slate-800/80">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">
              Saved Cohorts
            </h3>
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">
              Reusable user segments ready to be applied across your analytics.
            </p>
          </div>

          {cohorts.length > 0 ? (
            <button
              type="button"
              onClick={() => handleOpenCreate()}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 self-start sm:self-auto"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Create cohort</span>
            </button>
          ) : null}
        </div>

        {/* Cohorts List or Educational Empty State */}
        {cohorts.length === 0 ? (
          <div className="py-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 mb-4 shadow-inner">
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <h4 className="text-base font-bold text-neutral-900 dark:text-white">
              No saved cohorts yet
            </h4>
            <p className="mx-auto mt-1.5 max-w-lg text-sm text-neutral-500 dark:text-slate-400">
              Cohorts let you group users by traits like country, subscription plan, device type, or custom event metadata so you can see how specific segments perform across Retention and Insights.
            </p>

            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => handleOpenCreate()}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Create your first cohort</span>
              </button>
            </div>

            {/* Starter Cohort Templates */}
            <div className="mt-10 pt-8 border-t border-neutral-100 dark:border-slate-800/80">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-slate-500 mb-4">
                Or start with a recommended template:
              </p>
              <div className="grid gap-3 sm:grid-cols-3 max-w-3xl mx-auto text-left">
                {TEMPLATE_COHORTS.map((tmpl) => (
                  <button
                    key={tmpl.name}
                    type="button"
                    onClick={() => handleOpenCreate(tmpl.name, tmpl.filters)}
                    className="group rounded-xl border border-neutral-200 p-4 transition-all hover:border-blue-500 hover:bg-blue-50/30 hover:shadow-xs dark:border-slate-800 dark:hover:border-blue-500/50 dark:hover:bg-blue-950/20"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-semibold text-neutral-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400 transition">
                        {tmpl.name}
                      </span>
                      <span className="text-neutral-400 group-hover:text-blue-600 dark:text-slate-500 dark:group-hover:text-blue-400">
                        →
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-neutral-500 dark:text-slate-400 leading-relaxed">
                      {tmpl.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-neutral-200/70 dark:divide-slate-800/70">
            {cohorts.map((cohort) => {
              const filterCount = cohort.filters.length;
              return (
                <div
                  key={cohort.id}
                  className="py-4.5 first:pt-4 last:pb-0 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="space-y-2 min-w-0 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-base font-bold text-neutral-900 dark:text-white">
                        {cohort.name}
                      </h4>
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600 dark:bg-slate-900 dark:text-slate-400">
                        {filterCount} {filterCount === 1 ? 'condition' : 'conditions'}
                      </span>
                      <span className="text-xs text-neutral-400 dark:text-slate-500">
                        • {formatDate(cohort.createdAt)}
                      </span>
                    </div>

                    {/* Condition Chips */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-slate-500 mr-1">
                        Where:
                      </span>
                      {cohort.filters.map((f, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1.5">
                          {idx > 0 ? (
                            <span className="rounded bg-blue-100/70 px-1 py-0.2 text-[9px] font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                              AND
                            </span>
                          ) : null}
                          <span className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-neutral-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                            <span className="font-semibold text-neutral-900 dark:text-white">{f.field}</span>{' '}
                            <span className="text-neutral-500 dark:text-slate-400">{f.operator.replace(/_/g, ' ')}</span>{' '}
                            {f.value ? <span className="font-mono text-blue-700 dark:text-blue-300">&ldquo;{f.value}&rdquo;</span> : null}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions Toolbar */}
                  <div className="flex flex-wrap items-center gap-2 self-start lg:self-center shrink-0">
                    <Link
                      href={`/dashboard/retention?filters=${encodeURIComponent(JSON.stringify(cohort.filters))}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:border-blue-500 hover:bg-blue-50/50 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-500/50 dark:hover:bg-blue-950/40 dark:hover:text-blue-300 transition"
                      title="Apply this cohort in Retention matrix"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 3v18h18" />
                        <path d="M18 17V9" />
                        <path d="M13 17V5" />
                        <path d="M8 17v-3" />
                      </svg>
                      <span>Retention</span>
                    </Link>

                    <Link
                      href={`/dashboard/insights?filters=${encodeURIComponent(JSON.stringify(cohort.filters))}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:border-blue-500 hover:bg-blue-50/50 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-500/50 dark:hover:bg-blue-950/40 dark:hover:text-blue-300 transition"
                      title="Apply this cohort in Insights trends"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                        <polyline points="17 6 23 6 23 12" />
                      </svg>
                      <span>Insights</span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => handleDuplicate(cohort)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition"
                      title="Duplicate cohort"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      <span>Duplicate</span>
                    </button>

                    {confirmDeleteId === cohort.id ? (
                      <div className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-red-50 p-1 dark:border-red-900/60 dark:bg-red-950/50">
                        <span className="px-1 text-[11px] font-semibold text-red-800 dark:text-red-200">Delete?</span>
                        <button
                          type="button"
                          onClick={() => handleDelete(cohort.id)}
                          disabled={deletingId === cohort.id}
                          className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {deletingId === cohort.id ? '…' : 'Yes'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-neutral-600 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(cohort.id)}
                        className="inline-flex items-center justify-center rounded-lg p-2 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition"
                        aria-label={`Delete ${cohort.name}`}
                        title="Delete cohort"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Creation & Duplication Modal Dialog */}
      <CohortModal
        open={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setError(null);
        }}
        onSave={handleSaveCohort}
        initialName={modalInitialName}
        initialFilters={modalInitialFilters}
        isSubmitting={isSubmitting}
        error={error}
      />
    </div>
  );
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}
