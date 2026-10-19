import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { AlertManager } from './AlertManager';
import type { FilterCondition } from '@/components/SegmentFilters';

export const dynamic = 'force-dynamic';

interface AlertsResponse {
  project: { id: string } | null;
  alerts: Array<{
    id: string;
    name: string;
    eventName: string;
    measure: string;
    property: string | null;
    filters: FilterCondition[];
    windowHours: number;
    condition: string;
    threshold: number;
    webhookUrl: string | null;
    emailRecipients: string[];
    notificationGroupIds: string[];
    enabled: boolean;
    lastStatus: string;
    lastValue: number | null;
    lastEvaluatedAt: string | null;
    deliveries: Array<{
      channel: string;
      recipient: string | null;
      status: string;
      error: string | null;
      sentAt: string;
    }>;
  }>;
  notificationGroups: Array<{ id: string; name: string; memberEmails: string[] }>;
  recentEvents: Array<{ id: string; alertName: string; value: number | null; message: string; triggeredAt: string }>;
  entitlement: { available: boolean; plan: string } | null;
}

interface EventNamesResponse {
  eventNames: Array<{ eventName: string; total: number }>;
}

export default async function AlertsPage() {
  const { user, token } = await requireDashboardSession('/dashboard/alerts');
  const [{ data, error }, { data: eventNamesData }] = await Promise.all([
    dashboardGet<AlertsResponse>('/v1/dashboard/alerts', token),
    dashboardGet<EventNamesResponse>('/v1/dashboard/insights/event-names', token)
  ]);

  const eventNames = eventNamesData?.eventNames.map((item) => item.eventName) ?? [];

  return (
    <DashboardShell active="alerts" title="Alerts" userEmail={user.email}>
      {error ? (
        <section className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </section>
      ) : null}

      <AlertManager
        alerts={data?.alerts ?? []}
        recentEvents={data?.recentEvents ?? []}
        eventNames={eventNames}
        notificationGroups={data?.notificationGroups ?? []}
        alertsAvailable={data?.entitlement?.available !== false}
      />
    </DashboardShell>
  );
}
