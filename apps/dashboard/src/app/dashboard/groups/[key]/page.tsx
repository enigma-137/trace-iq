import Link from 'next/link';
import { DashboardShell } from '../../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { DAY_OPTIONS, GroupSummary, Stat, TraitChips, firstParam, formatDate, groupHref } from '../shared';

export const dynamic = 'force-dynamic';

interface GroupDetailResponse {
  project: { id: string; name: string };
  days: number;
  group: GroupSummary & { allTraits: Record<string, unknown> };
  members: Array<{
    id: string;
    userId: string | null;
    displayName: string;
    externalId: string | null;
    email: string | null;
    joinedAt: string;
    events: number;
    lastActiveAt: string | null;
  }>;
  timeline: Array<{ day: string; events: number; activeMembers: number }>;
  topEvents: Array<{ name: string; total: number }>;
}

export default async function GroupDetailPage({
  params,
  searchParams
}: {
  params: { key: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const key = decodeURIComponent(params.key);
  const { user, token } = await requireDashboardSession(`/dashboard/groups/${params.key}`);
  const days = firstParam(searchParams.days) ?? '30';
  const projectId = firstParam(searchParams.projectId);

  const query = new URLSearchParams({ days });
  if (projectId) query.set('projectId', projectId);
  const { data, error } = await dashboardGet<GroupDetailResponse>(
    `/v1/dashboard/groups/${encodeURIComponent(key)}?${query.toString()}`,
    token
  );

  const group = data?.group;
  const peak = Math.max(1, ...(data?.timeline ?? []).map((d) => d.events));
  const topTotal = data?.topEvents.reduce((sum, item) => sum + item.total, 0) || 1;
  const listQuery = new URLSearchParams({ days });
  if (projectId) listQuery.set('projectId', projectId);

  return (
    <DashboardShell active="groups" title="Group" userEmail={user.email ?? undefined} projectId={data?.project?.id ?? projectId}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/dashboard/groups?${listQuery.toString()}`} className="text-sm font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white">
          ← All groups
        </Link>
        <nav aria-label="Time range" className="flex flex-wrap gap-1">
          {DAY_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={groupHref(key, { days: option.value, projectId })}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                option.value === String(data?.days ?? days)
                  ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                  : 'border-neutral-300 text-neutral-600 hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {option.label.replace('Last ', '')}
            </Link>
          ))}
        </nav>
      </div>

      {error ? (
        <section className="mb-4 rounded-md border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {error}
        </section>
      ) : null}

      {group && data ? (
        <>
          <section className="mb-4 rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
            <h2 className="text-xl font-semibold text-neutral-900 [overflow-wrap:anywhere] dark:text-white">{group.name}</h2>
            <code className="mt-2 block w-fit max-w-full truncate rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1 font-mono text-xs text-neutral-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              {group.key}
            </code>
            <p className="mt-3 text-xs text-neutral-500 dark:text-slate-400">
              First reported {formatDate(group.firstSeen)} · last group() call {formatDate(group.lastSeen)}
            </p>
            <div className="mt-3">
              <TraitChips traits={group.allTraits} skip={['name']} />
            </div>
          </section>

          <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Members" value={group.members.toLocaleString()} hint="people who called group() for it" />
            <Stat label="Active members" value={group.activeMembers.toLocaleString()} hint={`in the last ${data.days} days`} />
            <Stat label="Events" value={group.events.toLocaleString()} hint={`from members, last ${data.days} days`} />
            <Stat label="Last active" value={formatDate(group.lastActiveAt)} />
          </section>

          <section className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
              <h3 className="mb-3 text-sm font-semibold text-neutral-900 dark:text-white">Daily activity</h3>
              <div className="flex h-32 items-end gap-[2px]" role="img" aria-label={`Events per day over the last ${data.days} days`}>
                {data.timeline.map((d) => (
                  <div
                    key={d.day}
                    title={`${d.day}: ${d.events.toLocaleString()} events, ${d.activeMembers} active`}
                    className={`flex-1 rounded-t-sm ${d.events > 0 ? 'bg-blue-600 dark:bg-blue-500' : 'bg-neutral-100 dark:bg-slate-800'}`}
                    style={{ height: `${d.events > 0 ? Math.max(6, (d.events / peak) * 100) : 4}%` }}
                  />
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-neutral-400 dark:text-slate-500">
                <span>{data.timeline[0]?.day}</span>
                <span>{data.timeline[data.timeline.length - 1]?.day}</span>
              </div>
            </div>

            <div className="rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
              <h3 className="mb-3 text-sm font-semibold text-neutral-900 dark:text-white">Top events</h3>
              {data.topEvents.length === 0 ? (
                <p className="text-xs text-neutral-500 dark:text-slate-400">No member activity in this range.</p>
              ) : (
                <ul className="space-y-2">
                  {data.topEvents.map((item) => {
                    const pct = Math.round((item.total / topTotal) * 100);
                    return (
                      <li key={item.name} className="space-y-1">
                        <div className="flex justify-between gap-3 text-xs">
                          <span className="truncate font-mono text-neutral-700 dark:text-slate-300">{item.name}</span>
                          <span className="font-semibold tabular-nums text-neutral-900 dark:text-white">{item.total.toLocaleString()}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-neutral-100 dark:bg-slate-800">
                          <div className="h-full rounded-full bg-orange-500 dark:bg-orange-400" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-md border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950">
            <h3 className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-900 dark:border-slate-800 dark:text-white">
              Members <span className="font-normal text-neutral-500 dark:text-slate-400">({data.members.length.toLocaleString()})</span>
            </h3>
            {data.members.length === 0 ? (
              <p className="px-4 py-6 text-sm text-neutral-500 dark:text-slate-400">No identified members yet.</p>
            ) : (
              <ul className="divide-y divide-neutral-100 dark:divide-slate-800/80">
                {data.members.map((member) => {
                  const body = (
                    <>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">{member.displayName}</p>
                        <p className="truncate font-mono text-[11px] text-neutral-500 dark:text-slate-400">{member.email ?? member.externalId ?? member.id}</p>
                      </div>
                      <span className="text-xs tabular-nums text-neutral-700 sm:text-right dark:text-slate-300">{member.events.toLocaleString()} events</span>
                      <span className="text-xs text-neutral-500 sm:text-right dark:text-slate-400">Active {formatDate(member.lastActiveAt)}</span>
                      <span className="text-xs text-neutral-500 sm:text-right dark:text-slate-400">Joined {formatDate(member.joinedAt)}</span>
                    </>
                  );
                  const rowClass = 'grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,2fr)_100px_130px_130px] sm:items-center sm:gap-3';
                  return (
                    <li key={member.id}>
                      {member.userId ? (
                        <Link
                          href={`/dashboard/users/${encodeURIComponent(member.userId)}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`}
                          className={`${rowClass} transition-colors hover:bg-neutral-50 dark:hover:bg-slate-900/60`}
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className={rowClass}>{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </DashboardShell>
  );
}
