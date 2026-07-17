import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { TrendChart } from '@/components/charts/TrendChart';
import { TrendControls } from './TrendControls';

export const dynamic = 'force-dynamic';

interface EventNamesResponse {
  project: { id: string; name: string } | null;
  eventNames: Array<{ eventName: string; total: number }>;
}

interface TrendsResponse {
  event: string;
  interval: 'hour' | 'day' | 'week';
  breakdown: string | null;
  buckets: string[];
  series: Array<{ key: string; points: Array<{ bucket: string; total: number }> }>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function InsightsPage({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const { user, token } = await requireDashboardSession('/dashboard/insights');
  const { data: eventNamesData, error: eventNamesError } = await dashboardGet<EventNamesResponse>(
    '/v1/dashboard/insights/event-names',
    token
  );

  const eventNames = eventNamesData?.eventNames.map((item) => item.eventName) ?? [];
  const selectedEvent = firstParam(searchParams.event) ?? eventNames[0] ?? '';
  const interval = firstParam(searchParams.interval) ?? 'day';
  const days = firstParam(searchParams.days) ?? '30';
  const breakdown = firstParam(searchParams.breakdown) ?? '';

  let trends: TrendsResponse | null = null;
  let trendsError: string | null = null;

  if (selectedEvent) {
    const query = new URLSearchParams({ event: selectedEvent, interval, days });
    if (breakdown) {
      query.set('breakdown', breakdown);
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
          Count an event over time, optionally broken down by a top-level property.
        </p>
        <TrendControls eventNames={eventNames} selected={{ event: selectedEvent, interval, days, breakdown }} />
      </section>

      {eventNamesError ? <ErrorBanner message={eventNamesError} /> : null}
      {trendsError ? <ErrorBanner message={trendsError} /> : null}

      <section className="rounded-md border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
        {!selectedEvent ? (
          <div className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-6 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/40">
            No events captured yet. Install the SDK and send an event, then come back to chart it.
          </div>
        ) : trends ? (
          <>
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h3 className="font-mono text-base font-semibold text-neutral-900 dark:text-white">{trends.event}</h3>
              <span className="text-xs text-neutral-400 dark:text-neutral-500">
                {trends.breakdown ? `broken down by ${trends.breakdown}` : `${trends.interval} · last ${days}d`}
              </span>
            </div>
            <TrendChart buckets={trends.buckets} series={trends.series} interval={trends.interval} />
          </>
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
