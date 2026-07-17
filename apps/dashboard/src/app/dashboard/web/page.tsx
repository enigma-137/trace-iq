import Link from 'next/link';
import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { TrendChart } from '@/components/charts/TrendChart';
import { RankedList } from '@/components/charts/RankedList';
import { ActiveHoursHeatmap } from '@/components/charts/ActiveHoursHeatmap';

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
}

const RANGES = [
  { value: '1', label: '24h' },
  { value: '7', label: '7d' },
  { value: '30', label: '30d' },
  { value: '90', label: '90d' }
];

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
  const { data, error } = await dashboardGet<WebAnalyticsResponse>(`/v1/dashboard/web?days=${days}`, token);

  const cur = data?.current;
  const prev = data?.previous;
  const trend = data?.visitorsTrend ?? [];

  return (
    <DashboardShell active="web" title="Web analytics" userEmail={user.email}>
      <div className="mb-6 flex items-center justify-between gap-3">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {data?.project ? data.project.name : 'No project yet'}
        </p>
        <div className="flex items-center gap-1 rounded-md border border-neutral-200 p-1 dark:border-neutral-800">
          {RANGES.map((range) => (
            <Link
              key={range.value}
              href={`/dashboard/web?days=${range.value}`}
              className={`rounded px-3 py-1.5 text-sm font-semibold transition ${
                days === range.value
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-black'
                  : 'text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900'
              }`}
            >
              {range.label}
            </Link>
          ))}
        </div>
      </div>

      {error ? (
        <section className="mb-4 rounded-md border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100">
          {error}
        </section>
      ) : null}

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatWithDelta label="Visitors" value={cur?.visitors ?? 0} prev={prev?.visitors ?? 0} />
        <StatWithDelta label="Page views" value={cur?.pageviews ?? 0} prev={prev?.pageviews ?? 0} />
        <StatWithDelta label="Sessions" value={cur?.sessions ?? 0} prev={prev?.sessions ?? 0} />
        <StatWithDelta
          label="Session duration"
          value={cur?.avgSessionDuration ?? 0}
          prev={prev?.avgSessionDuration ?? 0}
          format="duration"
        />
        <StatWithDelta
          label="Bounce rate"
          value={cur?.bounceRate ?? 0}
          prev={prev?.bounceRate ?? 0}
          format="percent"
          lowerIsBetter
        />
      </section>

      <section className="mb-6 rounded-md border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">
          Unique visitors
        </p>
        <TrendChart
          buckets={trend.map((p) => p.bucket)}
          series={[{ key: 'Visitors', points: trend.map((p) => ({ bucket: p.bucket, total: p.total })) }]}
          interval="day"
        />
      </section>

      <section className="mb-6 rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <p className="border-b border-neutral-200 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:border-neutral-800 dark:text-neutral-500">
          Top paths
        </p>
        {(data?.topPaths ?? []).length === 0 ? (
          <p className="p-5 text-sm text-neutral-500 dark:text-neutral-500">No page views captured yet.</p>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            <div className="hidden grid-cols-[1fr_100px_100px] gap-4 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500 sm:grid">
              <span>Path</span>
              <span className="text-right">Visitors</span>
              <span className="text-right">Views</span>
            </div>
            {(data?.topPaths ?? []).map((p) => (
              <div key={p.path} className="grid gap-1 px-5 py-2.5 sm:grid-cols-[1fr_100px_100px] sm:gap-4">
                <span className="truncate font-mono text-sm text-neutral-800 dark:text-neutral-200">{p.path}</span>
                <span className="text-sm tabular-nums text-neutral-500 dark:text-neutral-400 sm:text-right">{p.visitors.toLocaleString()}</span>
                <span className="text-sm tabular-nums text-neutral-500 dark:text-neutral-400 sm:text-right">{p.views.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card title="Sources by channel">
          <RankedList items={(data?.sources ?? []).map((s) => ({ label: s.channel, total: s.visitors }))} emptyLabel="No sources yet." />
        </Card>
        <Card title="Devices">
          <RankedList items={(data?.devices ?? []).map((d) => ({ label: d.name, total: d.total }))} emptyLabel="No device data yet." />
        </Card>
        <Card title="Geography">
          <RankedList items={(data?.countries ?? []).map((c) => ({ label: c.name, total: c.total }))} emptyLabel="No location data yet." />
        </Card>
      </section>

      <section className="rounded-md border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">
          Active hours (unique visitors, UTC)
        </p>
        <ActiveHoursHeatmap matrix={data?.activeHours ?? Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))} />
      </section>
    </DashboardShell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">{title}</p>
      {children}
    </div>
  );
}

function StatWithDelta({
  label,
  value,
  prev,
  format = 'number',
  lowerIsBetter = false
}: {
  label: string;
  value: number;
  prev: number;
  format?: 'number' | 'duration' | 'percent';
  lowerIsBetter?: boolean;
}) {
  const delta = prev > 0 ? ((value - prev) / prev) * 100 : value > 0 ? 100 : 0;
  const up = delta > 0;
  const flat = Math.abs(delta) < 0.05;

  return (
    <div className="rounded-md border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-white">{formatValue(value, format)}</p>
      {flat ? (
        <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">— vs prior</p>
      ) : (
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          <span aria-hidden>{up ? '▲' : '▼'}</span> {Math.abs(delta).toFixed(1)}%
          <span className="text-neutral-400 dark:text-neutral-500"> vs prior{lowerIsBetter && up ? ' ↑' : ''}</span>
        </p>
      )}
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
