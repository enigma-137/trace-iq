import Link from 'next/link';
import { DashboardShell } from '../../../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { FunnelForm } from '../../FunnelForm';

export const dynamic = 'force-dynamic';

interface FunnelDetail {
  id: string;
  name: string;
  steps: Array<{ order: number; eventName: string; label: string | null }>;
}

interface EventNamesResponse {
  eventNames: Array<{ eventName: string; total: number }>;
}

export default async function EditFunnelPage({ params }: { params: { id: string } }) {
  const { user, token } = await requireDashboardSession(`/dashboard/funnels/${params.id}/edit`);
  const [{ data: funnel, error }, { data: eventNamesData }] = await Promise.all([
    dashboardGet<FunnelDetail>(`/v1/dashboard/funnels/${params.id}`, token),
    dashboardGet<EventNamesResponse>('/v1/dashboard/insights/event-names', token)
  ]);

  const eventNames = eventNamesData?.eventNames.map((item) => item.eventName) ?? [];

  return (
    <DashboardShell active="funnels" title={funnel ? `Edit ${funnel.name}` : 'Edit funnel'} userEmail={user.email}>
      <div className="mb-4">
        <Link
          href={`/dashboard/funnels/${params.id}`}
          className="text-sm font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white"
        >
          ← Back to funnel
        </Link>
      </div>

      {error ? (
        <section className="mb-4 rounded-md border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {error}
        </section>
      ) : null}

      {funnel ? (
        <div className="max-w-xl">
          <FunnelForm
            eventNames={eventNames}
            funnel={{ id: funnel.id, name: funnel.name, steps: funnel.steps.map((s) => ({ eventName: s.eventName })) }}
          />
        </div>
      ) : null}
    </DashboardShell>
  );
}
