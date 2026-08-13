'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { dashboardFetch, useMfaStepUp } from '../MfaStepUp';

interface Webhook {
  id: string;
  name: string;
  url: string;
  hasSecret: boolean;
  eventNames: string[];
  enabled: boolean;
  lastStatus: string | null;
  lastDeliveredAt: string | null;
}

interface Delivery {
  id: string;
  webhookName: string;
  eventName: string | null;
  statusCode: number | null;
  ok: boolean;
  error: string | null;
  createdAt: string;
}

export function WebhookManager({
  webhooks,
  recentDeliveries,
  eventNames
}: {
  webhooks: Webhook[];
  recentDeliveries: Delivery[];
  eventNames: string[];
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { requestStepUp } = useMfaStepUp();
  const router = useRouter();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [events, setEvents] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function authFetch(path: string, init: RequestInit): Promise<Response | null> {
    const response = await dashboardFetch(supabase, requestStepUp, path, init);
    if (!response) {
      setError('Your dashboard session expired. Sign in again.');
    }
    return response;
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!url.trim()) return setError('Enter the URL that should receive events.');
    if (!/^https?:\/\//i.test(url.trim())) return setError('URL must start with http:// or https://');

    setIsSubmitting(true);
    const response = await authFetch('/v1/dashboard/webhooks', {
      method: 'POST',
      body: JSON.stringify({
        name: name.trim() || undefined,
        url: url.trim(),
        secret: secret.trim() || undefined,
        eventNames: parseEvents(events)
      })
    });
    if (!response) return setIsSubmitting(false);
    if (!response.ok) {
      setError(await readError(response));
      setIsSubmitting(false);
      return;
    }
    setName('');
    setUrl('');
    setSecret('');
    setEvents('');
    setIsSubmitting(false);
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <form
          className="grid h-fit gap-4 rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950"
          onSubmit={handleCreate}
        >
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">New webhook</h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              We&apos;ll POST each matching event as JSON. Add a secret and we&apos;ll sign it.
            </p>
          </div>

          <Field label="Name (optional)">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Warehouse loader" />
          </Field>
          <Field label="URL">
            <input className={inputClass} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/hooks/traceiq" />
          </Field>
          <Field label="Signing secret (optional)">
            <input className={inputClass} value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="whsec_…" />
            <span className="text-[11px] font-normal normal-case tracking-normal text-neutral-400 dark:text-slate-500">
              Sent as <span className="font-mono">x-traceiq-signature: sha256=…</span> (HMAC of the request body).
            </span>
          </Field>
          <Field label="Events (comma-separated — blank = all)">
            <input className={inputClass} value={events} onChange={(e) => setEvents(e.target.value)} placeholder="purchase, signup_completed" />
            {eventNames.length > 0 ? (
              <span className="mt-1 flex flex-wrap gap-1">
                {eventNames.slice(0, 8).map((ev) => (
                  <button
                    key={ev}
                    type="button"
                    onClick={() => setEvents((prev) => appendEvent(prev, ev))}
                    className="rounded border border-neutral-200 px-1.5 py-0.5 font-mono text-[10px] font-normal normal-case tracking-normal text-neutral-500 transition hover:border-neutral-400 hover:text-neutral-900 dark:border-slate-800 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-100"
                  >
                    + {ev}
                  </button>
                ))}
              </span>
            ) : null}
          </Field>

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
              {isSubmitting ? 'Saving…' : 'Create webhook'}
            </button>
          </div>
        </form>

        <section className="rounded-md border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          <p className="border-b border-neutral-200 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:border-slate-800 dark:text-slate-500">
            Webhooks
          </p>
          {webhooks.length === 0 ? (
            <p className="p-5 text-sm text-neutral-500 dark:text-slate-500">No webhooks yet. Add one to start forwarding events.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-slate-800">
              {webhooks.map((webhook) => (
                <WebhookRow key={webhook.id} webhook={webhook} authFetch={authFetch} onChanged={() => router.refresh()} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-md border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <p className="border-b border-neutral-200 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:border-slate-800 dark:text-slate-500">
          Recent deliveries
        </p>
        {recentDeliveries.length === 0 ? (
          <p className="p-5 text-sm text-neutral-500 dark:text-slate-500">
            No deliveries yet. Deliveries appear here once matching events arrive (or you hit Test).
          </p>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-slate-800">
            {recentDeliveries.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${statusPillClass(d.ok)}`}>
                    {d.ok ? 'OK' : 'Fail'}
                  </span>
                  <code className="truncate font-mono text-xs text-neutral-600 dark:text-slate-400">{d.eventName ?? '—'}</code>
                  <span className="truncate text-xs text-neutral-400 dark:text-slate-500">→ {d.webhookName}</span>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-neutral-400 dark:text-slate-500">
                  <span>{d.statusCode ?? (d.error ? 'error' : '—')}</span>
                  <span className="hidden sm:inline">{formatTime(d.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function WebhookRow({
  webhook,
  authFetch,
  onChanged
}: {
  webhook: Webhook;
  authFetch: (path: string, init: RequestInit) => Promise<Response | null>;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  async function update(patch: Record<string, unknown>) {
    setBusy(true);
    const response = await authFetch(`/v1/dashboard/webhooks/${webhook.id}`, { method: 'PUT', body: JSON.stringify(patch) });
    setBusy(false);
    if (response?.ok) onChanged();
  }

  async function remove() {
    setBusy(true);
    const response = await authFetch(`/v1/dashboard/webhooks/${webhook.id}`, { method: 'DELETE' });
    setBusy(false);
    if (response?.ok) onChanged();
  }

  async function test() {
    setBusy(true);
    setTestResult(null);
    const response = await authFetch(`/v1/dashboard/webhooks/${webhook.id}/test`, { method: 'POST' });
    setBusy(false);
    if (!response) return;
    if (!response.ok) {
      setTestResult(`Test failed: ${await readError(response)}`);
      return;
    }
    const body = (await response.json()) as { ok: boolean; statusCode: number | null; error: string | null };
    setTestResult(body.ok ? `Delivered (HTTP ${body.statusCode}).` : `Endpoint error: ${body.error ?? `HTTP ${body.statusCode}`}`);
    onChanged();
  }

  return (
    <li className="px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                webhook.enabled
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-slate-950'
                  : 'border border-neutral-200 text-neutral-400 dark:border-slate-800 dark:text-slate-600'
              }`}
            >
              {webhook.enabled ? 'On' : 'Off'}
            </span>
            <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{webhook.name}</p>
            {webhook.hasSecret ? (
              <span className="shrink-0 rounded border border-neutral-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:border-slate-800 dark:text-slate-400">
                Signed
              </span>
            ) : null}
          </div>
          <code className="mt-1 block truncate font-mono text-xs text-neutral-500 dark:text-slate-400">{webhook.url}</code>
          <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
            {webhook.eventNames.length === 0 ? 'All events' : `${webhook.eventNames.length} event${webhook.eventNames.length === 1 ? '' : 's'}: ${webhook.eventNames.join(', ')}`}
            {webhook.lastStatus ? ` · last ${webhook.lastStatus}${webhook.lastDeliveredAt ? ` ${formatTime(webhook.lastDeliveredAt)}` : ''}` : ''}
          </p>
          {testResult ? <p className="mt-1 text-xs text-neutral-600 dark:text-slate-300">{testResult}</p> : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button className={toolbarBtn} disabled={busy} onClick={test}>
            Test
          </button>
          <button className={toolbarBtn} disabled={busy} onClick={() => update({ enabled: !webhook.enabled })}>
            {webhook.enabled ? 'Disable' : 'Enable'}
          </button>
          <button className={deleteBtn} disabled={busy} onClick={remove} aria-label="Delete webhook">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
            </svg>
          </button>
        </div>
      </div>
    </li>
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

function parseEvents(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function appendEvent(prev: string, ev: string): string {
  const current = parseEvents(prev);
  if (current.includes(ev)) return prev;
  return [...current, ev].join(', ');
}

function statusPillClass(ok: boolean): string {
  return ok
    ? 'bg-neutral-900 text-white dark:bg-white dark:text-slate-950'
    : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400';
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
  'inline-flex h-8 items-center justify-center rounded-md border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';

const deleteBtn =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-300 text-neutral-400 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-500 dark:hover:border-red-900 dark:hover:bg-red-950/30 dark:hover:text-red-400';
