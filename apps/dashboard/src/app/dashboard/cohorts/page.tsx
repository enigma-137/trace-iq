import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { CohortManager } from './CohortManager';
import type { FilterCondition } from '@/components/SegmentFilters';

export const dynamic = 'force-dynamic';

interface CohortsResponse {
  project: { id: string } | null;
  cohorts: Array<{ id: string; name: string; filters: FilterCondition[]; createdAt: string }>;
}

export default async function CohortsPage() {
  const { user, token } = await requireDashboardSession('/dashboard/cohorts');
  const { data, error } = await dashboardGet<CohortsResponse>('/v1/dashboard/cohorts', token);

  return (
    <DashboardShell active="cohorts" title="Cohorts" userEmail={user.email}>
      <p className="mb-6 max-w-2xl text-sm text-neutral-500 dark:text-slate-400">
        Save a group of users defined by their properties — country, device, plan, or any event property — then apply it to
        Insights and Retention to see how that segment behaves.
      </p>

      {error ? (
        <section className="mb-4 rounded-md border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {error}
        </section>
      ) : null}

      <CohortManager cohorts={data?.cohorts ?? []} />
    </DashboardShell>
  );
}
