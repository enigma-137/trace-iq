'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { SegmentFilters, FilterCondition, cleanFilters } from '@/components/SegmentFilters';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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
  enabled: boolean;
  lastStatus: string;
  lastValue: number | null;
  lastEvaluatedAt: string | null;
}

interface AlertEvent {
  id: string;
  alertName: string;
  value: number | null;
  message: string;
  triggeredAt: string;
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
  eventNames
}: {
  alerts: Alert[];
  recentEvents: AlertEvent[];
  eventNames: string[];
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
        webhookUrl: webhookUrl.trim() || undefined
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

  return (
    <div className="grid gap-6">
      <form
        className="grid gap-4 rounded-md border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950"
        onSubmit={handleSubmit}
      >
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">New alert</h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Watch a metric on a rolling window. We check it in the background and record a firing (and POST your webhook)
            when it crosses the line.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Alert name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Signups dropping" />
          </Field>
          <Field label="Event">
            <input
              className={inputClass}
              list="alert-event-names"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="signup_completed"
            />
            <datalist id="alert-event-names">
              {eventNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </Field>
          <Field label="Measure">
            <select className={inputClass} value={measure} onChange={(e) => setMeasure(e.target.value)}>
              {MEASURES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          {needsProperty ? (
            <Field label="Property">
              <input className={inputClass} value={property} onChange={(e) => setProperty(e.target.value)} placeholder="amount" />
            </Field>
          ) : null}
          <Field label="Window">
            <select className={inputClass} value={windowHours} onChange={(e) => setWindowHours(Number(e.target.value))}>
              {WINDOWS.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Condition">
            <select className={inputClass} value={condition} onChange={(e) => setCondition(e.target.value)}>
              {CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
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
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
            Segment (optional)
          </span>
          <SegmentFilters value={filters} onChange={setFilters} />
        </div>

        <Field label="Webhook URL (optional)">
          <input
            className={inputClass}
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://hooks.slack.com/…"
          />
        </Field>

        {error ? (
          <p className="rounded-md border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100">
            {error}
          </p>
        ) : null}

        <div>
          <button
            type="submit"
            className="h-10 rounded-md bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-700 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving…' : 'Create alert'}
          </button>
        </div>
      </form>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section className="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <p className="border-b border-neutral-200 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:border-neutral-800 dark:text-neutral-500">
            Alerts
          </p>
          {alerts.length === 0 ? (
            <p className="p-5 text-sm text-neutral-500 dark:text-neutral-500">No alerts yet. Create one above.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {alerts.map((alert) => (
                <li key={alert.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={alert.enabled ? alert.lastStatus : 'disabled'} />
                      <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{alert.name}</p>
                    </div>
                    <p className="mt-1 truncate font-mono text-xs text-neutral-500 dark:text-neutral-400">{summarize(alert)}</p>
                    <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                      {alert.lastValue !== null
                        ? `Last value ${Math.round(alert.lastValue).toLocaleString()} · checked ${formatDate(alert.lastEvaluatedAt)}`
                        : 'Not evaluated yet · runs automatically within a few minutes'}
                    </p>
                    {testResults[alert.id] ? (
                      <p className="mt-2 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
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

        <section className="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <p className="border-b border-neutral-200 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:border-neutral-800 dark:text-neutral-500">
            Recent firings
          </p>
          {recentEvents.length === 0 ? (
            <p className="p-5 text-sm text-neutral-500 dark:text-neutral-500">Nothing has fired yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {recentEvents.map((event) => (
                <li key={event.id} className="px-5 py-3">
                  <p className="text-sm font-medium text-neutral-900 dark:text-white">{event.alertName}</p>
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{event.message}</p>
                  <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">{formatDate(event.triggeredAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    triggered: 'bg-neutral-900 text-white dark:bg-white dark:text-black',
    ok: 'border border-neutral-300 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400',
    pending: 'border border-neutral-200 text-neutral-400 dark:border-neutral-800 dark:text-neutral-500',
    disabled: 'border border-neutral-200 text-neutral-300 dark:border-neutral-800 dark:text-neutral-600'
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
    <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
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
  'min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm font-normal normal-case text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:border-white dark:focus:ring-white/10';

const toolbarBtn =
  'inline-flex h-8 items-center justify-center rounded-md border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800';

const deleteBtn =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-300 text-neutral-400 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-500 dark:hover:border-red-900 dark:hover:bg-red-950/30 dark:hover:text-red-400';
