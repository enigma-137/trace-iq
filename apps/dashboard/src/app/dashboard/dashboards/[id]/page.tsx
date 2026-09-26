import { notFound } from 'next/navigation';
import { DashboardShell } from '../../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { DashboardEditor } from './DashboardEditor';
import type { DashboardView } from '@/types/analytics';

export const dynamic = 'force-dynamic';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DashboardWorkspacePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ projectId?: string }>;
}) {
  const { id } = await params;
  const resolvedParams = await searchParams;
  const projectId = firstParam(resolvedParams?.projectId);

  const session = await requireDashboardSession(
    `/dashboard/dashboards/${id}${projectId ? `?projectId=${projectId}` : ''}`
  );

  const queryParams = projectId ? `?projectId=${projectId}` : '';
  const { data, error } = await dashboardGet<any>(
    `/v1/dashboard/dashboards/${id}${queryParams}`,
    session.token
  );

  const dashboard: DashboardView | null = (data?.dashboard ?? data) as DashboardView | null;

  if (error || !dashboard || !dashboard.id) {
    notFound();
  }

  return (
    <DashboardShell
      title={dashboard.name}
      projectId={projectId}
      activeNavKey="dashboards"
      userEmail={session.user.email}
    >
      <DashboardEditor
        projectId={projectId}
        initialDashboard={dashboard}
      />
    </DashboardShell>
  );
}
