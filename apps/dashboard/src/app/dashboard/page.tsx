import Link from 'next/link';
import { DashboardShell } from './DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { comparisonText, compactNumber, deltaInfo, formatCount } from '@/lib/metrics';
import { StatTile } from '@/components/charts/StatTile';
import { Sparkline } from '@/components/charts/Sparkline';
import { TopEventsList } from '@/components/charts/TopEventsList';
import { RankedList } from '@/components/charts/RankedList';

export const dynamic = 'force-dynamic';

interface OverviewResponse {
  project: { id: string; name: string; organizationName: string } | null;
  totals: { events: number; events24h: number; users: number; sessions: number };
  revenue: { total: number; previous: number; transactions: number };
  topEvents: Array<{ eventName: string; total: number }>;
  topDevices: Array<{ name: string; total: number }>;
  topCountries: Array<{ name: string; total: number }>;
  sparkline: Array<{ bucket: string; total: number }>;
}

export default async function DashboardPage() {
  const { user, token } = await requireDashboardSession('/dashboard');
  const { data: overview, error } = await dashboardGet<OverviewResponse>('/v1/dashboard/overview', token);

  return (
    <DashboardShell active="overview" title="Overview" userEmail={user.email}>
      {error ? (
        <section className="mb-4 rounded-md border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100">
          {error}
        </section>
      ) : null}

      {overview?.project ? <RevenueHeadline revenue={overview.revenue} /> : null}

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total events" value={overview?.totals.events ?? 0} hint="All time" />
        <StatTile label="Events (24h)" value={overview?.totals.events24h ?? 0} hint="Last 24 hours" />
        <StatTile label="Identified users" value={overview?.totals.users ?? 0} hint="People profiles" />
        <StatTile label="Sessions" value={overview?.totals.sessions ?? 0} hint="All time" />
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-md border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">
                Events, last 14 days
              </p>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                {overview?.project ? overview.project.name : 'No project yet'}
              </p>
            </div>
            <a className="text-sm font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white" href="/dashboard/insights">
              Open insights →
            </a>
          </div>
          <div className="mt-4">
            <Sparkline points={overview?.sparkline ?? []} />
          </div>
        </div>

        <div className="rounded-md border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">
            Top events (30 days)
          </p>
          <TopEventsList events={overview?.topEvents ?? []} />
        </div>
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">
            Devices (30 days)
          </p>
          <RankedList
            items={(overview?.topDevices ?? []).map((d) => ({ label: d.name, total: d.total }))}
            emptyLabel="No device data yet."
          />
        </div>

        <div className="rounded-md border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">
            Locations (30 days)
          </p>
          <RankedList
            items={(overview?.topCountries ?? []).map((c) => ({ label: c.name, total: c.total }))}
            emptyLabel="No location data yet (needs public-IP traffic)."
          />
        </div>
      </section>

      {!overview?.project ? (
        <section className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-6 dark:border-neutral-700 dark:bg-neutral-900/40">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-white">Finish setup</h2>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
            Create your project and grab the SDK write key + install snippet to start capturing events.
          </p>
          <Link
            href="/dashboard/settings"
            className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
          >
            Go to settings
          </Link>
        </section>
      ) : null}
    </DashboardShell>
  );
}

function RevenueHeadline({ revenue }: { revenue: OverviewResponse['revenue'] }) {
  const hasData = revenue.transactions > 0 || revenue.total !== 0;
  const current = compactNumber(revenue.total);
  const previous = compactNumber(revenue.previous);
  const delta = deltaInfo(revenue.total, revenue.previous);

  return (
    <section className="mb-6 rounded-md border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">
            Revenue (GTV) · last 30 days
          </p>
          {hasData ? (
            <>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white">{current}</span>
                <span
                  className={`inline-flex items-center gap-1 text-sm font-medium ${
                    delta.muted ? 'text-neutral-400 dark:text-neutral-500' : 'text-neutral-800 dark:text-neutral-200'
                  }`}
                  title={`vs ${previous} the previous 30 days`}
                >
                  {delta.arrow ? <span aria-hidden>{delta.arrow}</span> : null}
                  {delta.label}
                </span>
              </div>
              <p className="mt-1.5 max-w-xl text-sm text-neutral-500 dark:text-neutral-400">
                Summed from the <span className="font-mono text-neutral-700 dark:text-neutral-300">amount</span> on{' '}
                {formatCount(revenue.transactions)} {revenue.transactions === 1 ? 'event' : 'events'} in the last 30 days.{' '}
                <span className="text-neutral-400 dark:text-neutral-500">{comparisonText(30, revenue.previous, previous, delta)}</span>
              </p>
            </>
          ) : (
            <p className="mt-2 max-w-xl text-sm text-neutral-500 dark:text-neutral-400">
              No revenue tracked yet. Send an event with a numeric{' '}
              <span className="font-mono text-neutral-700 dark:text-neutral-300">amount</span> property (e.g.{' '}
              <span className="font-mono text-neutral-700 dark:text-neutral-300">purchase</span>) and it&apos;ll add up here.
            </p>
          )}
        </div>
        <Link
          className="shrink-0 text-sm font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white"
          href="/dashboard/insights?event=purchase&measure=sum&property=amount"
        >
          Break down revenue →
        </Link>
      </div>
    </section>
  );
}
