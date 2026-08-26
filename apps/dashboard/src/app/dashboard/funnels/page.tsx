import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { FunnelsClientView } from './FunnelsClientView';

export const dynamic = 'force-dynamic';

interface FunnelStepItem {
  eventName: string;
}

interface FunnelsResponse {
  funnels: Array<{ id: string; name: string; stepCount: number; createdAt: string; steps?: FunnelStepItem[] }>;
}

interface EventNamesResponse {
  eventNames: Array<{ eventName: string; total: number; actors?: number }>;
}

export default async function FunnelsPage() {
  const { user, token } = await requireDashboardSession('/dashboard/funnels');
  const [{ data: funnelsData, error }, { data: eventNamesData }] = await Promise.all([
    dashboardGet<FunnelsResponse>('/v1/dashboard/funnels', token),
    dashboardGet<EventNamesResponse>('/v1/dashboard/insights/event-names', token)
  ]);

  const funnels = funnelsData?.funnels ?? [];
  const eventNames = eventNamesData?.eventNames ?? [];

  return (
    <DashboardShell active="funnels" title="Funnels" userEmail={user.email}>
      {error ? (
        <section className="mb-4 rounded-md border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </section>
      ) : null}

      <FunnelsClientView funnels={funnels} eventNames={eventNames} />
    </DashboardShell>
  );
}
