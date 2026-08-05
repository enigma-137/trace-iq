import Link from 'next/link';
import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { StatTile } from '@/components/charts/StatTile';

export const dynamic = 'force-dynamic';

interface EndpointRow {
  method: string;
  path: string;
  count: number;
  avg: number;
  p95: number;
  status: number;
  errors: number;
}

interface ErrorRow {
  method: string;
  path: string;
  status: number;
  count: number;
}

interface ApiPerformanceResponse {
  project: { id: string; name: string } | null;
  days: number;
  summary: { totalRequests: number; errorCount: number; errorRate: number; p95: number; avg: number };
  highestLatency: EndpointRow[];
  highestError: ErrorRow[];
  mostRequests: EndpointRow[];
  leastRequests: EndpointRow[];
}

const RANGES = [
  { label: '24h', value: '1' },
  { label: '7d', value: '7' },
  { label: '14d', value: '14' },
  { label: '30d', value: '30' }
];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ApiPerformancePage({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const { user, token } = await requireDashboardSession('/dashboard/api-performance');
  const days = firstParam(searchParams.days) ?? '7';
  const { data, error } = await dashboardGet<ApiPerformanceResponse>(`/v1/dashboard/api-performance?days=${days}`, token);

  const summary = data?.summary;
  const hasData = (summary?.totalRequests ?? 0) > 0;
  const slowest = data?.highestLatency?.[0];

  return (
    <DashboardShell active="api-performance" title="API performance" userEmail={user.email}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-neutral-500 dark:text-slate-400">
          Latency, errors, and traffic per endpoint — from <code className="font-mono text-xs">$api_request</code> events
          sent by the SDK middleware or browser autocapture.
        </p>
        <div className="flex items-center gap-1 rounded-md border border-neutral-200 p-1 dark:border-slate-800">
          {RANGES.map((range) => (
            <Link
              key={range.value}
              href={`/dashboard/api-performance?days=${range.value}`}
              className={`rounded px-3 py-1.5 text-sm font-semibold transition ${
                days === range.value
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-slate-950'
                  : 'text-neutral-500 hover:bg-neutral-100 dark:text-slate-400 dark:hover:bg-neutral-900'
              }`}
            >
              {range.label}
            </Link>
          ))}
        </div>
      </div>

      {error ? (
        <section className="mb-4 rounded-md border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {error}
        </section>
      ) : null}

      {!hasData ? (
        <section className="rounded-md border border-neutral-200 bg-white p-6 text-sm text-neutral-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
          No API requests captured yet. Add <code className="font-mono">traceiq.middleware()</code> to your server, or
          enable <code className="font-mono">autoCaptureRequests</code> in the browser SDK. See{' '}
          <Link className="font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white" href="/docs?page=api-performance">
            the docs
          </Link>
          .
        </section>
      ) : (
        <>
          <p className="mb-4 text-sm text-neutral-600 dark:text-slate-300">
            Over the last {data?.days}d, <strong>{summary?.totalRequests.toLocaleString()}</strong> requests ·{' '}
            <strong>{summary?.errorRate}%</strong> errored · slowest is{' '}
            <strong>
              {slowest ? `${slowest.method} ${slowest.path}` : '—'}
            </strong>{' '}
            at <strong>{formatMs(slowest?.p95 ?? 0)}</strong> p95.
          </p>

          <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Requests" value={summary?.totalRequests ?? 0} hint={`last ${data?.days}d`} />
            <StatTile
              label="Error rate"
              value={`${summary?.errorRate ?? 0}%`}
              hint={`${(summary?.errorCount ?? 0).toLocaleString()} of ${(summary?.totalRequests ?? 0).toLocaleString()} 4xx/5xx`}
            />
            <StatTile label="p95 latency" value={formatMs(summary?.p95 ?? 0)} hint="95% of requests are faster" />
            <StatTile label="Avg latency" value={formatMs(summary?.avg ?? 0)} hint="mean response time" />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <EndpointPanel
              title="Highest latency"
              subtitle="by p95 response time"
              rows={data?.highestLatency ?? []}
              metric="p95"
            />
            <ErrorPanel title="Highest error" subtitle="4xx / 5xx responses" rows={data?.highestError ?? []} />
            <EndpointPanel title="Most requests" subtitle="by volume" rows={data?.mostRequests ?? []} metric="avg" />
            <EndpointPanel
              title="Least requests"
              subtitle="quietest endpoints"
              rows={data?.leastRequests ?? []}
              metric="avg"
            />
          </div>
        </>
      )}
    </DashboardShell>
  );
}

function EndpointPanel({
  title,
  subtitle,
  rows,
  metric
}: {
  title: string;
  subtitle: string;
  rows: EndpointRow[];
  metric: 'p95' | 'avg';
}) {
  return (
    <Panel title={title} subtitle={subtitle} headers={['Method', 'Endpoint', metric === 'p95' ? 'p95' : 'Avg']}>
      {rows.map((row) => (
        <div key={`${row.method}\n${row.path}`} className="grid grid-cols-[64px_1fr_auto] items-center gap-3 px-5 py-2.5">
          <MethodPill method={row.method} />
          <span className="flex min-w-0 items-center gap-2">
            <StatusDot status={row.status} />
            <code className="truncate font-mono text-xs text-neutral-700 dark:text-slate-300">{row.path}</code>
          </span>
          <span className="text-right text-sm tabular-nums text-neutral-600 dark:text-slate-400">
            {formatMs(metric === 'p95' ? row.p95 : row.avg)}
          </span>
        </div>
      ))}
    </Panel>
  );
}

function ErrorPanel({ title, subtitle, rows }: { title: string; subtitle: string; rows: ErrorRow[] }) {
  return (
    <Panel title={title} subtitle={subtitle} headers={['Method', 'Endpoint', 'Count']}>
      {rows.map((row) => (
        <div key={`${row.method}\n${row.path}\n${row.status}`} className="grid grid-cols-[64px_1fr_auto] items-center gap-3 px-5 py-2.5">
          <MethodPill method={row.method} />
          <span className="flex min-w-0 items-center gap-2">
            <StatusDot status={row.status} />
            <code className="truncate font-mono text-xs text-neutral-700 dark:text-slate-300">{row.path}</code>
          </span>
          <span className="text-right text-sm tabular-nums text-neutral-600 dark:text-slate-400">
            {row.count.toLocaleString()}
          </span>
        </div>
      ))}
    </Panel>
  );
}

function Panel({
  title,
  subtitle,
  headers,
  children
}: {
  title: string;
  subtitle: string;
  headers: string[];
  children: React.ReactNode;
}) {
  const empty = !Array.isArray(children) || children.length === 0;
  return (
    <section className="rounded-md border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="border-b border-neutral-200 px-5 py-3 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">{title}</h2>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">{subtitle}</p>
      </div>
      <div className="grid grid-cols-[64px_1fr_auto] gap-3 border-b border-neutral-200 bg-neutral-50 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:border-slate-800 dark:bg-neutral-900/60 dark:text-neutral-500">
        <span>{headers[0]}</span>
        <span>{headers[1]}</span>
        <span className="text-right">{headers[2]}</span>
      </div>
      {empty ? (
        <p className="px-5 py-4 text-sm text-neutral-500 dark:text-slate-500">Nothing here for this range.</p>
      ) : (
        <div className="divide-y divide-neutral-200 dark:divide-slate-800">{children}</div>
      )}
    </section>
  );
}

function MethodPill({ method }: { method: string }) {
  return (
    <span className="inline-flex justify-center rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-neutral-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
      {method}
    </span>
  );
}

function StatusDot({ status }: { status: number }) {
  // Status codes are the one place we break the monochrome palette: green = success,
  // red = failure, since that convention reads instantly.
  const color =
    status >= 400
      ? 'bg-red-500'
      : status >= 200
        ? 'bg-emerald-500'
        : 'bg-neutral-400 dark:bg-slate-600';
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums text-neutral-500 dark:text-slate-400">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} aria-hidden />
      {status || '—'}
    </span>
  );
}

function formatMs(value: number): string {
  if (!value) return '0 ms';
  // Trim a trailing .0 so 21.0 reads as 21.
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ms`;
}
