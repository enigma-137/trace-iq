import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { comparisonText, compactNumber, deltaInfo, formatCount } from '@/lib/metrics';
import { TrendChart } from '@/components/charts/TrendChart';
import { SegmentBar } from '@/components/SegmentBar';
import type { FilterCondition } from '@/components/SegmentFilters';
import { TrendControls } from './TrendControls';

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

// Sum/avg of money reads better compact (₦1.2M); counts read better in full (12,340).
function formatterFor(measure: Measure): (value: number) => string {
  return measure === 'sum' || measure === 'avg' ? compactNumber : formatCount;
}

function metricLabel(trends: TrendsResponse): string {
  switch (trends.measure) {
    case 'unique':
      return 'Unique users';
    case 'sum':
      return `Total ${trends.property}`;
    case 'avg':
      return `Average ${trends.property}`;
    default:
      return 'Total events';
  }
}

// A sentence a non-technical reader can parse at a glance.
function plainSummary(trends: TrendsResponse, formattedCurrent: string): string {
  const window = `the last ${trends.summary.days} days`;
  switch (trends.measure) {
    case 'unique':
      return `${formattedCurrent} unique people triggered ${trends.event} in ${window}.`;
    case 'sum':
      return `${trends.event} added up to ${formattedCurrent} in ${trends.property} over ${window}.`;
    case 'avg':
      return `${trends.event} averaged ${formattedCurrent} ${trends.property} over ${window}.`;
    default:
      return `${trends.event} happened ${formattedCurrent} times in ${window}.`;
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
  const selectedEvent = firstParam(searchParams.event) ?? eventNames[0] ?? '';
  const interval = firstParam(searchParams.interval) ?? 'day';
  const days = firstParam(searchParams.days) ?? '30';
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
    const query = new URLSearchParams({ event: selectedEvent, interval, days, measure });
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
      <section className="mb-6 rounded-md border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Event trends</h2>
        <p className="mt-1 mb-4 text-sm text-neutral-500 dark:text-neutral-400">
          Trend an event over time — count it, count unique users, or sum/average a numeric property like{' '}
          <span className="font-mono text-neutral-700 dark:text-neutral-300">amount</span>. Optionally break it down by a property.
        </p>
        <TrendControls
          eventNames={eventNames}
          selected={{ event: selectedEvent, interval, days, breakdown, measure, property }}
        />
        <div className="mt-4">
          <SegmentBar basePath="/dashboard/insights" cohorts={cohortsData?.cohorts ?? []} initialFilters={filters} />
        </div>
      </section>

      {eventNamesError ? <ErrorBanner message={eventNamesError} /> : null}
      {trendsError ? <ErrorBanner message={trendsError} /> : null}

      <section className="rounded-md border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
        {!selectedEvent ? (
          <div className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-6 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/40">
            No events captured yet. Install the SDK and send an event, then come back to chart it.
          </div>
        ) : missingProperty ? (
          <div className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-6 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/40">
            Enter a numeric property (e.g. <span className="font-mono text-neutral-700 dark:text-neutral-300">amount</span>) to
            {measure === 'sum' ? ' sum' : ' average'} over time.
          </div>
        ) : trends ? (
          (() => {
            const fmt = formatterFor(trends.measure);
            const current = fmt(trends.summary.current);
            const previous = fmt(trends.summary.previous);
            const delta = deltaInfo(trends.summary.current, trends.summary.previous);
            return (
              <>
                <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">
                      {metricLabel(trends)}
                    </p>
                    <div className="mt-1 flex items-baseline gap-3">
                      <span className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white">{current}</span>
                      <span
                        className={`inline-flex items-center gap-1 text-sm font-medium ${
                          delta.muted ? 'text-neutral-400 dark:text-neutral-500' : 'text-neutral-800 dark:text-neutral-200'
                        }`}
                        title={`vs ${previous} in the previous ${trends.summary.days} days`}
                      >
                        {delta.arrow ? <span aria-hidden>{delta.arrow}</span> : null}
                        {delta.label}
                      </span>
                    </div>
                    <p className="mt-1.5 max-w-xl text-sm text-neutral-500 dark:text-neutral-400">
                      {plainSummary(trends, current)}{' '}
                      <span className="text-neutral-400 dark:text-neutral-500">
                        {comparisonText(trends.summary.days, trends.summary.previous, previous, delta)}
                      </span>
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-neutral-400 dark:text-neutral-500">
                    {trends.breakdown ? `broken down by ${trends.breakdown}` : `${trends.interval} · last ${days}d`}
                  </span>
                </div>
                <TrendChart
                  buckets={trends.buckets}
                  series={trends.series}
                  interval={trends.interval}
                  format={trends.measure === 'sum' || trends.measure === 'avg' ? 'compact' : 'number'}
                  legendTotals={trends.measure === 'count' || trends.measure === 'sum'}
                />
              </>
            );
          })()
        ) : (
          <p className="text-sm text-neutral-500 dark:text-neutral-500">Loading…</p>
        )}
      </section>
    </DashboardShell>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <section className="mb-4 rounded-md border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100">
      {message}
    </section>
  );
}
