import Link from 'next/link';
import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { FunnelForm } from './FunnelForm';

export const dynamic = 'force-dynamic';

interface FunnelsResponse {
  funnels: Array<{ id: string; name: string; stepCount: number; createdAt: string }>;
}

interface EventNamesResponse {
  eventNames: Array<{ eventName: string; total: number }>;
}

export default async function FunnelsPage() {
  const { user, token } = await requireDashboardSession('/dashboard/funnels');
  const [{ data: funnelsData, error }, { data: eventNamesData }] = await Promise.all([
    dashboardGet<FunnelsResponse>('/v1/dashboard/funnels', token),
    dashboardGet<EventNamesResponse>('/v1/dashboard/insights/event-names', token)
  ]);

  const funnels = funnelsData?.funnels ?? [];
  const eventNames = eventNamesData?.eventNames.map((item) => item.eventName) ?? [];

  return (
    <DashboardShell active="funnels" title="Funnels" userEmail={user.email}>
      {error ? (
        <section className="mb-4 rounded-md border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {error}
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <FunnelForm eventNames={eventNames} />

        <section className="rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
          <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-white">Your funnels</h2>
          {funnels.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-slate-500">
              No funnels yet. Create one on the left to measure conversion between events.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-slate-800">
              {funnels.map((funnel) => (
                <li key={funnel.id}>
                  <Link
                    href={`/dashboard/funnels/${funnel.id}`}
                    className="flex items-center justify-between gap-3 py-3 transition hover:opacity-70"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{funnel.name}</p>
                      <p className="text-xs text-neutral-500 dark:text-slate-500">{funnel.stepCount} steps</p>
                    </div>
                    <span className="text-sm font-semibold text-neutral-900 dark:text-white">View →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
