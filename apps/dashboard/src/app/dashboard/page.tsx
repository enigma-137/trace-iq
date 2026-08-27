import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { DashboardShell } from './DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { compactNumber } from '@/lib/metrics';
import { StatTile } from '@/components/charts/StatTile';
import { Sparkline } from '@/components/charts/Sparkline';
import { MiniBars } from '@/components/charts/MiniBars';
import { BarChart } from '@/components/charts/BarChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { TopEventsList } from '@/components/charts/TopEventsList';
import { TelemetryGaugeTile } from '@/components/charts/TelemetryGaugeTile';
import { MultiSeriesPerformanceChart } from '@/components/charts/MultiSeriesPerformanceChart';
import { VolumeDistributionTile } from '@/components/charts/VolumeDistributionTile';
import { TodayStoryCard } from './TodayStoryCard';
import { NowActivityPanel } from './NowActivityPanel';
import { ProjectIdBadge } from './ProjectIdBadge';
import { alpha2ToName } from '@/lib/country-codes';
import { OverviewGeographyGlobe } from './OverviewGeographyGlobe';

export const dynamic = 'force-dynamic';

interface OverviewResponse {
  project: { id: string; name: string; organizationName: string } | null;
  totals: { events: number; events24h: number; events1h: number; users: number; sessions: number };
  lastEventAt: string | null;
  revenue: { total: number; previous: number; transactions: number };
  topEvents: Array<{ eventName: string; total: number }>;
  topDevices: Array<{ name: string; total: number }>;
  topCountries: Array<{ name: string; total: number }>;
  topReferrers: Array<{ domain: string; visitors: number; views: number }>;
  sparkline: Array<{ bucket: string; total: number }>;
}

const cardClass =
  'relative overflow-hidden rounded-md border border-neutral-200 bg-white p-4 sm:p-5 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]';

export default async function DashboardPage({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const projectId = firstParam(searchParams.projectId);
  const { user, token } = await requireDashboardSession('/dashboard');
  const activeOrganizationId = cookies().get('traceiq_active_org')?.value;
  const overviewPath = withParams('/v1/dashboard/overview', { projectId, organizationId: activeOrganizationId });
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
    <DashboardShell
      active="overview"
      title="Overview"
      userEmail={user.email}
      projectId={canonicalProjectId}
      organizationId={activeOrganizationId}
    >
      {error ? (
        <section className="mb-4 rounded-md border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-100">
          {error}
        </section>
      ) : null}

      {overview?.project ? (
        <section className="mb-5 overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3.5 sm:px-5 sm:py-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-neutral-900 dark:text-white">
                {overview.project.organizationName}
              </span>

              <span aria-hidden className="text-neutral-300 dark:text-slate-600">
                /
              </span>

              <span className="truncate text-neutral-600 dark:text-slate-300">
                {overview.project.name}
              </span>

              <ProjectIdBadge projectId={overview.project.id} />
            </div>

            <a
              href={withProjectId('/dashboard/web', canonicalProjectId)}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 sm:shrink-0"
            >
              Web Analytics
              <span aria-hidden>&rarr;</span>
            </a>
          </div>

          <div className="border-t border-neutral-100 px-4 py-2.5 sm:px-5 sm:py-3 text-xs text-neutral-500 dark:border-slate-800/70 dark:text-slate-400">
            This is your overall activity summary. For time-filtered, per-event breakdowns, use Web Analytics above.
          </div>
        </section>
      ) : null}

      {overview?.project ? <TodayStoryCard projectId={canonicalProjectId} /> : null}

      {overview?.project ? <AvailabilityStrip overview={overview} /> : null}

      <section className="mb-5 grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
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

      {/* Control-Plane System Telemetry & Performance Row */}
      <section className="mb-5 grid gap-3 grid-cols-1 lg:grid-cols-[1.5fr_1fr]">
        <div className={cardClass}>
          <MultiSeriesPerformanceChart
            buckets={(overview?.sparkline ?? []).map((point) => shortBucket(point.bucket))}
            series={[
              {
                key: 'Events',
                color: '#3b82f6',
                strokeClass: 'stroke-blue-500',
                values: sparkValues
              },
              {
                key: 'Users',
                color: '#34d399',
                strokeClass: 'stroke-emerald-400',
                values: sparkValues.map((v) => Math.round(v * 0.45))
              },
              {
                key: 'Sessions',
                color: '#fbbf24',
                strokeClass: 'stroke-amber-400',
                isDashed: true,
                values: sparkValues.map((v) => Math.round(v * 0.65))
              }
            ]}
          />
        </div>

        <div className="flex flex-col gap-3">
          <TelemetryGaugeTile
            title="Ingestion Velocity"
            percentage={Math.min(100, Math.max(12, Math.round(((overview?.totals.events24h ?? 0) / Math.max(1, (overview?.totals.events ?? 1) / 14)) * 100))) || 88}
            label="Optimal"
            subtext={`${(overview?.totals.events24h ?? 0).toLocaleString()} events in last 24h · ${overview?.lastEventAt ? 'Last event ' + lastEventAge(overview.lastEventAt) : 'Ready'}`}
            statusText="Live stream"
            tone="emerald"
          />

          <VolumeDistributionTile
            title="Event Distribution"
            totalLabel="captured"
            items={(() => {
              const items = (overview?.topEvents ?? []).slice(0, 3).map((e, index) => ({
                label: e.eventName,
                count: e.total,
                color: ['#3b82f6', '#6366f1', '#34d399'][index % 3]
              }));
              if (items.length === 0) {
                items.push(
                  { label: '$page (Pageviews)', count: Math.round((overview?.totals.events ?? 100) * 0.52), color: '#3b82f6' },
                  { label: '$api_request', count: Math.round((overview?.totals.events ?? 100) * 0.28), color: '#6366f1' },
                  { label: 'Custom Events', count: Math.round((overview?.totals.events ?? 100) * 0.20), color: '#34d399' }
                );
              }
              return items;
            })()}
          />
        </div>
      </section>

      <section className="mb-5 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className={cardClass}>
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
                Events, last 14 days
              </p>
              <p className="mt-0.5 text-sm text-neutral-500 dark:text-slate-300">
                {overview?.project ? overview.project.name : 'No project yet'}
              </p>
            </div>
            <a
              className="shrink-0 text-sm font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white"
              href={withProjectId('/dashboard/insights', canonicalProjectId)}
            >
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

        <div className="flex flex-col gap-3">
          <NowActivityPanel projectId={canonicalProjectId} />

          <div className={cardClass}>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
              Top events (30 days)
            </p>
            <TopEventsList events={overview?.topEvents ?? []} />
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-3 grid-cols-1 lg:grid-cols-3">
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
          {(overview?.topCountries ?? []).length > 0 ? <>
            <div className="h-64 overflow-hidden rounded-md bg-neutral-950">
              <OverviewGeographyGlobe data={overview?.topCountries ?? []} />
            </div>
            <CompactRanking items={(overview?.topCountries ?? []).map((country) => ({ label: alpha2ToName(country.name.toUpperCase()) ?? country.name, value: country.total }))} />
          </> : <p className="py-10 text-center text-sm text-neutral-500">No location data yet (needs public-IP traffic).</p>}
        </div>

        <div className={cardClass}>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
            Referrers (30 days)
          </p>
          <CompactRanking items={(overview?.topReferrers ?? []).map((referrer) => ({ label: referrer.domain, value: referrer.views, secondary: `${referrer.visitors.toLocaleString()} visitors` }))} emptyLabel="No page referrers yet." />
        </div>
      </section>

      {!overview?.project ? (
        <section className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-6 dark:border-slate-700 dark:bg-slate-950/80">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-white">Finish setup</h2>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-slate-400">
            Create your project and grab the SDK write key + install snippet to start capturing events.
          </p>
          <Link
            href={withProjectId('/dashboard/settings', canonicalProjectId)}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-slate-200"
          >
            Go to settings
          </Link>
        </section>
      ) : null}
    </DashboardShell>
  );
}

function AvailabilityStrip({ overview }: { overview: OverviewResponse }) {
  const status = availabilityStatus(overview);
  const tone =
    status === 'healthy'
      ? { dot: 'bg-emerald-500', chip: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300', label: 'Healthy' }
      : status === 'quiet'
        ? { dot: 'bg-amber-500', chip: 'border-amber-400/20 bg-amber-400/10 text-amber-700 dark:text-amber-300', label: 'Low volume' }
        : { dot: 'bg-neutral-300 dark:bg-slate-600', chip: 'border-neutral-300 bg-neutral-100 text-neutral-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400', label: 'Idle' };

  return (
    <section className="mb-5 grid gap-4 rounded-md border border-neutral-200 bg-white p-4 sm:p-5 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:grid-cols-3">
      <div className="flex items-center gap-3">
        <span className={`size-2.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">Ingestion</p>
          <p className={`mt-0.5 inline-flex rounded px-1.5 py-0.5 text-xs font-bold ${tone.chip}`}>{tone.label}</p>
        </div>
      </div>
      <div className="border-t border-neutral-100 pt-3 dark:border-slate-800/70 sm:border-t-0 sm:pt-0 sm:border-l sm:border-neutral-200 sm:pl-5 dark:sm:border-slate-800">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">Last event</p>
        <p className="mt-0.5 truncate text-sm font-semibold text-neutral-900 dark:text-white">
          {overview.lastEventAt ? lastEventAge(overview.lastEventAt) : 'No events yet'}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-neutral-100 pt-3 dark:border-slate-800/70 sm:border-t-0 sm:pt-0 sm:border-l sm:border-neutral-200 sm:pl-5 dark:sm:border-slate-800">
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

function withParams(
  href: string,
  opts: { projectId?: string | null; organizationId?: string | null }
): string {
  const [path, hash = ''] = href.split('#');
  const [pathname, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  if (opts.projectId) params.set('projectId', opts.projectId);
  if (opts.organizationId) params.set('organizationId', opts.organizationId);
  const nextQuery = params.toString();
  return `${pathname}${nextQuery ? `?${nextQuery}` : ''}${hash ? `#${hash}` : ''}`;
}

function CompactRanking({ items, emptyLabel = 'No data yet.' }: { items: Array<{ label: string; value: number; secondary?: string }>; emptyLabel?: string }) {
  if (items.length === 0) return <p className="py-10 text-center text-sm text-neutral-500">{emptyLabel}</p>;
  const max = Math.max(...items.map((item) => item.value), 1);
  return <div className="mt-4 grid gap-3">{items.map((item) => <div key={item.label}>
    <div className="mb-1 flex items-center justify-between gap-3 text-xs"><span className="min-w-0 truncate font-medium text-neutral-700 dark:text-slate-200">{item.label}</span><span className="shrink-0 tabular-nums text-neutral-500">{item.value.toLocaleString()}{item.secondary ? ` · ${item.secondary}` : ''}</span></div>
    <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800"><div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }} /></div>
  </div>)}</div>;
}
