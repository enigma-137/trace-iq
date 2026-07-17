import Link from 'next/link';
import { DashboardShell } from '../../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

interface PersonProfile {
  id: string;
  externalId: string | null;
  anonymousId: string | null;
  traits: Record<string, unknown>;
  eventCount: number;
  sessionCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  lastOs: string | null;
  lastDeviceType: string | null;
  lastBrowser: string | null;
  lastCountry: string | null;
  lastCity: string | null;
}

interface TimelineResponse {
  items: Array<{
    id: string;
    eventName: string;
    properties: Record<string, unknown>;
    sessionId: string | null;
    occurredAt: string;
  }>;
}

export default async function UserProfilePage({ params }: { params: { id: string } }) {
  const { user, token } = await requireDashboardSession(`/dashboard/users/${params.id}`);
  const [{ data: profile, error: profileError }, { data: timeline }] = await Promise.all([
    dashboardGet<PersonProfile>(`/v1/dashboard/users/${params.id}`, token),
    dashboardGet<TimelineResponse>(`/v1/dashboard/users/${params.id}/timeline?limit=100`, token)
  ]);

  const items = timeline?.items ?? [];
  const traitEntries = profile ? Object.entries(profile.traits ?? {}) : [];

  return (
    <DashboardShell active="users" title="User timeline" userEmail={user.email}>
      <div className="mb-4">
        <Link href="/dashboard/users" className="text-sm font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white">
          ← All users
        </Link>
      </div>

      {profileError ? (
        <section className="mb-4 rounded-md border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100">
          {profileError}
        </section>
      ) : null}

      {profile ? (
        <section className="mb-6 rounded-md border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
          <h2 className="font-mono text-xl font-semibold text-neutral-900 [overflow-wrap:anywhere] dark:text-white">
            {profile.externalId ?? profile.anonymousId ?? profile.id}
          </h2>
          <code className="mt-2 block w-fit rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1.5 font-mono text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
            {profile.id}
          </code>

          <dl className="mt-4 grid gap-4 sm:grid-cols-4">
            <Meta label="Events" value={profile.eventCount.toLocaleString()} />
            <Meta label="Sessions" value={profile.sessionCount.toLocaleString()} />
            <Meta label="First seen" value={formatDate(profile.firstSeenAt)} />
            <Meta label="Last seen" value={formatDate(profile.lastSeenAt)} />
            <Meta label="Device" value={deviceLabel(profile) || '—'} />
            <Meta label="Browser" value={profile.lastBrowser ?? '—'} />
            <Meta label="Location" value={locationLabel(profile) || '—'} />
          </dl>

          {traitEntries.length > 0 ? (
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">Traits</p>
              <div className="flex flex-wrap gap-2">
                {traitEntries.map(([key, value]) => (
                  <span
                    key={key}
                    className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 font-mono text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
                  >
                    {key}: {String(value)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-md border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
        <h3 className="mb-4 text-base font-semibold text-neutral-900 dark:text-white">Timeline</h3>
        {items.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-500">No events recorded for this user yet.</p>
        ) : (
          <ol className="relative border-l border-neutral-200 dark:border-neutral-800">
            {items.map((item) => (
              <li key={item.id} className="mb-5 ml-4">
                <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-neutral-900 dark:bg-white" />
                <p className="font-mono text-sm font-semibold text-neutral-900 dark:text-white">{item.eventName}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-500">{formatDateTime(item.occurredAt)}</p>
                {item.properties && Object.keys(item.properties).length > 0 ? (
                  <pre className="mt-2 overflow-x-auto rounded-md border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
                    <code>{JSON.stringify(item.properties, null, 2)}</code>
                  </pre>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </DashboardShell>
  );
}

function deviceLabel(profile: PersonProfile): string {
  return [profile.lastOs, profile.lastDeviceType].filter(Boolean).join(' · ');
}

function locationLabel(profile: PersonProfile): string {
  return [profile.lastCity, profile.lastCountry].filter(Boolean).join(', ');
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-neutral-900 dark:text-white">{value}</dd>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) return 'unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date);
}

function formatDateTime(value?: string) {
  if (!value) return 'unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
