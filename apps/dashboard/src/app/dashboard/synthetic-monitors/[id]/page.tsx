import { DashboardShell } from '../../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { MonitorDetailView } from './MonitorDetailView';
import type { SyntheticMonitor, SyntheticRun } from '@traceiq/types';

export const dynamic = 'force-dynamic';

interface MonitorDetailResponse extends SyntheticMonitor {}

interface RunsResponse {
  runs: SyntheticRun[];
}

export default async function SyntheticMonitorDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: { projectId?: string };
}) {
  const { user, token } = await requireDashboardSession(`/dashboard/synthetic-monitors/${params.id}`);

  const queryParams = new URLSearchParams();
  if (searchParams?.projectId) queryParams.set('projectId', searchParams.projectId);

  const monitorEndpoint = `/v1/dashboard/synthetic-monitors/${params.id}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
  const runsEndpoint = `/v1/dashboard/synthetic-monitors/${params.id}/runs${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

  const [monitorRes, runsRes] = await Promise.all([
    dashboardGet<MonitorDetailResponse>(monitorEndpoint, token),
    dashboardGet<RunsResponse>(runsEndpoint, token)
  ]);

  if (!monitorRes.data) {
    return (
      <DashboardShell active="synthetic-monitors" title="Monitor Details" userEmail={user.email}>
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-center text-rose-700 dark:border-rose-950 dark:bg-rose-950/40 dark:text-rose-300">
          {monitorRes.error || 'Synthetic monitor not found.'}
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell active="synthetic-monitors" title={monitorRes.data.name} userEmail={user.email}>
      <MonitorDetailView
        monitor={monitorRes.data}
        runs={runsRes.data?.runs || []}
        projectId={searchParams?.projectId}
        token={token}
      />
    </DashboardShell>
  );
}
