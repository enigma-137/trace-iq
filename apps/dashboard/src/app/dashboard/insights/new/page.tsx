import { DashboardShell } from '../../DashboardShell';
import { requireDashboardSession } from '@/lib/dashboard';
import { InsightBuilder } from '../InsightBuilder';

export const dynamic = 'force-dynamic';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function NewInsightPage({
  searchParams
}: {
  searchParams?: Promise<{ projectId?: string; dashboardId?: string }>;
}) {
  const resolvedParams = await searchParams;
  const projectId = firstParam(resolvedParams?.projectId);
  const dashboardId = firstParam(resolvedParams?.dashboardId);
  const session = await requireDashboardSession(
    `/dashboard/insights/new${projectId ? `?projectId=${projectId}` : ''}`
  );

  return (
    <DashboardShell
      title="New Insight"
      projectId={projectId}
      activeNavKey="insights"
      userEmail={session.user.email}
    >
      <InsightBuilder
        projectId={projectId}
        returnDashboardId={dashboardId}
      />
    </DashboardShell>
  );
}
