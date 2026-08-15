'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { SegmentFilters, FilterCondition, cleanFilters } from '@/components/SegmentFilters';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Cohort {
  id: string;
  name: string;
  filters: FilterCondition[];
  createdAt: string;
}

function describe(filters: FilterCondition[]): string {
  if (filters.length === 0) return 'all users';
  return filters
    .map((f) => `${f.field} ${f.operator.replace('_', ' ')}${f.value ? ` ${f.value}` : ''}`)
    .join(' · ');
}

export function CohortManager({ cohorts }: { cohorts: Cohort[] }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const [name, setName] = useState('');
  const [filters, setFilters] = useState<FilterCondition[]>([{ field: '', operator: 'is', value: '' }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function getToken(): Promise<string | null> {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const cleaned = cleanFilters(filters);
    if (!name.trim()) {
      setError('Give the cohort a name.');
      return;
    }
    if (cleaned.length === 0) {
      setError('Add at least one complete filter condition.');
      return;
    }

    setIsSubmitting(true);
    const token = await getToken();
    if (!token) {
      setError('Your dashboard session expired. Sign in again.');
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/v1/dashboard/cohorts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), filters: cleaned })
      });
      if (!response.ok) {
        setError(await readError(response));
        setIsSubmitting(false);
        return;
      }
      setName('');
      setFilters([{ field: '', operator: 'is', value: '' }]);
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
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <form
        className="grid h-fit gap-4 rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950"
        onSubmit={handleSubmit}
      >
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">New cohort</h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-slate-400">
            A reusable group of users. Apply it to Insights and Retention to segment any view.
          </p>
        </div>

        <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
          Cohort name
          <input
            className="min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-white dark:focus:ring-white/10"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nigerian pro users"
          />
        </label>

        <div className="grid gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
            Match users where all of…
          </span>
          <SegmentFilters value={filters} onChange={setFilters} />
        </div>

        {error ? (
          <p className="rounded-md border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            {error}
          </p>
        ) : null}

        <div>
          <button
            type="submit"
            className="h-10 rounded-md bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-700 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-slate-200"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving…' : 'Create cohort'}
          </button>
        </div>
      </form>

      <section className="rounded-md border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <p className="border-b border-neutral-200 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:border-slate-800 dark:text-slate-500">
          Saved cohorts
        </p>
        {cohorts.length === 0 ? (
          <p className="p-5 text-sm text-neutral-500 dark:text-slate-500">No cohorts yet. Create one to start segmenting.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-slate-800">
            {cohorts.map((cohort) => (
              <li key={cohort.id} className="flex items-start justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{cohort.name}</p>
                  <p className="mt-0.5 truncate font-mono text-xs text-neutral-500 dark:text-slate-400">{describe(cohort.filters)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Link
                    href={`/dashboard/insights?filters=${encodeURIComponent(JSON.stringify(cohort.filters))}`}
                    className="text-xs font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white"
                  >
                    Open in Insights →
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(cohort.id)}
                    disabled={deletingId === cohort.id}
                    className="text-xs font-semibold text-red-600 transition hover:text-red-700 disabled:opacity-50 dark:text-red-400"
                  >
                    {deletingId === cohort.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? `Request failed with ${response.status}`;
  } catch {
    return `Request failed with ${response.status}`;
  }
}
