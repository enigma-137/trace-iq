import { notFound } from 'next/navigation';
import { DashboardShell } from '../../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { ExperimentDetailView } from './ExperimentDetailView';
import type { Experiment, ExperimentResults } from '@traceiq/types';

export const dynamic = 'force-dynamic';

interface ExperimentDetailResponse {
  project: { id: string; name: string } | null;
  experiment: Experiment;
  results: ExperimentResults;
}

export default async function ExperimentDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: { projectId?: string };
}) {
  const { user, token } = await requireDashboardSession(`/dashboard/experiments/${params.id}`);

  const queryParams = new URLSearchParams();
  if (searchParams?.projectId) queryParams.set('projectId', searchParams.projectId);

  const endpoint = `/v1/dashboard/experiments/${params.id}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
  const { data, error } = await dashboardGet<ExperimentDetailResponse>(endpoint, token);

  if (error || !data?.experiment) {
    return notFound();
  }

  return (
    <DashboardShell active="experiments" title={data.experiment.name} userEmail={user.email}>
      <ExperimentDetailView
        experiment={data.experiment}
        initialResults={data.results}
        projectId={searchParams?.projectId ?? data.project?.id}
        token={token}
      />
    </DashboardShell>
  );
}
