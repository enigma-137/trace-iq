import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { ObservabilityApp } from './ObservabilityApp';
import {
  ObservabilityLog,
  HistogramResponse
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

  const queryParams = new URLSearchParams();
  if (projectId) queryParams.set('projectId', projectId);
  if (source !== 'all') queryParams.set('source', source);
  if (level) queryParams.set('level', level);
  if (status) queryParams.set('status', status);
  if (search) queryParams.set('search', search);
  queryParams.set('limit', '50');

  const [logsResult, histogramResult] = await Promise.all([
    dashboardGet<LogsApiResponse>(`/v1/dashboard/logs?${queryParams.toString()}`, token),
    dashboardGet<HistogramResponse>(`/v1/dashboard/logs/histogram?${queryParams.toString()}`, token)
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
      {/* Page Header */}
      <section className="mb-5 flex flex-col justify-between gap-4 rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
              Operational Telemetry
            </p>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              Unified
            </span>
          </div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
            Logs &amp; Observability
          </h2>
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-neutral-500 dark:text-slate-400">
            Real-time operational activity across API requests, webhooks, AI models, background jobs, alerts, and SDK telemetry with distributed trace correlation and automated credential redaction.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            className="inline-flex h-9 items-center justify-center rounded-md border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            href="/docs"
          >
            Telemetry Docs ↗
          </a>
        </div>
      </section>

      {/* Main Observability Application Area */}
      <ObservabilityApp
        initialLogs={initialLogs}
        initialHistogram={initialHistogram}
        initialHasMore={initialHasMore}
        projectId={projectId}
        project={project}
      />
    </DashboardShell>
  );
}
