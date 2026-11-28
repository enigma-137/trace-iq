import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { ImportPanel, type ImportJob } from './ImportPanel';

export const dynamic = 'force-dynamic';

interface ProjectResponse {
  project: { id: string; name: string } | null;
}

export default async function ImportPage({
  searchParams
}: {
  searchParams?: Promise<{ projectId?: string }> | { projectId?: string };
}) {
  const resolvedParams = searchParams ? await Promise.resolve(searchParams) : {};
  const projectId = resolvedParams.projectId;
  const { user, token } = await requireDashboardSession(
    projectId ? `/dashboard/import?projectId=${encodeURIComponent(projectId)}` : '/dashboard/import'
  );

  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  const [{ data: projectData }, { data: jobsData }] = await Promise.all([
    dashboardGet<ProjectResponse>(`/v1/dashboard/insights/event-names${query}`, token),
    dashboardGet<{ jobs: ImportJob[] }>(`/v1/dashboard/import/jobs${query}`, token)
  ]);
  const project = projectData?.project ?? null;

  return (
    <DashboardShell
      active="import"
      title="Import"
      userEmail={user.email}
      projectId={projectId ?? project?.id}
      projectName={project?.name}
    >
      <ImportPanel projectId={projectId ?? project?.id} projectName={project?.name} initialJobs={jobsData?.jobs ?? []} />
    </DashboardShell>
  );
}
