import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { HugeiconsIcon } from '@hugeicons/react';
import Alert02Icon from '@hugeicons/core-free-icons/Alert02Icon';
import Clock03Icon from '@hugeicons/core-free-icons/Clock03Icon';
import UserMultiple02Icon from '@hugeicons/core-free-icons/UserMultiple02Icon';
import Activity01Icon from '@hugeicons/core-free-icons/Activity01Icon';
import DashboardSpeed01Icon from '@hugeicons/core-free-icons/DashboardSpeed01Icon';
import Coins01Icon from '@hugeicons/core-free-icons/Coins01Icon';
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
import { comparisonRanges, snapshotLabels, type MetricComparison } from '@/components/charts/ComparisonHoverCard';
import { percentChange } from '@/components/dashboard/DashCard';
import { DEFAULT_FILTERS, filtersToSearch } from '@/lib/requests';
import { BrandIcon } from '@/components/icons/BrandIcon';
import { CountryFlag } from '@/components/icons/CountryFlag';

export const dynamic = 'force-dynamic';

interface ApiTelemetryOverview {
  totalRequests: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  avgDuration: number;
  errorRate: number;
  /** 4xx and 5xx responses. Missing from APIs older than the field. */
  failedRequests?: number;
  serverErrors?: number;
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

type OverviewRange = '24h' | '7d' | '30d';

const OVERVIEW_RANGES: Array<{ value: OverviewRange; label: string; long: string; adjective: string; days: number }> = [
  { value: '24h', label: '24h', long: '24 hours', adjective: '24-hour', days: 1 },
  { value: '7d', label: '7 days', long: '7 days', adjective: '7-day', days: 7 },
  { value: '30d', label: '30 days', long: '30 days', adjective: '30-day', days: 30 }
];

function parseRange(value: string | undefined): OverviewRange {
  return OVERVIEW_RANGES.some((range) => range.value === value) ? (value as OverviewRange) : '7d';
}

interface OverviewResponse {
  project: { id: string; name: string; organizationName: string } | null;
  /** Window the API applied. Older APIs omit it and use fixed 14/30-day windows. */
  range?: OverviewRange;
  totals: { events: number; events24h: number; events1h: number; users: number; sessions: number };
  /** Counts for the window before `range`. Older APIs omit it. */
  previousTotals?: {
    events: number;
    sessions: number;
    /** Fields below arrived later; an API from before them omits them. */
    users?: number;
    apiRequests?: number;
    failedRequests?: number;
    serverErrors?: number;
    errorRate?: number;
    p95?: number;
  };
  lastEventAt: string | null;
  // Null until revenue tracking is set up in Settings → Revenue.
  revenue: { total: number; previous: number; transactions: number; failed: number; currency: string } | null;
  topEvents: Array<{ eventName: string; total: number }>;
  topDevices: Array<{ name: string; total: number }>;
  topCountries: Array<{ name: string; total: number }>;
  topReferrers: Array<{ domain: string; visitors: number; views: number }>;
  sparkline: Array<{ bucket: string; total: number }>;
  observabilitySeries?: Array<{ bucket: string; events: number; apiCalls: number; failedRequests?: number; errors: number }>;
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
  'relative overflow-hidden rounded-xl border border-neutral-200 bg-white p-4 sm:p-5 shadow-xs dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]';

export default async function DashboardPage({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const projectId = firstParam(searchParams.projectId);
  const range = parseRange(firstParam(searchParams.range));
  const { user, token } = await requireDashboardSession('/dashboard');
  const activeOrganizationId = cookies().get('traceiq_active_org')?.value;
  const overviewPath = withParams('/v1/dashboard/overview', { projectId, organizationId: activeOrganizationId, range });
  let { data: overview, error } = await dashboardGet<OverviewResponse>(overviewPath, token);

  // A projectId the user can't open (a stale link or a deleted project): fall back to
  // their default project, or to the no-project state when they have none.
  if (projectId && !overview) {
    const fallback = await dashboardGet<OverviewResponse>(
      withParams('/v1/dashboard/overview', { organizationId: activeOrganizationId, range }),
      token
    );
    if (fallback.data) {
      overview = fallback.data;
      error = null;
    }
  }

  if (overview?.project?.id && overview.project.id !== projectId) {
    redirect(withParams('/dashboard', { projectId: overview.project.id, range: searchParams.range ? range : undefined }));
  }

  // Label cards with the window the API actually applied; an API that predates
  // ranges keeps its old fixed windows, so its labels stay as they were.
  const appliedRange = OVERVIEW_RANGES.find((option) => option.value === overview?.range);
  const windowLabel = appliedRange?.long ?? '30 days';
  const rangeDays = appliedRange?.days ?? 14;

  const hasNoProject = Boolean(overview) && !overview?.project;
  const canonicalProjectId = overview?.project?.id ?? (hasNoProject ? undefined : projectId);
  // Fallbacks for older APIs that omit these fields; fetched together, not in turn.
  const needsReferrers = Boolean(canonicalProjectId) && (overview?.topReferrers ?? []).length === 0;
  const needsObservability = Boolean(canonicalProjectId) && (overview?.observabilitySeries ?? []).length === 0;
  const [dashboardReferrers, observabilitySeries] = await Promise.all([
    needsReferrers ? loadReferrers(canonicalProjectId!, token, appliedRange?.days ?? 30) : Promise.resolve(overview?.topReferrers ?? []),
    needsObservability
      ? loadObservabilitySeries(canonicalProjectId!, token, overview?.sparkline ?? [], rangeDays)
      : Promise.resolve(overview?.observabilitySeries ?? [])
  ]);

  const sparkValues = overview?.sparkline.map((point) => point.total) ?? [];
  // Compare with the previous window when the API reports it; older APIs only
  // give the sparkline, so fall back to its first-vs-last trend.
  const previousTotals = appliedRange ? overview?.previousTotals : undefined;
  const eventsChange = previousTotals ? percentChange(overview?.totals.events, previousTotals.events) : null;
  const activityDelta = previousTotals ? (eventsChange === null ? undefined : signedPercent(eventsChange)) : trendLabel(sparkValues);
  const activityTone = previousTotals ? (eventsChange === null || Math.round(eventsChange) === 0 ? 'neutral' : eventsChange > 0 ? 'green' : 'red') : trendTone(sparkValues);
  const now = new Date();
  const ranges = appliedRange ? comparisonRanges(now, appliedRange.days) : null;
  // One card per metric the API sent a previous value for.
  const compare = (
    current: number | undefined,
    previous: number | undefined,
    format: (value: number) => string,
    options: { invert?: boolean; labels?: { previousLabel: string; currentLabel: string } } = {}
  ): MetricComparison | undefined =>
    current === undefined || previous === undefined || !ranges
      ? undefined
      : { previous: format(previous), current: format(current), ...(options.labels ?? ranges), change: percentChange(current, previous), invert: options.invert };
  // The card's headline delta: % change against the previous window, colored by
  // whether that direction is good. Undefined when the API sent no previous value.
  const changeDelta = (current: number | undefined, previous: number | undefined, invert = false) => {
    if (current === undefined || previous === undefined || !ranges) return undefined;
    const change = percentChange(current, previous);
    if (change === null) return undefined;
    const rounded = Math.round(change);
    return {
      delta: signedPercent(change) === 'flat' ? '0%' : signedPercent(change),
      deltaTone: rounded === 0 ? ('neutral' as const) : (invert ? rounded < 0 : rounded > 0) ? ('green' as const) : ('red' as const),
      deltaDirection: rounded < 0 ? ('down' as const) : ('up' as const)
    };
  };
  const ms = (value: number) => (value > 0 ? `${value.toLocaleString()} ms` : '–');
  const pct = (value: number) => `${value}%`;
  const count = (value: number) => value.toLocaleString();
  const eventsComparison = compare(overview?.totals.events ?? 0, previousTotals?.events, count);

  // Tabbed chart data points
  const hourly = appliedRange?.value === '24h';
  const tabbedPoints = observabilitySeries.map((point) => ({
    ...point,
    label: pointLabel(point.bucket, hourly),
    links: canonicalProjectId ? bucketLinks(point.bucket, hourly, canonicalProjectId) : undefined,
    bucket: hourly ? hourlyBucketLabel(point.bucket) : dailyBucketLabel(point.bucket)
  }));

  // Sparkline data arrays for KPI cards - purely from API response without hardcoded numbers
  const latencySparkline = overview?.apiTelemetry?.latencySeries?.map((p) => p.p90) ?? [];
  const failedSparkline = observabilitySeries.map((p) => ('failedRequests' in p ? Number(p.failedRequests ?? 0) : 0));
  const failedRequests = overview?.apiTelemetry?.failedRequests;
  const serverErrors = overview?.apiTelemetry?.serverErrors ?? 0;
  const usersSparkline: number[] = [];
  const apiSparkline = observabilitySeries.map((p) => p.apiCalls ?? 0);
  // The project's chosen successful-payment events; the card only shows once revenue is set up.
  // An API from before revenue settings sends no currency; treat that as not set up.
  const revenue = overview?.revenue?.currency ? overview.revenue : null;
  const revenuePrevious = previousTotals ? revenue?.previous : undefined;
  const showRevenue = revenue !== null;
  const revenuePayments = revenue
    ? `${revenue.transactions.toLocaleString()} paid${revenue.failed ? ` · ${revenue.failed.toLocaleString()} failed` : ''}`
    : '';

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

        {hasNoProject ? (
          <PageBanner
            variant="accent"
            badge="Get started"
            title="Create your first project"
            description="You don't have a project yet. The setup wizard creates one, gives you the write key for the SDK, and checks that your first event arrives. This overview fills in as soon as it does."
            illustrationSrc="/dashboards/banner-connect-project.png"
            illustrationAlt="Connect Project Artwork"
            primaryAction={{
              label: 'Open setup wizard →',
              href: '/dashboard/setup'
            }}
            secondaryAction={{
              label: 'Read the setup guide',
              href: '/docs?page=quickstart'
            }}
          />
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
        {overview?.project && !overview.lastEventAt ? (
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

        {overview?.project ? (
          <nav aria-label="Time range" className="flex items-center justify-end gap-2">
            <span className="text-xs text-neutral-500 dark:text-slate-400">Showing</span>
            <div className="inline-flex rounded-lg border border-neutral-200 bg-white p-0.5 dark:border-slate-800 dark:bg-slate-950">
              {OVERVIEW_RANGES.map((option) => (
                <Link
                  key={option.value}
                  href={withParams('/dashboard', { projectId: canonicalProjectId ?? undefined, range: option.value })}
                  aria-current={option.value === range ? 'page' : undefined}
                  prefetch={false}
                  className={
                    option.value === range
                      ? 'rounded-md bg-neutral-900 px-3 py-1 text-xs font-semibold text-white dark:bg-white dark:text-slate-950'
                      : 'rounded-md px-3 py-1 text-xs font-medium text-neutral-600 transition hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
                  }
                >
                  {option.label}
                </Link>
              ))}
            </div>
          </nav>
        ) : null}

        {/* 5 KPI Metric Cards, plus Revenue when set up (Dynamic values only, '-' or 0 fallback) */}
        <section
          className={`grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 ${showRevenue ? '2xl:grid-cols-6' : 'xl:grid-cols-5'}`}
        >
          <OverviewMetricCard
            icon={<HugeiconsIcon icon={Activity01Icon} size={16} strokeWidth={1.8} />}
            title={appliedRange ? `Events (${appliedRange.label})` : 'Total Events'}
            value={overview?.totals.events ?? 0}
            delta={activityDelta && activityDelta !== 'flat' ? activityDelta : undefined}
            deltaTone={activityTone === 'red' ? 'red' : activityTone === 'neutral' && previousTotals ? 'neutral' : 'green'}
            deltaDirection={activityTone === 'red' ? 'down' : 'up'}
            deltaSubtext={
              previousTotals
                ? `vs previous ${appliedRange?.long ?? ''}`
                : appliedRange?.value !== '24h' && overview?.totals.events24h
                  ? `${overview.totals.events24h.toLocaleString()} last 24h`
                  : undefined
            }
            comparison={eventsComparison}
            color="blue"
            sparklineData={sparkValues}
          />

          <OverviewMetricCard
            icon={<HugeiconsIcon icon={Clock03Icon} size={16} strokeWidth={1.8} />}
            title="P95 Latency"
            value={overview?.apiTelemetry?.p95 !== undefined && overview.apiTelemetry.p95 > 0 ? `${overview.apiTelemetry.p95.toLocaleString()} ms` : '-'}
            {...(changeDelta(overview?.apiTelemetry?.p95, previousTotals?.p95, true) ?? {
              delta: overview?.apiTelemetry?.p50 ? `Median ${overview.apiTelemetry.p50.toLocaleString()} ms` : undefined,
              deltaTone: 'neutral' as const,
              deltaDirection: 'up' as const
            })}
            deltaSubtext={
              changeDelta(overview?.apiTelemetry?.p95, previousTotals?.p95) && overview?.apiTelemetry?.p50
                ? `median ${overview.apiTelemetry.p50.toLocaleString()} ms`
                : undefined
            }
            color="emerald"
            sparklineData={latencySparkline}
            comparison={compare(overview?.apiTelemetry?.p95, previousTotals?.p95, ms, { invert: true })}
          />

          <OverviewMetricCard
            icon={<HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={1.8} />}
            title="Failure Rate"
            value={overview?.apiTelemetry?.errorRate !== undefined ? `${overview.apiTelemetry.errorRate}%` : '0%'}
            {...(changeDelta(overview?.apiTelemetry?.errorRate, previousTotals?.errorRate, true) ?? {
              delta: failedRequests !== undefined ? `${failedRequests.toLocaleString()} failed` : undefined,
              deltaTone: failedRequests ? ('red' as const) : ('neutral' as const),
              deltaDirection: failedRequests ? ('up' as const) : undefined
            })}
            deltaSubtext={
              failedRequests === undefined
                ? undefined
                : changeDelta(overview?.apiTelemetry?.errorRate, previousTotals?.errorRate)
                  ? `${failedRequests.toLocaleString()} failed · ${serverErrors.toLocaleString()} 5xx`
                  : `${serverErrors.toLocaleString()} server errors (5xx)`
            }
            color="rose"
            sparklineData={failedSparkline}
            comparison={compare(overview?.apiTelemetry?.errorRate, previousTotals?.errorRate, pct, { invert: true })}
          />

          <OverviewMetricCard
            icon={<HugeiconsIcon icon={UserMultiple02Icon} size={16} strokeWidth={1.8} />}
            title="Identified Profiles"
            value={overview?.totals.users ?? 0}
            {...(changeDelta(overview?.totals.users, previousTotals?.users) ?? {
              delta: overview?.totals.sessions ? `${overview.totals.sessions.toLocaleString()} sessions` : undefined,
              deltaTone: 'blue' as const,
              deltaDirection: 'up' as const
            })}
            deltaSubtext={
              overview?.totals.sessions
                ? changeDelta(overview?.totals.users, previousTotals?.users)
                  ? `${overview.totals.sessions.toLocaleString()} sessions`
                  : 'active sessions'
                : undefined
            }
            color="purple"
            sparklineData={usersSparkline}
            comparison={
              appliedRange
                ? compare(overview?.totals.users, previousTotals?.users, count, { labels: snapshotLabels(now, appliedRange.days) })
                : undefined
            }
            comparisonAlign="right"
          />

          <OverviewMetricCard
            icon={<HugeiconsIcon icon={DashboardSpeed01Icon} size={16} strokeWidth={1.8} />}
            title="API Requests"
            value={overview?.apiTelemetry?.totalRequests ?? (overview?.totals.events24h ?? 0)}
            {...(changeDelta(overview?.apiTelemetry?.totalRequests, previousTotals?.apiRequests) ?? {
              delta: overview?.totals.events1h ? `${overview.totals.events1h.toLocaleString()} in 1h` : undefined,
              deltaTone: 'neutral' as const,
              deltaDirection: 'up' as const
            })}
            deltaSubtext={changeDelta(overview?.apiTelemetry?.totalRequests, previousTotals?.apiRequests) ? `vs previous ${appliedRange?.long ?? ''}` : undefined}
            color="cyan"
            sparklineData={apiSparkline}
            comparison={compare(overview?.apiTelemetry?.totalRequests, previousTotals?.apiRequests, count)}
            comparisonAlign="right"
          />

          {showRevenue && revenue ? (
            <OverviewMetricCard
              icon={<HugeiconsIcon icon={Coins01Icon} size={16} strokeWidth={1.8} />}
              title="Revenue"
              value={formatMoney(revenue.total, revenue.currency)}
              {...(changeDelta(revenue.total, revenuePrevious) ?? {
                delta: revenuePayments,
                deltaTone: 'neutral' as const,
                deltaDirection: 'up' as const
              })}
              deltaSubtext={changeDelta(revenue.total, revenuePrevious) ? revenuePayments : 'payments'}
              color="emerald"
              comparison={compare(revenue.total, revenuePrevious, (value) => formatMoney(value, revenue.currency))}
              comparisonAlign="right"
            />
          ) : null}
        </section>

        {/* Row 1: Observability Tabbed Trends Chart & Allocation */}
        <section className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.65fr_1fr]">
          <div className="flex min-w-0 flex-col gap-4">
            <OverviewTabbedChart data={tabbedPoints} windowLabel={appliedRange?.adjective ?? '14-day'} />
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
                <TopEventsList events={overview?.topEvents ?? []} windowLabel={windowLabel} />
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
            windowLabel={appliedRange?.value ?? '14d'}
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
                Devices ({windowLabel})
              </p>
            </div>
            <div className="mt-3">
              <DonutChart
                items={(overview?.topDevices ?? []).map((d) => ({ label: d.name, value: d.total, icon: <BrandIcon label={d.name} size={14} /> }))}
                centerValue={compactNumber((overview?.topDevices ?? []).reduce((sum, d) => sum + d.total, 0))}
                centerLabel="events"
                emptyLabel="No device data yet."
              />
            </div>
          </div>

          <div className={cardClass}>
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-slate-800/70">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">
                Locations ({windowLabel})
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
                      value: country.total,
                      icon: <CountryFlag country={country.name} />
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
                Referrers ({windowLabel})
              </p>
            </div>
            <div className="mt-3">
              <CompactRanking
                items={dashboardReferrers.map((referrer) => ({
                  label: referrer.domain,
                  value: referrer.views,
                  icon: <BrandIcon label={referrer.domain} />,
                  secondary: `${referrer.visitors.toLocaleString()} visitors`
                }))}
                emptyLabel="No page referrers yet."
              />
            </div>
          </div>
        </section>

      </div>
    </DashboardShell>
  );
}

async function loadReferrers(projectId: string, token: string | null, days: number) {
  const referrerParams = new URLSearchParams({ days: String(days), projectId });
  const referrerPath = `/v1/dashboard/web?${referrerParams.toString()}`;
  const { data: webReferrers } = await dashboardGet<WebReferrersResponse>(referrerPath, token);
  return webReferrers?.referrers ?? [];
}

async function loadObservabilitySeries(
  projectId: string,
  token: string | null,
  sparkline: Array<{ bucket: string; total: number }>,
  days: number
) {
  const trendPath = (event: string) => {
    const params = new URLSearchParams({
      event,
      interval: days === 1 ? 'hour' : 'day',
      days: String(days),
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
  items: Array<{ label: string; value: number; secondary?: string; icon?: ReactNode }>;
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
            <span className="flex min-w-0 items-center gap-2 font-medium text-neutral-700 dark:text-slate-200">
              {item.icon}
              <span className="truncate">{item.label}</span>
            </span>
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

function signedPercent(change: number): string {
  const rounded = Math.round(change);
  return rounded === 0 ? 'flat' : `${rounded > 0 ? '+' : ''}${rounded}%`;
}

function pointLabel(bucket: string, hourly: boolean): string {
  const date = new Date(bucket);
  if (Number.isNaN(date.getTime())) return bucket;
  return hourly
    ? date.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', timeZone: 'UTC' }) + ' UTC'
    : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** The requests recorded in one chart bucket, for the pinned point card. */
function bucketLinks(bucket: string, hourly: boolean, projectId: string) {
  const from = new Date(bucket);
  if (Number.isNaN(from.getTime())) return undefined;
  const to = new Date(from.getTime() + (hourly ? 3_600_000 : 86_400_000));
  const search = filtersToSearch({ ...DEFAULT_FILTERS, from: from.toISOString(), to: to.toISOString() }, projectId);
  return [
    { label: 'Requests in this period', href: `/dashboard/requests?${search}` },
    { label: 'Server errors (5xx)', href: `/dashboard/requests?${filtersToSearch({ ...DEFAULT_FILTERS, from: from.toISOString(), to: to.toISOString(), status: '5xx' }, projectId)}` }
  ];
}

function dailyBucketLabel(bucket: string): string {
  if (!bucket) return '';
  const date = new Date(bucket);
  if (Number.isNaN(date.getTime())) return bucket;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function hourlyBucketLabel(bucket: string): string {
  if (!bucket) return '';
  const date = new Date(bucket);
  if (Number.isNaN(date.getTime())) return bucket;
  return date.toLocaleTimeString('en-US', { hour: 'numeric', timeZone: 'UTC' });
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

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${value.toLocaleString()} ${currency}`;
  }
}
