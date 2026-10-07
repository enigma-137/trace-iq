import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { SyntheticMonitorList } from './SyntheticMonitorList';
import type { SyntheticMonitorSummary } from '@traceiq/types';

export const dynamic = 'force-dynamic';

interface SyntheticMonitorsResponse {
  monitors: SyntheticMonitorSummary[];
}

export default async function SyntheticMonitorsPage({
  searchParams
}: {
  searchParams?: { projectId?: string };
}) {
  const { user, token } = await requireDashboardSession('/dashboard/synthetic-monitors');

  const queryParams = new URLSearchParams();
  if (searchParams?.projectId) queryParams.set('projectId', searchParams.projectId);

  const endpoint = `/v1/dashboard/synthetic-monitors${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
  const { data, error } = await dashboardGet<SyntheticMonitorsResponse>(endpoint, token);

  const monitors = data?.monitors ?? [];
  const total = monitors.length;
  const active = monitors.filter((m) => m.status === 'active').length;
  const healthy = monitors.filter((m) => m.lastRunStatus === 'passed').length;
  const failing = monitors.filter((m) => m.lastRunStatus === 'failed' || m.lastRunStatus === 'timed_out').length;

  return (
    <DashboardShell active="synthetic-monitors" title="Synthetic Monitors" userEmail={user.email}>
      {/* Intro Header Section */}
      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                Deterministic Journey Testing
              </span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-2xl">
              Catch Broken Flows Before Real Users Notice
            </h2>
            <p className="text-xs leading-relaxed text-neutral-600 dark:text-slate-400 sm:text-sm">
              Schedule Playwright headless browser checks to simulate critical user journeys across checkout, signup, login, and workflows. Get instant failure diagnostics with step timelines, console errors, network failures, and screenshots.
            </p>
          </div>

          {/* Quick Metrics Summary */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 shrink-0">
            <div className="rounded-lg border border-neutral-100 bg-neutral-50/70 p-3 text-center dark:border-slate-800 dark:bg-slate-900/60">
              <div className="text-lg font-bold text-neutral-900 dark:text-white">{total}</div>
              <div className="text-[11px] font-medium text-neutral-500 dark:text-slate-400">Total</div>
            </div>
            <div className="rounded-lg border border-neutral-100 bg-neutral-50/70 p-3 text-center dark:border-slate-800 dark:bg-slate-900/60">
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{active}</div>
              <div className="text-[11px] font-medium text-neutral-500 dark:text-slate-400">Active</div>
            </div>
            <div className="rounded-lg border border-neutral-100 bg-neutral-50/70 p-3 text-center dark:border-slate-800 dark:bg-slate-900/60">
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{healthy}</div>
              <div className="text-[11px] font-medium text-neutral-500 dark:text-slate-400">Passing</div>
            </div>
            <div className="rounded-lg border border-neutral-100 bg-neutral-50/70 p-3 text-center dark:border-slate-800 dark:bg-slate-900/60">
              <div className="text-lg font-bold text-rose-600 dark:text-rose-400">{failing}</div>
              <div className="text-[11px] font-medium text-neutral-500 dark:text-slate-400">Failing</div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Monitors Component */}
      <SyntheticMonitorList
        initialMonitors={monitors}
        projectId={searchParams?.projectId}
        token={token}
        error={error}
      />
    </DashboardShell>
  );
}
