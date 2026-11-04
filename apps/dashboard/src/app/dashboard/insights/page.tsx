import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { InsightsLibraryView } from './InsightsLibraryView';
import type { SavedInsightView } from '@/types/analytics';

export const dynamic = 'force-dynamic';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function InsightsPage({
  searchParams
}: {
  searchParams?: Promise<{ projectId?: string }>;
}) {
  const resolvedParams = await searchParams;
  const projectId = firstParam(resolvedParams?.projectId);
  const session = await requireDashboardSession(
    `/dashboard/insights${projectId ? `?projectId=${projectId}` : ''}`
  );

  const queryParams = new URLSearchParams();
  if (projectId) queryParams.set('projectId', projectId);

  const { data } = await dashboardGet<{ insights: SavedInsightView[] }>(
    `/v1/dashboard/insights?${queryParams.toString()}`,
    session.token
  );

  return (
    <DashboardShell
      title="Insights"
      projectId={projectId}
      activeNavKey="insights"
      userEmail={session.user.email}
    >
      <InsightsLibraryView
        projectId={projectId}
        initialInsights={data?.insights || []}
        userId={session.user.id}
      />
    </DashboardShell>
  );
}
