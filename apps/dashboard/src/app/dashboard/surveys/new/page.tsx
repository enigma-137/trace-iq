import { DashboardShell } from '../../DashboardShell';
import { requireDashboardSession } from '@/lib/dashboard';
import { SurveyBuilder } from '../SurveyBuilder';

export const dynamic = 'force-dynamic';

export default async function NewSurveyPage({
  searchParams
}: {
  searchParams?: { projectId?: string };
}) {
  const { user, token } = await requireDashboardSession('/dashboard/surveys/new');

  return (
    <DashboardShell active="surveys" title="Create Survey" userEmail={user.email}>
      <SurveyBuilder projectId={searchParams?.projectId} token={token} />
    </DashboardShell>
  );
}
