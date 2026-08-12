import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DashboardShell } from './DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { comparisonText, compactNumber, deltaInfo, formatCount } from '@/lib/metrics';
import { StatTile } from '@/components/charts/StatTile';
import { Sparkline } from '@/components/charts/Sparkline';
import { MiniBars } from '@/components/charts/MiniBars';
import { BarChart } from '@/components/charts/BarChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { TopEventsList } from '@/components/charts/TopEventsList';

export const dynamic = 'force-dynamic';

interface OverviewResponse {
  project: { id: string; name: string; organizationName: string } | null;
  totals: { events: number; events24h: number; events1h: number; users: number; sessions: number };
  lastEventAt: string | null;
  revenue: { total: number; previous: number; transactions: number };
  topEvents: Array<{ eventName: string; total: number }>;
  topDevices: Array<{ name: string; total: number }>;
  topCountries: Array<{ name: string; total: number }>;
  sparkline: Array<{ bucket: string; total: number }>;
}

const cardClass =
  'relative overflow-hidden rounded-md border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]';

export default async function DashboardPage({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const projectId = firstParam(searchParams.projectId);
  const { user, token } = await requireDashboardSession('/dashboard');
  const overviewPath = withProjectId('/v1/dashboard/overview', projectId);
  const { data: overview, error } = await dashboardGet<OverviewResponse>(overviewPath, token);

  if (!projectId && overview?.project?.id) {
    redirect(`/dashboard?projectId=${encodeURIComponent(overview.project.id)}`);
  }

  const canonicalProjectId = overview?.project?.id ?? projectId;
  const sparkValues = overview?.sparkline.map((point) => point.total) ?? [];
  const recentSpark = overview?.sparkline.slice(-10) ?? [];
  const activityTone = trendTone(sparkValues);
  const activityDelta = trendLabel(sparkValues);

  return (
    <DashboardShell active="overview" title="Overview" userEmail={user.email} projectId={canonicalProjectId}>
      {error ? (
        <section className="mb-4 rounded-md border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-100">
          {error}
        </section>
      ) : null}

      {/* {overview?.project ? <RevenueHeadline revenue={overview.revenue} sparkline={overview.sparkline} projectId={canonicalProjectId} /> : null} */}

      {overview?.project ? <AvailabilityStrip overview={overview} /> : null}

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total events" value={overview?.totals.events ?? 0} hint="All time" delta={activityDelta} tone={activityTone}>
          <MiniBars values={sparkValues} tone="blue" />
        </StatTile>
        <StatTile
          label="Events (24h)"
          value={overview?.totals.events24h ?? 0}
          hint="Last 24 hours"
          delta={(overview?.totals.events24h ?? 0) > 0 ? 'Live' : 'Idle'}
          tone={(overview?.totals.events24h ?? 0) > 0 ? 'green' : 'red'}
        >
          <MiniBars values={sparkValues.slice(-12)} tone={(overview?.totals.events24h ?? 0) > 0 ? 'green' : 'red'} />
        </StatTile>
        <StatTile label="Identified users" value={overview?.totals.users ?? 0} hint="People profiles" delta="profiles" tone="green">
          <Sparkline points={recentSpark} tone="green" filled className="h-11 w-full" />
        </StatTile>
        <StatTile label="Sessions" value={overview?.totals.sessions ?? 0} hint="All time" delta="active" tone="blue">
          <Sparkline points={recentSpark} tone="blue" filled className="h-11 w-full" />
        </StatTile>
      </section>

      <section className="mb-5 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className={cardClass}>
          <div className="relative flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
                Events, last 14 days
              </p>
              <p className="mt-1 text-sm text-neutral-500 dark:text-slate-300">
                {overview?.project ? overview.project.name : 'No project yet'}
              </p>
            </div>
            <a className="shrink-0 text-sm font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white" href={withProjectId("/dashboard/insights", canonicalProjectId)}>
              Open insights &rarr;
            </a>
          </div>
          <div className="relative mt-4">
            <BarChart
              items={(overview?.sparkline ?? []).map((point) => ({ label: shortBucket(point.bucket), value: point.total }))}
              tone="blue"
              showValues
              height={220}
              className="h-64 w-full"
            />
          </div>
        </div>

        <div className={cardClass}>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
            Top events (30 days)
          </p>
          <TopEventsList events={overview?.topEvents ?? []} />
        </div>
      </section>

      <section className="mb-6 grid gap-3 lg:grid-cols-2">
        <div className={cardClass}>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
            Devices (30 days)
          </p>
          <DonutChart
            items={(overview?.topDevices ?? []).map((d) => ({ label: d.name, value: d.total }))}
            centerValue={compactNumber((overview?.topDevices ?? []).reduce((sum, d) => sum + d.total, 0))}
            centerLabel="events"
            emptyLabel="No device data yet."
          />
        </div>

        <div className={cardClass}>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
            Locations (30 days)
          </p>
          <DonutChart
            items={(overview?.topCountries ?? []).map((c) => ({ label: c.name, value: c.total }))}
            centerValue={compactNumber((overview?.topCountries ?? []).reduce((sum, c) => sum + c.total, 0))}
            centerLabel="events"
            emptyLabel="No location data yet (needs public-IP traffic)."
          />
        </div>
      </section>

      {!overview?.project ? (
        <section className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-6 dark:border-slate-700 dark:bg-slate-950/80">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-white">Finish setup</h2>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-slate-400">
            Create your project and grab the SDK write key + install snippet to start capturing events.
          </p>
          <Link
            href={withProjectId("/dashboard/settings", canonicalProjectId)}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-slate-200"
          >
            Go to settings
          </Link>
        </section>
      ) : null}
    </DashboardShell>
  );
}

// function RevenueHeadline({
//   revenue,
//   sparkline,
//   projectId
// }: {
//   revenue: OverviewResponse['revenue'];
//   sparkline: OverviewResponse['sparkline'];
//   projectId?: string | null;
// }) {
//   const hasData = revenue.transactions > 0 || revenue.total !== 0;
//   const current = compactNumber(revenue.total);
//   const previous = compactNumber(revenue.previous);
//   const delta = deltaInfo(revenue.total, revenue.previous);
//   const isPositive = revenue.total >= revenue.previous;
//   const tone = delta.muted ? 'blue' : isPositive ? 'green' : 'red';

//   return (
//     <section className="relative mb-5 overflow-hidden rounded-md border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800/90 dark:bg-slate-950 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
//       <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_36%,rgba(59,130,246,0.10),transparent_32%)] dark:bg-[radial-gradient(circle_at_78%_36%,rgba(59,130,246,0.24),transparent_32%)]" />
//       <div className="relative grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(320px,1.1fr)] lg:items-end">
//         <div className="min-w-0">
//           <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
//             Revenue (GTV) - last 30 days
//           </p>
//           {hasData ? (
//             <>
//               <div className="mt-1 flex items-baseline gap-3">
//                 <span className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white">{current}</span>
//                 <span
//                   className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold ${
//                     tone === 'green'
//                       ? 'border-emerald-400/15 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300'
//                       : tone === 'red'
//                         ? 'border-red-400/15 bg-red-400/10 text-red-600 dark:text-red-300'
//                         : 'border-blue-500/10 bg-blue-500/5 text-blue-700 dark:text-blue-300'
//                   }`}
//                   title={`vs ${previous} the previous 30 days`}
//                 >
//                   {delta.label}
//                 </span>
//               </div>
//               <p className="mt-1.5 max-w-xl text-sm text-neutral-500 dark:text-slate-400">
//                 Summed from the <span className="font-mono text-neutral-700 dark:text-slate-200">amount</span> on{' '}
//                 {formatCount(revenue.transactions)} {revenue.transactions === 1 ? 'event' : 'events'} in the last 30 days.{' '}
//                 <span className="text-neutral-400 dark:text-slate-500">{comparisonText(30, revenue.previous, previous, delta)}</span>
//               </p>
//             </>
//           ) : (
//             <p className="mt-2 max-w-xl text-sm text-neutral-500 dark:text-slate-400">
//               No revenue tracked yet. Send an event with a numeric{' '}
//               <span className="font-mono text-neutral-700 dark:text-slate-200">amount</span> property and it&apos;ll add up here.
//             </p>
//           )}
//         </div>
//         <div className="min-h-28">
//           <Sparkline points={sparkline} height={92} tone={tone} filled className="h-28 w-full" />
//         </div>
//         <Link
//           className="justify-self-start text-sm font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white lg:col-start-2 lg:justify-self-end"
//           href={withProjectId("/dashboard/insights?event=purchase&measure=sum&property=amount", projectId)}
//         >
//           Break down revenue &rarr;
//         </Link>
//       </div>
//     </section>
//   );
// }

function AvailabilityStrip({ overview }: { overview: OverviewResponse }) {
  const status = availabilityStatus(overview);
  const tone =
    status === 'healthy'
      ? { dot: 'bg-emerald-500', chip: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300', label: 'Healthy' }
      : status === 'quiet'
        ? { dot: 'bg-amber-500', chip: 'border-amber-400/20 bg-amber-400/10 text-amber-700 dark:text-amber-300', label: 'Low volume' }
        : { dot: 'bg-neutral-300 dark:bg-slate-600', chip: 'border-neutral-300 bg-neutral-100 text-neutral-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400', label: 'Idle' };

  return (
    <section className="mb-5 grid gap-3 rounded-md border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:grid-cols-3">
      <div className="flex items-center gap-3">
        <span className={`size-2.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">Ingestion</p>
          <p className={`mt-0.5 inline-flex rounded px-1.5 py-0.5 text-xs font-bold ${tone.chip}`}>{tone.label}</p>
        </div>
        </div>
        <div className="sm:border-l sm:border-neutral-200 sm:pl-5 dark:sm:border-slate-800">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">Last event</p>
        <p className="mt-0.5 truncate text-sm font-semibold text-neutral-900 dark:text-white">
          {overview.lastEventAt ? lastEventAge(overview.lastEventAt) : 'No events yet'}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:border-l sm:border-neutral-200 sm:pl-5 dark:sm:border-slate-800">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">Last hour</p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-neutral-900 dark:text-white">
            {overview.totals.events1h.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">Last 24 hours</p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-neutral-900 dark:text-white">
            {overview.totals.events24h.toLocaleString()}
          </p>
        </div>
      </div>
    </section>
  );
}

type Availability = 'healthy' | 'quiet' | 'idle';

function availabilityStatus(overview: OverviewResponse): Availability {
  if (overview.totals.events24h > 0) return 'healthy';
  if (overview.totals.events > 0) return 'quiet';
  return 'idle';
}

function lastEventAge(lastEventAt: string): string {
  const ageMs = Date.now() - new Date(lastEventAt).getTime();
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return 'moments ago';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

function trendTone(values: number[]): 'blue' | 'green' | 'red' {
  if (values.length < 2) return 'blue';
  const first = values[0] || 0;
  const last = values[values.length - 1] || 0;
  if (last > first) return 'green';
  if (last < first) return 'red';
  return 'blue';
}

function trendLabel(values: number[]) {
  if (values.length < 2) return undefined;
  const first = values[0] || 0;
  const last = values[values.length - 1] || 0;
  if (first <= 0 && last > 0) return 'new';
  if (first <= 0) return 'flat';
  const change = Math.round(((last - first) / first) * 100);
  if (change === 0) return 'flat';
  return `${change > 0 ? '+' : ''}${change}%`;
}

function shortBucket(bucket: string): string {
  if (bucket.includes('T')) return bucket.split('T')[1].slice(0, 5);
  return bucket.slice(5);
}



function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function withProjectId(href: string, projectId?: string | null): string {
  if (!projectId) return href;
  const [path, hash = ''] = href.split('#');
  const [pathname, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  params.set('projectId', projectId);
  const nextQuery = params.toString();
  return `${pathname}${nextQuery ? `?${nextQuery}` : ''}${hash ? `#${hash}` : ''}`;
}
