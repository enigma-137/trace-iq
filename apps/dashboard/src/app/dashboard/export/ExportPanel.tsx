'use client';

import { useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface ExportEvent {
  id: string;
  occurredAt: string;
  eventName: string;
  distinctId: string | null;
  userId: string | null;
  anonymousId: string | null;
  sessionId: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  os: string | null;
  deviceType: string | null;
  browser: string | null;
  properties: Record<string, unknown> | null;
}

interface ExportResponse {
  count: number;
  truncated: boolean;
  from: string;
  to: string;
  events: ExportEvent[];
}

const COLUMNS: Array<keyof ExportEvent> = [
  'id',
  'occurredAt',
  'eventName',
  'distinctId',
  'userId',
  'anonymousId',
  'sessionId',
  'country',
  'region',
  'city',
  'os',
  'deviceType',
  'browser'
];

export function ExportPanel({ eventNames }: { eventNames: string[] }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [event, setEvent] = useState('');
  const [limit, setLimit] = useState('10000');
  const [busy, setBusy] = useState<null | 'csv' | 'json'>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function fetchEvents(): Promise<ExportResponse | null> {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setError('Your dashboard session expired. Sign in again.');
      return null;
    }

    const params = new URLSearchParams();
    if (from) params.set('from', new Date(`${from}T00:00:00`).toISOString());
    if (to) params.set('to', new Date(`${to}T23:59:59.999`).toISOString());
    if (event) params.set('event', event);
    if (limit) params.set('limit', limit);

    const response = await fetch(`${apiBaseUrl}/v1/dashboard/export/events?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      setError(await readError(response));
      return null;
    }
    return (await response.json()) as ExportResponse;
  }

  async function download(format: 'csv' | 'json') {
    setError(null);
    setStatus(null);
    setBusy(format);
    try {
      const data = await fetchEvents();
      if (!data) return;

      if (data.count === 0) {
        setStatus('No events matched — nothing to download.');
        return;
      }

      const stamp = `${from}_to_${to}`;
      if (format === 'csv') {
        triggerDownload(toCsv(data.events), `traceiq-events_${stamp}.csv`, 'text/csv;charset=utf-8');
      } else {
        triggerDownload(JSON.stringify(data.events, null, 2), `traceiq-events_${stamp}.json`, 'application/json');
      }
      setStatus(
        `Downloaded ${data.count.toLocaleString()} event${data.count === 1 ? '' : 's'}.` +
          (data.truncated ? ` Hit the ${Number(limit).toLocaleString()}-row cap — narrow the range for the rest.` : '')
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid max-w-2xl gap-4 rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="From">
          <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Event (optional)">
          <select className={inputClass} value={event} onChange={(e) => setEvent(e.target.value)}>
            <option value="">All events</option>
            {eventNames.map((ev) => (
              <option key={ev} value={ev}>
                {ev}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Row cap (max 50,000)">
          <input
            type="number"
            min={1}
            max={50000}
            className={inputClass}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </Field>
      </div>

      {error ? (
        <p className="rounded-md border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {error}
        </p>
      ) : null}
      {status ? <p className="text-sm text-neutral-600 dark:text-slate-300">{status}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => download('csv')}
          disabled={busy !== null}
          className="h-10 rounded-md bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-700 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-slate-200"
        >
          {busy === 'csv' ? 'Preparing…' : 'Download CSV'}
        </button>
        <button
          onClick={() => download('json')}
          disabled={busy !== null}
          className="h-10 rounded-md border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-100 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {busy === 'json' ? 'Preparing…' : 'Download JSON'}
        </button>
      </div>
      <p className="text-xs text-neutral-400 dark:text-slate-500">
        CSV flattens the top-level fields; the full <span className="font-mono">properties</span> object is included as a
        JSON column (and in full in the JSON export).
      </p>
    </div>
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

function toCsv(events: ExportEvent[]): string {
  const header = [...COLUMNS, 'properties'];
  const lines = [header.map(csvCell).join(',')];
  for (const ev of events) {
    const row = COLUMNS.map((col) => csvCell(ev[col]));
    row.push(csvCell(ev.properties ? JSON.stringify(ev.properties) : ''));
    lines.push(row.join(','));
  }
  return lines.join('\r\n');
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Quote when the value contains a comma, quote, or newline; escape embedded quotes.
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return toDateInput(d);
}

function defaultTo(): string {
  return toDateInput(new Date());
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
