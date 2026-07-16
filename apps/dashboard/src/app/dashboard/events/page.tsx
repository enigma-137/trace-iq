import { redirect } from 'next/navigation';
import { createSupabaseServerClient, hasSupabaseServerConfig } from '@/lib/supabase/server';
import { DashboardShell } from '../DashboardShell';

export const dynamic = 'force-dynamic';

interface DashboardProject {
  id: string;
  name: string;
  slug: string;
  organizationId: string;
  organizationName: string;
  role: string;
}

interface RecentEvent {
  id: string;
  projectId: string;
  userId?: string | null;
  externalUserId?: string | null;
  anonymousId?: string | null;
  sessionId?: string | null;
  eventName: string;
  properties?: Record<string, unknown>;
  occurredAt?: string;
  receivedAt?: string;
}

interface RecentEventsResponse {
  project: DashboardProject | null;
  events: RecentEvent[];
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default async function DashboardEventsPage() {
  if (!hasSupabaseServerConfig()) {
    redirect('/auth/login?missingConfig=1');
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login?next=/dashboard/events');
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const recentEvents = session?.access_token
    ? await fetchRecentEvents(session.access_token)
    : {
        data: null,
        error: 'Your dashboard session expired. Sign in again.'
      };

  return (
    <DashboardShell active="events" title="Events" userEmail={user.email}>
      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/60 dark:shadow-none">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Live project events</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 dark:text-white">
              Recent browser events
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
              This view reads the project attached to your logged-in workspace, so a real website install should appear here.
            </p>
          </div>
          <a
            className="inline-flex h-10 w-fit items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-800"
            href="/dashboard/events"
          >
            Refresh
          </a>
        </div>
      </section>

      {recentEvents.error ? <EventsError message={recentEvents.error} /> : null}

      {recentEvents.data ? (
        <EventsPanel project={recentEvents.data.project} events={recentEvents.data.events} />
      ) : null}
    </DashboardShell>
  );
}

async function fetchRecentEvents(token: string): Promise<{ data: RecentEventsResponse | null; error: string | null }> {
  try {
    const response = await fetch(`${apiBaseUrl}/v1/dashboard/events/recent?limit=50`, {
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const message = await readError(response);
      return {
        data: null,
        error: message
      };
    }

    return {
      data: (await response.json()) as RecentEventsResponse,
      error: null
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Could not load recent events.'
    };
  }
}

function EventsPanel({ project, events }: { project: DashboardProject | null; events: RecentEvent[] }) {
  if (!project) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950/70 dark:shadow-none">
        <h2 className="text-lg font-semibold text-slate-950 dark:text-white">No project yet</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
          Create your first tracking project from Overview, then install the SDK snippet on a website.
        </p>
        <a
          className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200"
          href="/dashboard"
        >
          Go to setup
        </a>
      </section>
    );
  }

  return (
    <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/70 dark:shadow-none">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <p className="text-xs font-bold uppercase tracking-normal text-slate-500 dark:text-slate-500">
            {project.organizationName}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">{project.name}</h2>
          <code className="mt-3 block w-fit rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            {project.id}
          </code>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-right dark:border-slate-800 dark:bg-slate-900/60">
          <p className="text-xs text-slate-500 dark:text-slate-500">Events loaded</p>
          <p className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">{events.length}</p>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-900/40">
          <h3 className="text-base font-semibold text-slate-950 dark:text-white">Waiting for the first event</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
            Once the SDK is installed on a real website and `track()` runs, the newest events for this project will show here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          <div className="hidden grid-cols-[1fr_1fr_1fr_1fr] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-500 lg:grid">
            <span>Event</span>
            <span>User</span>
            <span>Session</span>
            <span>Received</span>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {events.map((event) => (
              <article
                key={event.id}
                className="grid gap-3 px-4 py-4 lg:grid-cols-[1fr_1fr_1fr_1fr] lg:gap-4"
              >
                <EventCell label="Event">
                  <strong className="block text-sm font-semibold text-slate-950 dark:text-white">{event.eventName}</strong>
                  <span className="mt-1 block text-xs text-slate-500 [overflow-wrap:anywhere] dark:text-slate-500">{event.id}</span>
                </EventCell>
                <EventCell label="User">
                  <span className="text-sm text-slate-800 [overflow-wrap:anywhere] dark:text-slate-200">
                    {event.externalUserId ?? event.userId ?? event.anonymousId ?? 'anonymous'}
                  </span>
                  {event.externalUserId && event.userId ? (
                    <span className="mt-1 block text-xs text-slate-500 [overflow-wrap:anywhere] dark:text-slate-500">
                      {event.userId}
                    </span>
                  ) : null}
                </EventCell>
                <EventCell label="Session">
                  <span className="text-sm text-slate-800 [overflow-wrap:anywhere] dark:text-slate-200">
                    {event.sessionId ?? 'none'}
                  </span>
                </EventCell>
                <EventCell label="Received">
                  <span className="text-sm text-slate-800 dark:text-slate-200">{formatDate(event.receivedAt)}</span>
                </EventCell>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function EventCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-bold uppercase text-slate-500 dark:text-slate-500 lg:hidden">{label}</p>
      {children}
    </div>
  );
}

function EventsError({ message }: { message: string }) {
  return (
    <section className="mb-4 rounded-lg border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-950 dark:border-white/30 dark:bg-white/10 dark:text-white">
      {message}
    </section>
  );
}

function formatDate(value?: string) {
  if (!value) {
    return 'unknown';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

async function readError(response: Response) {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? `Request failed with ${response.status}`;
  } catch {
    return `Request failed with ${response.status}`;
  }
}
