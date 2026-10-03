import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { ErrorTrackingClientView, ErrorIssueItem, IssueDetailData } from './ErrorTrackingClientView';

export const dynamic = 'force-dynamic';

interface IssuesResponse {
  project: { id: string; name: string } | null;
  days: number;
  issues: ErrorIssueItem[];
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ErrorsPage({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const { user, token } = await requireDashboardSession('/dashboard/errors');
  const days = firstParam(searchParams.days) ?? '14';
  const selType = firstParam(searchParams.type);
  const selMessage = firstParam(searchParams.message);

  const { data, error } = await dashboardGet<IssuesResponse>(`/v1/dashboard/errors?days=${days}`, token);
  const issues = data?.issues ?? [];

  // Determine active issue to fetch details for
  const targetType = selType ?? issues[0]?.type;
  const targetMessage = selMessage ?? issues[0]?.message;

  let detail: IssueDetailData | null = null;
  if (targetType && targetMessage) {
    const q = new URLSearchParams({ type: targetType, message: targetMessage, days });
    const result = await dashboardGet<IssueDetailData>(`/v1/dashboard/errors/issue?${q.toString()}`, token);
    detail = result.data;
  }

  return (
    <DashboardShell active="errors" title="Error tracking" userEmail={user.email ?? undefined}>
      {error ? (
        <section className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-400">
          {error}
        </section>
      ) : null}

      <ErrorTrackingClientView
        initialIssues={issues}
        initialDetail={detail}
        selectedType={targetType}
        selectedMessage={targetMessage}
        days={days}
        userEmail={user.email ?? undefined}
      />
    </DashboardShell>
  );
}
