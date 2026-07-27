import Link from 'next/link';
import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { UsersSearch } from './UsersSearch';

export const dynamic = 'force-dynamic';

interface PersonsResponse {
  persons: Array<{
    id: string;
    externalId: string | null;
    anonymousId: string | null;
    eventCount: number;
    firstSeenAt: string;
    lastSeenAt: string;
  }>;
  limit: number;
  offset: number;
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

  const query = new URLSearchParams({ offset: String(offset) });
  if (search) {
    query.set('search', search);
  }

  const { data, error } = await dashboardGet<PersonsResponse>(`/v1/dashboard/users?${query.toString()}`, token);
  const persons = data?.persons ?? [];
  const limit = data?.limit ?? 25;
  const hasNext = persons.length === limit;

  return (
    <DashboardShell active="users" title="Users" userEmail={user.email}>
      <section className="mb-6 rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">People</h2>
        <p className="mt-1 mb-4 text-sm text-neutral-500 dark:text-slate-400">
          Identified users (created when the SDK calls <code className="font-mono">identify()</code>). Click a user to see their
          timeline.
        </p>
        <UsersSearch initialValue={search} />
      </section>

      {error ? (
        <section className="mb-4 rounded-md border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {error}
        </section>
      ) : null}

      <section className="rounded-md border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        {persons.length === 0 ? (
          <p className="p-6 text-sm text-neutral-500 dark:text-slate-500">
            {search ? 'No users match that search.' : 'No identified users yet.'}
          </p>
        ) : (
          <div className="overflow-hidden rounded-md">
            <div className="hidden grid-cols-[2fr_1fr_1fr_1fr] gap-4 border-b border-neutral-200 bg-neutral-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-500 lg:grid">
              <span>User</span>
              <span>Events</span>
              <span>First seen</span>
              <span>Last seen</span>
            </div>
            <div className="divide-y divide-neutral-200 dark:divide-slate-800">
              {persons.map((person) => (
                <Link
                  key={person.id}
                  href={`/dashboard/users/${person.id}`}
                  className="grid gap-2 px-4 py-3.5 transition hover:bg-neutral-50 lg:grid-cols-[2fr_1fr_1fr_1fr] lg:gap-4 dark:hover:bg-slate-900/40"
                >
                  <span className="min-w-0 truncate font-mono text-sm font-medium text-neutral-900 [overflow-wrap:anywhere] dark:text-white">
                    {person.externalId ?? person.anonymousId ?? person.id}
                  </span>
                  <span className="text-sm tabular-nums text-neutral-700 dark:text-slate-300">{person.eventCount.toLocaleString()}</span>
                  <span className="text-sm text-neutral-500 dark:text-slate-400">{formatDate(person.firstSeenAt)}</span>
                  <span className="text-sm text-neutral-500 dark:text-slate-400">{formatDate(person.lastSeenAt)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      {(offset > 0 || hasNext) && persons.length > 0 ? (
        <div className="mt-4 flex items-center justify-between">
          <PageLink search={search} offset={Math.max(offset - limit, 0)} disabled={offset === 0}>
            ← Previous
          </PageLink>
          <PageLink search={search} offset={offset + limit} disabled={!hasNext}>
            Next →
          </PageLink>
        </div>
      ) : null}
    </DashboardShell>
  );
}

function PageLink({
  search,
  offset,
  disabled,
  children
}: {
  search: string;
  offset: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="text-sm text-neutral-300 dark:text-slate-700">{children}</span>;
  }
  const params = new URLSearchParams({ offset: String(offset) });
  if (search) {
    params.set('search', search);
  }
  return (
    <Link
      href={`/dashboard/users?${params.toString()}`}
      className="text-sm font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white"
    >
      {children}
    </Link>
  );
}

function formatDate(value?: string) {
  if (!value) return 'unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date);
}
