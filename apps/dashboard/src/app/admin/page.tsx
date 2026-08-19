import Link from 'next/link';
import { requireAdminAccess } from '@/lib/admin';
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

  const overview = access.overview!;
  const logs = access.logs!;
  const organizations = access.organizations!;
  const projects = access.projects!;

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

        <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AdminTile label="Organizations" value={overview.organizations} hint="All workspaces" />
          <AdminTile label="Projects" value={overview.projects} hint="Across all workspaces" />
          <AdminTile label="Events (24h)" value={overview.events24h} hint={`${overview.activeOrgs24h} active orgs`} />
          <AdminTile label="Events (all time)" value={overview.eventsTotal} hint="Total ingested" />
          <AdminTile label="Tracked users" value={overview.trackedUsers} hint="Identified + anonymous" />
          <AdminTile label="Availability" value="—" hint="Check status page" />
        </section>

        <div className="mb-5 grid gap-3 lg:grid-cols-2">
          <section className={cardClass}>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
              Live activity (all organizations)
            </p>
            <AdminActivityFeed />
          </section>

          <section className={cardClass}>
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
          </section>
        </div>

        <section className={cardClass}>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
            Organizations
          </p>
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
                    <td className="py-2.5 pr-3 font-medium text-neutral-900 dark:text-white">{org.name}</td>
                    <td className="py-2.5 pr-3 text-neutral-600 dark:text-slate-300">{org.memberCount}</td>
                    <td className="py-2.5 pr-3 text-neutral-600 dark:text-slate-300">{org.projectCount}</td>
                    <td className="py-2.5 pr-3 text-neutral-600 dark:text-slate-300">{org.eventCount.toLocaleString()}</td>
                    <td className="py-2.5 text-neutral-400 dark:text-slate-500">{formatDate(org.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={cardClass}>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
            Projects
          </p>
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
                    <td className="py-2.5 pr-3 font-medium text-neutral-900 dark:text-white">{project.name}</td>
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
        </section>
      </div>
    </main>
  );
}

const cardClass =
  'rounded-md border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]';

function AdminTile({ label, value, hint }: { label: string; value: number | string; hint: string }) {
  return (
    <div className="relative overflow-hidden rounded-md border border-neutral-200 bg-white p-4 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/80">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(59,130,246,0.08),transparent_34%)] dark:bg-[radial-gradient(circle_at_20%_0%,rgba(59,130,246,0.12),transparent_34%)]" />
      <div className="relative">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">{label}</p>
        <p className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">{hint}</p>
      </div>
    </div>
  );
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
