import Link from 'next/link';
import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { comparisonText, compactNumber, deltaInfo, formatCount } from '@/lib/metrics';
import { TrendChart } from '@/components/charts/TrendChart';
import type { FilterCondition } from '@/components/SegmentFilters';
import { TrendControls } from './TrendControls';
import { SaveViewButton } from '../SaveViewButton';

export const dynamic = 'force-dynamic';

interface EventNamesResponse {
  project: { id: string; name: string } | null;
  eventNames: Array<{ eventName: string; total: number }>;
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

type Measure = 'count' | 'unique' | 'sum' | 'avg';

interface TrendsResponse {
  event: string;
  interval: 'hour' | 'day' | 'week';
  measure: Measure;
  property: string | null;
  breakdown: string | null;
  buckets: string[];
  series: Array<{ key: string; points: Array<{ bucket: string; total: number; value: number }> }>;
  summary: { current: number; previous: number; days: number };
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeMeasure(value: string | undefined): Measure {
  return value === 'unique' || value === 'sum' || value === 'avg' ? value : 'count';
}

function formatterFor(measure: Measure): (value: number) => string {
  return measure === 'sum' || measure === 'avg' ? compactNumber : formatCount;
}

function metricLabel(trends: TrendsResponse): string {
  switch (trends.measure) {
    case 'unique':
      return 'Unique Users';
    case 'sum':
      return `Total ${trends.property ?? 'Property'}`;
    case 'avg':
      return `Average ${trends.property ?? 'Property'}`;
    default:
      return 'Total Events';
  }
}

function plainSummary(trends: TrendsResponse, formattedCurrent: string): string {
  const window = `the last ${trends.summary.days} days`;
  switch (trends.measure) {
    case 'unique':
      return `${formattedCurrent} unique users triggered ${trends.event} in ${window}.`;
    case 'sum':
      return `${trends.event} added up to ${formattedCurrent} in ${trends.property ?? 'property'} over ${window}.`;
    case 'avg':
      return `${trends.event} averaged ${formattedCurrent} ${trends.property ?? 'property'} over ${window}.`;
    default:
      return `${trends.event} occurred ${formattedCurrent} times in ${window}.`;
  }
}

export default async function InsightsPage({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const { user, token } = await requireDashboardSession('/dashboard/insights');
  const [{ data: eventNamesData, error: eventNamesError }, { data: cohortsData }] = await Promise.all([
    dashboardGet<EventNamesResponse>('/v1/dashboard/insights/event-names', token),
    dashboardGet<CohortsResponse>('/v1/dashboard/cohorts', token)
  ]);

  const eventNames = eventNamesData?.eventNames.map((item) => item.eventName) ?? [];
  const project = eventNamesData?.project ?? null;
  const selectedEvent = firstParam(searchParams.event) ?? eventNames[0] ?? '';
  const interval = firstParam(searchParams.interval) ?? 'day';
  const days = firstParam(searchParams.days) ?? '30';
  const from = firstParam(searchParams.from) ?? '';
  const to = firstParam(searchParams.to) ?? '';
  const breakdown = firstParam(searchParams.breakdown) ?? '';
  const measure = normalizeMeasure(firstParam(searchParams.measure));
  const property = firstParam(searchParams.property)?.trim() ?? '';
  const needsProperty = measure === 'sum' || measure === 'avg';
  const missingProperty = needsProperty && !property;
  const filtersParam = firstParam(searchParams.filters);
  const filters = parseFiltersParam(filtersParam);

  let trends: TrendsResponse | null = null;
  let trendsError: string | null = null;

  if (selectedEvent && !missingProperty) {
    const query = new URLSearchParams({ event: selectedEvent, interval, measure });
    if (from || to) {
      if (from) query.set('from', from);
      if (to) query.set('to', to);
    } else {
      query.set('days', days);
    }
    if (breakdown) {
      query.set('breakdown', breakdown);
    }
    if (needsProperty) {
      query.set('property', property);
    }
    if (filtersParam) {
      query.set('filters', filtersParam);
    }
    const result = await dashboardGet<TrendsResponse>(`/v1/dashboard/insights/trends?${query.toString()}`, token);
    trends = result.data;
    trendsError = result.error;
  }

  return (
    <DashboardShell active="insights" title="Insights" userEmail={user.email}>
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-800 shadow-xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-neutral-500 dark:text-slate-400 sm:text-sm">
                Trend an event over time — count volume, unique users, or calculate property sums and averages.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            <SaveViewButton
              definition={{
                source: 'trend',
                event: selectedEvent,
                interval,
                from,
                to,
                days,
                measure,
                property,
                breakdown,
                filters: filtersParam
              }}
              projectId={project?.id}
            />
          </div>
        </div>

        {/* Query Controls: inputs with collapsible middle panel */}
        <TrendControls
          eventNames={eventNames}
          cohorts={cohortsData?.cohorts ?? []}
          initialFilters={filters}
          selected={{ event: selectedEvent, interval, days, from, to, breakdown, measure, property }}
        />

        {/* Error Alerts */}
        {eventNamesError ? <ErrorBanner message={eventNamesError} /> : null}
        {trendsError ? <ErrorBanner message={trendsError} /> : null}

        {/* Main Chart / Centered Empty State Area */}
        {!selectedEvent ? (
          /* Centered Empty State */
          <section className="flex flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-xs dark:border-slate-800 dark:bg-slate-950 sm:p-14">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50 text-neutral-700 shadow-xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-neutral-900 dark:text-white sm:text-lg">
              No events captured yet
            </h3>
            <p className="mx-auto mt-1.5 max-w-md text-xs leading-5 text-neutral-500 dark:text-slate-400 sm:text-sm sm:leading-6">
              TraceIQ hasn't recorded events for this project yet. Integrate the SDK or send a test event to begin charting user behavior and metrics.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/dashboard/setup"
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                View SDK Setup Guide
              </Link>
              <Link
                href="/dashboard/web"
                className="inline-flex h-9 items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 text-xs font-semibold text-neutral-700 shadow-xs transition hover:bg-neutral-50 hover:text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Web Analytics
              </Link>
            </div>
          </section>
        ) : missingProperty ? (
          /* Centered Property Prompt */
          <section className="flex flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-xs dark:border-slate-800 dark:bg-slate-950 sm:p-12">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-neutral-900 dark:text-white">
              Property required for {measure === 'sum' ? 'Sum' : 'Average'}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-neutral-500 dark:text-slate-400 sm:text-sm">
              Enter a numeric property name (e.g.{' '}
              <span className="font-mono font-semibold text-neutral-800 dark:text-slate-200">amount</span> or{' '}
              <span className="font-mono font-semibold text-neutral-800 dark:text-slate-200">duration_ms</span>) in the query bar above to chart it.
            </p>
          </section>
        ) : trends ? (
          /* Trends Data Visualization */
          (() => {
            const fmt = formatterFor(trends.measure);
            const current = fmt(trends.summary.current);
            const previous = fmt(trends.summary.previous);
            const delta = deltaInfo(trends.summary.current, trends.summary.previous);

            return (
              <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-950 sm:p-6">
                {/* Metric Summary Header */}
                <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-neutral-100 pb-5 dark:border-slate-800/80">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
                      {metricLabel(trends)}
                    </p>
                    <div className="mt-1 flex items-baseline gap-3">
                      <span className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-4xl">
                        {current}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
                          delta.muted
                            ? 'bg-neutral-100 text-neutral-600 dark:bg-slate-800 dark:text-slate-400'
                            : 'bg-neutral-100 text-neutral-900 dark:bg-slate-800 dark:text-slate-100'
                        }`}
                        title={`vs ${previous} in the previous ${trends.summary.days} days`}
                      >
                        {delta.arrow ? <span aria-hidden>{delta.arrow}</span> : null}
                        {delta.label}
                      </span>
                    </div>
                    <p className="mt-2 max-w-xl text-xs text-neutral-500 dark:text-slate-400 sm:text-sm">
                      {plainSummary(trends, current)}{' '}
                      <span className="text-neutral-400 dark:text-slate-500">
                        {comparisonText(trends.summary.days, trends.summary.previous, previous, delta)}
                      </span>
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-mono text-neutral-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                    <span>
                      {trends.breakdown ? `by ${trends.breakdown}` : `${trends.interval} interval · ${days}d`}
                    </span>
                  </div>
                </div>

                {/* Trend Chart */}
                <TrendChart
                  buckets={trends.buckets}
                  series={trends.series}
                  interval={trends.interval}
                  format={trends.measure === 'sum' || trends.measure === 'avg' ? 'compact' : 'number'}
                  legendTotals={trends.measure === 'count' || trends.measure === 'sum'}
                />
              </section>
            );
          })()
        ) : (
          /* Loading State */
          <div className="flex items-center justify-center rounded-xl border border-neutral-200 bg-white p-12 text-center text-xs text-neutral-400 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-500">
            <svg className="mr-2 h-4 w-4 animate-spin text-neutral-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading insights data…
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-red-200 bg-red-50/80 px-4 py-3 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-red-600 dark:text-red-400">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{message}</span>
    </div>
  );
}
