import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { WebhookManager } from './WebhookManager';

export const dynamic = 'force-dynamic';

interface WebhooksResponse {
  project: { id: string } | null;
  webhooks: Array<{
    id: string;
    name: string;
    url: string;
    hasSecret: boolean;
    eventNames: string[];
    enabled: boolean;
    lastStatus: string | null;
    lastDeliveredAt: string | null;
  }>;
  recentDeliveries: Array<{
    id: string;
    webhookName: string;
    eventName: string | null;
    statusCode: number | null;
    ok: boolean;
    error: string | null;
    createdAt: string;
  }>;
}

interface EventNamesResponse {
  eventNames: Array<{ eventName: string; total: number }>;
}

export default async function WebhooksPage() {
  const { user, token } = await requireDashboardSession('/dashboard/webhooks');
  const [{ data, error }, { data: eventNamesData }] = await Promise.all([
    dashboardGet<WebhooksResponse>('/v1/dashboard/webhooks', token),
    dashboardGet<EventNamesResponse>('/v1/dashboard/insights/event-names', token)
  ]);

  const eventNames = eventNamesData?.eventNames.map((item) => item.eventName) ?? [];

  return (
    <DashboardShell active="webhooks" title="Webhooks" userEmail={user.email}>
      <p className="mb-6 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
        Forward events to another system the moment they arrive — a data warehouse loader, an ops tool, a Slack relay.
        Each delivery is a <span className="font-mono text-xs">POST</span> and can be signed with a secret so the
        receiver can verify it came from TraceIQ.
      </p>

      {error ? (
        <section className="mb-4 rounded-md border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100">
          {error}
        </section>
      ) : null}

      <WebhookManager
        webhooks={data?.webhooks ?? []}
        recentDeliveries={data?.recentDeliveries ?? []}
        eventNames={eventNames}
      />
    </DashboardShell>
  );
}
