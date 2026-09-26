import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { DashboardsLibraryView } from './DashboardsLibraryView';
import type { DashboardView } from '@/types/analytics';

export const dynamic = 'force-dynamic';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DashboardsPage({
  searchParams
}: {
  searchParams?: Promise<{ projectId?: string; tag?: string; tab?: string }>;
}) {
  const resolvedParams = await searchParams;
  const projectId = firstParam(resolvedParams?.projectId);
  const session = await requireDashboardSession(
    `/dashboard/dashboards${projectId ? `?projectId=${projectId}` : ''}`
  );

  const queryParams = new URLSearchParams();
  if (projectId) queryParams.set('projectId', projectId);
  if (resolvedParams?.tag) queryParams.set('tag', resolvedParams.tag);
  if (resolvedParams?.tab) queryParams.set('tab', resolvedParams.tab);

  const { data } = await dashboardGet<{ dashboards: DashboardView[] }>(
    `/v1/dashboard/dashboards?${queryParams.toString()}`,
    session.token
  );

  return (
    <DashboardShell
      title="Dashboards"
      projectId={projectId}
      activeNavKey="dashboards"
      userEmail={session.user.email}
    >
      <DashboardsLibraryView
        projectId={projectId}
        initialDashboards={data?.dashboards || []}
        userId={session.user.id}
      />
    </DashboardShell>
  );
}
