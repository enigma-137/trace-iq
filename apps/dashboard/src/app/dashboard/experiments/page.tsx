import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { ExperimentList } from './ExperimentList';
import type { Experiment } from '@traceiq/types';

export const dynamic = 'force-dynamic';

interface ExperimentsResponse {
  project: { id: string; name: string } | null;
  experiments: Experiment[];
  metrics: {
    total: number;
    running: number;
    completed: number;
    draft: number;
  };
}

export default async function ExperimentsPage({
  searchParams
}: {
  searchParams?: { projectId?: string; environment?: string };
}) {
  const { user, token } = await requireDashboardSession('/dashboard/experiments');

  const queryParams = new URLSearchParams();
  if (searchParams?.projectId) queryParams.set('projectId', searchParams.projectId);
  if (searchParams?.environment) queryParams.set('environment', searchParams.environment);

  const endpoint = `/v1/dashboard/experiments${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
  const { data, error } = await dashboardGet<ExperimentsResponse>(endpoint, token);

  const metrics = data?.metrics ?? { total: 0, running: 0, completed: 0, draft: 0 };

  return (
    <DashboardShell active="experiments" title="Experiments" userEmail={user.email}>
      {/* Intro Header Section */}
      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                A/B & Multivariate Testing
              </span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-2xl">
              Optimize User Experience with Controlled Experiments
            </h2>
            <p className="text-xs leading-relaxed text-neutral-600 dark:text-slate-400 sm:text-sm">
              Deploy UI and feature variants with deterministic traffic allocation. Measure primary conversion events with mathematical rigor and statistical confidence before rolling out changes to 100% of your audience.
            </p>
          </div>

          {/* Quick Metrics Summary */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 shrink-0">
            <div className="rounded-lg border border-neutral-100 bg-neutral-50/70 p-3 text-center dark:border-slate-800 dark:bg-slate-900/60">
              <div className="text-lg font-bold text-neutral-900 dark:text-white">{metrics.total}</div>
              <div className="text-[11px] font-medium text-neutral-500 dark:text-slate-400">Total</div>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 text-center dark:border-emerald-950/40 dark:bg-emerald-950/20">
              <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{metrics.running}</div>
              <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-500">Running</div>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-center dark:border-blue-950/40 dark:bg-blue-950/20">
              <div className="text-lg font-bold text-blue-700 dark:text-blue-400">{metrics.completed}</div>
              <div className="text-[11px] font-medium text-blue-600 dark:text-blue-500">Completed</div>
            </div>
            <div className="rounded-lg border border-neutral-100 bg-neutral-50/70 p-3 text-center dark:border-slate-800 dark:bg-slate-900/60">
              <div className="text-lg font-bold text-neutral-700 dark:text-slate-300">{metrics.draft}</div>
              <div className="text-[11px] font-medium text-neutral-500 dark:text-slate-400">Drafts</div>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <section className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </section>
      ) : null}

      <ExperimentList
        initialExperiments={data?.experiments ?? []}
        projectId={searchParams?.projectId ?? data?.project?.id}
        token={token}
      />
    </DashboardShell>
  );
}
