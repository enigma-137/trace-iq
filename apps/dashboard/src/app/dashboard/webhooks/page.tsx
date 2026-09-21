import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { WebhookManager } from './WebhookManager';

export const dynamic = 'force-dynamic';

export type WebhookStatus = 'active' | 'paused' | 'failing' | 'disabled';

export interface Webhook {
  id: string;
  name: string;
  url: string;
  hasSecret: boolean;
  secretRotatedAt: string | null;
  hasPreviousSecret: boolean;
  eventNames: string[];
  enabled: boolean;
  status: WebhookStatus;
  failureCount: number;
  description: string | null;
  lastStatus: string | null;
  lastDeliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Delivery {
  id: string;
  deliveryId: string;
  webhookId: string;
  webhookName: string;
  eventName: string | null;
  statusCode: number | null;
  durationMs: number | null;
  ok: boolean;
  status: string;
  error: string | null;
  attempt: number;
  createdAt: string;
}

export interface WebhooksMetrics {
  activeEndpoints: number;
  deliveriesToday: number;
  failedDeliveries: number;
  successRate: number;
}

interface WebhooksResponse {
  project: { id: string; name?: string } | null;
  metrics: WebhooksMetrics;
  webhooks: Webhook[];
  recentDeliveries: Delivery[];
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
      {error ? (
        <section className="mb-4 rounded-md border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {error}
        </section>
      ) : null}

      <WebhookManager
        initialWebhooks={data?.webhooks ?? []}
        initialRecentDeliveries={data?.recentDeliveries ?? []}
        initialMetrics={
          data?.metrics ?? { activeEndpoints: 0, deliveriesToday: 0, failedDeliveries: 0, successRate: 100 }
        }
        eventNames={eventNames}
        projectId={data?.project?.id}
      />
    </DashboardShell>
  );
}
