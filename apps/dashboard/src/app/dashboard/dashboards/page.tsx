import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { DashboardsApp } from './DashboardsApp';
import type { DashboardView } from './types';

export const dynamic = 'force-dynamic';

interface DashboardsResponse {
  project: { id: string; name: string } | null;
  dashboards: DashboardView[];
}

export default async function DashboardsPage() {
  const { user, token } = await requireDashboardSession('/dashboard/dashboards');
  const { data, error } = await dashboardGet<DashboardsResponse>('/v1/dashboard/dashboards', token);
  const dashboards = data?.dashboards ?? [];
  const project = data?.project ?? null;

  return (
    <DashboardShell active="dashboards" title="Dashboards" userEmail={user.email}>
      <section className="mb-6 rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Saved dashboards</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-500 dark:text-slate-400">
          Save a view (event type, time range, measures, filters) once, reopen it in one click, and compare a few side by
          side. Each dashboard captures one query — build one from Insights with <span className="font-mono">Save view</span>.
        </p>
      </section>

      {error ? (
        <section className="mb-4 rounded-md border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {error}
        </section>
      ) : null}

      <DashboardsApp projectId={project?.id ?? undefined} initialDashboards={dashboards} userId={user.id} initialToken={token ?? undefined} />
    </DashboardShell>
  );
}
