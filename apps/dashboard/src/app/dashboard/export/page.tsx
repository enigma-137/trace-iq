import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { ExportPanel } from './ExportPanel';

export const dynamic = 'force-dynamic';

interface EventNamesResponse {
  project: { id: string; name: string } | null;
  eventNames: Array<{ eventName: string; total: number }>;
}

export default async function ExportPage({
  searchParams
}: {
  searchParams?: Promise<{ projectId?: string }> | { projectId?: string };
}) {
  const resolvedParams = searchParams ? await Promise.resolve(searchParams) : {};
  const projectId = resolvedParams.projectId;
  const { user, token } = await requireDashboardSession(
    projectId ? `/dashboard/export?projectId=${encodeURIComponent(projectId)}` : '/dashboard/export'
  );

  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  const { data } = await dashboardGet<EventNamesResponse>(`/v1/dashboard/insights/event-names${query}`, token);

  const eventNames = data?.eventNames.map((item) => item.eventName) ?? [];
  const project = data?.project ?? null;

  return (
    <DashboardShell
      active="export"
      title="Export"
      userEmail={user.email}
      projectId={projectId ?? project?.id}
      projectName={project?.name}
    >
      <ExportPanel
        eventNames={eventNames}
        userEmail={user.email}
        projectId={projectId ?? project?.id}
        projectName={project?.name}
      />
    </DashboardShell>
  );
}

