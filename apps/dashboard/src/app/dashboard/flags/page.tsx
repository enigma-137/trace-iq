import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { FlagItem, FlagManager, FlagSummaryMetrics } from './FlagManager';

export const dynamic = 'force-dynamic';

interface FlagsResponse {
  project: { id: string } | null;
  metrics?: FlagSummaryMetrics;
  flags: FlagItem[];
}

export default async function FlagsPage({
  searchParams
}: {
  searchParams?: { projectId?: string };
}) {
  const { user, token } = await requireDashboardSession('/dashboard/flags');
  const projectId = searchParams?.projectId;
  const url = `/v1/dashboard/flags${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`;
  const { data, error } = await dashboardGet<FlagsResponse>(url, token);

  return (
    <DashboardShell active="flags" title="Feature flags" userEmail={user.email} projectId={projectId}>
      {error ? (
        <section className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </section>
      ) : null}

      <FlagManager
        flags={data?.flags ?? []}
        metrics={data?.metrics}
        projectId={projectId}
      />
    </DashboardShell>
  );
}
