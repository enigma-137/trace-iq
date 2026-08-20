import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { TrendChart } from '@/components/charts/TrendChart';
import { RankedList } from '@/components/charts/RankedList';
import { ActiveHoursHeatmap } from '@/components/charts/ActiveHoursHeatmap';
import { Sparkline } from '@/components/charts/Sparkline';
import { MiniBars } from '@/components/charts/MiniBars';
// import { GeographyGlobe } from '@/components/GeographyGlobe';

export const dynamic = 'force-dynamic';

interface WebTotals {
  visitors: number;
  pageviews: number;
  sessions: number;
  avgSessionDuration: number;
  bounceRate: number;
}

interface WebAnalyticsResponse {
  project: { id: string; name: string } | null;
  days: number;
  current: WebTotals;
  previous: WebTotals;
  visitorsTrend: Array<{ bucket: string; total: number }>;
  topPaths: Array<{ path: string; visitors: number; views: number }>;
  devices: Array<{ name: string; total: number }>;
  countries: Array<{ name: string; total: number }>;
  sources: Array<{ channel: string; visitors: number }>;
  activeHours: number[][];
  frustratingPages: Array<{ path: string; errors: number; rageClicks: number; users: number }>;
}

const RANGES = [
  { value: '1', label: '24h' },
  { value: '7', label: '7d' },
  { value: '30', label: '30d' },
  { value: '90', label: '90d' }
];

const cardClass =
  'relative overflow-hidden rounded-md border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]';
const tableClass = 'mb-5 overflow-hidden rounded-md border border-neutral-200 bg-white shadow-sm dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function WebAnalyticsPage({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const { user, token } = await requireDashboardSession('/dashboard/web');
  const days = firstParam(searchParams.days) ?? '7';
  const projectId = firstParam(searchParams.projectId);
  const apiParams = new URLSearchParams({ days });
  if (projectId) apiParams.set('projectId', projectId);
  const { data, error } = await dashboardGet<WebAnalyticsResponse>(`/v1/dashboard/web?${apiParams.toString()}`, token);

  if (!projectId && data?.project?.id) {
    redirect(`/dashboard/web?days=${encodeURIComponent(days)}&projectId=${encodeURIComponent(data.project.id)}`);
  }

  const canonicalProjectId = data?.project?.id ?? projectId;
  const cur = data?.current;
  const prev = data?.previous;
  const trend = data?.visitorsTrend ?? [];
  const trendValues = trend.map((p) => p.total);

  return (
    <DashboardShell active="web" title="Web analytics" userEmail={user.email} projectId={canonicalProjectId}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-500 dark:text-slate-300">
          {data?.project ? data.project.name : 'No project yet'}
        </p>
        <div className="flex items-center gap-1 rounded-md border border-neutral-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          {RANGES.map((range) => (
            <Link
              key={range.value}
              href={withProjectId(`/dashboard/web?days=${range.value}`, canonicalProjectId)}
              className={`rounded px-3 py-1.5 text-sm font-semibold transition ${days === range.value ? 'bg-neutral-900 text-white dark:bg-white dark:text-slate-950' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white'
                }`}
            >
              {range.label}
            </Link>
          ))}
        </div>
      </div>

      {error ? (
        <section className="mb-4 rounded-md border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-100">
          {error}
        </section>
      ) : null}

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatWithDelta label="Visitors" value={cur?.visitors ?? 0} prev={prev?.visitors ?? 0} values={trendValues} />
        <StatWithDelta label="Page views" value={cur?.pageviews ?? 0} prev={prev?.pageviews ?? 0} values={trendValues} chart="bars" />
        <StatWithDelta label="Sessions" value={cur?.sessions ?? 0} prev={prev?.sessions ?? 0} values={trendValues.slice(-12)} tone="green" />
        <StatWithDelta
          label="Session duration"
          value={cur?.avgSessionDuration ?? 0}
          prev={prev?.avgSessionDuration ?? 0}
          values={trendValues.slice(-12)}
          format="duration"
          tone="blue"
          chart="bars"
        />
        <StatWithDelta
          label="Bounce rate"
          value={cur?.bounceRate ?? 0}
          prev={prev?.bounceRate ?? 0}
          values={trendValues.slice(-12)}
          format="percent"
          lowerIsBetter
          tone="red"
        />
      </section>

      <section className={`${cardClass} mb-5`}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_76%_16%,rgba(59,130,246,0.08),transparent_36%)] dark:bg-[radial-gradient(circle_at_76%_16%,rgba(59,130,246,0.16),transparent_36%)]" />
        <div className="relative mb-4 flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
            Unique visitors
          </p>
          <span className="rounded-full border border-blue-500/10 bg-blue-500/5 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-300">
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

      <section className={tableClass}>
        <p className="border-b border-neutral-200 dark:border-slate-800 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
          Top paths
        </p>
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

      <section className="mb-5 grid gap-3 lg:grid-cols-3">
        <Card title="Sources by channel">
          <RankedList items={(data?.sources ?? []).map((s) => ({ label: s.channel, total: s.visitors }))} emptyLabel="No sources yet." />
        </Card>
        <Card title="Devices">
          <RankedList items={(data?.devices ?? []).map((d) => ({ label: d.name, total: d.total }))} emptyLabel="No device data yet." />
        </Card>
        <Card title="Geography">
          <div className="grid gap-4]">
            {/* <div className="h-[360px] w-full">
              <GeographyGlobe
                data={(data?.countries ?? []).map((c) => ({ name: c.name, total: c.total }))}
                metric="visitors"
                
              />
            </div> */}
            <div>
              <RankedList
                items={(data?.countries ?? []).map((c) => ({ label: c.name, total: c.total }))}
                emptyLabel="No location data yet."
              />
            </div>
          </div>
        </Card>
      </section>

      <section className={`${cardClass} mb-5`}>
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
          Active hours (unique visitors, UTC)
        </p>
        <ActiveHoursHeatmap matrix={data?.activeHours ?? Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))} />
      </section>

      <section className={tableClass}>
        <div className="border-b border-neutral-200 dark:border-slate-800 px-5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
            Frustrating pages
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-slate-500">
            Pages generating errors and rage clicks. Dead-click detection is not captured yet.
          </p>
        </div>
        {(data?.frustratingPages ?? []).length === 0 ? (
          <p className="p-5 text-sm text-neutral-500 dark:text-slate-500">No frustration signals captured yet.</p>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-slate-800">
            <div className="hidden grid-cols-[1fr_110px_90px_90px] gap-4 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-500 sm:grid">
              <span>Path</span>
              <span className="text-right">Rage clicks</span>
              <span className="text-right">Errors</span>
              <span className="text-right">Users</span>
            </div>
            {(data?.frustratingPages ?? []).map((p) => (
              <div key={p.path} className="grid gap-1 px-5 py-2.5 sm:grid-cols-[1fr_110px_90px_90px] sm:gap-4">
                <span className="truncate font-mono text-sm text-neutral-900 dark:text-slate-100">{p.path}</span>
                <span className="text-sm tabular-nums text-red-600 dark:text-red-300 sm:text-right">{p.rageClicks.toLocaleString()}</span>
                <span className="text-sm tabular-nums text-red-700 dark:text-red-200 sm:text-right">{p.errors.toLocaleString()}</span>
                <span className="text-sm tabular-nums text-neutral-500 dark:text-slate-400 sm:text-right">{p.users.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
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

function StatWithDelta({
  label,
  value,
  prev,
  values,
  format = 'number',
  lowerIsBetter = false,
  tone = 'blue',
  chart = 'line'
}: {
  label: string;
  value: number;
  prev: number;
  values: number[];
  format?: 'number' | 'duration' | 'percent';
  lowerIsBetter?: boolean;
  tone?: 'blue' | 'green' | 'red';
  chart?: 'line' | 'bars';
}) {
  const delta = prev > 0 ? ((value - prev) / prev) * 100 : value > 0 ? 100 : 0;
  const up = delta > 0;
  const flat = Math.abs(delta) < 0.05;
  const good = flat || (lowerIsBetter ? !up : up);
  const deltaTone = flat ? 'blue' : good ? 'green' : 'red';

  return (
    <div className="relative overflow-hidden rounded-md border border-neutral-200 bg-white p-4 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="pointer-events-none absolute inset-0 " />
      {/* Shine shine, incase you want to add it back  bg-[radial-gradient(circle_at_18%_0%,rgba(59,130,246,0.08),transparent_34%)] dark:bg-[radial-gradient(circle_at_18%_0%,rgba(59,130,246,0.12),transparent_34%)] */}
      <div className="relative">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">{label}</p>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <p className="text-2xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-white">{formatValue(value, format)}</p>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums ${deltaTone === 'green'
              ? 'border-emerald-400/15 text-emerald-700 dark:text-emerald-300'
              : deltaTone === 'red'
                ? 'border-red-400/15 text-red-600 dark:text-red-300'
                : 'border-blue-500/10 text-blue-700 dark:text-blue-300'
              }`}
          >
            {flat ? 'flat' : `${up ? '+' : '-'}${Math.abs(delta).toFixed(1)}%`}
          </span>
        </div>
        <p className="mt-1 text-xs text-neutral-500 dark:text-slate-500">vs prior</p>
        <div className="mt-3">
          {chart === 'bars' ? (
            <MiniBars values={values} tone={tone} />
          ) : (
            <Sparkline points={values.map((total) => ({ total }))} tone={tone} filled className="h-11 w-full" />
          )}
        </div>
      </div>
    </div>
  );
}

function formatValue(value: number, format: 'number' | 'duration' | 'percent'): string {
  if (format === 'percent') {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (format === 'duration') {
    const total = Math.round(value);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }
  return value.toLocaleString();
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
