import { DashboardShell } from './DashboardShell';
import { SetupPanel } from './SetupPanel';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { StatTile } from '@/components/charts/StatTile';
import { Sparkline } from '@/components/charts/Sparkline';
import { TopEventsList } from '@/components/charts/TopEventsList';
import { RankedList } from '@/components/charts/RankedList';

export const dynamic = 'force-dynamic';

interface OverviewResponse {
  project: { id: string; name: string; organizationName: string } | null;
  totals: { events: number; events24h: number; users: number; sessions: number };
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

      <SetupPanel />
    </DashboardShell>
  );
}
