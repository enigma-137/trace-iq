import Link from 'next/link';
import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { EmptyState } from '@/components/EmptyState';
import { DAY_OPTIONS, GroupSummary, Stat, TraitChips, firstParam, formatDate, groupHref } from './shared';

export const dynamic = 'force-dynamic';

interface GroupsResponse {
  project: { id: string; name: string } | null;
  days: number;
  groups: GroupSummary[];
  total: number;
}

export default async function GroupsPage({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const { user, token } = await requireDashboardSession('/dashboard/groups');
  const days = firstParam(searchParams.days) ?? '30';
  const search = firstParam(searchParams.search)?.trim() ?? '';
  const projectId = firstParam(searchParams.projectId);

  const query = new URLSearchParams({ days });
  if (search) query.set('search', search);
  if (projectId) query.set('projectId', projectId);
  const { data, error } = await dashboardGet<GroupsResponse>(`/v1/dashboard/groups?${query.toString()}`, token);

  const groups = data?.groups ?? [];
  const activeGroups = groups.filter((group) => group.events > 0).length;
  const members = groups.reduce((sum, group) => sum + group.members, 0);

  return (
    <DashboardShell active="groups" title="Groups" userEmail={user.email ?? undefined} projectId={data?.project?.id ?? projectId}>
      {error ? (
        <section className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-400">
          {error}
        </section>
      ) : null}

      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
        <input
          type="search"
          name="search"
          defaultValue={search}
          placeholder="Search by name or id"
          aria-label="Search groups"
          className="h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 sm:w-72 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
        />
        <select
          name="days"
          defaultValue={days}
          aria-label="Time range"
          className="h-9 rounded-md border border-neutral-300 bg-white px-2 text-sm text-neutral-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
        >
          {DAY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          Apply
        </button>
      </form>

      {data?.project && (groups.length > 0 || search) ? (
        <section className="mb-4 grid gap-3 sm:grid-cols-3">
          <Stat label="Groups" value={(data.total ?? groups.length).toLocaleString()} hint={search ? `matching “${search}”` : 'reported with group()'} />
          <Stat label="Active groups" value={activeGroups.toLocaleString()} hint={`with activity in the last ${data.days} days`} />
          <Stat label="Members" value={members.toLocaleString()} hint="people who joined a listed group" />
        </section>
      ) : null}

      {data?.project && groups.length === 0 ? (
        <section className="rounded-md border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
          <EmptyState
            illustrationSrc="/dashboards/connect-app.png"
            illustrationAlt="No groups yet"
            title={search ? 'No groups match your search' : 'No groups yet'}
            description={
              search ? (
                'Try another name or id.'
              ) : (
                <>
                  Call <code className="font-mono">traceiq.group({'{'} organizationId, traits: {'{'} name {'}'} {'}'})</code> when a person
                  signs in to an account. Each account then shows up here with its members and their activity.
                </>
              )
            }
            primaryAction={search ? undefined : { label: 'Read the docs', href: '/docs?page=methods' }}
          />
        </section>
      ) : null}

      {groups.length > 0 ? (
        <section className="overflow-hidden rounded-md border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          <div className="hidden grid-cols-[minmax(0,2fr)_90px_110px_100px_120px] gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 md:grid dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            <span>Group</span>
            <span className="text-right">Members</span>
            <span className="text-right">Active members</span>
            <span className="text-right">Events</span>
            <span className="text-right">Last active</span>
          </div>
          <ul className="divide-y divide-neutral-100 dark:divide-slate-800/80">
            {groups.map((group) => (
              <li key={group.key}>
                <Link
                  href={groupHref(group.key, { days, projectId })}
                  className="grid gap-2 px-4 py-3 transition-colors hover:bg-neutral-50 md:grid-cols-[minmax(0,2fr)_90px_110px_100px_120px] md:items-center md:gap-3 dark:hover:bg-slate-900/60"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{group.name}</p>
                    {group.name !== group.key ? <p className="truncate font-mono text-[11px] text-neutral-500 dark:text-slate-400">{group.key}</p> : null}
                    <TraitChips traits={group.traits} skip={['name']} />
                  </div>
                  <Cell label="Members" value={group.members.toLocaleString()} />
                  <Cell label="Active" value={group.activeMembers.toLocaleString()} />
                  <Cell label="Events" value={group.events.toLocaleString()} />
                  <Cell label="Last active" value={formatDate(group.lastActiveAt)} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </DashboardShell>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex justify-between text-xs tabular-nums text-neutral-700 md:block md:text-right dark:text-slate-300">
      <span className="text-neutral-400 md:hidden dark:text-slate-500">{label}</span>
      {value}
    </span>
  );
}
