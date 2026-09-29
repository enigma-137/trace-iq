import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { SurveyList } from './SurveyList';
import type { Survey } from '@traceiq/types';

export const dynamic = 'force-dynamic';

interface SurveysResponse {
  project: { id: string; name: string } | null;
  surveys: Array<Survey & { responseCount?: number; impressionCount?: number; responseRate?: number }>;
  metrics: {
    total: number;
    published: number;
    closed: number;
    draft: number;
    totalResponses: number;
  };
}

export default async function SurveysPage({
  searchParams
}: {
  searchParams?: { projectId?: string; environment?: string };
}) {
  const { user, token } = await requireDashboardSession('/dashboard/surveys');

  const queryParams = new URLSearchParams();
  if (searchParams?.projectId) queryParams.set('projectId', searchParams.projectId);
  if (searchParams?.environment) queryParams.set('environment', searchParams.environment);

  const endpoint = `/v1/dashboard/surveys${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
  const { data, error } = await dashboardGet<SurveysResponse>(endpoint, token);

  const metrics = data?.metrics ?? { total: 0, published: 0, closed: 0, draft: 0, totalResponses: 0 };

  return (
    <DashboardShell active="surveys" title="Surveys" userEmail={user.email}>
      {/* Intro Header Section */}
      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                User Feedback & CSAT
              </span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-2xl">
              Capture Direct User Voice & NPS Inside Your Product
            </h2>
            <p className="text-xs leading-relaxed text-neutral-600 dark:text-slate-400 sm:text-sm">
              Deliver targeted in-app micro-surveys, rating scales, and NPS prompts without interrupting user flow. Analyze qualitative and quantitative feedback in real time alongside your product analytics.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 shrink-0">
            <div className="rounded-lg border border-neutral-100 bg-neutral-50/70 p-3 text-center dark:border-slate-800 dark:bg-slate-900/60">
              <div className="text-lg font-bold text-neutral-900 dark:text-white">{metrics.total}</div>
              <div className="text-[11px] font-medium text-neutral-500 dark:text-slate-400">Total</div>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 text-center dark:border-emerald-950/40 dark:bg-emerald-950/20">
              <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{metrics.published}</div>
              <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-500">Active</div>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-center dark:border-blue-950/40 dark:bg-blue-950/20">
              <div className="text-lg font-bold text-blue-700 dark:text-blue-400">{metrics.totalResponses.toLocaleString()}</div>
              <div className="text-[11px] font-medium text-blue-600 dark:text-blue-500">Responses</div>
            </div>
            <div className="rounded-lg border border-neutral-100 bg-neutral-50/70 p-3 text-center dark:border-slate-800 dark:bg-slate-900/60">
              <div className="text-lg font-bold text-neutral-700 dark:text-slate-300">{metrics.draft}</div>
              <div className="text-[11px] font-medium text-neutral-500 dark:text-slate-400">Drafts</div>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <section className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </section>
      ) : null}

      <SurveyList
        initialSurveys={data?.surveys ?? []}
        projectId={searchParams?.projectId ?? data?.project?.id}
        token={token}
      />
    </DashboardShell>
  );
}
