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
      {/* Intro Header Section */}
      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950 shadow-xs">
        <div className="max-w-3xl space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
              Automated Monitoring
            </span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-2xl">
            Proactive Metric Anomaly & Threshold Alerts
          </h2>
          <p className="text-sm leading-relaxed text-neutral-600 dark:text-slate-400">
            Know immediately when critical metrics move without constantly watching dashboards.
            TraceIQ continuously monitors your telemetry in the background over rolling time windows, detecting unexpected drops, spikes, or threshold breaches and dispatching real-time notifications to your team via Webhooks, Slack, or Email.
          </p>
        </div>
      </section>

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
