import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import {
  ErrorTrackingClientView,
  ErrorIssueItem,
  IssueCounts,
  IssueDetailData,
  IssueStatusFilter
} from './ErrorTrackingClientView';

export const dynamic = 'force-dynamic';

interface IssuesResponse {
  project: { id: string; name: string } | null;
  days: number;
  issues: ErrorIssueItem[];
  counts?: IssueCounts;
}

const STATUS_FILTERS: IssueStatusFilter[] = ['open', 'resolved', 'ignored', 'all'];
const EMPTY_COUNTS: IssueCounts = { all: 0, open: 0, regressed: 0, resolved: 0, ignored: 0 };

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
  const statusParam = firstParam(searchParams.status) as IssueStatusFilter | undefined;
  const status: IssueStatusFilter = statusParam && STATUS_FILTERS.includes(statusParam) ? statusParam : 'open';
  // `type` + `message` come from older links (e.g. the overview's top errors).
  const selId = firstParam(searchParams.issue);
  const selType = firstParam(searchParams.type);
  const selMessage = firstParam(searchParams.message);

  const { data, error } = await dashboardGet<IssuesResponse>(`/v1/dashboard/errors?days=${days}&status=${status}`, token);
  const issues = data?.issues ?? [];

  let detail: IssueDetailData | null = null;
  const detailQuery = selId
    ? new URLSearchParams({ id: selId, days })
    : selType && selMessage
      ? new URLSearchParams({ type: selType, message: selMessage, days })
      : issues[0]
        ? new URLSearchParams({ id: issues[0].id, days })
        : null;
  if (detailQuery) {
    const result = await dashboardGet<IssueDetailData>(`/v1/dashboard/errors/issue?${detailQuery.toString()}`, token);
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
        selectedId={selId ?? detail?.issue.id ?? undefined}
        statusFilter={status}
        counts={data?.counts ?? EMPTY_COUNTS}
        days={days}
        userEmail={user.email ?? undefined}
        currentUserId={user.id}
      />
    </DashboardShell>
  );
}
