import Link from 'next/link';
import { requireAdminAccess } from '@/lib/admin';
import { StatTile } from '@/components/charts/StatTile';
import { BarChart } from '@/components/charts/BarChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { RankedList } from '@/components/charts/RankedList';
import { AdminActivityFeed } from './AdminActivityFeed';

export const metadata = { title: 'Admin · TraceIQ' };

const LOG_KIND_LABELS: Record<string, string> = {
  alert: 'Alert',
  digest: 'Digest',
  achievement: 'Achievement',
  audit: 'Audit'
};

export default async function AdminPage() {
  const access = await requireAdminAccess('/admin');

  if (!access.isAdmin) {
    return <AccessDenied />;
  }

  const overview = access.overview!;
  const logs = access.logs!;
  const organizations = access.organizations!;
  const projects = access.projects!;
  const timeline = access.timeline!;

  // Ranked data for the chart row: top organizations by members and by projects.
  const byMembers = [...organizations].sort((a, b) => b.memberCount - a.memberCount).slice(0, 6);
  const byProjects = [...organizations].sort((a, b) => b.projectCount - a.projectCount).slice(0, 6);
  const eventShare = [...organizations].sort((a, b) => b.eventCount - a.eventCount).slice(0, 6);

  // Daily bars, zero-filled so the last 14 days always show a continuous axis.
  const timelineBars = fillTimeline(timeline).map((point) => ({
    label: shortDay(point.day),
    value: point.total
  }));

  const totalMembers = organizations.reduce((sum, org) => sum + org.memberCount, 0);
  const totalProjects = projects.length;

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-slate-950">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <header className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-500">
              TraceIQ · operator console
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-950 dark:text-white">Platform admin</h1>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex h-9 shrink-0 items-center rounded-md border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Dashboard
          </Link>
        </header>

        {/* Key numbers */}
        <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Organizations" value={overview.organizations} hint={`${overview.activeOrgs24h} active in last 24h`} />
          <StatTile label="Projects" value={overview.projects} hint={`${totalProjects} across all workspaces`} />
          <StatTile label="Events (24h)" value={overview.events24h} hint={`${overview.eventsTotal.toLocaleString()} all time`} tone="green" />
          <StatTile label="Tracked users" value={overview.trackedUsers} hint={`${totalMembers} workspace members`} tone="blue" />
        </section>

        {/* Charts row */}
        <section className="mb-5 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
          <div className={cardClass}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
                Events ingested · last 14 days
              </p>
              <span className="text-xs font-semibold tabular-nums text-neutral-600 dark:text-slate-300">
                {timelineBars.reduce((sum, bar) => sum + bar.value, 0).toLocaleString()} total
              </span>
            </div>
            <div className="mt-4">
              <BarChart items={timelineBars} tone="blue" height={180} className="h-44 w-full" emptyLabel="No events yet." />
            </div>
          </div>

          <div className={cardClass}>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
              Event share by organization
            </p>
            <DonutChart
              items={eventShare.map((org) => ({ label: org.name, value: org.eventCount }))}
              centerValue={compactNumber(overview.eventsTotal)}
              centerLabel="events"
              emptyLabel="No event data yet."
            />
          </div>
        </section>

        {/* Rankings row */}
        <section className="mb-5 grid gap-3 lg:grid-cols-2">
          <div className={cardClass}>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
              Most members
            </p>
            <RankedList items={byMembers.map((org) => ({ label: org.name, total: org.memberCount }))} emptyLabel="No members yet." />
          </div>
          <div className={cardClass}>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
              Most projects
            </p>
            <RankedList items={byProjects.map((org) => ({ label: org.name, total: org.projectCount }))} emptyLabel="No projects yet." />
          </div>
        </section>

        {/* Organizations table */}
        <section className="mb-5">
          <SectionHeading title="Organizations" subtitle={`${organizations.length} total`} />
          <div className={cardClass}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-400 dark:border-slate-800 dark:text-slate-500">
                    <th className="py-2 pr-3 font-semibold">Name</th>
                    <th className="py-2 pr-3 font-semibold">Members</th>
                    <th className="py-2 pr-3 font-semibold">Projects</th>
                    <th className="py-2 pr-3 font-semibold">Events</th>
                    <th className="py-2 font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {organizations.map((org) => (
                    <tr key={org.id} className="border-b border-neutral-100 last:border-0 dark:border-slate-800/70">
                      <td className="py-2.5 pr-3 font-medium text-neutral-900 dark:text-white">
                        <p className="truncate">{org.name}</p>
                        <p className="text-xs text-neutral-400 dark:text-slate-500">/{org.slug}</p>
                      </td>
                      <td className="py-2.5 pr-3 text-neutral-600 dark:text-slate-300">{org.memberCount}</td>
                      <td className="py-2.5 pr-3 text-neutral-600 dark:text-slate-300">{org.projectCount}</td>
                      <td className="py-2.5 pr-3 text-neutral-600 dark:text-slate-300">{org.eventCount.toLocaleString()}</td>
                      <td className="py-2.5 text-neutral-400 dark:text-slate-500">{formatDate(org.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Projects table */}
        <section className="mb-5">
          <SectionHeading title="Projects" subtitle={`${projects.length} total`} />
          <div className={cardClass}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-400 dark:border-slate-800 dark:text-slate-500">
                    <th className="py-2 pr-3 font-semibold">Name</th>
                    <th className="py-2 pr-3 font-semibold">Organization</th>
                    <th className="py-2 pr-3 font-semibold">Events</th>
                    <th className="py-2 pr-3 font-semibold">Last event</th>
                    <th className="py-2 font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((project) => (
                    <tr key={project.id} className="border-b border-neutral-100 last:border-0 dark:border-slate-800/70">
                      <td className="py-2.5 pr-3 font-medium text-neutral-900 dark:text-white">
                        <p className="truncate">{project.name}</p>
                        <p className="text-xs text-neutral-400 dark:text-slate-500">/{project.slug}</p>
                      </td>
                      <td className="py-2.5 pr-3 text-neutral-600 dark:text-slate-300">{project.organizationName}</td>
                      <td className="py-2.5 pr-3 text-neutral-600 dark:text-slate-300">{project.eventCount.toLocaleString()}</td>
                      <td className="py-2.5 pr-3 text-neutral-400 dark:text-slate-500">
                        {project.lastEventAt ? relativeText(project.lastEventAt) : '—'}
                      </td>
                      <td className="py-2.5 text-neutral-400 dark:text-slate-500">{formatDate(project.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Live + system activity */}
        <section className="grid gap-3 lg:grid-cols-2">
          <div className={cardClass}>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
              Live activity (all organizations)
            </p>
            <AdminActivityFeed />
          </div>

          <div className={cardClass}>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
              Recent system activity
            </p>
            {logs.length === 0 ? (
              <p className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-4 text-center text-xs text-neutral-500 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-400">
                No system activity yet. Alert deliveries, digests, achievement emails and audit events will show here.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-100 dark:divide-slate-800/80">
                {logs.slice(0, 12).map((log, index) => (
                  <li key={`${log.occurredAt}-${index}`} className="flex items-start gap-3 px-0.5 py-2.5">
                    <span className="mt-0.5 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:bg-slate-800 dark:text-slate-400">
                      {LOG_KIND_LABELS[log.kind] ?? log.kind}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-neutral-900 dark:text-white">{log.summary}</p>
                      <p className="mt-0.5 text-xs text-neutral-400 dark:text-slate-500">{formatDate(log.occurredAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3 px-0.5">
      <h2 className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-white">{title}</h2>
      {subtitle ? <p className="text-xs text-neutral-400 dark:text-slate-500">{subtitle}</p> : null}
    </div>
  );
}

function AccessDenied() {
  return (
    <main className="grid min-h-screen place-items-center bg-white px-5 dark:bg-black">
      <section className="w-full max-w-sm text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-500">
          TraceIQ · admin
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950 dark:text-white">Access denied</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
          Your account is not authorized to open the platform admin console. If you think this is a mistake, ask the
          account owner to add your email to <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs dark:bg-neutral-900">platform_admins</code>.
        </p>
        <Link
          className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-slate-200"
          href="/dashboard"
        >
          Back to dashboard
        </Link>
      </section>
    </main>
  );
}

const cardClass =
  'rounded-md border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]';

function fillTimeline(points: Array<{ day: string; total: number }>) {
  const byDay = new Map(points.map((point) => [point.day, point.total]));
  const result: Array<{ day: string; total: number }> = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (let i = 13; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - i);
    const key = date.toISOString().slice(0, 10);
    result.push({ day: key, total: byDay.get(key) ?? 0 });
  }

  return result;
}

function shortDay(isoDay: string): string {
  const [year, month, day] = isoDay.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function compactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function relativeText(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}