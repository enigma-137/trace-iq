import Link from 'next/link';
import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import type { FilterCondition } from '@/components/SegmentFilters';
import { RetentionGrid } from './RetentionGrid';
import { RetentionFilterModal } from './RetentionFilterModal';
import { AddCurrentViewToDashboardButton } from '@/components/dashboards/AddCurrentViewToDashboardButton';

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

function formatWeekName(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return `Week of ${new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date)}`;
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
  const totalUsers = data?.cohorts.reduce((sum, c) => sum + c.size, 0) ?? 0;

  // Calculate total returners at Week 1 across cohorts with size > 0
  const totalW1Returners = data?.cohorts.reduce((sum, c) => {
    const count = c.periods[1];
    return sum + (typeof count === 'number' ? count : 0);
  }, 0) ?? 0;

  // Identify the best performing cohort by W1 retention (with at least 1 user)
  let bestCohort: { name: string; rate: number; size: number } | null = null;
  if (data?.cohorts) {
    for (const c of data.cohorts) {
      if (c.size > 0 && typeof c.periods[1] === 'number') {
        const rate = Math.round((c.periods[1] / c.size) * 100);
        if (!bestCohort || rate > bestCohort.rate) {
          bestCohort = { name: formatWeekName(c.cohort), rate, size: c.size };
        }
      }
    }
  }

  return (
    <DashboardShell active="retention" title="Retention" userEmail={user.email}>
      {error ? (
        <section className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </section>
      ) : null}

      {/* Hero Explanatory Intro & Controls Header */}
      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950 shadow-xs">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                Cohort Retention
              </span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-2xl">
              Understand Product Stickiness & Long-term User Habits
            </h2>
            <p className="text-sm leading-relaxed text-neutral-600 dark:text-slate-400">
              Retention measures how effectively your product transforms first-time visitors into repeat, habitual users week over week.
              A curve that levels off into a flat plateau indicates enduring product value and strong retention, while a continuous drop toward zero highlights early onboarding friction.{' '}
              <Link href="/docs?page=retention" className="font-semibold text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300">
                How retention is measured →
              </Link>
            </p>
          </div>

          {/* Integrated Time Range Selector, Filter Modal Trigger & Add to Dashboard */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-end shrink-0">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50/80 p-1 dark:border-slate-800 dark:bg-slate-900/60">
                {RANGES.map((range) => {
                  const isSelected = weeks === range.value;
                  const targetUrl = filtersParam
                    ? `/dashboard/retention?weeks=${range.value}&filters=${encodeURIComponent(filtersParam)}`
                    : `/dashboard/retention?weeks=${range.value}`;
                  return (
                    <Link
                      key={range.value}
                      href={targetUrl}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${isSelected
                          ? 'bg-white text-neutral-900 shadow-xs dark:bg-slate-800 dark:text-white'
                          : 'text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
                        }`}
                    >
                      {range.label}
                    </Link>
                  );
                })}
              </div>

              <AddCurrentViewToDashboardButton
                title="Weekly User Retention"
                type="retention"
                chartType="retention"
                query={{ weeks, filters }}
                dateConfig={{ days: String(Number(weeks) * 7) }}
              />
            </div>

            <RetentionFilterModal
              basePath="/dashboard/retention"
              cohorts={cohortsData?.cohorts ?? []}
              initialFilters={filters}
              currentWeeks={weeks}
            />
          </div>
        </div>
      </section>

      {/* Summary Metric Cards (Solid Blue Cards for Key Highlights) */}
      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Solid Blue Card 1: Week 1 Retention */}
        <div className="relative overflow-hidden rounded-xl border border-blue-500 bg-blue-600 p-5 text-white shadow-sm dark:border-blue-600 dark:bg-blue-600">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-100">
              Week 1 Retention
            </p>
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white">
              Benchmark
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight tabular-nums sm:text-4xl">
              {week1}%
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-blue-50/90">
            <strong>{week1}%</strong> of users return one week after first activity.
            Higher and flatter indicates strong initial retention.
          </p>
        </div>

        {/* Solid Blue Card 2: Total Tracked Audience */}
        <div className="relative overflow-hidden rounded-xl border border-blue-500 bg-blue-600 p-5 text-white shadow-sm dark:border-blue-600 dark:bg-blue-600">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-100">
              Returning Users (W1)
            </p>
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white">
              Volume
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight tabular-nums sm:text-4xl">
              {totalW1Returners.toLocaleString()}
            </span>
            <span className="text-xs text-blue-100 font-medium">
              of {totalUsers.toLocaleString()} users
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-blue-50/90">
            {totalW1Returners > 0
              ? `${totalW1Returners.toLocaleString()} active returners observed across ${data?.cohorts.length ?? 0} weekly cohorts.`
              : 'Tracking first-time and returning user activity over the selected window.'}
          </p>
        </div>

        {/* Neutral Card 3: Week 4 Plateau */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
              Week 4 Retention
            </p>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600 dark:bg-slate-900 dark:text-slate-300">
              Core Habit
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-neutral-900 tabular-nums dark:text-white sm:text-4xl">
              {week4}%
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-neutral-500 dark:text-slate-400">
            {week4 > 0
              ? `${week4}% of users stay engaged at month one. A non-zero baseline proves long-term product value.`
              : 'Measures month-one retention plateau. Long-term baseline for your stickiest customer segment.'}
          </p>
        </div>

        {/* Neutral Card 4: Strongest Cohort */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
              Strongest Cohort
            </p>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600 dark:bg-slate-900 dark:text-slate-300">
              Top Rate
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            {bestCohort ? (
              <span className="text-3xl font-bold tracking-tight text-neutral-900 tabular-nums dark:text-white sm:text-4xl">
                {bestCohort.rate}%
              </span>
            ) : (
              <span className="text-2xl font-bold text-neutral-400 dark:text-slate-600">—</span>
            )}
            {bestCohort ? (
              <span className="text-xs text-neutral-500 dark:text-slate-400 truncate max-w-[110px]" title={bestCohort.name}>
                {bestCohort.name}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-neutral-500 dark:text-slate-400">
            {bestCohort
              ? `Best W1 return rate in this window (${bestCohort.size.toLocaleString()} users). Investigate acquisition drivers for this cohort.`
              : 'Highlights the cohort with the highest early return percentage once data is populated.'}
          </p>
        </div>
      </section>

      {/* Cohort Matrix Table Section */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950 shadow-xs">
        <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
              Weekly Cohort Retention Matrix
            </h3>
            <p className="text-xs text-neutral-500 dark:text-slate-400">
              Detailed breakdown of recurring user activity grouped by onboarding week across {weeks} weeks.
            </p>
          </div>
        </div>

        {data ? (
          <RetentionGrid weeks={data.weeks} cohorts={data.cohorts} averages={data.averages} />
        ) : (
          <div className="flex h-48 items-center justify-center text-sm text-neutral-500 dark:text-slate-400">
            Loading retention metrics…
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
