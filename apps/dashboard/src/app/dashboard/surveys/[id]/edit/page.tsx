import { notFound } from 'next/navigation';
import { DashboardShell } from '../../../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { SurveyBuilder } from '../../SurveyBuilder';
import type { Survey } from '@traceiq/types';

export const dynamic = 'force-dynamic';

interface SurveyDetailResponse {
  project: { id: string; name: string } | null;
  survey: Survey;
}

export default async function EditSurveyPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: { projectId?: string };
}) {
  const { user, token } = await requireDashboardSession(`/dashboard/surveys/${params.id}/edit`);

  const queryParams = new URLSearchParams();
  if (searchParams?.projectId) queryParams.set('projectId', searchParams.projectId);

  const endpoint = `/v1/dashboard/surveys/${params.id}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
  const { data, error } = await dashboardGet<SurveyDetailResponse>(endpoint, token);

  if (error || !data?.survey) {
    return notFound();
  }

  return (
    <DashboardShell active="surveys" title={`Edit: ${data.survey.name}`} userEmail={user.email}>
      <SurveyBuilder
        initialSurvey={data.survey}
        projectId={searchParams?.projectId ?? data.project?.id}
        token={token}
      />
    </DashboardShell>
  );
}
