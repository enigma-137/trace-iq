import { notFound } from 'next/navigation';
import { DashboardShell } from '../../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { FlagDetailsView } from './FlagDetailsView';
import { FlagItem } from '../FlagManager';

export const dynamic = 'force-dynamic';

interface FlagDetailResponse {
  project: { id: string; name: string } | null;
  flag: FlagItem;
  audienceEstimate: {
    totalUsers: number;
    estimatedReceivingUsers: number;
  };
}

export default async function FlagDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: { projectId?: string; tab?: string };
}) {
  const { user, token } = await requireDashboardSession(`/dashboard/flags/${params.id}`);
  const projectId = searchParams?.projectId;
  const url = `/v1/dashboard/flags/${params.id}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`;
  const { data, error } = await dashboardGet<FlagDetailResponse>(url, token);

  if (error || !data?.flag) {
    notFound();
  }

  return (
    <DashboardShell
      active="flags"
      title={data.flag.name}
      userEmail={user.email}
      projectId={projectId}
    >
      <FlagDetailsView
        flag={data.flag}
        audienceEstimate={data.audienceEstimate}
        projectId={projectId}
        initialTab={searchParams?.tab}
      />
    </DashboardShell>
  );
}
