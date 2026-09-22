'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { DashboardDialog } from '../DashboardDialog';
import { readApiError } from '@/lib/api-error';
import { toast } from '@/lib/toast';
import type { FilterCondition } from '@/components/SegmentFilters';
import { CreateAlertModal, AlertFormData } from './CreateAlertModal';
import { NotificationGroupModal } from './NotificationGroupModal';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface AlertDelivery {
  channel: string;
  recipient: string | null;
  status: string;
  error: string | null;
  sentAt: string;
}

interface Alert {
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
  deliveries: AlertDelivery[];
}

interface AlertEvent {
  id: string;
  alertName: string;
  value: number | null;
  message: string;
  triggeredAt: string;
}

interface NotificationGroup {
  id: string;
  name: string;
  memberEmails: string[];
}

const TEMPLATE_ALERTS: Array<{
  name: string;
  description: string;
  data: Partial<AlertFormData>;
}> = [
    {
      name: 'Signup Drop Alert',
      description: 'Alerts if successful user signups drop by more than 30% compared to yesterday.',
      data: {
        name: 'Signups Dropping (>30%)',
        eventName: 'signup_completed',
        measure: 'count',
        windowHours: 24,
        condition: 'drops_by',
        threshold: 30
      }
    },
    {
      name: 'API Error Spike Alert',
      description: 'Alerts when API request error count spikes by more than 50% over a 1-hour window.',
      data: {
        name: 'API Error Rate Spike',
        eventName: '$api_request',
        measure: 'count',
        windowHours: 1,
        condition: 'spikes_by',
        threshold: 50
      }
    },
    {
      name: 'Zero Activity Threshold',
      description: 'Detects complete system outage when essential telemetry drops below 1.',
      data: {
        name: 'Zero Ingestion Warning',
        eventName: '$api_request',
        measure: 'count',
        windowHours: 1,
        condition: 'below',
        threshold: 1
      }
    }
  ];

function humanReadableCondition(alert: Alert): string {
  const metric =
    alert.measure === 'count'
      ? `count of "${alert.eventName}"`
      : alert.measure === 'unique'
        ? `unique users for "${alert.eventName}"`
        : `average ${alert.property ? `"${alert.property}"` : 'property'} for "${alert.eventName}"`;

  const windowStr = alert.windowHours === 168 ? '7 days' : `${alert.windowHours} hours`;

  switch (alert.condition) {
    case 'drops_by':
      return `Triggers when ${metric} drops by ${alert.threshold}% over a rolling ${windowStr} window.`;
    case 'spikes_by':
      return `Triggers when ${metric} spikes by ${alert.threshold}% over a rolling ${windowStr} window.`;
    case 'above':
      return `Triggers when ${metric} rises above ${alert.threshold.toLocaleString()} in a rolling ${windowStr} window.`;
    case 'below':
      return `Triggers when ${metric} falls below ${alert.threshold.toLocaleString()} in a rolling ${windowStr} window.`;
    default:
      return `${metric} ${alert.condition} ${alert.threshold} over ${windowStr}`;
  }
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function AlertManager({
  alerts,
  recentEvents,
  eventNames,
  notificationGroups,
  alertsAvailable
}: {
  alerts: Alert[];
  recentEvents: AlertEvent[];
  eventNames: string[];
  notificationGroups: NotificationGroup[];
  alertsAvailable: boolean;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();

  // Create / Edit Alert Modal state
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [alertModalData, setAlertModalData] = useState<Partial<AlertFormData> | undefined>(undefined);
  const [isAlertSubmitting, setIsAlertSubmitting] = useState(false);
  const [alertError, setAlertError] = useState<string | null>(null);

  // Notification Group Modal state
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [groupToEdit, setGroupToEdit] = useState<NotificationGroup | null>(null);
  const [isGroupSubmitting, setIsGroupSubmitting] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);

  // Alert deletion state
  const [alertToDelete, setAlertToDelete] = useState<Alert | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<NotificationGroup | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { message: string; triggered: boolean }>>({});

  async function getToken(): Promise<string | null> {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function authFetch(path: string, init: RequestInit): Promise<Response | null> {
    const token = await getToken();
    if (!token) {
      toast.error('Session expired. Please sign in again.');
      return null;
    }
    return fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {})
      }
    });
  }

  function handleOpenCreateAlert(initial?: Partial<AlertFormData>) {
    setAlertModalData(initial);
    setAlertError(null);
    setIsAlertModalOpen(true);
  }

  function handleOpenDuplicateAlert(alert: Alert) {
    handleOpenCreateAlert({
      name: `${alert.name} (Copy)`,
      eventName: alert.eventName,
      measure: alert.measure,
      property: alert.property ?? undefined,
      windowHours: alert.windowHours,
      condition: alert.condition,
      threshold: alert.threshold,
      filters: alert.filters,
      webhookUrl: alert.webhookUrl ?? undefined,
      emailRecipients: alert.emailRecipients,
      notificationGroupIds: alert.notificationGroupIds
    });
  }

  async function handleSaveAlert(payload: AlertFormData) {
    setIsAlertSubmitting(true);
    setAlertError(null);

    try {
      const response = await authFetch('/v1/dashboard/alerts', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (!response) {
        setIsAlertSubmitting(false);
        return;
      }

      if (!response.ok) {
        const message = await readApiError(response, 'Could not save alert.');
        setAlertError(message);
        setIsAlertSubmitting(false);
        return;
      }

      toast.success(`Alert "${payload.name}" was created successfully.`);
      setIsAlertModalOpen(false);
      setIsAlertSubmitting(false);
      router.refresh();
    } catch (err) {
      setAlertError(err instanceof Error ? err.message : 'Could not save alert.');
      setIsAlertSubmitting(false);
    }
  }

  async function handleToggle(alert: Alert) {
    setBusyId(alert.id);
    try {
      const response = await authFetch(`/v1/dashboard/alerts/${alert.id}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !alert.enabled })
      });
      if (response?.ok) {
        toast.success(`Alert "${alert.name}" is now ${!alert.enabled ? 'enabled' : 'paused'}.`);
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleTest(alert: Alert) {
    setBusyId(alert.id);
    try {
      const response = await authFetch(`/v1/dashboard/alerts/${alert.id}/test`, { method: 'POST' });
      if (response?.ok) {
        const result = (await response.json()) as { message: string; triggered: boolean };
        setTestResults((prev) => ({ ...prev, [alert.id]: result }));
        if (result.triggered) {
          toast.warning(`Test firing triggered: ${result.message}`);
        } else {
          toast.success(`Test check passed: ${result.message}`);
        }
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteAlert() {
    if (!alertToDelete || busyId) return;
    setBusyId(alertToDelete.id);
    try {
      const response = await authFetch(`/v1/dashboard/alerts/${alertToDelete.id}`, { method: 'DELETE' });
      if (!response?.ok) throw new Error('Could not delete alert.');
      toast.success(`Alert "${alertToDelete.name}" was removed.`);
      setAlertToDelete(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Deletion failed.');
    } finally {
      setBusyId(null);
    }
  }

  // Notification Group Handlers
  function handleOpenCreateGroup() {
    setGroupToEdit(null);
    setGroupError(null);
    setIsGroupModalOpen(true);
  }

  function handleOpenEditGroup(group: NotificationGroup) {
    setGroupToEdit(group);
    setGroupError(null);
    setIsGroupModalOpen(true);
  }

  async function handleSaveGroup(name: string, memberEmails: string[], id?: string) {
    setIsGroupSubmitting(true);
    setGroupError(null);

    try {
      const endpoint = id ? `/v1/dashboard/notification-groups/${id}` : '/v1/dashboard/notification-groups';
      const method = id ? 'PUT' : 'POST';

      const response = await authFetch(endpoint, {
        method,
        body: JSON.stringify({ name, memberEmails })
      });

      if (!response) {
        setIsGroupSubmitting(false);
        return;
      }

      if (!response.ok) {
        const message = await readApiError(response, 'Could not save notification group.');
        setGroupError(message);
        setIsGroupSubmitting(false);
        return;
      }

      toast.success(`Notification group "${name}" saved.`);
      setIsGroupModalOpen(false);
      setIsGroupSubmitting(false);
      router.refresh();
    } catch (err) {
      setGroupError(err instanceof Error ? err.message : 'Could not save notification group.');
      setIsGroupSubmitting(false);
    }
  }

  async function handleDeleteGroup() {
    if (!groupToDelete || busyId) return;
    setBusyId(groupToDelete.id);
    try {
      const response = await authFetch(`/v1/dashboard/notification-groups/${groupToDelete.id}`, {
        method: 'DELETE'
      });
      if (!response?.ok) throw new Error('Could not delete group.');
      toast.success(`Group "${groupToDelete.name}" was removed.`);
      setGroupToDelete(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Deletion failed.');
    } finally {
      setBusyId(null);
    }
  }

  // Metrics summary
  const activeAlertsCount = alerts.filter((a) => a.enabled).length;
  const triggeredCount = alerts.filter((a) => a.lastStatus === 'triggered').length;
  const totalDestinationsCount =
    alerts.reduce((sum, a) => {
      let count = 0;
      if (a.webhookUrl) count++;
      if (a.emailRecipients.length > 0) count += a.emailRecipients.length;
      if (a.notificationGroupIds.length > 0) count += a.notificationGroupIds.length;
      return sum + count;
    }, 0) + notificationGroups.length;

  return (
    <div className="space-y-6">
      {/* Plan Entitlement Warning */}
      {!alertsAvailable ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <div className="flex items-center justify-between gap-3">
            <div>
              <strong className="font-semibold">Automated Alerts require Pro:</strong> Alert rules remain saved, but background evaluation and incident notifications are paused.
            </div>
            <Link
              href="/dashboard/settings/billing"
              className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition"
            >
              Upgrade to Pro →
            </Link>
          </div>
        </div>
      ) : null}

      {/* Summary Metric Cards: Solid Blue Cards with White Text */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Solid Blue Card 1: Active Monitors */}
        <div className="relative overflow-hidden rounded-xl border border-blue-500 bg-blue-600 p-5 text-white shadow-sm dark:border-blue-600 dark:bg-blue-600">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-100">
              Active Monitors
            </span>
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white">
              {alerts.length} Total
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight tabular-nums sm:text-4xl">
              {activeAlertsCount}
            </span>
            <span className="text-xs text-blue-100 font-medium">
              monitors enabled
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-blue-50/90">
            {activeAlertsCount > 0
              ? 'Continuously evaluating rolling telemetry in the background.'
              : 'No active monitors enabled. Create or enable an alert below.'}
          </p>
        </div>

        {/* Solid Blue Card 2: Recent Firings */}
        <div className="relative overflow-hidden rounded-xl border border-blue-500 bg-blue-600 p-5 text-white shadow-sm dark:border-blue-600 dark:bg-blue-600">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-100">
              Recent Firings
            </span>
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white">
              {triggeredCount > 0 ? 'Attention' : 'Healthy'}
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight tabular-nums sm:text-4xl">
              {recentEvents.length}
            </span>
            <span className="text-xs text-blue-100 font-medium">
              incident events
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-blue-50/90">
            {recentEvents.length > 0
              ? `${recentEvents.length} threshold alerts recorded across recent evaluation windows.`
              : 'All monitored metrics are currently within normal baseline thresholds.'}
          </p>
        </div>

        {/* Neutral Card 3: Notification Destinations */}
        <div className="flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-950 sm:col-span-2 lg:col-span-1">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
                Notification Channels
              </span>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600 dark:bg-slate-900 dark:text-slate-300">
                {notificationGroups.length} Groups
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-neutral-900 tabular-nums dark:text-white">
                {totalDestinationsCount}
              </span>
              <span className="text-xs text-neutral-500 dark:text-slate-400 font-medium">
                destinations configured
              </span>
            </div>
            <p className="mt-2 text-xs text-neutral-500 dark:text-slate-400">
              Webhooks, team notification groups, and direct email recipients ready to dispatch alerts.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-slate-800/80">
            <button
              type="button"
              onClick={() => handleOpenCreateAlert()}
              disabled={!alertsAvailable}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-slate-200"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Create New Alert</span>
            </button>
          </div>
        </div>
      </section>

      {/* Main Alerts Section & Recent Firings Layout */}
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* Left Column: Primary Alerts List */}
        <div className="space-y-6">
          <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950 shadow-xs">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-5 border-b border-neutral-200/80 dark:border-slate-800/80">
              <div>
                <h3 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">
                  Monitored Alerts
                </h3>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">
                  Automated metric monitors running in the background.
                </p>
              </div>

              {alerts.length > 0 ? (
                <button
                  type="button"
                  onClick={() => handleOpenCreateAlert()}
                  disabled={!alertsAvailable}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500 self-start sm:self-auto"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>Create alert</span>
                </button>
              ) : null}
            </div>

            {/* Alerts List or Rich Empty State */}
            {alerts.length === 0 ? (
              <div className="py-8 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 mb-4 shadow-inner">
                  <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
                <h4 className="text-base font-bold text-neutral-900 dark:text-white">
                  No automated alerts created yet
                </h4>
                <p className="mx-auto mt-1.5 max-w-lg text-sm text-neutral-500 dark:text-slate-400">
                  Alerts proactively monitor your telemetry so you know immediately if key metrics drop, error rates spike, or usage hits abnormal levels without watching dashboards.
                </p>

                <div className="mt-6 flex justify-center">
                  <button
                    type="button"
                    onClick={() => handleOpenCreateAlert()}
                    disabled={!alertsAvailable}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span>Create your first alert</span>
                  </button>
                </div>

                {/* Recommended Alert Templates */}
                <div className="mt-10 pt-8 border-t border-neutral-100 dark:border-slate-800/80">
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-slate-500 mb-4">
                    Or start with a common template:
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3 max-w-3xl mx-auto text-left">
                    {TEMPLATE_ALERTS.map((tmpl) => (
                      <button
                        key={tmpl.name}
                        type="button"
                        onClick={() => handleOpenCreateAlert(tmpl.data)}
                        className="group rounded-xl border border-neutral-200 p-4 transition-all hover:border-blue-500 hover:bg-blue-50/30 hover:shadow-xs dark:border-slate-800 dark:hover:border-blue-500/50 dark:hover:bg-blue-950/20"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-sm font-semibold text-neutral-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400 transition">
                            {tmpl.name}
                          </span>
                          <span className="text-neutral-400 group-hover:text-blue-600 dark:text-slate-500 dark:group-hover:text-blue-400">
                            →
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs text-neutral-500 dark:text-slate-400 leading-relaxed">
                          {tmpl.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-neutral-200/70 dark:divide-slate-800/70">
                {alerts.map((alert) => {
                  const testResult = testResults[alert.id];
                  return (
                    <div
                      key={alert.id}
                      className="py-5 first:pt-4 last:pb-0 flex flex-col gap-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1.5 min-w-0">
                          {/* Alert Title & Status Badge */}
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${!alertsAvailable
                                  ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                                  : alert.enabled
                                    ? alert.lastStatus === 'triggered'
                                      ? 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                                      : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                    : 'bg-neutral-100 text-neutral-500 dark:bg-slate-900 dark:text-slate-400'
                                }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${!alertsAvailable
                                    ? 'bg-amber-500'
                                    : alert.enabled
                                      ? alert.lastStatus === 'triggered'
                                        ? 'bg-red-500 animate-pulse'
                                        : 'bg-emerald-500'
                                      : 'bg-neutral-400'
                                  }`}
                              />
                              {!alertsAvailable
                                ? 'Pro required'
                                : alert.enabled
                                  ? alert.lastStatus === 'triggered'
                                    ? 'Firing'
                                    : 'Active'
                                  : 'Paused'}
                            </span>

                            <h4 className="text-base font-bold text-neutral-900 dark:text-white">
                              {alert.name}
                            </h4>

                            <span className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 font-mono text-[11px] text-neutral-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                              {alert.eventName} · {alert.measure}
                            </span>
                          </div>

                          {/* Human Readable Condition */}
                          <p className="text-sm font-medium text-neutral-700 dark:text-slate-200">
                            {humanReadableCondition(alert)}
                          </p>

                          {/* Last Evaluated Info */}
                          <p className="text-xs text-neutral-400 dark:text-slate-500">
                            {!alertsAvailable
                              ? 'Evaluations paused while on Free tier'
                              : alert.lastValue !== null
                                ? `Last measured value: ${Math.round(alert.lastValue).toLocaleString()} • Checked ${formatDate(alert.lastEvaluatedAt)}`
                                : 'Awaiting initial background evaluation cycle…'}
                          </p>
                        </div>

                        {/* Actions Toolbar */}
                        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
                          <button
                            type="button"
                            onClick={() => handleTest(alert)}
                            disabled={!alertsAvailable || busyId === alert.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition"
                            title="Run dry-run evaluation check"
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                            <span>{busyId === alert.id ? 'Testing…' : 'Test'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggle(alert)}
                            disabled={!alertsAvailable || busyId === alert.id}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${alert.enabled
                                ? 'border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                                : 'bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-slate-200'
                              }`}
                          >
                            {alert.enabled ? 'Pause' : 'Enable'}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenDuplicateAlert(alert)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition"
                            title="Duplicate alert configuration"
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                            <span>Duplicate</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setAlertToDelete(alert)}
                            className="inline-flex items-center justify-center rounded-lg p-2 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition"
                            aria-label={`Delete ${alert.name}`}
                            title="Delete alert"
                          >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Notification Destination Chips */}
                      {(alert.webhookUrl || alert.emailRecipients.length > 0 || alert.notificationGroupIds.length > 0) ? (
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-slate-500 mr-1">
                            Dispatches to:
                          </span>
                          {alert.webhookUrl ? (
                            <span className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-neutral-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                              <svg className="h-3 w-3 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                              <span>Webhook</span>
                            </span>
                          ) : null}
                          {alert.emailRecipients.map((email) => (
                            <span key={email} className="inline-flex items-center gap-1 rounded-md border border-blue-200/70 bg-blue-50/70 px-2 py-0.5 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300">
                              <svg className="h-3 w-3 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                              <span>{email}</span>
                            </span>
                          ))}
                          {alert.notificationGroupIds.map((groupId) => {
                            const groupName = notificationGroups.find((g) => g.id === groupId)?.name ?? 'Group';
                            return (
                              <span key={groupId} className="inline-flex items-center gap-1 rounded-md border border-blue-200/70 bg-blue-50/70 px-2 py-0.5 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300">
                                <svg className="h-3 w-3 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
                                <span>Group · {groupName}</span>
                              </span>
                            );
                          })}
                        </div>
                      ) : null}

                      {/* Inline Test Result Banner */}
                      {testResult ? (
                        <div
                          className={`rounded-lg p-3 text-xs font-medium border ${testResult.triggered
                              ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200'
                              : 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200'
                            }`}
                        >
                          <strong className="font-semibold">
                            {testResult.triggered ? '⚠️ Threshold Triggered: ' : '✅ Threshold Passed: '}
                          </strong>
                          {testResult.message}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Notification Groups Management Section */}
          <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950 shadow-xs">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-5 border-b border-neutral-200/80 dark:border-slate-800/80">
              <div>
                <h3 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">
                  Notification Groups
                </h3>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">
                  Reusable team and on-call recipient bundles for one-click alert routing.
                </p>
              </div>

              <button
                type="button"
                onClick={handleOpenCreateGroup}
                disabled={!alertsAvailable}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 self-start sm:self-auto transition"
              >
                <svg className="h-4 w-4 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Create notification group</span>
              </button>
            </div>

            {notificationGroups.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm text-neutral-500 dark:text-slate-400">
                  No notification groups created yet. Group multiple team emails (e.g. SRE, Support, Backend On-Call) to quickly attach them to any alert.
                </p>
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={handleOpenCreateGroup}
                    disabled={!alertsAvailable}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-black transition"
                  >
                    + Add first group
                  </button>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-neutral-200/70 dark:divide-slate-800/70">
                {notificationGroups.map((group) => {
                  const usageCount = alerts.filter((a) => a.notificationGroupIds.includes(group.id)).length;
                  return (
                    <div
                      key={group.id}
                      className="py-4 first:pt-4 last:pb-0 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-neutral-900 dark:text-white">
                            {group.name}
                          </h4>
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                            Used by {usageCount} {usageCount === 1 ? 'alert' : 'alerts'}
                          </span>
                        </div>
                        <p className="truncate text-xs text-neutral-500 dark:text-slate-400">
                          {group.memberEmails.join(', ')}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenEditGroup(group)}
                          disabled={!alertsAvailable}
                          className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setGroupToDelete(group)}
                          disabled={!alertsAvailable}
                          className="rounded-lg p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition"
                          aria-label={`Delete group ${group.name}`}
                          title="Delete group"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Recent Firings Feed */}
        <div>
          <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950 shadow-xs sticky top-24">
            <div className="flex items-center justify-between pb-4 border-b border-neutral-200/80 dark:border-slate-800/80">
              <div>
                <h3 className="text-base font-bold tracking-tight text-neutral-900 dark:text-white">
                  Recent Firings
                </h3>
                <p className="text-xs text-neutral-500 dark:text-slate-400">
                  Incident events detected by active monitors.
                </p>
              </div>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600 dark:bg-slate-900 dark:text-slate-400">
                {recentEvents.length} logged
              </span>
            </div>

            {recentEvents.length === 0 ? (
              <div className="py-10 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 mb-3">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
                <h4 className="text-sm font-semibold text-neutral-900 dark:text-white">
                  No firings recorded
                </h4>
                <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
                  All metrics are operating within specified threshold parameters.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-200/70 dark:divide-slate-800/70 max-h-[650px] overflow-y-auto">
                {recentEvents.map((event) => (
                  <div key={event.id} className="py-3.5 first:pt-3 last:pb-0 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-neutral-900 dark:text-white">
                        {event.alertName}
                      </p>
                      <span className="shrink-0 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-700 dark:bg-red-950/60 dark:text-red-300">
                        Triggered
                      </span>
                    </div>
                    <p className="text-xs text-neutral-600 dark:text-slate-300 leading-relaxed">
                      {event.message}
                    </p>
                    <p className="text-[11px] text-neutral-400 dark:text-slate-500">
                      {formatDate(event.triggeredAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Create / Edit Alert Modal */}
      <CreateAlertModal
        open={isAlertModalOpen}
        onClose={() => {
          setIsAlertModalOpen(false);
          setAlertError(null);
        }}
        onSave={handleSaveAlert}
        eventNames={eventNames}
        notificationGroups={notificationGroups}
        initialData={alertModalData}
        isSubmitting={isAlertSubmitting}
        error={alertError}
      />

      {/* Notification Group Modal */}
      <NotificationGroupModal
        open={isGroupModalOpen}
        onClose={() => {
          setIsGroupModalOpen(false);
          setGroupError(null);
        }}
        onSave={handleSaveGroup}
        groupToEdit={groupToEdit}
        isSubmitting={isGroupSubmitting}
        error={groupError}
      />

      {/* Delete Alert Confirmation Dialog */}
      <DashboardDialog
        open={Boolean(alertToDelete)}
        title="Delete automated alert?"
        description="This will permanently delete the alert rule and stop all future evaluations and notification dispatches."
        onClose={() => {
          if (!busyId) setAlertToDelete(null);
        }}
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <button
              type="button"
              className="h-9 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              disabled={Boolean(busyId)}
              onClick={() => setAlertToDelete(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="h-9 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              disabled={Boolean(busyId)}
              onClick={() => void handleDeleteAlert()}
            >
              {busyId ? 'Deleting…' : 'Delete alert'}
            </button>
          </div>
        }
      >
        <p className="text-sm text-neutral-600 dark:text-slate-400">
          Are you sure you want to delete <strong className="font-semibold text-neutral-900 dark:text-white">{alertToDelete?.name}</strong>? This action cannot be undone.
        </p>
      </DashboardDialog>

      {/* Delete Group Confirmation Dialog */}
      <DashboardDialog
        open={Boolean(groupToDelete)}
        title="Delete notification group?"
        description="Alerts referencing this group will no longer notify its member emails. The alert rules themselves will remain intact."
        onClose={() => {
          if (!busyId) setGroupToDelete(null);
        }}
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <button
              type="button"
              className="h-9 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              disabled={Boolean(busyId)}
              onClick={() => setGroupToDelete(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="h-9 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              disabled={Boolean(busyId)}
              onClick={() => void handleDeleteGroup()}
            >
              {busyId ? 'Deleting…' : 'Delete group'}
            </button>
          </div>
        }
      >
        <p className="text-sm text-neutral-600 dark:text-slate-400">
          Are you sure you want to delete <strong className="font-semibold text-neutral-900 dark:text-white">{groupToDelete?.name}</strong>?
        </p>
      </DashboardDialog>
    </div>
  );
}
