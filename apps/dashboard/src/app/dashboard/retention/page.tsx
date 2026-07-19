import Link from 'next/link';
import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { SegmentBar } from '@/components/SegmentBar';
import type { FilterCondition } from '@/components/SegmentFilters';
import { RetentionGrid } from './RetentionGrid';

export const dynamic = 'force-dynamic';

interface RetentionResponse {
  project: { id: string } | null;
  weeks: number;
  cohorts: Array<{ cohort: string; size: number; periods: Array<number | null> }>;
  averages: number[];
  summary: { week1: number; week4: number };
}

interface CohortsResponse {
  cohorts: Array<{ id: string; name: string; filters: FilterCondition[] }>;
}

function parseFiltersParam(raw: string | undefined): FilterCondition[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const RANGES = [
  { value: '8', label: '8 weeks' },
  { value: '12', label: '12 weeks' },
  { value: '26', label: '26 weeks' }
];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function RetentionPage({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const { user, token } = await requireDashboardSession('/dashboard/retention');
  const weeks = firstParam(searchParams.weeks) ?? '8';
  const filtersParam = firstParam(searchParams.filters);
  const filters = parseFiltersParam(filtersParam);

  const retentionQuery = new URLSearchParams({ weeks });
  if (filtersParam) {
    retentionQuery.set('filters', filtersParam);
  }
  const [{ data, error }, { data: cohortsData }] = await Promise.all([
    dashboardGet<RetentionResponse>(`/v1/dashboard/retention?${retentionQuery.toString()}`, token),
    dashboardGet<CohortsResponse>('/v1/dashboard/cohorts', token)
  ]);

  const week1 = data?.summary.week1 ?? 0;
  const week4 = data?.summary.week4 ?? 0;

  return (
    <DashboardShell active="retention" title="Retention" userEmail={user.email}>
      {error ? (
        <section className="mb-4 rounded-md border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100">
          {error}
        </section>
      ) : null}

      <section className="mb-6 flex flex-col justify-between gap-4 rounded-md border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950 sm:flex-row sm:items-start">
        <div className="max-w-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">
            Week 1 retention
          </p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-neutral-900 dark:text-white">{week1}%</p>
          <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
            On average, {week1}% of users come back the week after they first show up
            {week4 > 0 ? <>, and {week4}% are still active four weeks later</> : null}. Higher and flatter is better — a
            curve that keeps dropping means people try it once and leave.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-md border border-neutral-200 p-1 dark:border-neutral-800">
          {RANGES.map((range) => (
            <Link
              key={range.value}
              href={`/dashboard/retention?weeks=${range.value}`}
              className={`rounded px-3 py-1.5 text-sm font-semibold transition ${
                weeks === range.value
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-black'
                  : 'text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900'
              }`}
            >
              {range.label}
            </Link>
          ))}
        </div>
      </section>

      <div className="mb-6">
        <SegmentBar basePath="/dashboard/retention" cohorts={cohortsData?.cohorts ?? []} initialFilters={filters} />
      </div>

      {data ? (
        <section className="rounded-md border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
          <RetentionGrid weeks={data.weeks} cohorts={data.cohorts} averages={data.averages} />
        </section>
      ) : (
        <p className="text-sm text-neutral-500 dark:text-neutral-500">Loading…</p>
      )}
    </DashboardShell>
  );
}
