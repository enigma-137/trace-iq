import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Activity, RefreshCw } from 'lucide-react';
import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { TrendChart } from '@/components/charts/TrendChart';
import { RankedList } from '@/components/charts/RankedList';
import { ActiveHoursHeatmap } from '@/components/charts/ActiveHoursHeatmap';
import { Sparkline } from '@/components/charts/Sparkline';
import { MiniBars } from '@/components/charts/MiniBars';
import { SvgNodeFlowGraph, ColumnGroup, ConnectionFlow } from '@/components/charts/SvgNodeFlowGraph';
import { TopLocationsCard, getCountryFlag } from '@/components/charts/TopLocationsCard';
import { TrafficTimingCard } from '@/components/charts/TrafficTimingCard';
import { WebAnalyticsControls } from './WebAnalyticsControls';

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

const cardClass =
  'relative overflow-hidden rounded-md border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]';
const tableClass =
  'mb-5 overflow-hidden rounded-md border border-neutral-200 bg-white shadow-sm dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
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
  const trendValues = trend.map((p) => p.total);
  const sessionGraph = data?.journey ? buildSessionTransitionGraph(data.journey) : { columns: [], connections: [] };

  return (
    <DashboardShell active="web" title="Web analytics" userEmail={user.email} projectId={canonicalProjectId}>
      {/* Header Bar with Title, Subtitle, Range Buttons and Refresh */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200/80 pb-4 dark:border-slate-800/80">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-2xl">
              Web Analytics
            </h1>
            <span className="rounded-full border border-purple-500/20 bg-purple-500/10 px-2.5 py-0.5 text-xs font-semibold text-purple-700 dark:text-purple-300">
              {data?.project ? data.project.name : 'Active Project'}
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400 sm:text-sm">
            Requests, visitors, bandwidth, latency, routes, and response activity.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Time Range Pills */}
          <div className="flex items-center gap-1 rounded-md border border-neutral-200 bg-white p-1 shadow-xs dark:border-slate-800 dark:bg-slate-950">
            {RANGES.map((range) => (
              <Link
                key={range.value}
                href={withProjectId(`/dashboard/web?days=${range.value}`, canonicalProjectId)}
                className={`rounded px-2.5 py-1 text-xs font-semibold transition sm:px-3 sm:py-1.5 sm:text-sm ${
                  days === range.value
                    ? 'bg-purple-600 text-white shadow-xs dark:bg-purple-600 dark:text-white'
                    : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white'
                }`}
              >
                {range.label}
              </Link>
            ))}
          </div>

          {/* Refresh Link/Button */}
          <Link
            href={withProjectId(`/dashboard/web?days=${days}`, canonicalProjectId)}
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-xs transition hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 sm:text-sm"
          >
            <RefreshCw className="h-3.5 w-3.5 text-purple-500" />
            <span>Refresh</span>
          </Link>
        </div>
      </div>

      {error ? (
        <section className="mb-4 rounded-md border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-100">
          {error}
        </section>
      ) : null}

      {/* Top 5 Headline KPI Cards matching reference dashboard */}
      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Web metrics headline">
        {/* Card 1: Visitors */}
        <div className="relative overflow-hidden rounded-md border border-neutral-200 bg-white p-4 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/80">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
            Visitors
          </p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <p className="text-2xl font-bold tabular-nums tracking-tight text-neutral-900 dark:text-white">
              {formatCompact(cur?.visitors ?? 0)}
            </p>
            <span className="rounded-full border border-blue-500/15 bg-blue-500/5 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-300">
              {cur?.pageviews?.toLocaleString()} views
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
            Unique visitors in the last {days === '1' ? '24h' : `${days}d`}
          </p>
          <div className="mt-3">
            <Sparkline points={trendValues.map((total) => ({ total }))} tone="blue" filled className="h-9 w-full" />
          </div>
        </div>

        {/* Card 2: Online now */}
        <div className="relative overflow-hidden rounded-md border border-neutral-200 bg-white p-4 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/80">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
              Online now
            </p>
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <p className="text-2xl font-bold tabular-nums tracking-tight text-neutral-900 dark:text-white">
              {cur?.onlineNow ?? 0}
            </p>
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
              Live
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
            Unique sessions in the last 5 minutes
          </p>
          <div className="mt-3">
            <MiniBars values={trendValues.slice(-10)} tone="green" />
          </div>
        </div>

        {/* Card 3: Bandwidth */}
        <div className="relative overflow-hidden rounded-md border border-neutral-200 bg-white p-4 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/80">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
            Bandwidth
          </p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <p className="text-2xl font-bold tabular-nums tracking-tight text-neutral-900 dark:text-white">
              {formatBytes(cur?.bandwidthBytes ?? 0)}
            </p>
            <span className="rounded-full border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:text-purple-300">
              Payloads
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
            Estimated bytes sent and received
          </p>
          <div className="mt-3">
            <MiniBars values={trendValues.slice(-10)} tone="blue" />
          </div>
        </div>

        {/* Card 4: Top Country */}
        <div className="relative overflow-hidden rounded-md border border-neutral-200 bg-white p-4 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/80">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
            Top Country
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-2xl leading-none">
              {data?.topCountry ? getCountryFlag(data.topCountry.name) : '🌐'}
            </span>
            <p className="truncate text-xl font-bold capitalize tracking-tight text-neutral-900 dark:text-white">
              {data?.topCountry?.name ?? 'Global'}
            </p>
          </div>
          <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
            {data?.topCountry ? `${data.topCountry.percentage.toFixed(1)}% of located traffic` : 'Location data analyzing'}
          </p>
          <div className="mt-3">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500"
                style={{ width: `${Math.max(10, data?.topCountry?.percentage ?? 10)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Card 5: Peak Time */}
        <div className="relative overflow-hidden rounded-md border border-neutral-200 bg-white p-4 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/80">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
            Peak Time
          </p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <p className="font-mono text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
              {data?.peakTime?.window ?? '11:00—12:00'}
            </p>
            <span className="rounded-full border border-pink-500/20 bg-pink-500/10 px-2 py-0.5 text-[10px] font-bold text-pink-700 dark:text-pink-300">
              UTC
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
            Busiest activity window ({data?.peakTime?.total ?? 0} events)
          </p>
          <div className="mt-3">
            <Sparkline points={trendValues.map((total) => ({ total }))} tone="red" filled className="h-9 w-full" />
          </div>
        </div>
      </section>

      {/* Top Locations & Traffic Timing side-by-side section */}
      <section className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <TopLocationsCard countries={data?.countries ?? []} cities={data?.cities ?? []} />
        <TrafficTimingCard timing={data?.trafficTiming ?? []} />
      </section>

      <WebAnalyticsControls
        token={token ?? ''}
        projectId={canonicalProjectId}
        days={days}
        initialFilters={data?.filters ?? []}
        goals={data?.goals ?? []}
      />

      {/* Unique visitors trend card */}
      <section className={`${cardClass} mb-5`}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_76%_16%,rgba(59,130,246,0.08),transparent_36%)] dark:bg-[radial-gradient(circle_at_76%_16%,rgba(59,130,246,0.16),transparent_36%)]" />
        <div className="relative mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">Unique visitors trend</h3>
            <p className="text-xs text-neutral-500 dark:text-slate-400">Daily unique visitors over selected window</p>
          </div>
          <span className="rounded-full border border-blue-500/10 bg-blue-500/5 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:text-blue-300">
            Last {days === '1' ? '24h' : `${days}d`}
          </span>
        </div>
        <div className="relative">
          <TrendChart
            buckets={trend.map((p) => p.bucket)}
            series={[{ key: 'Visitors', points: trend.map((p) => ({ bucket: p.bucket, total: p.total, value: p.total })) }]}
            interval="day"
          />
        </div>
      </section>

      {/* Top paths table */}
      <section className={tableClass}>
        <div className="border-b border-neutral-200 px-5 py-3 dark:border-slate-800">
          <h3 className="text-base font-semibold text-neutral-900 dark:text-white">Top paths</h3>
          <p className="text-xs text-neutral-500 dark:text-slate-400">Most visited routes by pageviews and visitors</p>
        </div>
        {(data?.topPaths ?? []).length === 0 ? (
          <p className="p-5 text-sm text-neutral-500 dark:text-slate-500">No page views captured yet.</p>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-slate-800">
            <div className="hidden grid-cols-[1fr_100px_100px] gap-4 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-500 sm:grid">
              <span>Path</span>
              <span className="text-right">Visitors</span>
              <span className="text-right">Views</span>
            </div>
            {(data?.topPaths ?? []).map((p) => (
              <div key={p.path} className="grid gap-1 px-5 py-2.5 sm:grid-cols-[1fr_100px_100px] sm:gap-4">
                <span className="truncate font-mono text-sm text-neutral-900 dark:text-slate-100">{p.path}</span>
                <span className="text-sm tabular-nums text-neutral-500 dark:text-slate-400 sm:text-right">{p.visitors.toLocaleString()}</span>
                <span className="text-sm tabular-nums text-neutral-500 dark:text-slate-400 sm:text-right">{p.views.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Breakdown cards */}
      <section className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Card title="Sources by channel">
          <RankedList items={(data?.sources ?? []).map((s) => ({ label: s.channel, total: s.visitors }))} emptyLabel="No sources yet." />
        </Card>
        <Card title="Top referrers">
          <RankedList items={(data?.referrers ?? []).map((r) => ({ label: r.domain, total: r.views }))} emptyLabel="No referrers yet." />
          {(data?.referrers ?? []).length > 0 ? (
            <p className="mt-3 border-t border-neutral-200 pt-3 text-[11px] text-neutral-500 dark:border-slate-800 dark:text-slate-500">
              Ranked by page views. Missing referrers are shown as Direct.
            </p>
          ) : null}
        </Card>
        <Card title="Devices">
          <RankedList items={(data?.devices ?? []).map((d) => ({ label: d.name, total: d.total }))} emptyLabel="No device data yet." />
        </Card>
        <Card title="Browsers">
          <RankedList items={(data?.browsers ?? []).map((item) => ({ label: item.name, total: item.total }))} emptyLabel="No browser data yet." />
        </Card>
        <Card title="Operating systems">
          <RankedList items={(data?.operatingSystems ?? []).map((item) => ({ label: item.name, total: item.total }))} emptyLabel="No OS data yet." />
        </Card>
        <Card title="Frustrating pages">
          <RankedList
            items={(data?.frustratingPages ?? []).map((item) => ({ label: item.path, total: item.errors + item.rageClicks }))}
            emptyLabel="No frustration signals yet."
          />
        </Card>
      </section>

      {/* Session Flow Transition Graph */}
      {sessionGraph.connections.length > 0 ? (
        <section className="mb-6">
          <SvgNodeFlowGraph
            title="Session navigation paths"
            subtitle={`${(data?.journey.sessions ?? 0).toLocaleString()} sessions · consecutive page views · last ${days === '1' ? '24 hours' : `${days} days`}`}
            columns={sessionGraph.columns}
            connections={sessionGraph.connections}
            legends={[{ label: 'Observed transition', status: 'info', color: '#3b82f6', description: 'Consecutive page views recorded in the same session' }]}
          />
        </section>
      ) : null}

      {/* Web Vitals Section */}
      <section className="mb-5">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400">Web Vitals</p>
            <p className="mt-1 text-sm text-neutral-500">75th percentile field measurements from real visits.</p>
          </div>
        </div>
        {(data?.webVitals.metrics ?? []).length === 0 ? (
          <div className={cardClass}>
            <p className="text-sm text-neutral-500">
              No Web Vitals captured yet. Measurements appear after visitors load a page with the updated browser SDK.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {data?.webVitals.metrics.map((vital) => {
                const rating = vitalRating(vital.metric, vital.p75);
                const tone =
                  rating === 'good'
                    ? 'text-emerald-600 dark:text-emerald-300'
                    : rating === 'poor'
                      ? 'text-red-600 dark:text-red-300'
                      : 'text-amber-600 dark:text-amber-300';
                return (
                  <div key={vital.metric} className={cardClass}>
                    <div className="flex items-center justify-between">
                      <p className="font-mono text-xs font-semibold">{vital.metric}</p>
                      <span className={`text-[10px] font-semibold uppercase ${tone}`}>{rating.replace('-', ' ')}</span>
                    </div>
                    <p className={`mt-3 text-2xl font-semibold tabular-nums ${tone}`}>{formatVital(vital.metric, vital.p75)}</p>
                    <p className="mt-1 text-xs text-neutral-500">p75 · {vital.count.toLocaleString()} samples</p>
                    <div className="mt-3 flex gap-2 text-[10px] tabular-nums">
                      <span className="text-emerald-600">{vital.good} good</span>
                      <span className="text-amber-600">{vital.needsImprovement} improve</span>
                      <span className="text-red-600">{vital.poor} poor</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={`${tableClass} mt-3`}>
              <p className="border-b border-neutral-200 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:border-slate-800">
                Vitals by page
              </p>
              <div className="divide-y divide-neutral-200 dark:divide-slate-800">
                {data?.webVitals.pages.map((page) => (
                  <div key={`${page.path}:${page.metric}`} className="grid gap-1 px-5 py-2.5 sm:grid-cols-[1fr_90px_120px_100px]">
                    <span className="truncate font-mono text-sm">{page.path}</span>
                    <span className="text-sm font-semibold">{page.metric}</span>
                    <span className="text-right text-sm tabular-nums">{formatVital(page.metric, page.p75)}</span>
                    <span className="text-right text-sm text-red-600">{page.poor} poor</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </section>

      {/* UTM Campaigns Table */}
      <section className={tableClass}>
        <p className="border-b border-neutral-200 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:border-slate-800">
          UTM campaigns
        </p>
        {(data?.campaigns ?? []).length === 0 ? (
          <p className="p-5 text-sm text-neutral-500">No tagged campaigns captured yet.</p>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-slate-800">
            {data?.campaigns.map((campaign) => (
              <div key={`${campaign.campaign}:${campaign.source}:${campaign.medium}`} className="grid gap-1 px-5 py-3 sm:grid-cols-[1fr_1fr_100px_100px]">
                <span className="font-semibold">{campaign.campaign}</span>
                <span className="text-sm text-neutral-500">{campaign.source} / {campaign.medium}</span>
                <span className="text-right text-sm tabular-nums">{campaign.visitors} visitors</span>
                <span className="text-right text-sm tabular-nums">{campaign.views} views</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Active hours heatmap */}
      <section className={`${cardClass} mb-5`}>
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
          Active hours (unique visitors, UTC)
        </p>
        <ActiveHoursHeatmap matrix={data?.activeHours ?? Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))} />
      </section>
    </DashboardShell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={cardClass}>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">{title}</p>
      {children}
    </div>
  );
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
