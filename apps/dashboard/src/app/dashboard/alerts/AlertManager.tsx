'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { DashboardDialog } from '../DashboardDialog';
import { readApiError } from '@/lib/api-error';
import { toast } from '@/lib/toast';
import type { FilterCondition } from '@/components/SegmentFilters';
import { CreateAlertModal, AlertFormData } from './CreateAlertModal';
import { NotificationGroupModal } from './NotificationGroupModal';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import Add01Icon from '@hugeicons/core-free-icons/Add01Icon';
import Alert02Icon from '@hugeicons/core-free-icons/Alert02Icon';
import ArrowRight01Icon from '@hugeicons/core-free-icons/ArrowRight01Icon';
import CheckmarkCircle02Icon from '@hugeicons/core-free-icons/CheckmarkCircle02Icon';
import Clock01Icon from '@hugeicons/core-free-icons/Clock01Icon';
import Copy01Icon from '@hugeicons/core-free-icons/Copy01Icon';
import Delete02Icon from '@hugeicons/core-free-icons/Delete02Icon';
import Mail01Icon from '@hugeicons/core-free-icons/Mail01Icon';
import Notification02Icon from '@hugeicons/core-free-icons/Notification02Icon';
import PauseIcon from '@hugeicons/core-free-icons/PauseIcon';
import PencilEdit02Icon from '@hugeicons/core-free-icons/PencilEdit02Icon';
import PlayIcon from '@hugeicons/core-free-icons/PlayIcon';
import Search01Icon from '@hugeicons/core-free-icons/Search01Icon';
import UserGroupIcon from '@hugeicons/core-free-icons/UserGroupIcon';
import WebhookIcon from '@hugeicons/core-free-icons/WebhookIcon';

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

  const windowStr = alert.windowHours === 168 ? '7 days' : alert.windowHours === 1 ? '1 hour' : `${alert.windowHours} hours`;

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

function alertStatus(alert: Alert, alertsAvailable: boolean) {
  if (!alertsAvailable) {
    return { key: 'locked', label: 'Pro required', badge: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300', dot: 'bg-amber-500' };
  }
  if (!alert.enabled) {
    return { key: 'paused', label: 'Paused', badge: 'bg-neutral-100 text-neutral-600 dark:bg-slate-800 dark:text-slate-300', dot: 'bg-neutral-400' };
  }
  if (alert.lastStatus === 'triggered') {
    return { key: 'firing', label: 'Firing', badge: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300', dot: 'bg-red-500 animate-pulse' };
  }
  return { key: 'active', label: 'Active', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300', dot: 'bg-emerald-500' };
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function thresholdLabel(alert: Alert): string {
  switch (alert.condition) {
    case 'above':
      return `above ${formatNumber(alert.threshold)}`;
    case 'below':
      return `below ${formatNumber(alert.threshold)}`;
    case 'drops_by':
      return `drop of ${alert.threshold}%`;
    case 'spikes_by':
      return `spike of ${alert.threshold}%`;
    default:
      return `${alert.condition} ${formatNumber(alert.threshold)}`;
  }
}

function formatRelative(value: string | null): string {
  if (!value) return 'never';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return value;
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} d ago` : formatDate(value);
}

/** The deliveries from the most recent firing (they share a send time within a minute). */
function latestDeliveries(deliveries: AlertDelivery[]): AlertDelivery[] {
  if (deliveries.length === 0) return [];
  const sorted = [...deliveries].sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
  const newest = new Date(sorted[0].sentAt).getTime();
  return sorted.filter((d) => newest - new Date(d.sentAt).getTime() < 60_000).slice(0, 5);
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
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

function Chip({ icon, title, children }: { icon: IconSvgElement; title?: string; children: ReactNode }) {
  return (
    <span
      title={title}
      className="inline-flex max-w-full items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-neutral-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
    >
      <HugeiconsIcon icon={icon} size={12} className="shrink-0 text-neutral-400 dark:text-slate-500" />
      <span className="truncate">{children}</span>
    </span>
  );
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
  const [filter, setFilter] = useState<AlertFilter>('all');
  const [search, setSearch] = useState('');

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
                const testResult = testResults[alert.id];
                const deliveries = latestDeliveries(alert.deliveries);
                const busy = busyId === alert.id;
                return (
                  <li key={alert.id} className={`p-4 sm:p-5 ${status.key === 'firing' ? 'bg-red-50/50 dark:bg-red-500/5' : ''}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.badge}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                            {status.label}
                          </span>
                          <h3 className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{alert.name}</h3>
                        </div>
                        <p className="text-sm text-neutral-600 dark:text-slate-300">{humanReadableCondition(alert)}</p>
                        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500 dark:text-slate-400">
                          <span className="font-mono text-neutral-600 dark:text-slate-300">{alert.eventName}</span>
                          {!alertsAvailable ? (
                            <span>Not checked on the Free plan</span>
                          ) : alert.lastValue !== null ? (
                            <>
                              <span>
                                Last value <strong className="font-semibold text-neutral-800 tabular-nums dark:text-slate-100">{formatNumber(alert.lastValue)}</strong>{' '}
                                · threshold {thresholdLabel(alert)}
                              </span>
                              <span className="inline-flex items-center gap-1" title={formatDate(alert.lastEvaluatedAt)}>
                                <HugeiconsIcon icon={Clock01Icon} size={12} />
                                Checked {formatRelative(alert.lastEvaluatedAt)}
                              </span>
                            </>
                          ) : (
                            <span>Waiting for the first check (runs every few minutes)</span>
                          )}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        <IconButton
                          label={busy ? 'Testing…' : 'Test now'}
                          icon={PlayIcon}
                          onClick={() => handleTest(alert)}
                          disabled={!alertsAvailable || busy}
                          showLabel
                        />
                        <IconButton
                          label={alert.enabled ? 'Pause' : 'Resume'}
                          icon={alert.enabled ? PauseIcon : PlayIcon}
                          onClick={() => handleToggle(alert)}
                          disabled={!alertsAvailable || busy}
                          showLabel
                        />
                        <IconButton label="Duplicate" icon={Copy01Icon} onClick={() => handleOpenDuplicateAlert(alert)} disabled={createDisabled} />
                        <IconButton label={`Delete ${alert.name}`} icon={Delete02Icon} onClick={() => setAlertToDelete(alert)} danger />
                      </div>
                    </div>

                    {/* Destinations and delivery results */}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                      {alert.webhookUrl ? (
                        <Chip icon={WebhookIcon} title={alert.webhookUrl}>
                          Webhook · {hostOf(alert.webhookUrl)}
                        </Chip>
                      ) : null}
                      {alert.emailRecipients.map((email) => (
                        <Chip key={email} icon={Mail01Icon}>
                          {email}
                        </Chip>
                      ))}
                      {alert.notificationGroupIds.map((groupId) => (
                        <Chip key={groupId} icon={UserGroupIcon}>
                          {notificationGroups.find((g) => g.id === groupId)?.name ?? 'Deleted group'}
                        </Chip>
                      ))}
                    </div>

                    {deliveries.length > 0 ? (
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500 dark:text-slate-400">
                        <span>Last notified {formatRelative(deliveries[0].sentAt)}:</span>
                        {deliveries.map((d, i) => (
                          <span
                            key={`${d.channel}-${d.recipient ?? i}`}
                            className={d.status === 'sent' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}
                            title={d.error ?? undefined}
                          >
                            {d.channel === 'webhook' ? 'Webhook' : d.recipient ?? 'Email'} {d.status === 'sent' ? 'sent' : `failed${d.error ? ` (${truncate(d.error, 60)})` : ''}`}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {testResult ? (
                      <div
                        className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                          testResult.triggered
                            ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
                            : 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
                        }`}
                      >
                        <HugeiconsIcon icon={testResult.triggered ? Alert02Icon : CheckmarkCircle02Icon} size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
                        <span>
                          <strong className="font-semibold">{testResult.triggered ? 'Would fire now. ' : 'Within limits. '}</strong>
                          {testResult.message} No notification was sent.
                        </span>
                      </div>
                    ) : null}
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
