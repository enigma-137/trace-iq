import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import type { ReplayListItem } from '@/features/replay/types';
import { ReplaysWorkspace } from './ReplaysWorkspace';

export const dynamic = 'force-dynamic';

export default async function ReplaysPage({
  searchParams
}: {
  searchParams: { projectId?: string; sessionId?: string; userId?: string; anonymousId?: string };
}) {
  const { user, token } = await requireDashboardSession('/dashboard/replays');
  const query = new URLSearchParams();
  if (searchParams.projectId) query.set('projectId', searchParams.projectId);
  if (searchParams.sessionId) query.set('sessionId', searchParams.sessionId);
  if (searchParams.userId) query.set('userId', searchParams.userId);
  if (searchParams.anonymousId) query.set('anonymousId', searchParams.anonymousId);

  const { data, error } = await dashboardGet<{
    project: { id: string; organizationId: string };
    replays: ReplayListItem[];
  }>(`/v1/dashboard/replays?${query}`, token);

  const project = data?.project;

  return (
    <DashboardShell
      active="replays"
      title="Session Replays"
      userEmail={user.email}
      projectId={project?.id ?? searchParams.projectId}
      organizationId={project?.organizationId}
    >
      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <ReplaysWorkspace
        initialReplays={data?.replays ?? []}
        projectId={project?.id ?? searchParams.projectId}
        organizationId={project?.organizationId}
        initialSessionId={searchParams.sessionId}
      />
    </DashboardShell>
  );
}
