import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { HugeiconsIcon } from '@hugeicons/react';
import Alert02Icon from '@hugeicons/core-free-icons/Alert02Icon';
import Clock03Icon from '@hugeicons/core-free-icons/Clock03Icon';
import UserMultiple02Icon from '@hugeicons/core-free-icons/UserMultiple02Icon';
import Activity01Icon from '@hugeicons/core-free-icons/Activity01Icon';
import DashboardSpeed01Icon from '@hugeicons/core-free-icons/DashboardSpeed01Icon';
import { DashboardShell } from './DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { compactNumber } from '@/lib/metrics';
import { OverviewMetricCard } from '@/components/charts/OverviewMetricCard';
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
import { RecentLogsPanel } from './RecentLogsPanel';
import { alpha2ToName } from '@/lib/country-codes';
import { OverviewGeographyGlobe } from './OverviewGeographyGlobe';
import { PageBanner } from '@/components/PageBanner';

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
  'relative overflow-hidden rounded-xl border border-neutral-200 bg-white p-4 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-slate-950';

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
  // Fallbacks for older APIs that omit these fields; fetched together, not in turn.
  const needsReferrers = Boolean(canonicalProjectId) && (overview?.topReferrers ?? []).length === 0;
  const needsObservability = Boolean(canonicalProjectId) && (overview?.observabilitySeries ?? []).length === 0;
  const [dashboardReferrers, observabilitySeries] = await Promise.all([
    needsReferrers ? loadReferrers(canonicalProjectId!, token) : Promise.resolve(overview?.topReferrers ?? []),
    needsObservability
      ? loadObservabilitySeries(canonicalProjectId!, token, overview?.sparkline ?? [])
      : Promise.resolve(overview?.observabilitySeries ?? [])
  ]);

  const sparkValues = overview?.sparkline.map((point) => point.total) ?? [];
  const activityDelta = trendLabel(sparkValues);
  const activityTone = trendTone(sparkValues);

  // Tabbed chart data points
  const tabbedPoints = observabilitySeries.map((point) => ({
    ...point,
    bucket: dailyBucketLabel(point.bucket)
  }));

  // Sparkline data arrays for KPI cards - purely from API response without hardcoded numbers
  const latencySparkline = overview?.apiTelemetry?.latencySeries?.map((p) => p.p90) ?? [];
  const errorSparkline = observabilitySeries.map((p) => p.errors ?? 0);
  const usersSparkline: number[] = [];
  const apiSparkline = observabilitySeries.map((p) => p.apiCalls ?? 0);

  return (
    <DashboardShell
      active="overview"
      organizationName={overview?.project?.organizationName ?? 'Overview'}
      projectName={overview?.project?.name ?? null}
      projectId={canonicalProjectId}
      organizationId={activeOrganizationId}
      alertsSummary={overview?.alertsSummary ?? null}
      userEmail={user.email}
    >
      {/* Centered layout container */}
      <div className="max-w-[1360px] mx-auto w-full space-y-5 sm:space-y-6">
        {error ? (
          <section className="rounded-lg border border-red-200 bg-red-50/80 px-4 py-3 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </section>
        ) : null}

        {/* Active Alerts Banner if alerts are firing */}
        {overview?.alertsSummary && overview.alertsSummary.firing > 0 ? (
          <div>
            <ActiveAlertsBanner
              firing={overview.alertsSummary.firing}
              total={overview.alertsSummary.total}
              projectId={canonicalProjectId}
            />
          </div>
        ) : null}

        {/* Lightweight Onboarding Setup Reminder (disappears after first event is received) */}
        {overview?.project && (!overview.totals.events || overview.totals.events === 0) ? (
          <PageBanner
            variant="accent"
            badge="Setup Required"
            title={`Connect ${overview.project.name} to TraceIQ`}
            description="No events have been received from this project yet. Install the lightweight SDK snippet or CLI to start streaming live telemetry and unlock dashboards."
            illustrationSrc="/dashboards/banner-connect-project.png"
            illustrationAlt="Connect Project Artwork"
            primaryAction={{
              label: 'Set up tracking →',
              href: `/dashboard/setup?projectId=${encodeURIComponent(canonicalProjectId!)}`
            }}
            secondaryAction={{
              label: 'SDK Documentation',
              href: '/docs'
            }}
          />
        ) : null}

        {/* Highlighted Insight Banner: Today's Story */}
        {overview?.project ? <TodayStoryCard projectId={canonicalProjectId} /> : null}

        {/* 5 KPI Metric Cards (Dynamic values only, '-' or 0 fallback) */}
        <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <OverviewMetricCard
            icon={<HugeiconsIcon icon={Activity01Icon} size={16} strokeWidth={1.8} />}
            title="Total Events"
            value={overview?.totals.events ?? 0}
            delta={activityDelta && activityDelta !== 'flat' ? activityDelta : undefined}
            deltaTone={activityTone === 'red' ? 'red' : 'green'}
            deltaDirection={activityTone === 'red' ? 'down' : 'up'}
            deltaSubtext={overview?.totals.events24h !== undefined && overview.totals.events24h > 0 ? `${overview.totals.events24h.toLocaleString()} last 24h` : undefined}
            color="blue"
            sparklineData={sparkValues}
          />

          <OverviewMetricCard
            icon={<HugeiconsIcon icon={Clock03Icon} size={16} strokeWidth={1.8} />}
            title="P95 Latency"
            value={overview?.apiTelemetry?.p95 !== undefined && overview.apiTelemetry.p95 > 0 ? `${overview.apiTelemetry.p95.toLocaleString()} ms` : '-'}
            delta={overview?.apiTelemetry?.avgDuration ? `Avg ${overview.apiTelemetry.avgDuration} ms` : undefined}
            deltaTone="neutral"
            deltaDirection="up"
            color="emerald"
            sparklineData={latencySparkline}
          />

          <OverviewMetricCard
            icon={<HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={1.8} />}
            title="Failure Rate"
            value={overview?.apiTelemetry?.errorRate !== undefined ? `${overview.apiTelemetry.errorRate}%` : '0%'}
            delta={overview?.topErrors && overview.topErrors.length > 0 ? `${overview.topErrors.length} types` : undefined}
            deltaTone={overview?.topErrors && overview.topErrors.length > 0 ? 'red' : 'neutral'}
            deltaDirection={overview?.topErrors && overview.topErrors.length > 0 ? 'up' : undefined}
            deltaSubtext={overview?.topErrors && overview.topErrors.length > 0 ? `${overview.topErrors.reduce((s, e) => s + e.occurrences, 0)} occurrences` : undefined}
            color="rose"
            sparklineData={errorSparkline}
          />

          <OverviewMetricCard
            icon={<HugeiconsIcon icon={UserMultiple02Icon} size={16} strokeWidth={1.8} />}
            title="Identified Profiles"
            value={overview?.totals.users ?? 0}
            delta={overview?.totals.sessions ? `${overview.totals.sessions.toLocaleString()} sessions` : undefined}
            deltaTone="blue"
            deltaDirection="up"
            deltaSubtext={overview?.totals.sessions ? 'active sessions' : undefined}
            color="purple"
            sparklineData={usersSparkline}
          />

          <OverviewMetricCard
            icon={<HugeiconsIcon icon={DashboardSpeed01Icon} size={16} strokeWidth={1.8} />}
            title="API Requests"
            value={overview?.apiTelemetry?.totalRequests ?? (overview?.totals.events24h ?? 0)}
            delta={overview?.totals.events1h ? `${overview.totals.events1h.toLocaleString()} in 1h` : undefined}
            deltaTone="neutral"
            deltaDirection="up"
            color="cyan"
            sparklineData={apiSparkline}
          />
        </section>

        {/* Row 1: Observability Tabbed Trends Chart & Allocation */}
        <section className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.65fr_1fr]">
          <div className="flex min-w-0 flex-col gap-4">
            <OverviewTabbedChart data={tabbedPoints} />
            <RecentLogsPanel projectId={canonicalProjectId} />
          </div>

          <div className="flex flex-col gap-4">
            <NowActivityPanel projectId={canonicalProjectId} />

            <div className={cardClass}>
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-neutral-100 dark:border-slate-800/70">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">
                  Event Volume Breakdown
                </p>
                <Link
                  href={withProjectId('/dashboard/events', canonicalProjectId)}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  View all events &rarr;
                </Link>
              </div>
              <div className="mt-3">
                <TopEventsList events={overview?.topEvents ?? []} />
              </div>
            </div>
          </div>
        </section>

        {/* Row 2: Observability & Telemetry Row */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
        <section>
          <TraceDataTable
            traces={overview?.recentTraces ?? []}
            projectId={canonicalProjectId}
          />
        </section>

        {/* Row 5: Geography, Devices, and Referrers */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
          <section className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-6 dark:border-slate-700 dark:bg-slate-950/80">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">Finish setup</h2>
            <p className="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-slate-400">
              Create your project and grab the SDK write key + install snippet to start capturing events.
            </p>
            <Link
              href={withProjectId('/dashboard/settings', canonicalProjectId)}
              className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-slate-200"
            >
              Configure SDK
            </Link>
          </section>
        ) : null}
      </div>
    </DashboardShell>
  );
}

async function loadReferrers(projectId: string, token: string | null) {
  const referrerParams = new URLSearchParams({ days: '30', projectId });
  const referrerPath = `/v1/dashboard/web?${referrerParams.toString()}`;
  const { data: webReferrers } = await dashboardGet<WebReferrersResponse>(referrerPath, token);
  return webReferrers?.referrers ?? [];
}

async function loadObservabilitySeries(
  projectId: string,
  token: string | null,
  sparkline: Array<{ bucket: string; total: number }>
) {
  const trendPath = (event: string) => {
    const params = new URLSearchParams({
      event,
      interval: 'day',
      days: '14',
      projectId
    });
    return `/v1/dashboard/insights/trends?${params.toString()}`;
  };
  const [apiRequests, exceptions, errors] = await Promise.all([
    dashboardGet<TrendResponse>(trendPath('$api_request'), token),
    dashboardGet<TrendResponse>(trendPath('$exception'), token),
    dashboardGet<TrendResponse>(trendPath('$error'), token)
  ]);
  return mergeObservabilitySeries(
    sparkline,
    apiRequests.data?.series[0]?.points ?? [],
    exceptions.data?.series[0]?.points ?? [],
    errors.data?.series[0]?.points ?? []
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function withParams(path: string, params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}

function withProjectId(path: string, projectId?: string | null): string {
  if (!projectId) return path;
  return `${path}?projectId=${encodeURIComponent(projectId)}`;
}

function CompactRanking({
  items,
  emptyLabel = 'No data yet.'
}: {
  items: Array<{ label: string; value: number; secondary?: string }>;
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-xs text-neutral-500">{emptyLabel}</p>;
  }

  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <ul className="divide-y divide-neutral-100 dark:divide-slate-800/60">
      {items.slice(0, 5).map((item) => (
        <li key={item.label} className="py-2">
          <div className="flex items-center justify-between text-xs">
            <span className="truncate font-medium text-neutral-700 dark:text-slate-200">{item.label}</span>
            <div className="flex items-center gap-2">
              {item.secondary ? (
                <span className="text-[11px] text-neutral-400 dark:text-slate-500">{item.secondary}</span>
              ) : null}
              <span className="font-mono text-neutral-500 dark:text-slate-400">{item.value.toLocaleString()}</span>
            </div>
          </div>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-blue-600"
              style={{ width: `${Math.min(100, Math.round((item.value / max) * 100))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function dailyBucketLabel(bucket: string): string {
  if (!bucket) return '';
  const date = new Date(bucket);
  if (Number.isNaN(date.getTime())) return bucket;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function lastEventAge(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function trendLabel(sparkline: number[]): string {
  if (sparkline.length < 2) return 'flat';
  const first = sparkline[0];
  const last = sparkline[sparkline.length - 1];
  if (first === 0 && last === 0) return 'flat';
  if (first === 0) return '+100%';
  const diff = Math.round(((last - first) / first) * 100);
  if (diff === 0) return 'flat';
  return diff > 0 ? `+${diff}%` : `${diff}%`;
}

function trendTone(sparkline: number[]): 'green' | 'red' | 'neutral' {
  if (sparkline.length < 2) return 'neutral';
  const first = sparkline[0];
  const last = sparkline[sparkline.length - 1];
  if (last > first) return 'green';
  if (last < first) return 'red';
  return 'neutral';
}

function mergeObservabilitySeries(
  sparkline: Array<{ bucket: string; total: number }>,
  apiPoints: Array<{ bucket: string; total: number }>,
  exceptionPoints: Array<{ bucket: string; total: number }>,
  errorPoints: Array<{ bucket: string; total: number }>
) {
  const map = new Map<string, { events: number; apiCalls: number; errors: number }>();

  for (const point of sparkline) {
    map.set(point.bucket, { events: point.total, apiCalls: 0, errors: 0 });
  }

  for (const point of apiPoints) {
    const existing = map.get(point.bucket) ?? { events: 0, apiCalls: 0, errors: 0 };
    existing.apiCalls = point.total;
    map.set(point.bucket, existing);
  }

  for (const point of [...exceptionPoints, ...errorPoints]) {
    const existing = map.get(point.bucket) ?? { events: 0, apiCalls: 0, errors: 0 };
    existing.errors += point.total;
    map.set(point.bucket, existing);
  }

  return Array.from(map.entries())
    .map(([bucket, values]) => ({ bucket, ...values }))
    .sort((a, b) => new Date(a.bucket).getTime() - new Date(b.bucket).getTime());
}
