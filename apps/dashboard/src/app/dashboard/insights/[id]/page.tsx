import { notFound } from 'next/navigation';
import { DashboardShell } from '../../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { InsightBuilder } from '../InsightBuilder';
import type { SavedInsightView } from '@/types/analytics';

export const dynamic = 'force-dynamic';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function EditInsightPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ projectId?: string; dashboardId?: string }>;
}) {
  const { id } = await params;
  const resolvedParams = await searchParams;
  const projectId = firstParam(resolvedParams?.projectId);
  const dashboardId = firstParam(resolvedParams?.dashboardId);

  const session = await requireDashboardSession(
    `/dashboard/insights/${id}${projectId ? `?projectId=${projectId}` : ''}`
  );

  const queryParams = projectId ? `?projectId=${projectId}` : '';
  const { data, error } = await dashboardGet<{ insight: SavedInsightView }>(
    `/v1/dashboard/insights/${id}${queryParams}`,
    session.token
  );

  if (error || !data?.insight) {
    notFound();
  }

  return (
    <DashboardShell
      title={data.insight.name}
      projectId={projectId}
      activeNavKey="insights"
      userEmail={session.user.email}
    >
      <InsightBuilder
        projectId={projectId}
        initialInsight={data.insight}
        insightId={id}
        returnDashboardId={dashboardId}
      />
    </DashboardShell>
  );
}
