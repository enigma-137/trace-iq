import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { ExportPanel } from './ExportPanel';

export const dynamic = 'force-dynamic';

interface EventNamesResponse {
  eventNames: Array<{ eventName: string; total: number }>;
}

export default async function ExportPage() {
  const { user, token } = await requireDashboardSession('/dashboard/export');
  const { data } = await dashboardGet<EventNamesResponse>('/v1/dashboard/insights/event-names', token);
  const eventNames = data?.eventNames.map((item) => item.eventName) ?? [];

  return (
    <DashboardShell active="export" title="Export" userEmail={user.email}>
      <p className="mb-6 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
        Pull raw events out of TraceIQ as CSV or JSON — for a spreadsheet, a notebook, or loading into your own
        warehouse. Pick a date range and (optionally) a single event, then download.
      </p>

      <ExportPanel eventNames={eventNames} />
    </DashboardShell>
  );
}
