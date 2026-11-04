import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { ObservabilityApp } from './ObservabilityApp';
import {
  ObservabilityLog,
  HistogramResponse,
  LogSource
} from './types';

export const dynamic = 'force-dynamic';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

interface LogsApiResponse {
  project: { id: string; name: string } | null;
  logs: ObservabilityLog[];
  hasMore: boolean;
  limit: number;
  offset: number;
}

export default async function DashboardLogsPage({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const { user, token } = await requireDashboardSession('/dashboard/logs');
  const projectId = firstParam(searchParams.projectId);
  const source = firstParam(searchParams.source) ?? 'all';
  const level = firstParam(searchParams.level) ?? '';
  const status = firstParam(searchParams.status) ?? '';
  const search = firstParam(searchParams.search) ?? '';
  // A custom window (e.g. ±1h around a request opened from Requests) when both ends are valid.
  const from = firstParam(searchParams.from) ?? '';
  const to = firstParam(searchParams.to) ?? '';
  const hasWindow = !Number.isNaN(Date.parse(from)) && !Number.isNaN(Date.parse(to)) && !!from && !!to;

  const queryParams = new URLSearchParams();
  if (projectId) queryParams.set('projectId', projectId);
  if (source !== 'all') queryParams.set('source', source);
  if (level) queryParams.set('level', level);
  if (status) queryParams.set('status', status);
  if (search) queryParams.set('search', search);
  if (hasWindow) {
    queryParams.set('from', from);
    queryParams.set('to', to);
  } else {
    // Match the client's default 24h window (the API alone would default to 1h).
    const now = Date.now();
    queryParams.set('from', new Date(now - 24 * 60 * 60 * 1000).toISOString());
    queryParams.set('to', new Date(now).toISOString());
  }
  queryParams.set('limit', '50');

  // `?logId=` opens that entry's detail drawer (same endpoint the drawer uses).
  const logId = firstParam(searchParams.logId);
  const logDetailPath = logId
    ? `/v1/dashboard/logs/${encodeURIComponent(logId)}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`
    : null;

  const [logsResult, histogramResult, logDetailResult] = await Promise.all([
    dashboardGet<LogsApiResponse>(`/v1/dashboard/logs?${queryParams.toString()}`, token),
    dashboardGet<HistogramResponse>(`/v1/dashboard/logs/histogram?${queryParams.toString()}`, token),
    logDetailPath ? dashboardGet<{ log: ObservabilityLog }>(logDetailPath, token) : Promise.resolve({ data: null })
  ]);

  const project = logsResult.data?.project ?? null;
  const initialLogs = logsResult.data?.logs ?? [];
  const initialHasMore = logsResult.data?.hasMore ?? false;
  const initialHistogram: HistogramResponse = histogramResult.data ?? {
    project,
    intervalSeconds: 60,
    buckets: [],
    summary: {
      total: 0,
      success: 0,
      warning: 0,
      error: 0,
      avgDuration: 0,
      p95Duration: 0
    },
    sourceCounts: {}
  };

  return (
    <DashboardShell active="logs" title="Logs & Observability" userEmail={user.email}>
      {/* Main Observability Application Area */}
      <ObservabilityApp
        initialLogs={initialLogs}
        initialHistogram={initialHistogram}
        initialHasMore={initialHasMore}
        projectId={projectId}
        project={project}
        initialSelectedLog={logDetailResult.data?.log ?? null}
        initialFilters={{
          search,
          ...(source !== 'all' ? { source: source as LogSource } : {}),
          ...(hasWindow ? { timeRange: 'custom' as const, from, to } : {})
        }}
      />
    </DashboardShell>
  );
}
