import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DashboardShell } from '../DashboardShell';
import { withProjectId } from '../nav';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { buildApiFlowGraph } from '@/lib/apiFlowGraph';
import { requestsHrefForEndpoint, type RequestSort } from '@/lib/requests';
import { DashCard, KpiStrip, RangeTabs } from '@/components/dashboard/DashCard';
import { SvgNodeFlowGraph } from '@/components/charts/SvgNodeFlowGraph';
import { AddCurrentViewToDashboardButton } from '@/components/dashboards/AddCurrentViewToDashboardButton';

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

type TimingSource = 'server' | 'client' | 'all';

interface ApiPerformanceResponse {
  project: { id: string; name: string } | null;
  days: number;
  source?: TimingSource;
  sources?: { server: number; client: number };
  summary: { totalRequests: number; errorCount: number; errorRate: number; p50?: number; p95: number; avg: number };
  highestLatency: EndpointRow[];
  highestError: ErrorRow[];
  mostRequests: EndpointRow[];
  leastRequests: EndpointRow[];
}

const SOURCES: Array<{ label: string; value: TimingSource }> = [
  { label: 'Server', value: 'server' },
  { label: 'Browser', value: 'client' },
  { label: 'All', value: 'all' }
];

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
  const projectId = firstParam(searchParams.projectId);
  const requestedSource = firstParam(searchParams.source);
  const apiParams = new URLSearchParams({ days });
  if (projectId) apiParams.set('projectId', projectId);
  if (requestedSource) apiParams.set('source', requestedSource);
  const { data, error } = await dashboardGet<ApiPerformanceResponse>(
    `/v1/dashboard/api-performance?${apiParams.toString()}`,
    token
  );

  if (!projectId && data?.project?.id) {
    redirect(`/dashboard/api-performance?${new URLSearchParams({ days, projectId: data.project.id })}`);
  }

  const canonicalProjectId = data?.project?.id ?? projectId;
  const source: TimingSource = data?.source ?? 'all';
  const sourceCounts = data?.sources ?? { server: 0, client: 0 };
  const pageHref = (params: { days?: string; source?: string }) => {
    const query = new URLSearchParams({ days: params.days ?? days });
    const nextSource = params.source ?? requestedSource;
    if (nextSource) query.set('source', nextSource);
    return withProjectId(`/dashboard/api-performance?${query.toString()}`, canonicalProjectId);
  };

  const summary = data?.summary;
  const hasData = (summary?.totalRequests ?? 0) > 0;
  const slowest = data?.highestLatency?.[0];
  const { columns, connections } = buildApiFlowGraph(data);

  return (
    <DashboardShell
      active="api-performance"
      title="API performance"
      userEmail={user.email}
      projectId={canonicalProjectId}
    >
      <div className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-sm text-neutral-500 dark:text-slate-400">
            Latency, errors, and traffic per endpoint. Click an endpoint to open its{' '}
            <Link
              className="font-medium text-neutral-900 underline underline-offset-2 dark:text-white"
              href={withProjectId('/dashboard/requests', canonicalProjectId)}
            >
              requests
            </Link>
            .
          </p>
          <div className="flex items-center gap-2">
            {sourceCounts.server > 0 && sourceCounts.client > 0 ? (
              <RangeTabs ranges={SOURCES} active={source} hrefFor={(value) => pageHref({ source: value })} />
            ) : null}
            <RangeTabs ranges={RANGES} active={days} hrefFor={(value) => pageHref({ days: value })} />
            <AddCurrentViewToDashboardButton
              title="API Requests & Latency"
              type="api_performance"
              chartType="line"
              query={{ event: '$api_request', days, interval: days === '1' ? 'hour' : 'day' }}
              dateConfig={{ days }}
              projectId={canonicalProjectId}
            />
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        ) : null}

        {hasData && source !== 'server' && sourceCounts.client > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            {source === 'client' ? 'These are' : 'This view includes'} browser timings: the full round trip from the
            visitor&apos;s device (DNS, TLS, network distance to your host, queueing), so they run far higher than the
            handler time your host reports.{' '}
            {sourceCounts.server === 0 ? (
              <>
                Add <code className="font-mono text-xs">traceiq.middleware()</code> to your server to see server-side
                response times.
              </>
            ) : null}
          </div>
        ) : null}

        {!hasData ? (
          <DashCard title="No API requests yet">
            <p className="text-sm text-neutral-500 dark:text-slate-400">
              Add <code className="font-mono text-xs">traceiq.middleware()</code> to your server, or enable{' '}
              <code className="font-mono text-xs">autoCaptureRequests</code> in the browser SDK. Requests are recorded as{' '}
              <code className="font-mono text-xs">$api_request</code> events.{' '}
              <Link className="font-medium text-neutral-900 underline underline-offset-2 dark:text-white" href="/docs?page=api-performance">
                Read the docs
              </Link>
            </p>
          </DashCard>
        ) : (
          <>
            <KpiStrip
              items={[
                { label: 'Requests', value: (summary?.totalRequests ?? 0).toLocaleString(), hint: `Last ${rangeLabel(days)}` },
                {
                  label: 'Error rate',
                  value: `${summary?.errorRate ?? 0}%`,
                  hint: `${(summary?.errorCount ?? 0).toLocaleString()} 4xx/5xx responses`
                },
                { label: 'Median latency', value: formatMs(summary?.p50 ?? 0), hint: 'Half of requests are faster' },
                { label: 'p95 latency', value: formatMs(summary?.p95 ?? 0), hint: '95% of requests are faster' },
                { label: 'Avg latency', value: formatMs(summary?.avg ?? 0), hint: slowest ? `Slowest: ${slowest.method} ${slowest.path}` : 'Mean response time' }
              ]}
            />

            <div className="grid gap-5 lg:grid-cols-2">
              <EndpointPanel
                title="Slowest endpoints"
                subtitle="By p95 response time"
                rows={data?.highestLatency ?? []}
                metric="p95"
                link={{ days, projectId: canonicalProjectId, sort: 'duration', source }}
              />
              <ErrorPanel
                title="Most errors"
                subtitle="4xx and 5xx responses"
                rows={data?.highestError ?? []}
                link={{ days, projectId: canonicalProjectId, source }}
              />
              <EndpointPanel
                title="Busiest endpoints"
                subtitle="By request volume"
                rows={data?.mostRequests ?? []}
                metric="avg"
                link={{ days, projectId: canonicalProjectId, source }}
              />
              <EndpointPanel
                title="Quietest endpoints"
                subtitle="Fewest requests"
                rows={data?.leastRequests ?? []}
                metric="avg"
                link={{ days, projectId: canonicalProjectId, source }}
              />
            </div>

            <SvgNodeFlowGraph
              compact
              title="Request flow"
              subtitle={`How requests move through ${columns.length} layers across ${connections.length} paths`}
              columns={columns}
              connections={connections}
            />
          </>
        )}
      </div>
    </DashboardShell>
  );
}

interface RowLink {
  days: string;
  projectId?: string | null;
  sort?: RequestSort;
  source?: string;
}

function EndpointPanel({
  title,
  subtitle,
  rows,
  metric,
  link
}: {
  title: string;
  subtitle: string;
  rows: EndpointRow[];
  metric: 'p95' | 'avg';
  link: RowLink;
}) {
  return (
    <Panel title={title} subtitle={subtitle} valueHeader={metric === 'p95' ? 'p95' : 'Avg'} empty={rows.length === 0}>
      {rows.map((row) => (
        <Link
          key={`${row.method}\n${row.path}`}
          href={requestsHrefForEndpoint({ method: row.method, path: row.path, ...link })}
          className={rowClass}
          title={`Open ${row.method} ${row.path} in Requests`}
        >
          <MethodPill method={row.method} />
          <span className="flex min-w-0 items-center gap-2">
            <code className="truncate font-mono text-xs text-neutral-800 dark:text-slate-200">{row.path}</code>
            <StatusDot status={row.status} />
          </span>
          <span className="text-right text-xs tabular-nums text-neutral-600 dark:text-slate-400">
            {formatMs(metric === 'p95' ? row.p95 : row.avg)}
          </span>
        </Link>
      ))}
    </Panel>
  );
}

function ErrorPanel({ title, subtitle, rows, link }: { title: string; subtitle: string; rows: ErrorRow[]; link: RowLink }) {
  return (
    <Panel title={title} subtitle={subtitle} valueHeader="Count" empty={rows.length === 0}>
      {rows.map((row) => (
        <Link
          key={`${row.method}\n${row.path}\n${row.status}`}
          href={requestsHrefForEndpoint({
            method: row.method,
            path: row.path,
            status: row.status ? String(row.status) : undefined,
            ...link
          })}
          className={rowClass}
          title={`Open failing ${row.method} ${row.path} requests`}
        >
          <MethodPill method={row.method} />
          <span className="flex min-w-0 items-center gap-2">
            <code className="truncate font-mono text-xs text-neutral-800 dark:text-slate-200">{row.path}</code>
            <StatusDot status={row.status} />
          </span>
          <span className="text-right text-xs tabular-nums text-neutral-600 dark:text-slate-400">{row.count.toLocaleString()}</span>
        </Link>
      ))}
    </Panel>
  );
}

const rowClass =
  'grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 transition hover:bg-neutral-50 dark:hover:bg-slate-900/60';

function Panel({
  title,
  subtitle,
  valueHeader,
  empty,
  children
}: {
  title: string;
  subtitle: string;
  valueHeader: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <DashCard title={title} description={subtitle} actions={<span className="text-xs text-neutral-400 dark:text-slate-500">{valueHeader}</span>} padded={false}>
      {empty ? (
        <p className="px-4 py-6 text-center text-sm text-neutral-500 dark:text-slate-500">Nothing in this range.</p>
      ) : (
        <div className="divide-y divide-neutral-100 dark:divide-slate-800">{children}</div>
      )}
    </DashCard>
  );
}

function MethodPill({ method }: { method: string }) {
  return (
    <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-slate-400">
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
    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-neutral-400 dark:text-slate-500">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} aria-hidden />
      {status || '—'}
    </span>
  );
}

function rangeLabel(days: string): string {
  return RANGES.find((range) => range.value === days)?.label ?? `${days}d`;
}

function formatMs(value: number): string {
  if (!value) return '0 ms';
  // Trim a trailing .0 so 21.0 reads as 21.
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ms`;
}
