import Link from 'next/link';
import { redirect } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import RefreshIcon from '@hugeicons/core-free-icons/RefreshIcon';
import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { TrendChart } from '@/components/charts/TrendChart';
import { BrandIcon } from '@/components/icons/BrandIcon';
import { RankedList } from '@/components/charts/RankedList';
import { ActiveHoursHeatmap } from '@/components/charts/ActiveHoursHeatmap';
import { SvgNodeFlowGraph, ColumnGroup, ConnectionFlow } from '@/components/charts/SvgNodeFlowGraph';
import { TopLocationsCard } from '@/components/charts/TopLocationsCard';
import { TrafficTimingCard } from '@/components/charts/TrafficTimingCard';
import { DashCard, KpiStrip, RangeTabs, percentChange, secondaryButtonSm } from '@/components/dashboard/DashCard';
import { comparisonRanges, type MetricComparison } from '@/components/charts/ComparisonHoverCard';
import { WebFilterBar, WebGoals } from './WebAnalyticsControls';
import { ExpandableList } from '@/components/dashboard/ExpandableList';

export const dynamic = 'force-dynamic';

interface WebTotals {
  visitors: number;
  pageviews: number;
  sessions: number;
  avgSessionDuration: number;
  bounceRate: number;
  bandwidthBytes: number;
  onlineNow?: number;
}

interface WebAnalyticsResponse {
  project: { id: string; name: string } | null;
  days: number;
  current: WebTotals;
  previous: WebTotals;
  visitorsTrend: Array<{ bucket: string; total: number }>;
  topPaths: Array<{ path: string; visitors: number; views: number }>;
  devices: Array<{ name: string; total: number }>;
  browsers: Array<{ name: string; total: number }>;
  operatingSystems: Array<{ name: string; total: number }>;
  countries: Array<{ name: string; total: number; percentage: number }>;
  cities: Array<{ name: string; total: number; percentage: number }>;
  topCountry: { name: string; total: number; percentage: number } | null;
  peakTime: { window: string; total: number } | null;
  trafficTiming: Array<{ rank: number; window: string; total: number; percentage: number }>;
  sources: Array<{ channel: string; visitors: number }>;
  referrers: Array<{ domain: string; visitors: number; views: number }>;
  campaigns: Array<{ campaign: string; source: string; medium: string; visitors: number; views: number }>;
  goals: Array<{ id: string; name: string; type: 'page' | 'event'; target: string; conversions: number; occurrences: number; conversionRate: number }>;
  filters: Array<{ field: string; operator: 'is' | 'is_not' | 'contains' | 'is_set' | 'is_not_set'; value?: string }>;
  journey: {
    sessions: number;
    columns: Array<{ step: number; nodes: Array<{ path: string; sessions: number }> }>;
    transitions: Array<{ fromStep: number; fromPath: string; toStep: number; toPath: string; sessions: number }>;
  };
  webVitals: {
    metrics: Array<{ metric: string; p75: number; count: number; good: number; needsImprovement: number; poor: number }>;
    pages: Array<{ path: string; metric: string; p75: number; count: number; poor: number }>;
  };
  activeHours: number[][];
  frustratingPages: Array<{ path: string; errors: number; rageClicks: number; users: number }>;
}

const RANGES = [
  { value: '1', label: '24h' },
  { value: '2', label: '48h' },
  { value: '3', label: '72h' },
  { value: '7', label: '7d' },
  { value: '30', label: '30d' }
];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatCompact(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}k`;
  return val.toLocaleString();
}

function formatVital(metric: string, value: number): string {
  return metric === 'CLS' ? value.toFixed(3) : `${Math.round(value).toLocaleString()} ms`;
}

function vitalRating(metric: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  const thresholds: Record<string, [number, number]> = {
    CLS: [0.1, 0.25],
    INP: [200, 500],
    LCP: [2500, 4000],
    FCP: [1800, 3000],
    TTFB: [800, 1800]
  };
  const [good, poor] = thresholds[metric] ?? [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  return value <= good ? 'good' : value <= poor ? 'needs-improvement' : 'poor';
}

function buildSessionTransitionGraph(journey: WebAnalyticsResponse['journey']): { columns: ColumnGroup[]; connections: ConnectionFlow[] } {
  const nodeId = (step: number, path: string) => `journey-${step}-${encodeURIComponent(path)}`;
  const included = new Set(journey.columns.flatMap((column) => column.nodes.map((node) => nodeId(column.step, node.path))));
  const columns: ColumnGroup[] = journey.columns.map((column) => ({
    id: `journey-step-${column.step}`,
    title: column.step === 1 ? 'Entry page' : `Page ${column.step}`,
    subtitle: column.step === 1 ? 'First page in session' : `Position ${column.step} in session`,
    nodes: column.nodes.map((node, index) => ({
      id: nodeId(column.step, node.path),
      title: node.path,
      description: `${node.sessions.toLocaleString()} session${node.sessions === 1 ? '' : 's'} reached this page`,
      countBadge: node.sessions.toLocaleString(),
      status: index === 0 ? 'healthy' : 'info',
      tags: [`step ${column.step}`]
    }))
  }));
  const connections: ConnectionFlow[] = journey.transitions
    .filter((transition) => included.has(nodeId(transition.fromStep, transition.fromPath)) && included.has(nodeId(transition.toStep, transition.toPath)))
    .map((transition) => ({
      fromId: nodeId(transition.fromStep, transition.fromPath),
      toId: nodeId(transition.toStep, transition.toPath),
      label: `${transition.sessions.toLocaleString()} sessions`,
      volume: transition.sessions,
      status: 'info',
      animated: true
    }));
  return { columns, connections };
}

export default async function WebAnalyticsPage({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const { user, token } = await requireDashboardSession('/dashboard/web');
  const days = firstParam(searchParams.days) ?? '7';
  const projectId = firstParam(searchParams.projectId);
  const filtersParam = firstParam(searchParams.filters);
  const apiParams = new URLSearchParams({ days });
  if (projectId) apiParams.set('projectId', projectId);
  if (filtersParam) apiParams.set('filters', filtersParam);
  const { data, error } = await dashboardGet<WebAnalyticsResponse>(`/v1/dashboard/web?${apiParams.toString()}`, token);

  if (!projectId && data?.project?.id) {
    const next = new URLSearchParams({ days, projectId: data.project.id });
    if (filtersParam) next.set('filters', filtersParam);
    redirect(`/dashboard/web?${next}`);
  }

  const canonicalProjectId = data?.project?.id ?? projectId;
  const cur = data?.current;
  const prev = data?.previous;
  const trend = data?.visitorsTrend ?? [];
  const sessionGraph = data?.journey ? buildSessionTransitionGraph(data.journey) : { columns: [], connections: [] };

  const rangeText = RANGES.find((range) => range.value === days)?.label ?? `${days}d`;
  const periods = comparisonRanges(new Date(), Math.max(1, Number(days) || 7));
  // Previous vs. current for the hover cards; only when the API sent both periods.
  const compare = (current: number | undefined, previous: number | undefined, format: (value: number) => string, invert = false): MetricComparison | undefined =>
    current === undefined || previous === undefined
      ? undefined
      : { previous: format(previous), current: format(current), ...periods, change: percentChange(current, previous), invert };
  const vitals = data?.webVitals.metrics ?? [];
  const vitalPages = data?.webVitals.pages ?? [];
  const campaigns = data?.campaigns ?? [];
  const topPaths = data?.topPaths ?? [];

  return (
    <DashboardShell active="web" title="Web analytics" userEmail={user.email} projectId={canonicalProjectId}>
      <div className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-neutral-500 dark:text-slate-400">
            Visitors, pages, and traffic sources{data?.project ? <> for <span className="font-medium text-neutral-900 dark:text-white">{data.project.name}</span></> : null}.
          </p>
          <div className="flex items-center gap-2">
            <RangeTabs ranges={RANGES} active={days} hrefFor={(value) => withProjectId(`/dashboard/web?days=${value}`, canonicalProjectId)} />
            <Link href={withProjectId(`/dashboard/web?days=${days}`, canonicalProjectId)} className={secondaryButtonSm} aria-label="Refresh">
              <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={1.8} />
              <span className="hidden sm:inline">Refresh</span>
            </Link>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>
        ) : null}

        <WebFilterBar token={token ?? ''} projectId={canonicalProjectId} days={days} initialFilters={data?.filters ?? []} />

        <KpiStrip
          items={[
            {
              label: 'Visitors',
              value: formatCompact(cur?.visitors ?? 0),
              delta: percentChange(cur?.visitors, prev?.visitors),
              hint: `vs. previous ${rangeText}`,
              comparison: compare(cur?.visitors, prev?.visitors, formatCompact)
            },
            {
              label: 'Page views',
              value: formatCompact(cur?.pageviews ?? 0),
              delta: percentChange(cur?.pageviews, prev?.pageviews),
              comparison: compare(cur?.pageviews, prev?.pageviews, formatCompact)
            },
            {
              label: 'Sessions',
              value: formatCompact(cur?.sessions ?? 0),
              delta: percentChange(cur?.sessions, prev?.sessions),
              comparison: compare(cur?.sessions, prev?.sessions, formatCompact)
            },
            {
              label: 'Bounce rate',
              value: `${Math.round((cur?.bounceRate ?? 0) * 100)}%`,
              delta: percentChange(cur?.bounceRate, prev?.bounceRate),
              invertDelta: true,
              hint: 'Single-page sessions',
              comparison: compare(cur?.bounceRate, prev?.bounceRate, (rate) => `${(rate * 100).toFixed(1)}%`, true)
            },
            {
              label: 'Avg. session',
              value: formatDuration(cur?.avgSessionDuration ?? 0),
              delta: percentChange(cur?.avgSessionDuration, prev?.avgSessionDuration),
              comparison: compare(cur?.avgSessionDuration, prev?.avgSessionDuration, formatDuration)
            }
          ]}
        />

        <DashCard title="Unique visitors" description={`Per ${days === '1' || days === '2' || days === '3' ? 'hour' : 'day'}, last ${rangeText}`}>
          <TrendChart
            buckets={trend.map((p) => p.bucket)}
            series={[{ key: 'Visitors', points: trend.map((p) => ({ bucket: p.bucket, total: p.total, value: p.total })) }]}
            interval="day"
          />
        </DashCard>

        <div className="grid gap-5 lg:grid-cols-2">
          <DashCard title="Top pages" description="By page views" padded={false} actions={<ColumnLabels labels={['Visitors', 'Views']} />}>
            {topPaths.length === 0 ? (
              <EmptyRow>No page views captured yet.</EmptyRow>
            ) : (
              <ul className="divide-y divide-neutral-100 dark:divide-slate-800">
                {topPaths.slice(0, 10).map((p) => (
                  <li key={p.path} className="grid grid-cols-[minmax(0,1fr)_64px_64px] items-center gap-3 px-4 py-2">
                    <span className="truncate font-mono text-xs text-neutral-800 dark:text-slate-200" title={p.path}>{p.path}</span>
                    <span className="text-right text-xs tabular-nums text-neutral-500 dark:text-slate-400">{p.visitors.toLocaleString()}</span>
                    <span className="text-right text-xs tabular-nums text-neutral-900 dark:text-white">{p.views.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </DashCard>

          <DashCard
            title="Referrers"
            description="Ranked by page views; no referrer counts as Direct"
          >
            <RankedList items={(data?.referrers ?? []).map((r) => ({ label: r.domain, total: r.views, icon: <BrandIcon label={r.domain} /> }))} emptyLabel="No referrers yet." />
          </DashCard>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <TopLocationsCard countries={data?.countries ?? []} cities={data?.cities ?? []} />
          <DashCard title="Channels" description="Where visitors came from">
            <RankedList items={(data?.sources ?? []).map((s) => ({ label: s.channel, total: s.visitors }))} emptyLabel="No sources yet." />
          </DashCard>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <DashCard title="Devices">
            <RankedList items={(data?.devices ?? []).map((d) => ({ label: d.name, total: d.total, icon: <BrandIcon label={d.name} /> }))} emptyLabel="No device data yet." />
          </DashCard>
          <DashCard title="Browsers">
            <RankedList items={(data?.browsers ?? []).map((item) => ({ label: item.name, total: item.total, icon: <BrandIcon label={item.name} /> }))} emptyLabel="No browser data yet." />
          </DashCard>
          <DashCard title="Operating systems">
            <RankedList items={(data?.operatingSystems ?? []).map((item) => ({ label: item.name, total: item.total, icon: <BrandIcon label={item.name} /> }))} emptyLabel="No OS data yet." />
          </DashCard>
        </div>

        <WebGoals token={token ?? ''} projectId={canonicalProjectId} goals={data?.goals ?? []} />

        <DashCard title="Web Vitals" description="75th percentile from real visits" padded={false}>
          {vitals.length === 0 ? (
            <EmptyRow>No Web Vitals yet. They appear after visitors load a page with the updated browser SDK.</EmptyRow>
          ) : (
            <>
              <dl className="grid grid-cols-2 border-b border-neutral-100 sm:grid-cols-3 lg:grid-cols-5 dark:border-slate-800">
                {vitals.map((vital) => {
                  const rating = vitalRating(vital.metric, vital.p75);
                  return (
                    <div key={vital.metric} className="border-neutral-100 px-4 py-3 dark:border-slate-800 [&:not(:first-child)]:border-l">
                      <dt className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-slate-400">
                        <span className={`h-1.5 w-1.5 rounded-full ${RATING_DOT[rating]}`} aria-hidden="true" />
                        {vital.metric}
                      </dt>
                      <dd className="mt-1 text-lg font-semibold tabular-nums text-neutral-900 dark:text-white">{formatVital(vital.metric, vital.p75)}</dd>
                      <dd className="text-xs text-neutral-500 dark:text-slate-500">
                        {RATING_LABEL[rating]} · {vital.count.toLocaleString()} samples
                      </dd>
                    </div>
                  );
                })}
              </dl>
              {vitalPages.length > 0 ? (
                <ExpandableList
                  className="divide-y divide-neutral-100 dark:divide-slate-800"
                  items={vitalPages.map((page) => (
                    <li key={`${page.path}:${page.metric}`} className="grid grid-cols-[minmax(0,1fr)_56px_88px_64px] items-center gap-3 px-4 py-2 text-xs">
                      <span className="truncate font-mono text-neutral-800 dark:text-slate-200">{page.path}</span>
                      <span className="font-medium text-neutral-500 dark:text-slate-400">{page.metric}</span>
                      <span className="text-right tabular-nums text-neutral-900 dark:text-white">{formatVital(page.metric, page.p75)}</span>
                      <span className={`text-right tabular-nums ${page.poor > 0 ? 'text-red-600 dark:text-red-400' : 'text-neutral-400 dark:text-slate-500'}`}>{page.poor} poor</span>
                    </li>
                  ))}
                />
              ) : null}
            </>
          )}
        </DashCard>

        {sessionGraph.connections.length > 0 ? (
          <SvgNodeFlowGraph
            compact
            title="Navigation paths"
            subtitle={`${(data?.journey.sessions ?? 0).toLocaleString()} sessions · consecutive page views · last ${rangeText}`}
            columns={sessionGraph.columns}
            connections={sessionGraph.connections}
            legends={[{ label: 'Observed transition', status: 'info', color: '#3b82f6', description: 'Consecutive page views recorded in the same session' }]}
          />
        ) : null}

        <div className="grid gap-5 lg:grid-cols-2">
          <DashCard title="UTM campaigns" padded={false} actions={<ColumnLabels labels={['Visitors', 'Views']} />}>
            {campaigns.length === 0 ? (
              <EmptyRow>No tagged campaigns yet.</EmptyRow>
            ) : (
              <ul className="divide-y divide-neutral-100 dark:divide-slate-800">
                {campaigns.map((campaign) => (
                  <li key={`${campaign.campaign}:${campaign.source}:${campaign.medium}`} className="grid grid-cols-[minmax(0,1fr)_64px_64px] items-center gap-3 px-4 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-neutral-900 dark:text-white">{campaign.campaign}</span>
                      <span className="block truncate text-xs text-neutral-500 dark:text-slate-400">{campaign.source} / {campaign.medium}</span>
                    </span>
                    <span className="text-right text-xs tabular-nums text-neutral-500 dark:text-slate-400">{campaign.visitors.toLocaleString()}</span>
                    <span className="text-right text-xs tabular-nums text-neutral-900 dark:text-white">{campaign.views.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </DashCard>
          <DashCard title="Frustrating pages" description="Errors plus rage clicks">
            <RankedList
              items={(data?.frustratingPages ?? []).map((item) => ({ label: item.path, total: item.errors + item.rageClicks }))}
              emptyLabel="No frustration signals yet."
              mono
            />
          </DashCard>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <TrafficTimingCard timing={data?.trafficTiming ?? []} />
          <DashCard title="Active hours" description="Unique visitors by weekday and hour (UTC)">
            <ActiveHoursHeatmap matrix={data?.activeHours ?? Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))} />
          </DashCard>
        </div>
      </div>
    </DashboardShell>
  );
}

const RATING_DOT = { good: 'bg-emerald-500', 'needs-improvement': 'bg-amber-500', poor: 'bg-red-500' } as const;
const RATING_LABEL = { good: 'Good', 'needs-improvement': 'Needs work', poor: 'Poor' } as const;

function ColumnLabels({ labels }: { labels: string[] }) {
  return (
    <span className="flex gap-3 text-xs text-neutral-400 dark:text-slate-500">
      {labels.map((label) => <span key={label} className="w-16 text-right">{label}</span>)}
    </span>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-center text-sm text-neutral-500 dark:text-slate-500">{children}</p>;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
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
