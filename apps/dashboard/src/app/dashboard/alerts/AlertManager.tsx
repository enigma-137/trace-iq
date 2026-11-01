'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { DashboardDialog } from '../DashboardDialog';
import { readApiError } from '@/lib/api-error';
import { toast } from '@/lib/toast';
import { CreateAlertModal, AlertFormData, type ChatChannelOption } from './CreateAlertModal';
import { AlertDetailsModal, DestinationIcon } from './AlertDetailsModal';
import {
  alertDestinations,
  alertStatus,
  destinationKinds,
  formatDate,
  formatNumber,
  formatRelative,
  ruleSummary,
  thresholdLabel,
  type AlertRecord as Alert
} from '@/lib/alert-helpers';
import { NotificationGroupModal } from './NotificationGroupModal';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import Add01Icon from '@hugeicons/core-free-icons/Add01Icon';
import Alert02Icon from '@hugeicons/core-free-icons/Alert02Icon';
import ArrowRight01Icon from '@hugeicons/core-free-icons/ArrowRight01Icon';
import CheckmarkCircle02Icon from '@hugeicons/core-free-icons/CheckmarkCircle02Icon';
import Delete02Icon from '@hugeicons/core-free-icons/Delete02Icon';
import Notification02Icon from '@hugeicons/core-free-icons/Notification02Icon';
import PencilEdit02Icon from '@hugeicons/core-free-icons/PencilEdit02Icon';
import Search01Icon from '@hugeicons/core-free-icons/Search01Icon';
import { retryAfterStepUp } from '@/lib/step-up';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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

type AlertFilter = 'all' | 'firing' | 'active' | 'paused';

const FILTERS: Array<{ value: AlertFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'firing', label: 'Firing' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' }
];

/** Firing first, then active, then paused. */
function statusRank(alert: Alert): number {
  if (alert.enabled && alert.lastStatus === 'triggered') return 0;
  return alert.enabled ? 1 : 2;
}

function StatTile({ label, value, hint, tone }: { label: string; value: number; hint: string; tone?: 'critical' | 'good' }) {
  const valueColor =
    tone === 'critical' ? 'text-red-600 dark:text-red-400' : tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-900 dark:text-white';
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${valueColor}`}>{value}</p>
      <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-slate-400">{hint}</p>
    </div>
  );
}

function IconButton({
  label,
  icon,
  onClick,
  disabled,
  danger,
  showLabel
}: {
  label: string;
  icon: IconSvgElement;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  showLabel?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-50 dark:border-slate-800 ${
        danger
          ? 'text-neutral-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:border-red-500/30 dark:hover:bg-red-500/10 dark:hover:text-red-400'
          : 'text-neutral-700 hover:bg-neutral-50 dark:text-slate-200 dark:hover:bg-slate-900'
      }`}
    >
      <HugeiconsIcon icon={icon} size={14} strokeWidth={1.9} />
      {showLabel ? <span>{label}</span> : null}
    </button>
  );
}

export function AlertManager({
  alerts,
  recentEvents,
  eventNames,
  notificationGroups,
  chatChannels,
  alertsAvailable
}: {
  alerts: Alert[];
  recentEvents: AlertEvent[];
  eventNames: string[];
  notificationGroups: NotificationGroup[];
  chatChannels: ChatChannelOption[];
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
  // The alert whose details are open. Looked up from the live list so it refreshes after an action.
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const detailsAlert = detailsId ? alerts.find((item) => item.id === detailsId) ?? null : null;
  const [groupToDelete, setGroupToDelete] = useState<NotificationGroup | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { message: string; triggered: boolean }>>({});
  const [filter, setFilter] = useState<AlertFilter>('all');
  const [search, setSearch] = useState('');

  async function getToken(): Promise<string | null> {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  // Actions that need a recent 2FA check prompt for a code and retry once.
  async function authFetch(path: string, init: RequestInit): Promise<Response | null> {
    const response = await sendAuthed(path, init);
    return response ? retryAfterStepUp(response, () => sendAuthed(path, init)) : null;
  }

  async function sendAuthed(path: string, init: RequestInit): Promise<Response | null> {
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
      notificationGroupIds: alert.notificationGroupIds,
      chatChannelIds: alert.chatChannelIds
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

  // Summary
  const firingAlerts = alerts.filter((a) => a.enabled && a.lastStatus === 'triggered');
  const activeAlertsCount = alerts.filter((a) => a.enabled).length;
  const pausedCount = alerts.length - activeAlertsCount;
  const counts: Record<AlertFilter, number> = {
    all: alerts.length,
    firing: firingAlerts.length,
    active: activeAlertsCount,
    paused: pausedCount
  };

  const visibleAlerts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return alerts
      .filter((a) => {
        if (filter === 'firing' && !(a.enabled && a.lastStatus === 'triggered')) return false;
        if (filter === 'active' && !a.enabled) return false;
        if (filter === 'paused' && a.enabled) return false;
        if (q && !`${a.name} ${a.eventName}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => statusRank(a) - statusRank(b) || a.name.localeCompare(b.name));
  }, [alerts, filter, search]);

  const createDisabled = !alertsAvailable;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-sm leading-6 text-neutral-500 dark:text-slate-400">
            Watch any event count, unique users or property average over a rolling window, and get an email or webhook the
            moment it crosses a threshold, drops, or spikes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => handleOpenCreateAlert()}
          disabled={createDisabled}
          className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-blue-500 disabled:opacity-50 sm:self-auto"
        >
          <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={2} />
          New alert
        </button>
      </div>

      {/* Plan Entitlement Warning */}
      {!alertsAvailable ? (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
          <p>
            <strong className="font-semibold">Alerts need the Pro plan.</strong> Your rules stay saved, but they are not
            checked and no notifications go out.
          </p>
          <Link
            href="/dashboard/settings/billing"
            className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700"
          >
            Upgrade to Pro
          </Link>
        </div>
      ) : null}

      {/* Summary */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Alert summary">
        <StatTile
          label="Firing now"
          value={firingAlerts.length}
          tone={firingAlerts.length > 0 ? 'critical' : 'good'}
          hint={firingAlerts.length > 0 ? 'Needs attention' : 'Everything within limits'}
        />
        <StatTile label="Active" value={activeAlertsCount} hint={`${alerts.length} alert${alerts.length === 1 ? '' : 's'} in total`} />
        <StatTile label="Paused" value={pausedCount} hint={pausedCount > 0 ? 'Not being checked' : 'None paused'} />
        <StatTile
          label="Recent firings"
          value={recentEvents.length}
          hint={recentEvents[0] ? `Last ${formatRelative(recentEvents[0].triggeredAt)}` : 'No firings yet'}
        />
      </section>

      {/* Firing banner */}
      {firingAlerts.length > 0 ? (
        <div className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          <HugeiconsIcon icon={Alert02Icon} size={18} strokeWidth={2} className="mt-0.5 shrink-0" />
          <p>
            <strong className="font-semibold">
              {firingAlerts.length === 1 ? `"${firingAlerts[0].name}" is firing.` : `${firingAlerts.length} alerts are firing.`}
            </strong>{' '}
            {firingAlerts.length === 1 && firingAlerts[0].lastValue !== null
              ? `Last value ${formatNumber(firingAlerts[0].lastValue)}, threshold ${thresholdLabel(firingAlerts[0])}.`
              : 'They are listed first below.'}
          </p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        {/* Alerts list */}
        <section className="min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div role="tablist" aria-label="Filter alerts" className="flex flex-wrap gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-slate-900">
              {FILTERS.map((f) => {
                const selected = filter === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setFilter(f.value)}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                      selected
                        ? 'bg-white text-neutral-900 shadow-xs dark:bg-slate-800 dark:text-white'
                        : 'text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
                    }`}
                  >
                    {f.label}
                    <span
                      className={`tabular-nums ${
                        f.value === 'firing' && counts.firing > 0 ? 'text-red-600 dark:text-red-400' : 'text-neutral-400 dark:text-slate-500'
                      }`}
                    >
                      {counts[f.value]}
                    </span>
                  </button>
                );
              })}
            </div>
            <label className="relative block sm:w-60">
              <span className="sr-only">Search alerts</span>
              <HugeiconsIcon
                icon={Search01Icon}
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-slate-500"
              />
              <input
                id="alert-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or event"
                className="w-full rounded-lg border border-neutral-200 bg-white py-1.5 pl-8 pr-2.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
              />
            </label>
          </div>

          {alerts.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                <HugeiconsIcon icon={Notification02Icon} size={22} strokeWidth={1.8} />
              </div>
              <h3 className="text-base font-semibold text-neutral-900 dark:text-white">No alerts yet</h3>
              <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-neutral-500 dark:text-slate-400">
                Pick a starting point below or build your own. You can test any alert against live data before it goes out.
              </p>
              <div className="mx-auto mt-6 grid max-w-2xl gap-3 text-left sm:grid-cols-3">
                {TEMPLATE_ALERTS.map((tmpl) => (
                  <button
                    key={tmpl.name}
                    type="button"
                    onClick={() => handleOpenCreateAlert(tmpl.data)}
                    disabled={createDisabled}
                    className="group rounded-xl border border-neutral-200 p-4 transition hover:border-blue-500 hover:bg-blue-50/40 disabled:opacity-50 dark:border-slate-800 dark:hover:border-blue-500/60 dark:hover:bg-blue-500/5"
                  >
                    <span className="flex items-center justify-between gap-2 text-sm font-semibold text-neutral-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
                      {tmpl.name}
                      <HugeiconsIcon icon={ArrowRight01Icon} size={14} className="shrink-0 text-neutral-400 group-hover:text-blue-500" />
                    </span>
                    <span className="mt-1.5 block text-xs leading-5 text-neutral-500 dark:text-slate-400">{tmpl.description}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : visibleAlerts.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-neutral-500 dark:text-slate-400">
              {search.trim() ? 'No alerts match your search.' : `No ${filter} alerts.`}
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-slate-800">
              {visibleAlerts.map((alert) => {
                const status = alertStatus(alert, alertsAvailable);
                const destinations = alertDestinations(alert, notificationGroups, chatChannels);
                const kinds = destinationKinds(destinations);
                return (
                  <li key={alert.id} className={status.key === 'firing' ? 'bg-red-50/50 dark:bg-red-500/5' : ''}>
                    <button
                      type="button"
                      onClick={() => setDetailsId(alert.id)}
                      aria-label={`Open ${alert.name}`}
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-neutral-50 focus-visible:bg-neutral-50 focus-visible:outline-none dark:hover:bg-slate-900/60 dark:focus-visible:bg-slate-900/60 sm:gap-4 sm:px-5"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-neutral-900 dark:text-white">{alert.name}</span>
                        <span className="mt-0.5 block truncate font-mono text-xs text-neutral-500 dark:text-slate-400">{ruleSummary(alert)}</span>
                      </span>
                      {kinds.length > 0 ? (
                        <span
                          className="hidden shrink-0 items-center -space-x-1.5 sm:flex"
                          role="img"
                          aria-label={`Sends to ${destinations.map((destination) => destination.label).join(', ')}`}
                          title={destinations.map((destination) => destination.label).join('\n')}
                        >
                          {kinds.slice(0, 4).map((kind) => (
                            <span
                              key={kind}
                              className="grid h-6 w-6 place-items-center rounded-full border border-white bg-neutral-100 dark:border-slate-950 dark:bg-slate-800"
                            >
                              <DestinationIcon kind={kind} size={13} />
                            </span>
                          ))}
                        </span>
                      ) : null}
                      <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.badge}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                        {status.label}
                      </span>
                      <HugeiconsIcon icon={ArrowRight01Icon} size={14} className="shrink-0 text-neutral-300 dark:text-slate-600" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Side column */}
        <div className="min-w-0 space-y-6">
          <section className="rounded-xl border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Recent firings</h3>
              <span className="text-xs text-neutral-400 tabular-nums dark:text-slate-500">{recentEvents.length}</span>
            </div>
            {recentEvents.length === 0 ? (
              <div className="flex items-center gap-3 px-4 py-6 text-sm text-neutral-500 dark:text-slate-400">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                No alert has fired yet.
              </div>
            ) : (
              <ol className="max-h-[420px] overflow-y-auto px-4 py-2">
                {recentEvents.map((event) => (
                  <li key={event.id} className="relative border-l border-neutral-200 py-2.5 pl-4 dark:border-slate-800">
                    <span className="absolute -left-[4.5px] top-4 h-2 w-2 rounded-full bg-red-500" />
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">{event.alertName}</p>
                      <time className="shrink-0 text-[11px] text-neutral-400 dark:text-slate-500" dateTime={event.triggeredAt} title={formatDate(event.triggeredAt)}>
                        {formatRelative(event.triggeredAt)}
                      </time>
                    </div>
                    <p className="mt-0.5 text-xs leading-5 text-neutral-500 dark:text-slate-400">{event.message}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Notification groups</h3>
                <p className="text-xs text-neutral-500 dark:text-slate-400">Reusable lists of people to email.</p>
              </div>
              <button
                type="button"
                onClick={handleOpenCreateGroup}
                disabled={createDisabled}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                <HugeiconsIcon icon={Add01Icon} size={13} strokeWidth={2} />
                New group
              </button>
            </div>
            {notificationGroups.length === 0 ? (
              <p className="px-4 py-5 text-xs leading-5 text-neutral-500 dark:text-slate-400">
                Group emails like "Backend on-call" or "Support" once, then attach the group to any alert. Changes to a group apply to
                every alert that uses it.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-200 dark:divide-slate-800">
                {notificationGroups.map((group) => {
                  const usageCount = alerts.filter((a) => a.notificationGroupIds.includes(group.id)).length;
                  return (
                    <li key={group.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">{group.name}</p>
                        <p className="truncate text-xs text-neutral-500 dark:text-slate-400" title={group.memberEmails.join(', ')}>
                          {group.memberEmails.length} {group.memberEmails.length === 1 ? 'person' : 'people'} · used by {usageCount}{' '}
                          {usageCount === 1 ? 'alert' : 'alerts'}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <IconButton label={`Edit ${group.name}`} icon={PencilEdit02Icon} onClick={() => handleOpenEditGroup(group)} disabled={createDisabled} />
                        <IconButton label={`Delete ${group.name}`} icon={Delete02Icon} onClick={() => setGroupToDelete(group)} disabled={createDisabled} danger />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      <AlertDetailsModal
        alert={detailsAlert}
        alertsAvailable={alertsAvailable}
        groups={notificationGroups}
        channels={chatChannels}
        testResult={detailsAlert ? testResults[detailsAlert.id] : null}
        busy={detailsAlert ? busyId === detailsAlert.id : false}
        createDisabled={createDisabled}
        onClose={() => setDetailsId(null)}
        onTest={(target) => void handleTest(target)}
        onToggle={(target) => void handleToggle(target)}
        onDuplicate={(target) => {
          setDetailsId(null);
          handleOpenDuplicateAlert(target);
        }}
        onDelete={(target) => {
          setDetailsId(null);
          setAlertToDelete(target);
        }}
      />

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
        chatChannels={chatChannels}
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
