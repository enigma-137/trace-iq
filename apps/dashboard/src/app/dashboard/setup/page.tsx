import { DashboardShell } from '../DashboardShell';
import { SetupWizard } from '../SetupWizard';
import { EmptyState } from '@/components/EmptyState';
import { dashboardGet, readActiveProjectCookie, requireDashboardSession } from '@/lib/dashboard';

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

  // /v1/setup ignores the active-project header and returns the organization's
  // first project, so pass the project the user last switched to explicitly.
  // A stale cookie (deleted or inaccessible project) falls back to the default.
  const preferredProjectId = projectId ?? readActiveProjectCookie() ?? undefined;
  const setupPath = (id?: string) => `/v1/setup${id ? `?projectId=${encodeURIComponent(id)}` : ''}`;

  let { data } = await dashboardGet<SetupResponse>(setupPath(preferredProjectId), token);
  if (!data?.project && preferredProjectId && !projectId) {
    ({ data } = await dashboardGet<SetupResponse>(setupPath(), token));
  }

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
            key={activeProject.id}
            projectId={activeProject.id}
            projectName={activeProject.name}
            organizationId={activeOrg?.id ?? organizationId}
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
