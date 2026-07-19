'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Flag {
  id: string;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  rolloutPercentage: number;
  overrides: Record<string, boolean>;
  payload: unknown;
}

export function FlagManager({ flags }: { flags: Flag[] }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rollout, setRollout] = useState('0');
  const [enabled, setEnabled] = useState(true);
  const [payload, setPayload] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!key.trim()) return setError('Give the flag a key (e.g. new-checkout).');

    let parsedPayload: unknown;
    if (payload.trim()) {
      try {
        parsedPayload = JSON.parse(payload);
      } catch {
        return setError('Payload must be valid JSON (e.g. {"limit": 5}).');
      }
    }

    setIsSubmitting(true);
    const response = await authFetch('/v1/dashboard/flags', {
      method: 'POST',
      body: JSON.stringify({
        key: key.trim(),
        name: name.trim() || undefined,
        description: description.trim() || undefined,
        enabled,
        rolloutPercentage: Number(rollout) || 0,
        payload: parsedPayload
      })
    });
    if (!response) return setIsSubmitting(false);
    if (!response.ok) {
      setError(await readError(response));
      setIsSubmitting(false);
      return;
    }
    setKey('');
    setName('');
    setDescription('');
    setRollout('0');
    setEnabled(true);
    setPayload('');
    setIsSubmitting(false);
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
      <form
        className="grid h-fit gap-4 rounded-md border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950"
        onSubmit={handleCreate}
      >
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">New flag</h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Ship behind a flag, roll out to a % of users, then flip it to 100% — or off in one click.
          </p>
        </div>

        <Field label="Key">
          <input
            className={inputClass}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="new-checkout"
          />
        </Field>
        <Field label="Name (optional)">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="New checkout flow" />
        </Field>
        <Field label="Description (optional)">
          <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Redesigned 2-step checkout" />
        </Field>
        <Field label="Rollout %">
          <input className={inputClass} type="number" min={0} max={100} value={rollout} onChange={(e) => setRollout(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-neutral-900 dark:accent-white" />
          Enabled
        </label>

        <Field label="Payload — remote config (optional)">
          <textarea
            className={`${inputClass} min-h-[72px] py-2 font-mono text-xs`}
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            placeholder={'{ "maxAmount": 50000, "banner": "Try the new checkout" }'}
            spellCheck={false}
          />
          <span className="text-[11px] font-normal normal-case tracking-normal text-neutral-400 dark:text-neutral-500">
            JSON delivered to the SDK only when this flag is on for a user. Leave blank for a plain on/off flag.
          </span>
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
            {isSubmitting ? 'Saving…' : 'Create flag'}
          </button>
        </div>
      </form>

      <section className="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <p className="border-b border-neutral-200 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:border-neutral-800 dark:text-neutral-500">
          Flags
        </p>
        {flags.length === 0 ? (
          <p className="p-5 text-sm text-neutral-500 dark:text-neutral-500">No flags yet. Create one to start rolling out safely.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {flags.map((flag) => (
              <FlagRow key={flag.id} flag={flag} authFetch={authFetch} onChanged={() => router.refresh()} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FlagRow({
  flag,
  authFetch,
  onChanged
}: {
  flag: Flag;
  authFetch: (path: string, init: RequestInit) => Promise<Response | null>;
  onChanged: () => void;
}) {
  const [rollout, setRollout] = useState(String(flag.rolloutPercentage));
  const [busy, setBusy] = useState(false);
  const dirty = Number(rollout) !== flag.rolloutPercentage;

  const hasPayload = flag.payload != null;
  const [payloadText, setPayloadText] = useState(hasPayload ? JSON.stringify(flag.payload, null, 2) : '');
  const [payloadError, setPayloadError] = useState<string | null>(null);

  async function update(patch: Record<string, unknown>) {
    setBusy(true);
    const response = await authFetch(`/v1/dashboard/flags/${flag.id}`, { method: 'PUT', body: JSON.stringify(patch) });
    setBusy(false);
    if (response?.ok) onChanged();
    return response;
  }

  async function savePayload() {
    setPayloadError(null);
    const trimmed = payloadText.trim();
    if (!trimmed) {
      await update({ payload: null });
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      setPayloadError('Payload must be valid JSON.');
      return;
    }
    const response = await update({ payload: parsed });
    if (response && !response.ok) setPayloadError(await readError(response));
  }

  async function remove() {
    setBusy(true);
    const response = await authFetch(`/v1/dashboard/flags/${flag.id}`, { method: 'DELETE' });
    setBusy(false);
    if (response?.ok) onChanged();
  }

  return (
    <li className="px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                flag.enabled
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-black'
                  : 'border border-neutral-200 text-neutral-400 dark:border-neutral-800 dark:text-neutral-600'
              }`}
            >
              {flag.enabled ? 'On' : 'Off'}
            </span>
            <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{flag.name}</p>
            <code className="truncate rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
              {flag.key}
            </code>
            {hasPayload ? (
              <span className="shrink-0 rounded border border-neutral-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                Config
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {flag.enabled
              ? `Rolled out to ${flag.rolloutPercentage}% of users`
              : 'Off for everyone (master switch)'}
            {flag.description ? ` · ${flag.description}` : ''}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={100}
              value={rollout}
              onChange={(e) => setRollout(e.target.value)}
              className="h-8 w-16 rounded-md border border-neutral-300 bg-white px-2 text-sm text-neutral-900 outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-white"
            />
            <span className="text-xs text-neutral-400">%</span>
          </div>
          <button
            className={toolbarBtn}
            disabled={busy || !dirty}
            onClick={() => update({ rolloutPercentage: Number(rollout) || 0 })}
          >
            Save
          </button>
          <button className={toolbarBtn} disabled={busy} onClick={() => update({ enabled: !flag.enabled })}>
            {flag.enabled ? 'Disable' : 'Enable'}
          </button>
          <button className={deleteBtn} disabled={busy} onClick={remove} aria-label="Delete flag">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
            </svg>
          </button>
        </div>
      </div>

      <details className="group mt-3">
        <summary className="inline-flex cursor-pointer select-none items-center gap-1.5 text-xs font-medium text-neutral-500 transition hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="transition group-open:rotate-90" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
          {hasPayload ? 'Edit payload (remote config)' : 'Add payload (remote config)'}
        </summary>
        <div className="mt-2 grid gap-2">
          <textarea
            className="min-h-[80px] w-full rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-xs text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:border-white"
            value={payloadText}
            onChange={(e) => setPayloadText(e.target.value)}
            placeholder={'{ "maxAmount": 50000 }'}
            spellCheck={false}
          />
          {payloadError ? <p className="text-xs text-red-600 dark:text-red-400">{payloadError}</p> : null}
          <div className="flex items-center gap-2">
            <button className={toolbarBtn} disabled={busy} onClick={savePayload}>
              Save payload
            </button>
            {hasPayload ? (
              <button
                className={toolbarBtn}
                disabled={busy}
                onClick={() => {
                  setPayloadText('');
                  setPayloadError(null);
                  void update({ payload: null });
                }}
              >
                Clear
              </button>
            ) : null}
            <span className="text-[11px] text-neutral-400 dark:text-neutral-500">Sent to the SDK only when the flag is on.</span>
          </div>
        </div>
      </details>
    </li>
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
  'inline-flex h-8 items-center justify-center rounded-md border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800';

const deleteBtn =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-300 text-neutral-400 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-500 dark:hover:border-red-900 dark:hover:bg-red-950/30 dark:hover:text-red-400';
