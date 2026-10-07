import { DashboardShell } from '../../../../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { RunDetailView } from './RunDetailView';
import type { SyntheticMonitor, SyntheticRun } from '@traceiq/types';

export const dynamic = 'force-dynamic';

export default async function SyntheticRunDetailPage({
  params,
  searchParams
}: {
  params: { id: string; runId: string };
  searchParams?: { projectId?: string };
}) {
  const { user, token } = await requireDashboardSession(
    `/dashboard/synthetic-monitors/${params.id}/runs/${params.runId}`
  );

  const queryParams = new URLSearchParams();
  if (searchParams?.projectId) queryParams.set('projectId', searchParams.projectId);

  const monitorEndpoint = `/v1/dashboard/synthetic-monitors/${params.id}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
  const runEndpoint = `/v1/dashboard/synthetic-runs/${params.runId}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

  const [monitorRes, runRes] = await Promise.all([
    dashboardGet<SyntheticMonitor>(monitorEndpoint, token),
    dashboardGet<SyntheticRun>(runEndpoint, token)
  ]);

  if (!runRes.data) {
    return (
      <DashboardShell active="synthetic-monitors" title="Run Details" userEmail={user.email}>
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-center text-rose-700 dark:border-rose-950 dark:bg-rose-950/40 dark:text-rose-300">
          {runRes.error || 'Synthetic run execution record not found.'}
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell active="synthetic-monitors" title={`Run ${params.runId.slice(0, 8)}`} userEmail={user.email}>
      <RunDetailView
        run={runRes.data}
        monitor={monitorRes.data}
        projectId={searchParams?.projectId}
      />
    </DashboardShell>
  );
}
