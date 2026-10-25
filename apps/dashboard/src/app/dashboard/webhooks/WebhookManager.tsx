'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { DashboardDialog } from '../DashboardDialog';
import { readApiError } from '@/lib/api-error';
import { toast } from '@/lib/toast';
import { retryAfterStepUp } from '@/lib/step-up';
import { Webhook, Delivery, WebhooksMetrics, WebhookStatus } from './page';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const SYSTEM_EVENTS = [
  { name: '$identify', group: 'System' },
  { name: '$page_viewed', group: 'System' },
  { name: '$screen_viewed', group: 'System' },
  { name: '$exception', group: 'System' },
  { name: '$session_start', group: 'System' },
  { name: '$session_end', group: 'System' }
];

export function WebhookManager({
  initialWebhooks,
  initialRecentDeliveries,
  initialMetrics,
  eventNames,
  projectId
}: {
  initialWebhooks: Webhook[];
  initialRecentDeliveries: Delivery[];
  initialMetrics: WebhooksMetrics;
  eventNames: string[];
  projectId?: string;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();

  // Selected webhook for Detail Drawer
  const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);
  
  // Selected delivery for Inspection Modal
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newSecretCreated, setNewSecretCreated] = useState<{ name: string; secret: string } | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | WebhookStatus>('all');

  async function getToken(): Promise<string | null> {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  // Actions that need a recent 2FA check prompt for a code and retry once.
  async function authFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
    const response = await sendAuthed(path, init);
    return response ? retryAfterStepUp(response, () => sendAuthed(path, init)) : null;
  }

  async function sendAuthed(path: string, init: RequestInit): Promise<Response | null> {
    const token = await getToken();
    if (!token) {
      toast.error('Your dashboard session expired. Sign in again.');
      return null;
    }
    const queryChar = path.includes('?') ? '&' : '?';
    const targetUrl = `${apiBaseUrl}${path}${projectId ? `${queryChar}projectId=${encodeURIComponent(projectId)}` : ''}`;

    return fetch(targetUrl, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {})
      }
    });
  }

  const selectedWebhook = useMemo(
    () => initialWebhooks.find((w) => w.id === selectedWebhookId) ?? null,
    [initialWebhooks, selectedWebhookId]
  );

  const filteredWebhooks = useMemo(() => {
    return initialWebhooks.filter((w) => {
      if (statusFilter !== 'all' && w.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return w.name.toLowerCase().includes(q) || w.url.toLowerCase().includes(q);
    });
  }, [initialWebhooks, statusFilter, searchQuery]);

  return (
    <div className="grid gap-8">
      {/* Top Header & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">Webhooks</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-slate-400">
            Send TraceIQ events to external systems in real time. Configure endpoints, choose events, verify signatures, and inspect every delivery.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateModalOpen(true)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-neutral-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-slate-200"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Create webhook
        </button>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Active endpoints" value={initialMetrics.activeEndpoints} />
        <MetricCard label="Deliveries today" value={initialMetrics.deliveriesToday} />
        <MetricCard
          label="Failed deliveries"
          value={initialMetrics.failedDeliveries}
          warn={initialMetrics.failedDeliveries > 0}
        />
        <MetricCard
          label="Success rate"
          value={`${initialMetrics.successRate}%`}
          warn={initialMetrics.successRate < 95 && initialMetrics.deliveriesToday > 0}
        />
      </div>

      {/* Main Endpoints Table or Empty State */}
      {initialWebhooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-950">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 dark:bg-slate-900">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-500 dark:text-slate-400">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
          <h2 className="mt-4 text-base font-semibold text-neutral-900 dark:text-white">No webhooks yet</h2>
          <p className="mt-1.5 max-w-sm text-sm text-neutral-500 dark:text-slate-400">
            Send TraceIQ events to your API, warehouse, automation, or internal services.
          </p>
          <div className="mt-6 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-neutral-900 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-slate-200"
            >
              + Create your first webhook
            </button>
            <span className="text-xs text-neutral-400 dark:text-slate-500">
              You can test a webhook before enabling live deliveries.
            </span>
          </div>
        </div>
      ) : (
        <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          {/* Table Toolbar */}
          <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-neutral-900 dark:text-white">Endpoints</span>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-slate-800 dark:text-slate-300">
                {initialWebhooks.length}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Status Filter */}
              <select
                className={selectClass}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | WebhookStatus)}
                aria-label="Filter by status"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="failing">Failing</option>
                <option value="disabled">Disabled</option>
              </select>

              {/* Search */}
              <input
                type="search"
                className={searchClass}
                placeholder="Search webhooks…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50/50 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
                <tr>
                  <th scope="col" className="py-3.5 pl-5 pr-3">Name</th>
                  <th scope="col" className="px-3 py-3.5">Endpoint URL</th>
                  <th scope="col" className="px-3 py-3.5">Events</th>
                  <th scope="col" className="px-3 py-3.5">Status</th>
                  <th scope="col" className="px-3 py-3.5">Last Delivery</th>
                  <th scope="col" className="py-3.5 pl-3 pr-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-slate-800">
                {filteredWebhooks.map((hook) => (
                  <tr
                    key={hook.id}
                    className="group transition hover:bg-neutral-50/70 dark:hover:bg-slate-900/40"
                  >
                    <td className="py-4 pl-5 pr-3">
                      <button
                        type="button"
                        onClick={() => setSelectedWebhookId(hook.id)}
                        className="text-left font-semibold text-neutral-900 hover:underline dark:text-white"
                      >
                        {hook.name}
                      </button>
                      {hook.hasSecret && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-slate-800 dark:text-slate-300">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                          Signed
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-4 font-mono text-xs text-neutral-600 dark:text-slate-400">
                      <span className="max-w-[240px] truncate block" title={hook.url}>
                        {hook.url}
                      </span>
                    </td>
                    <td className="px-3 py-4 text-xs text-neutral-600 dark:text-slate-400">
                      {hook.eventNames.length === 0 ? (
                        <span className="rounded bg-neutral-100 px-2 py-0.5 font-medium text-neutral-700 dark:bg-slate-800 dark:text-slate-300">
                          All events
                        </span>
                      ) : (
                        <span className="rounded bg-neutral-100 px-2 py-0.5 font-medium text-neutral-700 dark:bg-slate-800 dark:text-slate-300">
                          {hook.eventNames.length} {hook.eventNames.length === 1 ? 'event' : 'events'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-4">
                      <StatusBadge status={hook.status} failureCount={hook.failureCount} />
                    </td>
                    <td className="px-3 py-4 text-xs text-neutral-500 dark:text-slate-400">
                      {hook.lastDeliveredAt ? (
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              hook.lastStatus === 'success' ? 'bg-emerald-500' : 'bg-red-500'
                            }`}
                          />
                          <span>{formatRelativeTime(hook.lastDeliveredAt)}</span>
                        </div>
                      ) : (
                        <span className="text-neutral-400 dark:text-slate-600">No deliveries yet</span>
                      )}
                    </td>
                    <td className="py-4 pl-3 pr-5 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedWebhookId(hook.id)}
                        className="inline-flex h-8 items-center justify-center rounded border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Global Recent Deliveries Table */}
      <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-neutral-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Recent deliveries</h2>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">
            Real-time delivery attempts across all project webhooks.
          </p>
        </div>

        {initialRecentDeliveries.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-500 dark:text-slate-500">
            No deliveries recorded yet. Deliveries will appear here as events arrive or when you run a test.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50/50 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
                <tr>
                  <th scope="col" className="py-3 pl-5 pr-3">Status</th>
                  <th scope="col" className="px-3 py-3">Event</th>
                  <th scope="col" className="px-3 py-3">Webhook</th>
                  <th scope="col" className="px-3 py-3">Duration</th>
                  <th scope="col" className="px-3 py-3">Time</th>
                  <th scope="col" className="py-3 pl-3 pr-5 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-slate-800">
                {initialRecentDeliveries.map((del) => (
                  <tr
                    key={del.id}
                    onClick={() => setSelectedDeliveryId(del.id)}
                    className="cursor-pointer transition hover:bg-neutral-50/70 dark:hover:bg-slate-900/40"
                  >
                    <td className="py-3.5 pl-5 pr-3">
                      <DeliveryStatusPill statusCode={del.statusCode} ok={del.ok} status={del.status} />
                    </td>
                    <td className="px-3 py-3.5 font-mono text-xs font-medium text-neutral-800 dark:text-slate-200">
                      {del.eventName ?? '—'}
                    </td>
                    <td className="px-3 py-3.5 text-xs text-neutral-600 dark:text-slate-400">
                      {del.webhookName}
                    </td>
                    <td className="px-3 py-3.5 font-mono text-xs text-neutral-500 dark:text-slate-400">
                      {del.durationMs !== null ? `${del.durationMs}ms` : '—'}
                    </td>
                    <td className="px-3 py-3.5 text-xs text-neutral-500 dark:text-slate-400">
                      {formatTime(del.createdAt)}
                    </td>
                    <td className="py-3.5 pl-3 pr-5 text-right">
                      <span className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">
                        View
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Create Webhook Modal */}
      <CreateWebhookModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        eventNames={eventNames}
        authFetch={authFetch}
        onCreated={(created) => {
          setCreateModalOpen(false);
          if (created.secret) {
            setNewSecretCreated(created);
          } else {
            toast.success(`Webhook "${created.name}" created successfully.`);
          }
          router.refresh();
        }}
      />

      {/* One-time Secret Display Modal */}
      {newSecretCreated && (
        <SecretRevealModal
          webhookName={newSecretCreated.name}
          secret={newSecretCreated.secret}
          onClose={() => setNewSecretCreated(null)}
        />
      )}

      {/* Webhook Detail Drawer */}
      {selectedWebhook && (
        <WebhookDetailDrawer
          webhook={selectedWebhook}
          eventNames={eventNames}
          authFetch={authFetch}
          onClose={() => setSelectedWebhookId(null)}
          onRefresh={() => router.refresh()}
          onInspectDelivery={(id) => setSelectedDeliveryId(id)}
        />
      )}

      {/* Delivery Detail Modal */}
      {selectedDeliveryId && (
        <DeliveryDetailModal
          deliveryId={selectedDeliveryId}
          authFetch={authFetch}
          onClose={() => setSelectedDeliveryId(null)}
          onRetrySuccess={() => router.refresh()}
        />
      )}
    </div>
  );
}

// -- Subcomponents --------------------------------------------------------

function MetricCard({ label, value, warn = false }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <span className="text-xs font-medium text-neutral-500 dark:text-slate-400">{label}</span>
      <p
        className={`mt-1.5 text-2xl font-bold tracking-tight ${
          warn ? 'text-red-600 dark:text-red-400' : 'text-neutral-900 dark:text-white'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ status, failureCount }: { status: WebhookStatus; failureCount?: number }) {
  switch (status) {
    case 'active':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
          Active
        </span>
      );
    case 'paused':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-600 dark:bg-amber-400" />
          Paused
        </span>
      );
    case 'failing':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300" title={failureCount ? `${failureCount} consecutive failures` : 'Failing'}>
          <span className="h-1.5 w-1.5 rounded-full bg-red-600 dark:bg-red-400" />
          Failing{failureCount ? ` (${failureCount})` : ''}
        </span>
      );
    case 'disabled':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600 dark:bg-slate-800 dark:text-slate-400">
          <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
          Disabled
        </span>
      );
  }
}

function DeliveryStatusPill({ statusCode, ok, status }: { statusCode: number | null; ok: boolean; status?: string }) {
  if (status === 'retrying') {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
        <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        Retrying
      </span>
    );
  }
  if (ok) {
    return (
      <span className="inline-flex items-center rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
        ✓ {statusCode ?? 200}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded bg-red-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
      ✕ {statusCode ? `${statusCode}` : 'Error'}
    </span>
  );
}

// -- Modal: Create Webhook ------------------------------------------------

function CreateWebhookModal({
  open,
  onClose,
  eventNames,
  authFetch,
  onCreated
}: {
  open: boolean;
  onClose: () => void;
  eventNames: string[];
  authFetch: (path: string, init?: RequestInit) => Promise<Response | null>;
  onCreated: (created: { name: string; secret: string }) => void;
}) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [allEvents, setAllEvents] = useState(true);
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [eventSearch, setEventSearch] = useState('');
  const [customEvent, setCustomEvent] = useState('');
  const [signingMode, setSigningMode] = useState<'auto' | 'custom'>('auto');
  const [customSecret, setCustomSecret] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableEvents = useMemo(() => {
    const combined = Array.from(new Set([...SYSTEM_EVENTS.map((e) => e.name), ...eventNames]));
    if (!eventSearch.trim()) return combined;
    const q = eventSearch.toLowerCase();
    return combined.filter((e) => e.toLowerCase().includes(q));
  }, [eventNames, eventSearch]);

  function toggleEvent(eventName: string) {
    setSelectedEvents((prev) =>
      prev.includes(eventName) ? prev.filter((e) => e !== eventName) : [...prev, eventName]
    );
  }

  function addCustomEvent() {
    const trimmed = customEvent.trim();
    if (!trimmed) return;
    if (!selectedEvents.includes(trimmed)) {
      setSelectedEvents((prev) => [...prev, trimmed]);
    }
    setCustomEvent('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!url.trim()) {
      setError('Please provide an endpoint URL.');
      return;
    }
    if (!/^https?:\/\//i.test(url.trim())) {
      setError('Endpoint URL must begin with http:// or https://');
      return;
    }
    if (!allEvents && selectedEvents.length === 0) {
      setError('Please select at least one event or choose "All events".');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await authFetch('/v1/dashboard/webhooks', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim() || undefined,
          url: url.trim(),
          secret: signingMode === 'custom' ? customSecret.trim() || undefined : 'auto',
          eventNames: allEvents ? [] : selectedEvents
        })
      });

      if (!response?.ok) {
        setError(response ? await readError(response) : 'Failed to create webhook.');
        return;
      }

      const body = (await response.json()) as { id: string; secret: string };
      onCreated({ name: name.trim() || 'Webhook', secret: body.secret });
    } catch (err) {
      setError(await readApiError(err, 'Failed to create webhook.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <DashboardDialog
      open={open}
      title="Create webhook"
      description="Send TraceIQ events to your API or third-party endpoints in real time."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="grid gap-5">
        {/* Name */}
        <div className="grid gap-1.5">
          <label className="text-xs font-semibold text-neutral-700 dark:text-slate-300">
            Name (optional)
          </label>
          <input
            type="text"
            className={inputClass}
            placeholder="e.g. Warehouse sync, Slack alert relay"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* URL */}
        <div className="grid gap-1.5">
          <label className="text-xs font-semibold text-neutral-700 dark:text-slate-300">
            Endpoint URL <span className="text-red-500">*</span>
          </label>
          <input
            type="url"
            required
            className={inputClass}
            placeholder="https://api.example.com/webhooks/traceiq"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>

        {/* Event Selection */}
        <div className="grid gap-2">
          <label className="text-xs font-semibold text-neutral-700 dark:text-slate-300">
            Events to send
          </label>
          <div className="grid gap-2">
            <label className="flex items-center gap-2 text-sm text-neutral-800 dark:text-slate-200">
              <input
                type="radio"
                name="eventsMode"
                checked={allEvents}
                onChange={() => setAllEvents(true)}
                className="text-neutral-900 focus:ring-neutral-900 dark:focus:ring-white"
              />
              <span>All events</span>
              <span className="text-xs text-neutral-400 dark:text-slate-500">(Forward all project & system events)</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-800 dark:text-slate-200">
              <input
                type="radio"
                name="eventsMode"
                checked={!allEvents}
                onChange={() => setAllEvents(false)}
                className="text-neutral-900 focus:ring-neutral-900 dark:focus:ring-white"
              />
              <span>Selected events only</span>
            </label>
          </div>

          {!allEvents && (
            <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
              <div className="flex items-center justify-between gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Filter events…"
                  value={eventSearch}
                  onChange={(e) => setEventSearch(e.target.value)}
                  className="h-8 w-full rounded border border-neutral-300 bg-white px-2.5 text-xs text-neutral-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
                <span className="shrink-0 text-xs font-semibold text-neutral-500">
                  {selectedEvents.length} selected
                </span>
              </div>

              <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                {availableEvents.map((ev) => (
                  <label
                    key={ev}
                    className="flex items-center gap-2 rounded px-2 py-1 text-xs text-neutral-800 hover:bg-neutral-200/50 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={selectedEvents.includes(ev)}
                      onChange={() => toggleEvent(ev)}
                      className="rounded text-neutral-900 focus:ring-neutral-900 dark:focus:ring-white"
                    />
                    <code className="font-mono">{ev}</code>
                  </label>
                ))}
              </div>

              {/* Add Custom Event */}
              <div className="mt-3 flex gap-2 border-t border-neutral-200 pt-2 dark:border-slate-800">
                <input
                  type="text"
                  placeholder="Add custom event name…"
                  value={customEvent}
                  onChange={(e) => setCustomEvent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomEvent();
                    }
                  }}
                  className="h-8 flex-1 rounded border border-neutral-300 bg-white px-2.5 text-xs text-neutral-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
                <button
                  type="button"
                  onClick={addCustomEvent}
                  className="inline-flex h-8 items-center rounded border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Signing Secret Option */}
        <div className="grid gap-2">
          <label className="text-xs font-semibold text-neutral-700 dark:text-slate-300">
            Signing secret
          </label>
          <div className="grid gap-2">
            <label className="flex items-center gap-2 text-sm text-neutral-800 dark:text-slate-200">
              <input
                type="radio"
                name="signingMode"
                checked={signingMode === 'auto'}
                onChange={() => setSigningMode('auto')}
                className="text-neutral-900 focus:ring-neutral-900 dark:focus:ring-white"
              />
              <span>Generate secret automatically (Recommended)</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-800 dark:text-slate-200">
              <input
                type="radio"
                name="signingMode"
                checked={signingMode === 'custom'}
                onChange={() => setSigningMode('custom')}
                className="text-neutral-900 focus:ring-neutral-900 dark:focus:ring-white"
              />
              <span>Use custom signing secret</span>
            </label>
          </div>

          {signingMode === 'custom' && (
            <input
              type="text"
              className={inputClass}
              placeholder="e.g. whsec_my_custom_secret"
              value={customSecret}
              onChange={(e) => setCustomSecret(e.target.value)}
            />
          )}
        </div>

        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300" role="alert">
            {error}
          </div>
        )}

        <div className="mt-2 flex justify-end gap-3 border-t border-neutral-200 pt-4 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-md border border-neutral-300 bg-white px-4 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="h-9 rounded-md bg-neutral-900 px-4 text-xs font-semibold text-white shadow-sm hover:bg-neutral-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-slate-200"
          >
            {isSubmitting ? 'Creating…' : 'Create webhook'}
          </button>
        </div>
      </form>
    </DashboardDialog>
  );
}

// -- Modal: One-Time Secret Display ---------------------------------------

function SecretRevealModal({
  webhookName,
  secret,
  onClose
}: {
  webhookName: string;
  secret: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    toast.success('Signing secret copied to clipboard.');
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <DashboardDialog
      open={true}
      title="Save your signing secret"
      description={`Webhook "${webhookName}" has been created with a signing secret.`}
      onClose={onClose}
    >
      <div className="grid gap-4">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-semibold">⚠️ Important Security Notice</p>
          <p className="mt-1">
            Save this secret now in your environment variables. For security reasons, you will not be able to view the full plaintext value again in the dashboard.
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-slate-800 dark:bg-slate-900">
          <code className="font-mono text-xs font-bold text-neutral-900 break-all dark:text-white">
            {secret}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 inline-flex h-8 items-center gap-1.5 rounded border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-md bg-neutral-900 px-5 text-xs font-semibold text-white shadow-sm hover:bg-neutral-800 dark:bg-white dark:text-black"
          >
            Done
          </button>
        </div>
      </div>
    </DashboardDialog>
  );
}

// -- Drawer / Detail View -------------------------------------------------

function WebhookDetailDrawer({
  webhook,
  eventNames,
  authFetch,
  onClose,
  onRefresh,
  onInspectDelivery
}: {
  webhook: Webhook;
  eventNames: string[];
  authFetch: (path: string, init?: RequestInit) => Promise<Response | null>;
  onClose: () => void;
  onRefresh: () => void;
  onInspectDelivery: (id: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<'overview' | 'deliveries' | 'events' | 'security' | 'settings'>('overview');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    statusCode: number | null;
    durationMs: number | null;
    error: string | null;
  } | null>(null);

  // Deliveries Tab State
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
  const [deliveryFilter, setDeliveryFilter] = useState<'all' | 'success' | 'failed' | 'retrying'>('all');

  // Rotate Secret State
  const [rotateOpen, setRotateOpen] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  // Settings State
  const [name, setName] = useState(webhook.name);
  const [url, setUrl] = useState(webhook.url);
  const [status, setStatus] = useState<WebhookStatus>(webhook.status);
  const [selectedEvents, setSelectedEvents] = useState<string[]>(webhook.eventNames);
  const [allEvents, setAllEvents] = useState(webhook.eventNames.length === 0);
  const [savingSettings, setSavingSettings] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleTestWebhook() {
    setIsTesting(true);
    setTestResult(null);
    try {
      const response = await authFetch(`/v1/dashboard/webhooks/${webhook.id}/test`, { method: 'POST' });
      if (!response?.ok) {
        toast.error('Test delivery failed to execute.');
        return;
      }
      const data = (await response.json()) as {
        ok: boolean;
        statusCode: number | null;
        durationMs: number | null;
        error: string | null;
      };
      setTestResult(data);
      if (data.ok) {
        toast.success(`Delivered successfully (HTTP ${data.statusCode}) in ${data.durationMs}ms`);
      } else {
        toast.error(`Delivery failed: ${data.error ?? `HTTP ${data.statusCode}`}`);
      }
      onRefresh();
    } catch (err) {
      toast.error(await readApiError(err, 'Failed to test webhook.'));
    } finally {
      setIsTesting(false);
    }
  }

  async function fetchDeliveries() {
    setLoadingDeliveries(true);
    try {
      const query = deliveryFilter !== 'all' ? `?status=${deliveryFilter}` : '';
      const res = await authFetch(`/v1/dashboard/webhooks/${webhook.id}/deliveries${query}`);
      if (res?.ok) {
        const body = (await res.json()) as { deliveries: Delivery[] };
        setDeliveries(body.deliveries);
      }
    } finally {
      setLoadingDeliveries(false);
    }
  }

  async function handleRotateSecret() {
    try {
      const res = await authFetch(`/v1/dashboard/webhooks/${webhook.id}/rotate-secret`, { method: 'POST' });
      if (res?.ok) {
        const body = (await res.json()) as { id: string; secret: string };
        setNewSecret(body.secret);
        toast.success('Signing secret rotated successfully.');
        onRefresh();
      } else {
        toast.error(await readError(res!));
      }
    } catch (err) {
      toast.error(await readApiError(err, 'Failed to rotate secret.'));
    }
  }

  async function handleSaveSettings() {
    setSavingSettings(true);
    try {
      const res = await authFetch(`/v1/dashboard/webhooks/${webhook.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: name.trim(),
          url: url.trim(),
          status,
          eventNames: allEvents ? [] : selectedEvents
        })
      });
      if (res?.ok) {
        toast.success('Webhook settings updated.');
        onRefresh();
      } else {
        toast.error(await readError(res!));
      }
    } catch (err) {
      toast.error(await readApiError(err, 'Failed to update settings.'));
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const res = await authFetch(`/v1/dashboard/webhooks/${webhook.id}`, { method: 'DELETE' });
      if (res?.ok) {
        toast.success(`Webhook "${webhook.name}" was removed.`);
        setDeleteOpen(false);
        onClose();
        onRefresh();
      } else {
        toast.error(await readError(res!));
      }
    } catch (err) {
      toast.error(await readApiError(err, 'Failed to delete webhook.'));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm animate-in fade-in">
      <div className="flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl dark:bg-slate-950 dark:border-l dark:border-slate-800">
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white">{webhook.name}</h2>
            <StatusBadge status={webhook.status} failureCount={webhook.failureCount} />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isTesting}
              onClick={handleTestWebhook}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-800 hover:bg-neutral-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {isTesting ? 'Sending…' : '⚡ Test webhook'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-slate-200"
              aria-label="Close drawer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Live Test Feedback Banner */}
        {testResult && (
          <div
            className={`flex items-center justify-between border-b px-6 py-2.5 text-xs font-medium ${
              testResult.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <span>{testResult.ok ? '✓ Test delivered successfully' : '✕ Test delivery failed'}:</span>
              <span className="font-mono font-bold">
                {testResult.statusCode ? `HTTP ${testResult.statusCode}` : 'Network Error'}
              </span>
              {testResult.durationMs && <span>({testResult.durationMs}ms)</span>}
              {testResult.error && <span className="italic">— {testResult.error}</span>}
            </div>
            <button
              type="button"
              onClick={() => setTestResult(null)}
              className="text-neutral-400 hover:text-neutral-700"
            >
              ✕
            </button>
          </div>
        )}

        {/* Drawer Tabs */}
        <div className="flex border-b border-neutral-200 px-6 dark:border-slate-800">
          {(['overview', 'deliveries', 'events', 'security', 'settings'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setActiveTab(tab);
                if (tab === 'deliveries') void fetchDeliveries();
              }}
              className={`border-b-2 px-4 py-3 text-xs font-semibold capitalize transition ${
                activeTab === tab
                  ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="grid gap-6">
              {/* Endpoint Card */}
              <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-slate-500">
                  Endpoint URL
                </span>
                <p className="mt-1 font-mono text-sm font-bold text-neutral-900 dark:text-white break-all">
                  {webhook.url}
                </p>
                <div className="mt-4 flex flex-wrap gap-4 text-xs text-neutral-500 dark:text-slate-400">
                  <div>
                    <span className="font-semibold text-neutral-700 dark:text-slate-300">Events: </span>
                    {webhook.eventNames.length === 0 ? 'All events' : `${webhook.eventNames.length} selected`}
                  </div>
                  <div>
                    <span className="font-semibold text-neutral-700 dark:text-slate-300">Signing: </span>
                    {webhook.hasSecret ? 'HMAC SHA-256' : 'None'}
                  </div>
                  <div>
                    <span className="font-semibold text-neutral-700 dark:text-slate-300">Created: </span>
                    {formatTime(webhook.createdAt)}
                  </div>
                </div>
              </div>

              {/* Status & Health Guidance */}
              {webhook.status === 'failing' && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                  <p className="font-bold">⚠️ High failure rate detected</p>
                  <p className="mt-1">
                    TraceIQ has recorded repeated delivery failures for this endpoint. Deliveries will be retried with exponential backoff. You can test your endpoint or inspect failed attempts in the Deliveries tab.
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'deliveries' && (
            <div className="grid gap-4">
              <div className="flex items-center justify-between">
                <select
                  value={deliveryFilter}
                  onChange={(e) => {
                    setDeliveryFilter(e.target.value as any);
                    setTimeout(() => void fetchDeliveries(), 0);
                  }}
                  className={selectClass}
                >
                  <option value="all">All statuses</option>
                  <option value="success">Success only</option>
                  <option value="failed">Failed only</option>
                  <option value="retrying">Retrying only</option>
                </select>
                <button
                  type="button"
                  onClick={() => void fetchDeliveries()}
                  className="text-xs font-semibold text-neutral-600 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white"
                >
                  ↻ Refresh
                </button>
              </div>

              {loadingDeliveries ? (
                <div className="p-8 text-center text-xs text-neutral-500">Loading deliveries…</div>
              ) : deliveries.length === 0 ? (
                <div className="p-8 text-center text-xs text-neutral-500">No deliveries found.</div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-neutral-200 bg-neutral-50/50 text-[10px] font-semibold uppercase text-neutral-500 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
                      <tr>
                        <th className="py-2.5 pl-4 pr-2">Status</th>
                        <th className="px-2 py-2.5">Event</th>
                        <th className="px-2 py-2.5">Duration</th>
                        <th className="px-2 py-2.5">Attempt</th>
                        <th className="px-2 py-2.5">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 dark:divide-slate-800">
                      {deliveries.map((d) => (
                        <tr
                          key={d.id}
                          onClick={() => onInspectDelivery(d.id)}
                          className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-slate-900/40"
                        >
                          <td className="py-2.5 pl-4 pr-2">
                            <DeliveryStatusPill statusCode={d.statusCode} ok={d.ok} status={d.status} />
                          </td>
                          <td className="px-2 py-2.5 font-mono font-medium">{d.eventName ?? '—'}</td>
                          <td className="px-2 py-2.5 font-mono text-neutral-500">{d.durationMs ? `${d.durationMs}ms` : '—'}</td>
                          <td className="px-2 py-2.5 text-neutral-500">{d.attempt} of 5</td>
                          <td className="px-2 py-2.5 text-neutral-500">{formatTime(d.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'events' && (
            <div className="grid gap-4">
              <p className="text-xs text-neutral-500 dark:text-slate-400">
                Choose which events trigger deliveries to this endpoint.
              </p>
              <div className="grid gap-2">
                <label className="flex items-center gap-2 text-sm text-neutral-800 dark:text-slate-200">
                  <input
                    type="radio"
                    name="drawerEventsMode"
                    checked={allEvents}
                    onChange={() => setAllEvents(true)}
                  />
                  <span>All events</span>
                </label>
                <label className="flex items-center gap-2 text-sm text-neutral-800 dark:text-slate-200">
                  <input
                    type="radio"
                    name="drawerEventsMode"
                    checked={!allEvents}
                    onChange={() => setAllEvents(false)}
                  />
                  <span>Selected events</span>
                </label>
              </div>

              {!allEvents && (
                <div className="mt-2 grid max-h-60 gap-1 overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                  {Array.from(new Set([...SYSTEM_EVENTS.map((e) => e.name), ...eventNames])).map((ev) => (
                    <label key={ev} className="flex items-center gap-2 py-1 text-xs font-mono">
                      <input
                        type="checkbox"
                        checked={selectedEvents.includes(ev)}
                        onChange={() =>
                          setSelectedEvents((prev) =>
                            prev.includes(ev) ? prev.filter((x) => x !== ev) : [...prev, ev]
                          )
                        }
                      />
                      <span>{ev}</span>
                    </label>
                  ))}
                </div>
              )}

              <button
                type="button"
                disabled={savingSettings}
                onClick={handleSaveSettings}
                className="mt-2 h-9 w-fit rounded-md bg-neutral-900 px-4 text-xs font-semibold text-white shadow-sm hover:bg-neutral-800 dark:bg-white dark:text-black"
              >
                {savingSettings ? 'Saving…' : 'Save events'}
              </button>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="grid gap-6">
              {/* Signing Secret Card */}
              <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Signing secret</h3>
                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">
                      TraceIQ signs every webhook with HMAC-SHA256.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRotateOpen(true)}
                    className="rounded border border-neutral-300 bg-white px-3 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    Rotate secret
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <code className="font-mono text-xs text-neutral-600 dark:text-slate-400">
                    whsec_••••••••••••••••••••••••••••••••
                  </code>
                </div>
                {webhook.secretRotatedAt && (
                  <p className="mt-2 text-[11px] text-neutral-400 dark:text-slate-500">
                    Last rotated on {formatTime(webhook.secretRotatedAt)}
                  </p>
                )}
              </div>

              {/* Code Verification Snippets */}
              <div className="grid gap-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-slate-400">
                  Verification Code Examples
                </h3>

                {/* Node.js Snippet */}
                <div className="rounded-xl border border-neutral-200 bg-neutral-950 p-4 text-xs text-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                    <span className="font-mono font-semibold text-neutral-400">Node.js (TypeScript)</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(nodeVerificationSnippet);
                        toast.success('Node.js verification snippet copied.');
                      }}
                      className="text-[11px] font-semibold text-blue-400 hover:underline"
                    >
                      Copy
                    </button>
                  </div>
                  <pre className="mt-3 overflow-x-auto font-mono text-[11px] leading-relaxed text-emerald-400">
                    {nodeVerificationSnippet}
                  </pre>
                </div>

                {/* Python Snippet */}
                <div className="rounded-xl border border-neutral-200 bg-neutral-950 p-4 text-xs text-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                    <span className="font-mono font-semibold text-neutral-400">Python 3</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(pythonVerificationSnippet);
                        toast.success('Python verification snippet copied.');
                      }}
                      className="text-[11px] font-semibold text-blue-400 hover:underline"
                    >
                      Copy
                    </button>
                  </div>
                  <pre className="mt-3 overflow-x-auto font-mono text-[11px] leading-relaxed text-emerald-400">
                    {pythonVerificationSnippet}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="grid gap-6">
              <div className="grid gap-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">General Settings</h3>

                <div className="grid gap-1.5">
                  <label className="text-xs font-semibold text-neutral-700 dark:text-slate-300">Name</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="grid gap-1.5">
                  <label className="text-xs font-semibold text-neutral-700 dark:text-slate-300">Endpoint URL</label>
                  <input
                    type="url"
                    className={inputClass}
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </div>

                <div className="grid gap-1.5">
                  <label className="text-xs font-semibold text-neutral-700 dark:text-slate-300">Status</label>
                  <select
                    className={selectClass}
                    value={status}
                    onChange={(e) => setStatus(e.target.value as WebhookStatus)}
                  >
                    <option value="active">Active (Deliveries enabled)</option>
                    <option value="paused">Paused (Deliveries temporarily paused)</option>
                    <option value="disabled">Disabled (Deliveries stopped)</option>
                  </select>
                  <span className="text-[11px] text-neutral-400 dark:text-slate-500">
                    When paused, incoming events occurring while paused will not be delivered.
                  </span>
                </div>

                <button
                  type="button"
                  disabled={savingSettings}
                  onClick={handleSaveSettings}
                  className="mt-2 h-9 w-fit rounded-md bg-neutral-900 px-4 text-xs font-semibold text-white shadow-sm hover:bg-neutral-800 dark:bg-white dark:text-black"
                >
                  {savingSettings ? 'Saving…' : 'Save changes'}
                </button>
              </div>

              {/* Danger Zone */}
              <div className="rounded-xl border border-red-200 bg-red-50/50 p-5 dark:border-red-950 dark:bg-red-950/20">
                <h3 className="text-sm font-bold text-red-900 dark:text-red-300">Danger Zone</h3>
                <p className="mt-1 text-xs text-red-700 dark:text-red-400">
                  Permanently remove this webhook endpoint. Existing delivery logs will be preserved.
                </p>
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  className="mt-4 h-9 rounded-md bg-red-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-red-700"
                >
                  Delete webhook
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Rotate Secret Confirmation Dialog */}
      <DashboardDialog
        open={rotateOpen}
        title="Rotate signing secret?"
        description="Rotating your secret invalidates the current secret. Make sure to update your application server with the new secret value."
        onClose={() => setRotateOpen(false)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setRotateOpen(false)}
              className="h-9 rounded border border-neutral-300 px-4 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-slate-700 dark:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={async () => {
                setRotateOpen(false);
                await handleRotateSecret();
              }}
              className="h-9 rounded bg-amber-600 px-4 text-xs font-semibold text-white hover:bg-amber-700"
            >
              Rotate secret now
            </button>
          </>
        }
      >
        <p className="text-xs text-neutral-600 dark:text-slate-400">
          The new secret will be displayed once immediately after rotation.
        </p>
      </DashboardDialog>

      {/* Display rotated secret */}
      {newSecret && (
        <SecretRevealModal
          webhookName={webhook.name}
          secret={newSecret}
          onClose={() => setNewSecret(null)}
        />
      )}

      {/* Delete Webhook Confirmation Dialog */}
      <DashboardDialog
        open={deleteOpen}
        title="Delete webhook?"
        description={`Are you sure you want to delete "${webhook.name}"? TraceIQ will stop sending events to this URL.`}
        onClose={() => setDeleteOpen(false)}
        footer={
          <>
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => setDeleteOpen(false)}
              className="h-9 rounded border border-neutral-300 px-4 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-slate-700 dark:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleDelete}
              className="h-9 rounded bg-red-600 px-4 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {isDeleting ? 'Deleting…' : 'Delete webhook'}
            </button>
          </>
        }
      />
    </div>
  );
}

// -- Modal: Delivery Details & Attempt Inspector --------------------------

function DeliveryDetailModal({
  deliveryId,
  authFetch,
  onClose,
  onRetrySuccess
}: {
  deliveryId: string;
  authFetch: (path: string, init?: RequestInit) => Promise<Response | null>;
  onClose: () => void;
  onRetrySuccess: () => void;
}) {
  const [data, setData] = useState<{
    delivery: any;
    attempts: Array<{
      id: string;
      attemptNumber: number;
      statusCode: number | null;
      durationMs: number | null;
      ok: boolean;
      error: string | null;
      responseHeaders: Record<string, string> | null;
      responseBody: string | null;
      createdAt: string;
    }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);

  async function loadDetails() {
    setLoading(true);
    try {
      const res = await authFetch(`/v1/dashboard/webhooks/deliveries/${deliveryId}`);
      if (res?.ok) {
        const body = await res.json();
        setData(body);
      }
    } finally {
      setLoading(false);
    }
  }

  useMemo(() => {
    void loadDetails();
  }, [deliveryId]);

  async function handleManualRetry() {
    setIsRetrying(true);
    try {
      const res = await authFetch(`/v1/dashboard/webhooks/deliveries/${deliveryId}/retry`, { method: 'POST' });
      if (res?.ok) {
        const outcome = (await res.json()) as { ok: boolean; statusCode: number | null; durationMs: number | null; error: string | null };
        if (outcome.ok) {
          toast.success(`Retry attempt succeeded (HTTP ${outcome.statusCode}) in ${outcome.durationMs}ms`);
        } else {
          toast.error(`Retry attempt failed: ${outcome.error ?? `HTTP ${outcome.statusCode}`}`);
        }
        await loadDetails();
        onRetrySuccess();
      } else {
        toast.error('Failed to retry delivery.');
      }
    } catch (err) {
      toast.error(await readApiError(err, 'Failed to retry delivery.'));
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <DashboardDialog
      open={true}
      title="Delivery details"
      description={`Delivery ID: ${data?.delivery?.deliveryId ?? deliveryId}`}
      onClose={onClose}
    >
      {loading || !data ? (
        <div className="p-8 text-center text-xs text-neutral-500">Loading delivery details…</div>
      ) : (
        <div className="grid gap-5 text-xs">
          {/* Status & Summary */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-neutral-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="flex items-center gap-2">
              <DeliveryStatusPill statusCode={data.delivery.statusCode} ok={data.delivery.ok} status={data.delivery.status} />
              <span className="font-mono font-bold text-neutral-900 dark:text-white">
                {data.delivery.eventName}
              </span>
            </div>
            <div className="flex items-center gap-3 text-neutral-500">
              <span>{data.delivery.durationMs ? `${data.delivery.durationMs}ms` : '—'}</span>
              <span>Attempt {data.delivery.attempt} of {data.delivery.maxAttempts}</span>
              <button
                type="button"
                disabled={isRetrying}
                onClick={handleManualRetry}
                className="inline-flex h-7 items-center gap-1 rounded border border-neutral-300 bg-white px-2.5 font-semibold text-neutral-700 hover:bg-neutral-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {isRetrying ? 'Retrying…' : '↻ Retry now'}
              </button>
            </div>
          </div>

          {/* Request Section */}
          <div className="grid gap-2">
            <h4 className="font-bold uppercase tracking-wider text-neutral-500 dark:text-slate-400">Request</h4>
            <div className="rounded-lg border border-neutral-200 bg-neutral-950 p-3 font-mono text-[11px] text-slate-200 dark:border-slate-800">
              <div className="text-neutral-400 mb-2 font-semibold">Headers:</div>
              <pre className="overflow-x-auto text-neutral-300">
                {JSON.stringify(data.delivery.requestHeaders, null, 2)}
              </pre>
              <div className="text-neutral-400 my-2 font-semibold border-t border-neutral-800 pt-2">Payload:</div>
              <pre className="overflow-x-auto text-emerald-400">
                {JSON.stringify(data.delivery.payload, null, 2)}
              </pre>
            </div>
          </div>

          {/* Response Section */}
          <div className="grid gap-2">
            <h4 className="font-bold uppercase tracking-wider text-neutral-500 dark:text-slate-400">Response</h4>
            <div className="rounded-lg border border-neutral-200 bg-neutral-950 p-3 font-mono text-[11px] text-slate-200 dark:border-slate-800">
              {data.delivery.error && (
                <div className="text-red-400 mb-2 font-semibold">Error: {data.delivery.error}</div>
              )}
              {data.delivery.responseBody ? (
                <pre className="overflow-x-auto text-neutral-300">
                  {data.delivery.responseBody}
                </pre>
              ) : (
                <div className="text-neutral-500 italic">No response body captured.</div>
              )}
            </div>
          </div>

          {/* Attempts Timeline */}
          {data.attempts.length > 1 && (
            <div className="grid gap-2">
              <h4 className="font-bold uppercase tracking-wider text-neutral-500 dark:text-slate-400">Attempt History</h4>
              <div className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-slate-800 dark:border-slate-800">
                {data.attempts.map((att) => (
                  <div key={att.id} className="flex items-center justify-between p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Attempt {att.attemptNumber}:</span>
                      <DeliveryStatusPill statusCode={att.statusCode} ok={att.ok} />
                      {att.error && <span className="text-neutral-500 italic">{att.error}</span>}
                    </div>
                    <div className="flex items-center gap-3 text-neutral-400">
                      <span>{att.durationMs ? `${att.durationMs}ms` : '—'}</span>
                      <span>{formatTime(att.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </DashboardDialog>
  );
}

// -- Helpers & Styles -----------------------------------------------------

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? `Request failed with ${response.status}`;
  } catch {
    return `Request failed with ${response.status}`;
  }
}

const inputClass =
  'min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-xs font-normal normal-case text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-white dark:focus:ring-white/10';

const selectClass =
  'h-8 rounded-md border border-neutral-300 bg-white px-2.5 text-xs font-medium text-neutral-700 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';

const searchClass =
  'h-8 w-48 rounded-md border border-neutral-300 bg-white px-2.5 text-xs text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500';

const nodeVerificationSnippet = `import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyTraceIQWebhook(
  rawBody: string,
  signatureHeader: string,
  timestampHeader: string,
  secret: string,
  toleranceSeconds = 300
): boolean {
  // 1. Prevent replay attacks by checking timestamp window (default: 5 mins)
  const eventTime = new Date(timestampHeader).getTime();
  if (isNaN(eventTime) || Math.abs(Date.now() - eventTime) > toleranceSeconds * 1000) {
    return false;
  }

  // 2. Compute expected HMAC-SHA256 signature
  const expected = 'sha256=' + createHmac('sha256', secret)
    .update(\`\${timestampHeader}.\${rawBody}\`)
    .digest('hex');

  // 3. Constant-time comparison
  const sigBuffer = Buffer.from(signatureHeader);
  const expBuffer = Buffer.from(expected);
  if (sigBuffer.length !== expBuffer.length) return false;
  return timingSafeEqual(sigBuffer, expBuffer);
}`;

const pythonVerificationSnippet = `import hmac
import hashlib
import time
from datetime import datetime

def verify_traceiq_webhook(
    raw_body: str,
    signature_header: str,
    timestamp_header: str,
    secret: str,
    tolerance_seconds: int = 300
) -> bool:
    # 1. Prevent replay attacks with timestamp check
    try:
        event_time = datetime.fromisoformat(timestamp_header.replace("Z", "+00:00")).timestamp()
        if abs(time.time() - event_time) > tolerance_seconds:
            return False
    except Exception:
        return False

    # 2. Compute HMAC-SHA256 signature over timestamp.raw_body
    payload = f"{timestamp_header}.{raw_body}".encode('utf-8')
    expected = "sha256=" + hmac.new(secret.encode('utf-8'), payload, hashlib.sha256).hexdigest()

    # 3. Constant-time comparison
    return hmac.compare_digest(signature_header, expected)`;
