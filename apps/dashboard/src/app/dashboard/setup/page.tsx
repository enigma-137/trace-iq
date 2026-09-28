import Link from 'next/link';
import { DashboardShell } from '../DashboardShell';
import { SetupWizard } from '../SetupWizard';
import { EmptyState } from '@/components/EmptyState';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

interface SetupResponse {
  hasSetup: boolean;
  organization: { id: string; name: string; slug: string; role: string } | null;
  project: { id: string; organizationId: string; name: string; slug: string } | null;
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
    `/v1/setup${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`,
    token
  );

  const activeProject = data?.project;
  const activeOrg = data?.organization;

  return (
    <DashboardShell
      active="settings"
      title="Setup Wizard"
      userEmail={user.email}
      projectId={activeProject?.id ?? projectId}
      organizationId={activeOrg?.id ?? organizationId}
    >
      <div className="mx-auto max-w-5xl py-4">
        {activeProject ? (
          <SetupWizard
            projectId={activeProject.id}
            projectName={activeProject.name}
            writeKey={data?.writeKey?.value ?? undefined}
            userEmail={user.email}
          />
        ) : (
          <div className="mx-auto max-w-xl py-8">
            <div className="rounded-2xl border border-neutral-200/90 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <EmptyState
                illustrationSrc="/dashboards/connect-app.png"
                illustrationAlt="Connect your application"
                title="Select or create a project"
                description="The Setup Wizard requires an active TraceIQ project. Select a project from your workspace or create a new project to generate your SDK keys and verify incoming telemetry."
                primaryAction={{
                  label: 'Create new project',
                  href: '/dashboard/settings?newProject=1'
                }}
                secondaryAction={{
                  label: 'Return to dashboard',
                  href: '/dashboard'
                }}
              />
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
