import { DashboardShell } from '../../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { SyntheticMonitorForm } from './SyntheticMonitorForm';
import type { FunnelSyntheticDraft, ReplaySyntheticDraft } from '@traceiq/types';

export const dynamic = 'force-dynamic';

export default async function NewSyntheticMonitorPage({
  searchParams
}: {
  searchParams?: { projectId?: string; funnelId?: string; replayId?: string };
}) {
  const { user, token } = await requireDashboardSession('/dashboard/synthetic-monitors/new');

  let initialFunnelDraft: FunnelSyntheticDraft | undefined;
  let initialReplayDraft: ReplaySyntheticDraft | undefined;

  if (searchParams?.funnelId && token) {
    const draftRes = await dashboardGet<FunnelSyntheticDraft>(
      `/v1/dashboard/funnels/${searchParams.funnelId}/synthetic-draft${searchParams.projectId ? `?projectId=${searchParams.projectId}` : ''}`,
      token
    );
    if (draftRes.data) {
      initialFunnelDraft = draftRes.data;
    }
  } else if (searchParams?.replayId && token) {
    const draftRes = await dashboardGet<ReplaySyntheticDraft>(
      `/v1/dashboard/replays/${searchParams.replayId}/synthetic-draft${searchParams.projectId ? `?projectId=${searchParams.projectId}` : ''}`,
      token
    );
    if (draftRes.data) {
      initialReplayDraft = draftRes.data;
    }
  }

  const title = initialReplayDraft
    ? 'Convert Session Replay to Monitor'
    : initialFunnelDraft
    ? `Convert ${initialFunnelDraft.source.name} to Monitor`
    : 'Create Synthetic Monitor';

  return (
    <DashboardShell
      active="synthetic-monitors"
      title={title}
      userEmail={user.email}
    >
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-2xl">
            {initialReplayDraft
              ? 'Convert Session Replay to Synthetic Monitor'
              : initialFunnelDraft
              ? `Convert Funnel: ${initialFunnelDraft.source.name}`
              : 'Create New Synthetic Monitor'}
          </h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-slate-400">
            {initialReplayDraft
              ? `Extracted deterministic browser interaction journey from session ${initialReplayDraft.source.sessionId}. Review selectors, parameters, and assertions before activating.`
              : initialFunnelDraft
              ? `Review the analytics milestones from "${initialFunnelDraft.source.name}" and configure the browser interactions required to verify each step.`
              : 'Define target URL, execution schedule, browser viewport, and the deterministic step journey to test.'}
          </p>
        </div>

        <SyntheticMonitorForm
          projectId={searchParams?.projectId}
          initialDraft={initialFunnelDraft}
          initialReplayDraft={initialReplayDraft}
          token={token}
        />
      </div>
    </DashboardShell>
  );
}
