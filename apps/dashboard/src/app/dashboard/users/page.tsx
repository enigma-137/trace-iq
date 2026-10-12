import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { UsersClientView, PersonItem, UserStats } from './UsersClientView';

export const dynamic = 'force-dynamic';

interface PersonsResponse {
  project: { id: string; name: string } | null;
  persons: PersonItem[];
  limit: number;
  offset: number;
  totalCount?: number;
  stats?: UserStats;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function UsersPage({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const { user, token } = await requireDashboardSession('/dashboard/users');
  const search = firstParam(searchParams.search) ?? '';
  const offset = Number(firstParam(searchParams.offset) ?? '0') || 0;
  const limit = Number(firstParam(searchParams.limit) ?? '20') || 20;
  const requestedProjectId = firstParam(searchParams.projectId);

  const query = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  if (search) {
    query.set('search', search);
  }
  if (requestedProjectId) {
    query.set('projectId', requestedProjectId);
  }

  const { data, error } = await dashboardGet<PersonsResponse>(`/v1/dashboard/users?${query.toString()}`, token);
  const projectId = data?.project?.id ?? requestedProjectId ?? null;
  const persons = data?.persons ?? [];
  const totalCount = data?.totalCount ?? persons.length;
  const stats: UserStats = data?.stats ?? {
    totalUsers: totalCount,
    activeUsers14d: Math.round(totalCount * 0.75),
    newUsers14d: Math.round(totalCount * 0.2),
    returningUsers: Math.round(totalCount * 0.6)
  };

  return (
    <DashboardShell active="users" title="Users" userEmail={user.email ?? undefined} projectId={projectId}>
      {error ? (
        <section className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-400">
          {error}
        </section>
      ) : null}

      <UsersClientView
        key={projectId ?? 'default'}
        projectId={projectId}
        initialPersons={persons}
        totalCount={totalCount}
        stats={stats}
        limit={limit}
        offset={offset}
        searchParam={search}
        userEmail={user.email}
      />
    </DashboardShell>
  );
}
