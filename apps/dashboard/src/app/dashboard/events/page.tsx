import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { EventsTable, type RecentEvent } from './EventsTable';
import { StatTile } from '@/components/charts/StatTile';
import { MiniBars } from '@/components/charts/MiniBars';
import { BarChart } from '@/components/charts/BarChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { RankedList } from '@/components/charts/RankedList';

export const dynamic = 'force-dynamic';

const cardClass =
  'relative overflow-hidden rounded-md border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800/90 dark:bg-slate-950 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]';

interface DashboardProject {
  id: string;
  name: string;
  organizationName: string;
}

interface RecentEventsResponse {
  project: DashboardProject | null;
  events: RecentEvent[];
}

export default async function DashboardEventsPage() {
  const { user, token } = await requireDashboardSession('/dashboard/events');
  const { data, error } = await dashboardGet<RecentEventsResponse>('/v1/dashboard/events/recent?limit=50', token);

  const project = data?.project ?? null;
  const events = data?.events ?? [];
  const overview = buildOverview(events);

  return (
    <DashboardShell active="events" title="Events" userEmail={user.email}>
      <section className="mb-6 flex flex-col justify-between gap-4 rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950 md:flex-row md:items-end">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
            Live activity
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">Recent events</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500 dark:text-slate-400">
            {project ? (
              <>
                Streaming from <span className="font-medium text-neutral-700 dark:text-slate-200">{project.name}</span>. Click any
                row to expand the full event payload.
              </>
            ) : (
              'Reads the project attached to your workspace.'
            )}
          </p>
        </div>
        <a
          className="inline-flex h-10 w-fit items-center justify-center rounded-md border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          href="/dashboard/events"
        >
          Refresh
        </a>
      </section>

      {error ? (
        <section className="mb-4 rounded-md border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {error}
        </section>
      ) : null}

      {!project && !error ? (
        <section className="rounded-md border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">No project yet</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500 dark:text-slate-400">
            Create your first tracking project from Overview, then install the SDK snippet on a website.
          </p>
          <a
            className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-slate-200"
            href="/dashboard"
          >
            Go to setup
          </a>
        </section>
      ) : null}

      {project && events.length > 0 ? (
        <section className="mb-3 grid gap-3">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Events" value={events.length} hint="Loaded" delta="recent">
              <MiniBars values={overview.hourCounts} tone="blue" />
            </StatTile>
            <StatTile label="Event types" value={overview.eventTypes.length} hint="Unique names" delta="kinds">
              <MiniBars values={overview.typeCounts} tone="green" />
            </StatTile>
            <StatTile label="Users" value={overview.users} hint="Identified + anonymous" delta="people">
              <MiniBars values={overview.userCounts} tone="green" />
            </StatTile>
            <StatTile label="Last 24h" value={overview.last24h} hint="Of these events" delta={overview.last24h > 0 ? 'Live' : 'Idle'} tone={overview.last24h > 0 ? 'green' : 'red'}>
              <MiniBars values={overview.hourCounts.slice(-12)} tone={overview.last24h > 0 ? 'green' : 'red'} />
            </StatTile>
          </section>

          <section className="grid gap-3 lg:grid-cols-2">
            <div className={cardClass}>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
                Top event types
              </p>
              <BarChart items={overview.topEvents} tone="blue" showValues height={210} className="h-60 w-full" />
            </div>
            <div className={cardClass}>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
                Activity by hour
              </p>
              <BarChart items={overview.hourBuckets} tone="green" height={210} className="h-60 w-full" />
            </div>
          </section>

          <section className="grid gap-3 lg:grid-cols-2">
            <div className={cardClass}>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
                Devices
              </p>
              <DonutChart
                items={overview.devices}
                centerValue={String(events.length)}
                centerLabel="events"
                emptyLabel="No device info captured yet."
              />
            </div>
            <div className={cardClass}>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
                Top users
              </p>
              <RankedList items={overview.topUsers} emptyLabel="No user identifiers sent yet." />
            </div>
          </section>
        </section>
      ) : null}

      {project ? (
        <section className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs text-neutral-500 dark:text-slate-400">{project.id}</p>
            <p className="text-xs text-neutral-400 dark:text-slate-500">{events.length} loaded</p>
          </div>
          <EventsTable events={events} />
        </section>
      ) : null}
    </DashboardShell>
  );
}

function buildOverview(events: RecentEvent[]) {
  const hourCounts = new Array<number>(24).fill(0);
  const typeCounts = new Map<string, number>();
  const deviceCounts = new Map<string, number>();
  const userCounts = new Map<string, number>();
  const now = Date.now();

  for (const event of events) {
    const hour = hourOf(event);
    if (hour !== null) hourCounts[hour] += 1;

    const type = event.eventName || 'untitled';
    typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);

    const device = deviceKey(event.deviceInfo);
    deviceCounts.set(device, (deviceCounts.get(device) ?? 0) + 1);

    const userId = event.externalUserId ?? event.userId ?? event.anonymousId;
    if (userId) userCounts.set(userId, (userCounts.get(userId) ?? 0) + 1);
  }

  const toSortedItems = (map: Map<string, number>) =>
    [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

  const topEvents = toSortedItems(typeCounts).slice(0, 8);
  const devices = toSortedItems(deviceCounts).slice(0, 7);
  const topUsers = [...userCounts.entries()]
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  const last24h = events.filter((event) => {
    const ms = timestampOf(event);
    return ms !== null && Date.now() - ms <= 24 * 60 * 60 * 1000;
  }).length;

  return {
    eventTypes: Array.from(typeCounts.keys()),
    typeCounts: [...typeCounts.values()],
    hourCounts,
    userCounts: [...userCounts.values()],
    topEvents,
    devices,
    topUsers,
    events: events.length,
    users: userCounts.size,
    last24h,
    hourBuckets: hourCounts.map((value, hour) => ({ label: `${hour}:00`, value }))
  };
}

function timestampOf(event: RecentEvent): number | null {
  const raw = event.occurredAt ?? event.receivedAt;
  if (!raw) return null;
  const parsed = new Date(raw).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function hourOf(event: RecentEvent): number | null {
  const ms = timestampOf(event);
  if (ms === null) return null;
  return new Date(ms).getHours();
}

function deviceKey(info: RecentEvent['deviceInfo']): string {
  if (!info) return 'unknown';
  const dt = info['deviceType'];
  const br = info['browser'];
  if (typeof dt === 'string' && dt) return dt;
  if (typeof br === 'string' && br) return br;
  return 'unknown';
}