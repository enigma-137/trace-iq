import { DashboardShell } from '../DashboardShell';
import { SetupWizard } from '../SetupWizard';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

interface SetupResponse {
  hasSetup: boolean;
  project: { id: string; name: string } | null;
  writeKey: { value: string; prefix: string } | null;
}

export default async function SetupPage({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const { user, token } = await requireDashboardSession('/dashboard/setup');
  const projectId = Array.isArray(searchParams.projectId) ? searchParams.projectId[0] : searchParams.projectId;
  const organizationId = Array.isArray(searchParams.organizationId) ? searchParams.organizationId[0] : searchParams.organizationId;

  const { data } = await dashboardGet<SetupResponse>(
    `/v1/dashboard/setup${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`,
    token
  );

  return (
    <DashboardShell
      active="settings"
      title="Setup Wizard"
      userEmail={user.email}
      projectId={projectId}
      organizationId={organizationId}
    >
      <div className="mx-auto max-w-5xl py-4">
        <SetupWizard
          projectId={data?.project?.id ?? projectId ?? 'prj_default'}
          projectName={data?.project?.name ?? 'My Application'}
          writeKey={data?.writeKey?.value ?? 'tiq_live_default'}
          userEmail={user.email}
        />
      </div>
    </DashboardShell>
  );
}
