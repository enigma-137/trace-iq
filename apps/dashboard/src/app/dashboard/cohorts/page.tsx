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
      {/* Intro Header Section */}
      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950 shadow-xs">
        <div className="max-w-3xl space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
              Audience Segmentation
            </span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-2xl">
            Save & Reuse Audience Segments Across Analytics
          </h2>
          <p className="text-sm leading-relaxed text-neutral-600 dark:text-slate-400">
            Cohorts are custom, saved groups of users defined by their attributes and event properties — such as country, device, subscription plan, or custom metadata.
            Build a cohort once to seamlessly filter and compare user behavior in <strong>Retention</strong>, <strong>Insights</strong>, and other dashboard views without rebuilding filter conditions.
          </p>
        </div>
      </section>

      {error ? (
        <section className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </section>
      ) : null}

      <CohortManager cohorts={data?.cohorts ?? []} />
    </DashboardShell>
  );
}
