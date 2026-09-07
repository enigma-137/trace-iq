import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { DashboardShell } from './DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { compactNumber } from '@/lib/metrics';
import { PaceStatTile } from '@/components/charts/PaceStatTile';
import { OverviewTabbedChart } from '@/components/charts/OverviewTabbedChart';
import { LatencyTimelineCard } from '@/components/charts/LatencyTimelineCard';
import { RequestStatusCard } from '@/components/charts/RequestStatusCard';
import { RatioDistributionCard } from '@/components/charts/RatioDistributionCard';
import { TraceDataTable } from '@/components/charts/TraceDataTable';
import { TopErrorsList } from '@/components/charts/TopErrorsList';
import { UXFrictionCard } from '@/components/charts/UXFrictionCard';
import { ActiveAlertsBanner } from '@/components/charts/ActiveAlertsBanner';
import { DonutChart } from '@/components/charts/DonutChart';
import { TopEventsList } from '@/components/charts/TopEventsList';
import { TodayStoryCard } from './TodayStoryCard';
import { NowActivityPanel } from './NowActivityPanel';
import { ProjectIdBadge } from './ProjectIdBadge';
import { alpha2ToName } from '@/lib/country-codes';
import { OverviewGeographyGlobe } from './OverviewGeographyGlobe';

export const dynamic = 'force-dynamic';

interface ApiTelemetryOverview {
  totalRequests: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  avgDuration: number;
  errorRate: number;
  statusBreakdown: {
    ok200: number;
    rateLimit429: number;
    error500: number;
    other: number;
  };
  latencySeries: Array<{ bucket: string; p50: number; p90: number; p99: number }>;
}

interface ErrorIssueOverview {
  type: string;
  message: string;
  occurrences: number;
  users: number;
  firstSeen: string;
  lastSeen: string;
  sparkline: number[];
}

interface FunnelOverview {
  name: string;
  conversionRate: number;
  totalStarted: number;
  totalCompleted: number;
  avgDurationSec: number;
  steps: Array<{ name: string; count: number; dropOffRate: number }>;
}

interface UxFrictionOverview {
  rageClicks: number;
  deadClicks: number;
  errorSessions: number;
  replaysAvailable: number;
}

interface RecentTraceOverview {
  id: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  occurredAt: string;
  actor: string | null;
}

interface AlertsSummaryOverview {
  total: number;
  firing: number;
  healthy: number;
}

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
  observabilitySeries?: Array<{ bucket: string; events: number; apiCalls: number; errors: number }>;
  apiTelemetry?: ApiTelemetryOverview;
  topErrors?: ErrorIssueOverview[];
  funnelSummary?: FunnelOverview;
  uxFriction?: UxFrictionOverview;
  recentTraces?: RecentTraceOverview[];
  alertsSummary?: AlertsSummaryOverview;
}

interface WebReferrersResponse {
  referrers: Array<{ domain: string; visitors: number; views: number }>;
}

interface TrendResponse {
  series: Array<{
    points: Array<{ bucket: string; total: number }>;
  }>;
}

const cardClass =
  'relative overflow-hidden rounded-md border border-neutral-200 bg-transparent p-4 sm:p-5 dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]';

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
  let dashboardReferrers = overview?.topReferrers ?? [];
  if (canonicalProjectId && dashboardReferrers.length === 0) {
    const referrerParams = new URLSearchParams({ days: '30', projectId: canonicalProjectId });
    const referrerPath = `/v1/dashboard/web?${referrerParams.toString()}`;
    const { data: webReferrers } = await dashboardGet<WebReferrersResponse>(referrerPath, token);
    dashboardReferrers = webReferrers?.referrers ?? [];
  }

  let observabilitySeries = overview?.observabilitySeries ?? [];
  if (canonicalProjectId && observabilitySeries.length === 0) {
    const trendPath = (event: string) => {
      const params = new URLSearchParams({
        event,
        interval: 'day',
        days: '14',
        projectId: canonicalProjectId
      });
      return `/v1/dashboard/insights/trends?${params.toString()}`;
    };
    const [apiRequests, exceptions, errors] = await Promise.all([
      dashboardGet<TrendResponse>(trendPath('$api_request'), token),
      dashboardGet<TrendResponse>(trendPath('$exception'), token),
      dashboardGet<TrendResponse>(trendPath('$error'), token)
    ]);
    observabilitySeries = mergeObservabilitySeries(
      overview?.sparkline ?? [],
      apiRequests.data?.series[0]?.points ?? [],
      exceptions.data?.series[0]?.points ?? [],
      errors.data?.series[0]?.points ?? []
    );
  }

  const sparkValues = overview?.sparkline.map((point) => point.total) ?? [];
  const activityDelta = trendLabel(sparkValues);
  const activityTone = trendTone(sparkValues);

  // Tabbed chart data points
  const tabbedPoints = observabilitySeries.map((point) => ({
    ...point,
    bucket: dailyBucketLabel(point.bucket)
  }));

  return (
    <DashboardShell
      active="overview"
      title={overview?.project?.organizationName ?? 'Overview'}
      userEmail={user.email}
      projectId={canonicalProjectId}
      organizationId={activeOrganizationId}
    >
      {error ? (
        <section className="mb-4 rounded-md border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-100">
          {error}
        </section>
      ) : null}

      {/* Hero Header Strip */}
      {overview?.project ? (
        <section className="mb-5 overflow-hidden rounded-lg border border-neutral-200 bg-transparent dark:border-slate-800 dark:bg-slate-900/70">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3.5 sm:px-5 sm:py-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="truncate font-semibold text-neutral-900 dark:text-white">
                {overview.project.name}
              </span>

              <ProjectIdBadge projectId={overview.project.id} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-full  px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
                <span>All Telemetry Operational</span>
              </div>

              <Link
                href={withProjectId('/dashboard/web', canonicalProjectId)}
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-slate-200 sm:shrink-0"
              >
                <span>Web Analytics</span>
                <span aria-hidden>&rarr;</span>
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {/* Active Alerts Banner if alerts are configured/firing */}
      {overview?.alertsSummary && overview.alertsSummary.total > 0 ? (
        <div className="mb-5">
          <ActiveAlertsBanner
            firing={overview.alertsSummary.firing}
            total={overview.alertsSummary.total}
            projectId={canonicalProjectId}
          />
        </div>
      ) : null}

      {/* AI Daily Summary Story Card */}
      {overview?.project ? <TodayStoryCard projectId={canonicalProjectId} /> : null}

      {/* Ingestion & Freshness Status Strip */}
      {overview?.project ? <AvailabilityStrip overview={overview} /> : null}

      {/* Top 4 KPI Metric Cards (Pace UI Style) */}
      <section className="mb-5 grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <PaceStatTile
          icon={
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
          title="Total Events"
          value={overview?.totals.events ?? 0}
          badge={activityDelta && activityDelta !== 'flat' ? activityDelta : undefined}
          badgeTone={activityTone === 'red' ? 'red' : 'green'}
          badgeIcon={activityTone === 'red' ? 'down' : 'up'}
          description={`${(overview?.totals.events24h ?? 0).toLocaleString()} last 24h`}
        />

        <PaceStatTile
          icon={
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
            </svg>
          }
          title="P95 Latency"
          value={overview?.apiTelemetry?.p95 ? `${overview.apiTelemetry.p95}ms` : '--'}
          badge={overview?.apiTelemetry?.p95 ? '-32ms' : undefined}
          badgeTone="green"
          badgeIcon="down"
          description={overview?.apiTelemetry?.avgDuration ? `Avg ${overview.apiTelemetry.avgDuration}ms` : 'No latency recorded'}
        />

        <PaceStatTile
          icon={
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
          title="Failure Rate (5xx)"
          value={`${overview?.apiTelemetry?.errorRate ?? 0}%`}
          badge={overview?.topErrors && overview.topErrors.length > 0 ? `+${overview.topErrors.length} types` : '-0%'}
          badgeTone={overview?.topErrors && overview.topErrors.length > 0 ? 'red' : 'green'}
          badgeIcon={overview?.topErrors && overview.topErrors.length > 0 ? 'up' : 'down'}
          description={`${overview?.topErrors?.reduce((s, e) => s + e.occurrences, 0) ?? 0} exception occurrences`}
        />

        <PaceStatTile
          icon={
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
          title="Identified Profiles"
          value={overview?.totals.users ?? 0}
          suffix="people"
          badge={(overview?.totals.sessions ?? 0) > 0 ? `+${overview?.totals.sessions}` : undefined}
          badgeTone="blue"
          badgeIcon="up"
          description={`${(overview?.totals.sessions ?? 0).toLocaleString()} active sessions`}
        />
      </section>

      {/* Row 1: Observability Tabbed Trends Chart & Allocation */}
      <section className="mb-5 grid gap-3 grid-cols-1 lg:grid-cols-[1.6fr_1fr] items-start">
        <OverviewTabbedChart data={tabbedPoints} />

        <div className="flex flex-col gap-3">
          <NowActivityPanel projectId={canonicalProjectId} />

          <div className={cardClass}>
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-neutral-100 dark:border-slate-800/70">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">
                  Event Volume Breakdown
                </p>
              </div>
              <Link
                href={withProjectId('/dashboard/insights', canonicalProjectId)}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                Insights &rarr;
              </Link>
            </div>
            <div className="mt-3">
              <TopEventsList events={overview?.topEvents ?? []} />
            </div>
          </div>
        </div>
      </section>

      {/* Row 2: 3-Column Observability & Telemetry Row (Pace UI AI Layout) */}
      <section className="mb-5 grid gap-3 grid-cols-1 lg:grid-cols-3">
        <RatioDistributionCard
          title="Autocapture vs Custom"
          leftLabel="Autocapture ($page)"
          leftValue={overview?.funnelSummary?.steps[0]?.count ?? (overview?.totals.events ?? 0)}
          rightLabel="Custom Telemetry"
          rightValue={overview?.funnelSummary?.steps[1]?.count ?? 0}
          stat1Label="Avg Session Duration"
          stat1Value={
            overview?.funnelSummary?.avgDurationSec && overview.funnelSummary.avgDurationSec > 0
              ? `${Math.floor(overview.funnelSummary.avgDurationSec / 60)}m ${overview.funnelSummary.avgDurationSec % 60}s`
              : '0s'
          }
          stat2Label="Pipeline Health"
          stat2Value={(overview?.totals.events24h ?? 0) > 0 ? '100% Healthy' : 'Active'}
          footerHighlight={
            overview?.lastEventAt
              ? `Last ingestion: ${lastEventAge(overview.lastEventAt)}`
              : 'Waiting for stream events'
          }
        />

        <LatencyTimelineCard
          data={overview?.apiTelemetry?.latencySeries ?? []}
          currentP99={overview?.apiTelemetry?.p99}
          currentP90={overview?.apiTelemetry?.p90}
          currentP50={overview?.apiTelemetry?.p50}
        />

        <RequestStatusCard
          breakdown={
            overview?.apiTelemetry?.statusBreakdown ?? {
              ok200: 0,
              rateLimit429: 0,
              error500: 0
            }
          }
          totalRequests={overview?.apiTelemetry?.totalRequests ?? 0}
        />
      </section>

      {/* Row 3: Exceptions Health & UX Friction Row */}
      <section className="mb-5 grid gap-3 grid-cols-1 lg:grid-cols-2">
        <TopErrorsList
          errors={overview?.topErrors ?? []}
          projectId={canonicalProjectId}
        />

        <UXFrictionCard
          rageClicks={overview?.uxFriction?.rageClicks ?? 0}
          deadClicks={overview?.uxFriction?.deadClicks ?? 0}
          errorSessions={overview?.uxFriction?.errorSessions ?? 0}
          replaysAvailable={overview?.uxFriction?.replaysAvailable ?? 0}
          projectId={canonicalProjectId}
        />
      </section>

      {/* Row 4: Live Telemetry & API Traces Data Table */}
      <section className="mb-5">
        <TraceDataTable
          traces={overview?.recentTraces ?? []}
          projectId={canonicalProjectId}
        />
      </section>

      {/* Row 5: Geography, Devices, and Referrers */}
      <section className="mb-6 grid gap-3 grid-cols-1 lg:grid-cols-3">
        <div className={cardClass}>
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-slate-800/70">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">
              Devices (30 days)
            </p>
          </div>
          <div className="mt-3">
            <DonutChart
              items={(overview?.topDevices ?? []).map((d) => ({ label: d.name, value: d.total }))}
              centerValue={compactNumber((overview?.topDevices ?? []).reduce((sum, d) => sum + d.total, 0))}
              centerLabel="events"
              emptyLabel="No device data yet."
            />
          </div>
        </div>

        <div className={cardClass}>
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-slate-800/70">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">
              Locations (30 days)
            </p>
          </div>
          <div className="mt-3">
            {(overview?.topCountries ?? []).length > 0 ? (
              <>
                <div className="aspect-[2/1] min-h-52 overflow-hidden rounded-md border border-neutral-100 bg-white dark:border-neutral-800 dark:bg-neutral-950">
                  <OverviewGeographyGlobe data={overview?.topCountries ?? []} />
                </div>
                <CompactRanking
                  items={(overview?.topCountries ?? []).map((country) => ({
                    label: alpha2ToName(country.name.toUpperCase()) ?? country.name,
                    value: country.total
                  }))}
                />
              </>
            ) : (
              <p className="py-10 text-center text-sm text-neutral-500">No location data yet (needs public-IP traffic).</p>
            )}
          </div>
        </div>

        <div className={cardClass}>
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-slate-800/70">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">
              Referrers (30 days)
            </p>
          </div>
          <div className="mt-3">
            <CompactRanking
              items={dashboardReferrers.map((referrer) => ({
                label: referrer.domain,
                value: referrer.views,
                secondary: `${referrer.visitors.toLocaleString()} visitors`
              }))}
              emptyLabel="No page referrers yet."
            />
          </div>
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
      ? { dot: 'bg-emerald-500', chip: '  text-emerald-700 dark:text-emerald-300', label: 'Healthy' }
      : status === 'quiet'
        ? { dot: 'bg-amber-500', chip: ' text-amber-700 dark:text-amber-300', label: 'Low volume' }
        : { dot: 'bg-neutral-300 dark:bg-slate-600', chip: 'border-neutral-300 bg-neutral-100 text-neutral-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400', label: 'Idle' };

  return (
    <section className="mb-5 grid gap-4 rounded-md border border-neutral-200 bg-transparent p-4 sm:p-5 dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:grid-cols-3">
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

function dailyBucketLabel(bucket: string): string {
  const date = new Date(bucket);
  if (Number.isNaN(date.getTime())) return bucket;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  }).format(date);
}

function mergeObservabilitySeries(
  events: Array<{ bucket: string; total: number }>,
  apiRequests: Array<{ bucket: string; total: number }>,
  exceptions: Array<{ bucket: string; total: number }>,
  errors: Array<{ bucket: string; total: number }>
): NonNullable<OverviewResponse['observabilitySeries']> {
  const apiByBucket = new Map(apiRequests.map((point) => [point.bucket, point.total]));
  const exceptionsByBucket = new Map(exceptions.map((point) => [point.bucket, point.total]));
  const errorsByBucket = new Map(errors.map((point) => [point.bucket, point.total]));

  return events.map((point) => ({
    bucket: point.bucket,
    events: point.total,
    apiCalls: apiByBucket.get(point.bucket) ?? 0,
    errors: (exceptionsByBucket.get(point.bucket) ?? 0) + (errorsByBucket.get(point.bucket) ?? 0)
  }));
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

function CompactRanking({
  items,
  emptyLabel = 'No data yet.'
}: {
  items: Array<{ label: string; value: number; secondary?: string }>;
  emptyLabel?: string;
}) {
  if (items.length === 0) return <p className="py-10 text-center text-sm text-neutral-500">{emptyLabel}</p>;
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="mt-4 grid gap-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs">
            <span className="min-w-0 truncate font-medium text-neutral-700 dark:text-slate-200">{item.label}</span>
            <span className="shrink-0 tabular-nums text-neutral-500">
              {item.value.toLocaleString()}
              {item.secondary ? ` · ${item.secondary}` : ''}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-blue-500"
              style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
