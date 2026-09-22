import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { FunnelsClientView } from './FunnelsClientView';

export const dynamic = 'force-dynamic';

export interface FunnelStepItem {
  order?: number;
  eventName: string;
  label?: string | null;
}

export interface FunnelItem {
  id: string;
  name: string;
  stepCount: number;
  createdAt: string;
  steps?: FunnelStepItem[];
}

export interface FunnelResultStep {
  order: number;
  eventName: string;
  label: string | null;
  count: number;
  conversionFromStart: number;
  conversionFromPrevious: number;
  droppedFromPrevious: number;
}

export interface FunnelResultsData {
  funnel: { id: string; name: string };
  days: number;
  steps: FunnelResultStep[];
}

interface FunnelsResponse {
  funnels: FunnelItem[];
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

  // Fetch 30-day performance results for all funnels in parallel for instant analytics preview
  const resultsMap: Record<string, FunnelResultsData | null> = {};
  if (funnels.length > 0) {
    const resultsPromises = funnels.map((f) =>
      dashboardGet<FunnelResultsData>(`/v1/dashboard/funnels/${f.id}/results?days=30`, token)
    );
    const resultsSettled = await Promise.allSettled(resultsPromises);
    resultsSettled.forEach((res, index) => {
      const funnelId = funnels[index]?.id;
      if (funnelId && res.status === 'fulfilled' && res.value.data) {
        resultsMap[funnelId] = res.value.data;
      }
    });
  }

  return (
    <DashboardShell active="funnels" title="Funnels" userEmail={user.email}>
      {error ? (
        <section className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </section>
      ) : null}

      <FunnelsClientView funnels={funnels} resultsMap={resultsMap} eventNames={eventNames} />
    </DashboardShell>
  );
}
