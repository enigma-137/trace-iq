import Link from 'next/link';
import { DashboardShell } from '../DashboardShell';
import { SetupWizard } from '../SetupWizard';
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
          <div className="mx-auto max-w-xl py-12 text-center">
            <div className="rounded-xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-xl text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                ⚠️
              </div>
              <h2 className="mt-4 text-lg font-semibold text-neutral-900 dark:text-white">
                No Project Selected
              </h2>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                The Setup Wizard must be scoped to an existing TraceIQ project. Please select or create a project first before continuing integration.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/dashboard/settings?newProject=1"
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"
                >
                  Create New Project →
                </Link>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  Return to Dashboard
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
