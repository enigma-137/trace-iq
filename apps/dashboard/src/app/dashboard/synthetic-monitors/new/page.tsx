import { DashboardShell } from '../../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { SyntheticMonitorForm } from './SyntheticMonitorForm';
import type { FunnelSyntheticDraft } from '@traceiq/types';

export const dynamic = 'force-dynamic';

export default async function NewSyntheticMonitorPage({
  searchParams
}: {
  searchParams?: { projectId?: string; funnelId?: string };
}) {
  const { user, token } = await requireDashboardSession('/dashboard/synthetic-monitors/new');

  let initialDraft: FunnelSyntheticDraft | undefined;
  if (searchParams?.funnelId && token) {
    const draftRes = await dashboardGet<FunnelSyntheticDraft>(
      `/v1/dashboard/funnels/${searchParams.funnelId}/synthetic-draft${searchParams.projectId ? `?projectId=${searchParams.projectId}` : ''}`,
      token
    );
    if (draftRes.data) {
      initialDraft = draftRes.data;
    }
  }

  return (
    <DashboardShell
      active="synthetic-monitors"
      title={initialDraft ? `Convert ${initialDraft.source.name} to Monitor` : 'Create Synthetic Monitor'}
      userEmail={user.email}
    >
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-2xl">
            {initialDraft ? `Convert Funnel: ${initialDraft.source.name}` : 'Create New Synthetic Monitor'}
          </h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-slate-400">
            {initialDraft
              ? `Review the analytics milestones from "${initialDraft.source.name}" and configure the browser interactions required to verify each step.`
              : 'Define target URL, execution schedule, browser viewport, and the deterministic step journey to test.'}
          </p>
        </div>

        <SyntheticMonitorForm
          projectId={searchParams?.projectId}
          initialDraft={initialDraft}
          token={token}
        />
      </div>
    </DashboardShell>
  );
}
