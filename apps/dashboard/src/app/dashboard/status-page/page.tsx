import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { StatusPageManager, type StatusPageSettings } from './StatusPageManager';

export const dynamic = 'force-dynamic';

export default async function StatusPageSettingsPage({
  searchParams
}: {
  searchParams?: Promise<{ projectId?: string }> | { projectId?: string };
}) {
  const resolvedParams = searchParams ? await Promise.resolve(searchParams) : {};
  const projectId = resolvedParams.projectId;
  const { user, token } = await requireDashboardSession(
    projectId ? `/dashboard/status-page?projectId=${encodeURIComponent(projectId)}` : '/dashboard/status-page'
  );
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  const { data, error } = await dashboardGet<StatusPageSettings>(`/v1/dashboard/status-page${query}`, token);

  return (
    <DashboardShell active="status-page" title="Status page" userEmail={user.email} projectId={projectId}>
      {data ? (
        <StatusPageManager initial={data} projectId={projectId} />
      ) : (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {error ?? 'Could not load the status page settings.'}
        </p>
      )}
    </DashboardShell>
  );
}
