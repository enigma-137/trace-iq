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
      <p className="mb-6 max-w-2xl text-sm text-neutral-500 dark:text-slate-400">
        Get told when something moves — a metric crossing a threshold or dropping/spiking versus the previous period —
        instead of watching dashboards. Firings show here and can POST to a webhook (e.g. Slack) or email recipients /
        notification groups.
      </p>

      {error ? (
        <section className="mb-4 rounded-md border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {error}
        </section>
      ) : null}

      <AlertManager
        alerts={data?.alerts ?? []}
        recentEvents={data?.recentEvents ?? []}
        eventNames={eventNames}
        notificationGroups={data?.notificationGroups ?? []}
      />
    </DashboardShell>
  );
}
