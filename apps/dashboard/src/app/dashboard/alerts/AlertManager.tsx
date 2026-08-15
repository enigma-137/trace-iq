'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { Select, Combobox, Checkbox } from '@traceiq/ui';
import { SegmentFilters, FilterCondition, cleanFilters } from '@/components/SegmentFilters';

const apiBaseUrl = process.env.NEXT_NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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

interface AlertDelivery {
  channel: string;
  recipient: string | null;
  status: string;
  error: string | null;
  sentAt: string;
}

interface NotificationGroup {
  id: string;
  name: string;
  memberEmails: string[];
}

const MEASURES = [
  { value: 'count', label: 'Event count' },
  { value: 'unique', label: 'Unique users' },
  { value: 'sum', label: 'Sum of property' },
  { value: 'avg', label: 'Average of property' }
];

const WINDOWS = [
  { value: 1, label: '1 hour' },
  { value: 6, label: '6 hours' },
  { value: 24, label: '24 hours' },
  { value: 168, label: '7 days' }
];

const CONDITIONS = [
  { value: 'above', label: 'is above', percent: false },
  { value: 'below', label: 'is below', percent: false },
  { value: 'drops_by', label: 'drops by', percent: true },
  { value: 'spikes_by', label: 'spikes by', percent: true }
];

function windowLabel(hours: number): string {
  return WINDOWS.find((w) => w.value === hours)?.label ?? `${hours}h`;
}

function summarize(alert: Alert): string {
  const metric =
    alert.measure === 'count'
      ? `count of ${alert.eventName}`
      : alert.measure === 'unique'
        ? `unique users of ${alert.eventName}`
        : `${alert.measure} of ${alert.property} for ${alert.eventName}`;
  const cond = CONDITIONS.find((c) => c.value === alert.condition);
  const target = cond?.percent ? `${alert.threshold}%` : `${alert.threshold}`;
  return `${metric} ${cond?.label ?? alert.condition} ${target} · rolling ${windowLabel(alert.windowHours)}`;
}

export function AlertManager({
  alerts,
  recentEvents,
  eventNames,
  notificationGroups
}: {
  alerts: Alert[];
  recentEvents: AlertEvent[];
  eventNames: string[];
  notificationGroups: NotificationGroup[];
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();

  const [name, setName] = useState('');
  const [eventName, setEventName] = useState(eventNames[0] ?? '');
  const [measure, setMeasure] = useState('count');
  const [property, setProperty] = useState('');
  const [windowHours, setWindowHours] = useState(24);
  const [condition, setCondition] = useState('drops_by');
  const [threshold, setThreshold] = useState('30');
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [recipientsInput, setRecipientsInput] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, string>>({});

  const needsProperty = measure === 'sum' || measure === 'avg';
  const isPercent = CONDITIONS.find((c) => c.value === condition)?.percent ?? false;

  async function getToken(): Promise<string | null> {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function authFetch(path: string, init: RequestInit): Promise<Response | null> {
    const token = await getToken();
    if (!token) {
      setError('Your dashboard session expired. Sign in again.');
      return null;
    }
    return fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Give the alert a name.');
    if (!eventName.trim()) return setError('Pick an event to watch.');
    if (needsProperty && !property.trim()) return setError('Enter a numeric property to sum/average.');
    if (!Number.isFinite(Number(threshold))) return setError('Threshold must be a number.');

    const emailRecipients = recipientsInput
      .split(/[,\s]+/u)
      .map((email) => email.trim())
      .filter(Boolean);
    const webhook = webhookUrl.trim();
    if (!webhook && emailRecipients.length === 0 && selectedGroupIds.length === 0) {
      return setError('Add a notification channel — a webhook URL and/or email recipients.');
    }

    setIsSubmitting(true);
    const response = await authFetch('/v1/dashboard/alerts', {
      method: 'POST',
      body: JSON.stringify({
        name: name.trim(),
        eventName: eventName.trim(),
        measure,
        property: needsProperty ? property.trim() : undefined,
        filters: cleanFilters(filters),
        windowHours,
        condition,
        threshold: Number(threshold),
        webhookUrl: webhook || undefined,
        emailRecipients,
        notificationGroupIds: selectedGroupIds
      })
    });
    if (!response) return setIsSubmitting(false);
    if (!response.ok) {
      setError(await readError(response));
      setIsSubmitting(false);
      return;
    }
    setName('');
    setThreshold('30');
    setFilters([]);
    setWebhookUrl('');
    setRecipientsInput('');
    setSelectedGroupIds([]);
    setIsSubmitting(false);
    router.refresh();
  }

  async function toggle(alert: Alert) {
    setBusyId(alert.id);
    const response = await authFetch(`/v1/dashboard/alerts/${alert.id}`, {
      method: 'PUT',
      body: JSON.stringify({ enabled: !alert.enabled })
    });
    setBusyId(null);
    if (response?.ok) router.refresh();
  }

  async function test(alert: Alert) {
    setBusyId(alert.id);
    const response = await authFetch(`/v1/dashboard/alerts/${alert.id}/test`, { method: 'POST' });
    setBusyId(null);
    if (response?.ok) {
      const result = (await response.json()) as { message: string; triggered: boolean };
      setTestResults((current) => ({ ...current, [alert.id]: `${result.triggered ? '🔴 Would fire — ' : '🟢 OK — '}${result.message}` }));
    }
  }

  async function remove(alert: Alert) {
    setBusyId(alert.id);
    const response = await authFetch(`/v1/dashboard/alerts/${alert.id}`, { method: 'DELETE' });
    setBusyId(null);
    if (response?.ok) router.refresh();
  }

  function toggleGroup(id: string) {
    setSelectedGroupIds((current) => (current.includes(id) ? current.filter((g) => g !== id) : [...current, id]));
  }

  return (
    <div className="grid gap-6">
      <form
        className="grid gap-4 rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950"
        onSubmit={handleSubmit}
      >
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">New alert</h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-slate-400">
            Watch a metric on a rolling window. We check it in the background and record a firing (then POST your webhook
            and/or email the recipients) when it crosses the line.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Alert name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Signups dropping" />
          </Field>
          <Field label="Event">
            <Combobox
              items={eventNames.map((name) => ({ value: name, label: name }))}
              value={eventName}
              onChange={setEventName}
              placeholder="signup_completed"
              aria-label="Event"
            />
          </Field>
          <Field label="Measure">
            <Select
              value={measure}
              onValueChange={setMeasure}
              items={MEASURES.map((m) => ({ value: m.value, label: m.label }))}
            />
          </Field>
          {needsProperty ? (
            <Field label="Property">
              <input className={inputClass} value={property} onChange={(e) => setProperty(e.target.value)} placeholder="amount" />
            </Field>
          ) : null}
          <Field label="Window">
            <Select
              value={String(windowHours)}
              onValueChange={(value) => setWindowHours(Number(value))}
              items={WINDOWS.map((w) => ({ value: String(w.value), label: w.label }))}
            />
          </Field>
          <Field label="Condition">
            <Select
              value={condition}
              onValueChange={setCondition}
              items={CONDITIONS.map((c) => ({ value: c.value, label: c.label }))}
            />
          </Field>
          <Field label={isPercent ? 'Change (%)' : 'Threshold (value)'}>
            <input
              className={inputClass}
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              placeholder={isPercent ? '30' : '100'}
            />
          </Field>
        </div>

        <div className="grid gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
            Segment (optional)
          </span>
          <SegmentFilters value={filters} onChange={setFilters} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Webhook URL (optional)">
            <input
              className={inputClass}
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://hooks.slack.com/…"
            />
          </Field>
          <Field label="Email recipients (comma-separated)">
            <input
              className={inputClass}
              value={recipientsInput}
              onChange={(e) => setRecipientsInput(e.target.value)}
              placeholder="dev@acme.com, oncall@acme.com"
              type="email"
              multiple
            />
          </Field>
        </div>

        {notificationGroups.length > 0 ? (
          <div className="grid gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
              Also notify groups (optional)
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {notificationGroups.map((group) => (
                <label
                  key={group.id}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 select-none hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
                >
                  <Checkbox
                    checked={selectedGroupIds.includes(group.id)}
                    onCheckedChange={() => toggleGroup(group.id)}
                    aria-label={group.name}
                  />
                  {group.name}
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-md border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            {error}
          </p>
        ) : null}

        <div>
          <button
            type="submit"
            className="h-10 rounded-md bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-700 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-slate-200"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving…' : 'Create alert'}
          </button>
        </div>
      </form>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="grid gap-6">
          <section className="rounded-md border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950">
            <p className="border-b border-neutral-200 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:border-slate-800 dark:text-slate-500">
              Alerts
            </p>
            {alerts.length === 0 ? (
              <p className="p-5 text-sm text-neutral-500 dark:text-slate-500">No alerts yet. Create one above.</p>
            ) : (
              <ul className="divide-y divide-neutral-200 dark:divide-slate-800">
                {alerts.map((alert) => (
                  <li key={alert.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={alert.enabled ? alert.lastStatus : 'disabled'} />
                        <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{alert.name}</p>
                      </div>
                      <p className="mt-1 truncate font-mono text-xs text-neutral-500 dark:text-slate-400">{summarize(alert)}</p>
                      {alert.webhookUrl || alert.emailRecipients.length > 0 || alert.notificationGroupIds.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {alert.webhookUrl ? <ChannelChip tone="webhook">Webhook</ChannelChip> : null}
                          {alert.emailRecipients.length > 0 ? <ChannelChip tone="email">Email × {alert.emailRecipients.length}</ChannelChip> : null}
                          {alert.notificationGroupIds.map((id) => (
                            <ChannelChip key={id} tone="group">
                              Group · {notificationGroups.find((g) => g.id === id)?.name ?? id}
                            </ChannelChip>
                          ))}
                        </div>
                      ) : null}
                      {alert.deliveries.length > 0 ? (
                        <ul className="mt-2 grid gap-1">
                          {alert.deliveries.slice(0, 4).map((delivery, index) => (
                            <li key={`${delivery.channel}-${delivery.sentAt}-${index}`} className="flex items-center gap-2 text-xs">
                              <DeliveryDot status={delivery.status} />
                              <span className="text-neutral-500 dark:text-slate-400">
                                {delivery.channel === 'email' ? 'Email to ' : 'Webhook '}
                                <span className="font-mono text-neutral-600 dark:text-slate-300">
                                  {delivery.recipient ?? (delivery.channel === 'webhook' ? 'endpoint' : '—')}
                                </span>{' '}
                                — {delivery.status === 'sent' ? 'delivered' : 'failed'}
                                {delivery.error ? ` (${delivery.error})` : ''}
                              </span>
                              <span className="ml-auto text-neutral-400 dark:text-slate-500">{formatDate(delivery.sentAt)}</span>
                            </li>
                          ))}
                          {alert.deliveries.length > 4 ? (
                            <li className="text-xs text-neutral-400 dark:text-slate-500">+{alert.deliveries.length - 4} more</li>
                          ) : null}
                        </ul>
                      ) : null}
                      <p className="mt-1 text-xs text-neutral-400 dark:text-slate-500">
                        {alert.lastValue !== null
                           ? `Last value ${Math.round(alert.lastValue).toLocaleString()} · checked ${formatDate(alert.lastEvaluatedAt)}`
                           : 'Not evaluated yet · runs automatically within a few minutes'}
                      </p>
                      {testResults[alert.id] ? (
                        <p className="mt-2 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                          {testResults[alert.id]}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button className={toolbarBtn} onClick={() => test(alert)} disabled={busyId === alert.id}>
                        {busyId === alert.id ? '…' : 'Test'}
                      </button>
                      <button className={toolbarBtn} onClick={() => toggle(alert)} disabled={busyId === alert.id}>
                        {alert.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button className={deleteBtn} onClick={() => remove(alert)} disabled={busyId === alert.id} aria-label="Delete alert">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
                        </svg>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <NotificationGroupsPanel groups={notificationGroups} authFetch={authFetch} refresh={() => router.refresh()} />
        </div>

        <section className="h-fit rounded-md border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          <p className="border-b border-neutral-200 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:border-slate-800 dark:text-slate-500">
            Recent firings
          </p>
          {recentEvents.length === 0 ? (
            <p className="p-5 text-sm text-neutral-500 dark:text-slate-500">Nothing has fired yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-slate-800">
              {recentEvents.map((event) => (
                <li key={event.id} className="px-5 py-3">
                  <p className="text-sm font-medium text-neutral-900 dark:text-white">{event.alertName}</p>
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">{event.message}</p>
                  <p className="mt-0.5 text-xs text-neutral-400 dark:text-slate-500">{formatDate(event.triggeredAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function ChannelChip({ tone, children }: { tone: 'webhook' | 'email' | 'group'; children: React.ReactNode }) {
  const styles: Record<string, string> = {
    webhook: 'border-neutral-300 text-neutral-500 dark:border-slate-700 dark:text-slate-400',
    email: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
    group: 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300'
  };
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[tone]}`}>
      {children}
    </span>
  );
}

function DeliveryDot({ status }: { status: string }) {
  const ok = status === 'sent';
  return (
    <span
      aria-hidden
      className={`size-1.5 shrink-0 rounded-full ${ok ? 'bg-emerald-500' : 'bg-red-500'}`}
    />
  );
}

function NotificationGroupsPanel({
  groups,
  authFetch,
  refresh
}: {
  groups: NotificationGroup[];
  authFetch: (path: string, init: RequestInit) => Promise<Response | null>;
  refresh: () => void;
}) {
  const [name, setName] = useState('');
  const [emails, setEmails] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmails, setEditEmails] = useState('');

  function startEdit(group: NotificationGroup) {
    setEditingId(group.id);
    setEditName(group.name);
    setEditEmails(group.memberEmails.join(', '));
    setError(null);
  }

  async function saveEdit(group: NotificationGroup) {
    setError(null);
    const memberEmails = editEmails.split(/[,\s]+/u).map((e) => e.trim()).filter(Boolean);
    if (!editName.trim()) return setError('Name the group.');
    if (memberEmails.length === 0) return setError('Add at least one email address.');

    setBusy(group.id);
    const response = await authFetch(`/v1/dashboard/notification-groups/${group.id}`, {
      method: 'PUT',
      body: JSON.stringify({ name: editName.trim(), memberEmails })
    });
    setBusy(null);
    if (!response?.ok) {
      setError((await readError(response as Response)) || 'Could not save group.');
      return;
    }
    setEditingId(null);
    refresh();
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const memberEmails = emails.split(/[,\s]+/u).map((e) => e.trim()).filter(Boolean);
    if (!name.trim()) return setError('Name the group.');
    if (memberEmails.length === 0) return setError('Add at least one email address.');

    setIsSaving(true);
    const response = await authFetch('/v1/dashboard/notification-groups', {
      method: 'POST',
      body: JSON.stringify({ name: name.trim(), memberEmails })
    });
    setIsSaving(false);
    if (!response?.ok) {
      setError((await readError(response as Response)) || 'Could not create group.');
      return;
    }
    setName('');
    setEmails('');
    refresh();
  }

  async function removeGroup(group: NotificationGroup) {
    setBusy(group.id);
    const response = await authFetch(`/v1/dashboard/notification-groups/${group.id}`, { method: 'DELETE' });
    setBusy(null);
    if (response?.ok) refresh();
  }

  return (
    <section className="rounded-md border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <p className="border-b border-neutral-200 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:border-slate-800 dark:text-slate-500">
        Notification groups
      </p>
      <div className="grid gap-4 p-5">
        <p className="text-sm text-neutral-500 dark:text-slate-400">
          A saved list of emails you can attach to any alert (creating one here makes it appear in the New alert form).
        </p>

        <form className="grid gap-2" onSubmit={handleCreate}>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Group name, e.g. On-call"
            aria-label="Group name"
          />
          <input
            className={inputClass}
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="oncall@acme.com, sre@acme.com"
            type="email"
            aria-label="Group emails"
          />
          {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={isSaving}
            className="h-9 rounded-md border border-neutral-300 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {isSaving ? 'Saving…' : 'Create group'}
          </button>
        </form>

        {groups.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-slate-500">No groups yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-slate-800">
            {groups.map((group) =>
              editingId === group.id ? (
                <li key={group.id} className="grid gap-2 py-2">
                  <input
                    className={inputClass}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Group name"
                    aria-label="Edit group name"
                  />
                  <input
                    className={inputClass}
                    value={editEmails}
                    onChange={(e) => setEditEmails(e.target.value)}
                    placeholder="oncall@acme.com, sre@acme.com"
                    type="email"
                    aria-label="Edit group emails"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      className="h-8 rounded-md bg-neutral-900 px-3 text-xs font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-black"
                      onClick={() => void saveEdit(group)}
                      disabled={busy === group.id}
                    >
                      {busy === group.id ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      className={toolbarBtn}
                      onClick={() => setEditingId(null)}
                      disabled={busy === group.id}
                    >
                      Cancel
                    </button>
                  </div>
                </li>
              ) : (
                <li key={group.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">{group.name}</p>
                    <p className="truncate text-xs text-neutral-400 dark:text-slate-500">
                      {group.memberEmails.length} {group.memberEmails.length === 1 ? 'member' : 'members'} · {group.memberEmails.join(', ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button className={toolbarBtn} onClick={() => startEdit(group)} disabled={busy === group.id}>
                      Edit
                    </button>
                    <button className={deleteBtn} onClick={() => removeGroup(group)} disabled={busy === group.id} aria-label={`Delete group ${group.name}`}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </div>
                </li>
              )
            )}
          </ul>
        )}
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    triggered: 'bg-neutral-900 text-white dark:bg-white dark:text-slate-950',
    ok: 'border border-neutral-300 text-neutral-500 dark:border-slate-700 dark:text-slate-400',
    pending: 'border border-neutral-200 text-neutral-400 dark:border-slate-800 dark:text-slate-500',
    disabled: 'border border-neutral-200 text-neutral-300 dark:border-slate-800 dark:text-slate-600'
  };
  const label = status === 'triggered' ? 'Firing' : status === 'ok' ? 'OK' : status === 'disabled' ? 'Off' : 'Pending';
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${map[status] ?? map.pending}`}>
      {label}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
      {label}
      {children}
    </label>
  );
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
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
  'min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm font-normal normal-case text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-white dark:focus:ring-white/10';

const toolbarBtn =
  'inline-flex h-8 items-center justify-center rounded-md border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';

const deleteBtn =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-300 text-neutral-400 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-500 dark:hover:border-red-900 dark:hover:bg-red-950/30 dark:hover:text-red-400';