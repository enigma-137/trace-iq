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
      <DashboardsApp
        projectId={project?.id ?? undefined}
        initialDashboards={dashboards}
        userId={user.id}
        initialToken={token ?? undefined}
        initialError={error ?? undefined}
      />
    </DashboardShell>
  );
}
