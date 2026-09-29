import { notFound } from 'next/navigation';
import { DashboardShell } from '../../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { SurveyResultsView } from './SurveyResultsView';
import type { Survey, SurveyResults } from '@traceiq/types';

export const dynamic = 'force-dynamic';

interface SurveyDetailResponse {
  project: { id: string; name: string } | null;
  survey: Survey;
  results: SurveyResults;
}

export default async function SurveyDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: { projectId?: string };
}) {
  const { user, token } = await requireDashboardSession(`/dashboard/surveys/${params.id}`);

  const queryParams = new URLSearchParams();
  if (searchParams?.projectId) queryParams.set('projectId', searchParams.projectId);

  const endpoint = `/v1/dashboard/surveys/${params.id}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
  const { data, error } = await dashboardGet<SurveyDetailResponse>(endpoint, token);

  if (error || !data?.survey) {
    return notFound();
  }

  return (
    <DashboardShell active="surveys" title={data.survey.name} userEmail={user.email}>
      <SurveyResultsView
        survey={data.survey}
        initialResults={data.results}
        projectId={searchParams?.projectId ?? data.project?.id}
        token={token}
      />
    </DashboardShell>
  );
}
