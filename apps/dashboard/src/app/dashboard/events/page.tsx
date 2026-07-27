import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { EventsTable, type RecentEvent } from './EventsTable';

export const dynamic = 'force-dynamic';

interface DashboardProject {
  id: string;
  name: string;
  organizationName: string;
}

interface RecentEventsResponse {
  project: DashboardProject | null;
  events: RecentEvent[];
}

export default async function DashboardEventsPage() {
  const { user, token } = await requireDashboardSession('/dashboard/events');
  const { data, error } = await dashboardGet<RecentEventsResponse>('/v1/dashboard/events/recent?limit=50', token);

  const project = data?.project ?? null;
  const events = data?.events ?? [];

  return (
    <DashboardShell active="events" title="Events" userEmail={user.email}>
      <section className="mb-6 flex flex-col justify-between gap-4 rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950 md:flex-row md:items-end">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
            Live activity
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">Recent events</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500 dark:text-slate-400">
            {project ? (
              <>
                Streaming from <span className="font-medium text-neutral-700 dark:text-slate-200">{project.name}</span>. Click any
                row to expand the full event payload.
              </>
            ) : (
              'Reads the project attached to your workspace.'
            )}
          </p>
        </div>
        <a
          className="inline-flex h-10 w-fit items-center justify-center rounded-md border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          href="/dashboard/events"
        >
          Refresh
        </a>
      </section>

      {error ? (
        <section className="mb-4 rounded-md border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {error}
        </section>
      ) : null}

      {!project && !error ? (
        <section className="rounded-md border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">No project yet</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500 dark:text-slate-400">
            Create your first tracking project from Overview, then install the SDK snippet on a website.
          </p>
          <a
            className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-slate-200"
            href="/dashboard"
          >
            Go to setup
          </a>
        </section>
      ) : null}

      {project ? (
        <section className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs text-neutral-500 dark:text-slate-400">{project.id}</p>
            <p className="text-xs text-neutral-400 dark:text-slate-500">{events.length} loaded</p>
          </div>
          <EventsTable events={events} />
        </section>
      ) : null}
    </DashboardShell>
  );
}
