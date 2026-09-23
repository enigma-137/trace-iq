'use client';

import { useContext, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DateRangePicker, Select, type DateRange } from '@traceiq/ui';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { PlanContext } from '../DashboardPlan';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  eventNames: string[];
  userEmail?: string | null;
  projectId?: string | null;
  initialRange?: DateRange;
  initialEvent?: string;
  initialFormat?: 'csv' | 'json';
}

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
  project?: { id: string; name: string };
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

export function ExportModal({
  open,
  onClose,
  eventNames,
  userEmail,
  projectId,
  initialRange,
  initialEvent = '',
  initialFormat = 'csv'
}: ExportModalProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { plan } = useContext(PlanContext);
  const isProOrSelfHosted = plan === 'pro' || plan === 'self_hosted';

  const [deliveryMethod, setDeliveryMethod] = useState<'download' | 'email'>('download');
  const [range, setRange] = useState<DateRange>(() => initialRange ?? { from: defaultFrom(), to: defaultTo() });
  const [event, setEvent] = useState(initialEvent);
  const [format, setFormat] = useState<'csv' | 'json'>(initialFormat);
  const [limit, setLimit] = useState('10000');
  const [recipientEmail, setRecipientEmail] = useState(userEmail ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Sync initial props when opened
  useEffect(() => {
    if (open) {
      if (initialRange) setRange(initialRange);
      if (initialEvent !== undefined) setEvent(initialEvent);
      if (initialFormat) setFormat(initialFormat);
      if (userEmail && !recipientEmail) setRecipientEmail(userEmail);
      setError(null);
      setSuccessMessage(null);
    }
  }, [open, initialRange, initialEvent, initialFormat, userEmail, recipientEmail]);

  // Handle ESC key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  async function getAuthToken(): Promise<string | null> {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function handleDownload() {
    setError(null);
    setSuccessMessage(null);
    setBusy(true);

    try {
      const token = await getAuthToken();
      if (!token) {
        setError('Your session has expired. Please sign in again.');
        return;
      }

      const params = new URLSearchParams();
      if (projectId) params.set('projectId', projectId);
      if (range.from) params.set('from', new Date(`${range.from}T00:00:00`).toISOString());
      if (range.to) params.set('to', new Date(`${range.to}T23:59:59.999`).toISOString());
      if (event) params.set('event', event);
      if (limit) params.set('limit', limit);

      const response = await fetch(`${apiBaseUrl}/v1/dashboard/export/events?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        setError(await readError(response));
        return;
      }

      const data = (await response.json()) as ExportResponse;
      if (data.count === 0) {
        setError('No events matched your selected date range and filter — nothing to download.');
        return;
      }

      const stamp = `${range.from}_to_${range.to}`;
      if (format === 'csv') {
        triggerDownload(toCsv(data.events), `traceiq-events_${stamp}.csv`, 'text/csv;charset=utf-8');
      } else {
        triggerDownload(JSON.stringify(data.events, null, 2), `traceiq-events_${stamp}.json`, 'application/json');
      }

      setSuccessMessage(
        `Successfully downloaded ${data.count.toLocaleString()} event${data.count === 1 ? '' : 's'}.` +
          (data.truncated ? ` (Hit the ${Number(limit).toLocaleString()}-row cap; narrow your range for remaining events.)` : '')
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailExport() {
    setError(null);
    setSuccessMessage(null);

    const targetEmail = recipientEmail.trim();
    if (!targetEmail || !isValidEmail(targetEmail)) {
      setError('Please provide a valid recipient email address.');
      return;
    }

    setBusy(true);

    try {
      const token = await getAuthToken();
      if (!token) {
        setError('Your session has expired. Please sign in again.');
        return;
      }

      const payload = {
        projectId: projectId ?? undefined,
        from: range.from ? new Date(`${range.from}T00:00:00`).toISOString() : undefined,
        to: range.to ? new Date(`${range.to}T23:59:59.999`).toISOString() : undefined,
        event: event || undefined,
        limit: Number(limit) || 10000,
        format,
        recipientEmail: targetEmail
      };

      const response = await fetch(`${apiBaseUrl}/v1/dashboard/export/email`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        setError(await readError(response));
        return;
      }

      const result = (await response.json()) as {
        ok: boolean;
        count: number;
        recipient: string;
        truncated?: boolean;
        message?: string;
      };

      setSuccessMessage(
        result.message ??
          `Export containing ${result.count.toLocaleString()} events has been emailed to ${result.recipient}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Email export failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-neutral-950/60 p-4 backdrop-blur-sm dark:bg-black/80 animate-in fade-in duration-150"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="relative my-6 w-full max-w-xl rounded-xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950 sm:p-7"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-neutral-100 pb-4 dark:border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-white dark:bg-slate-800 dark:text-slate-100">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <div>
              <h2 id="export-dialog-title" className="text-lg font-bold tracking-tight text-neutral-950 dark:text-white">
                Export Analytics Data
              </h2>
              <p className="text-xs text-neutral-500 dark:text-slate-400">
                Download raw telemetry or deliver formatted archives straight to your inbox.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
            onClick={onClose}
            disabled={busy}
            aria-label="Close modal"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Delivery Method Tabs */}
        <div className="mt-5 grid grid-cols-2 gap-2 rounded-lg bg-neutral-100 p-1 dark:bg-slate-900">
          <button
            type="button"
            className={`flex items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold transition ${
              deliveryMethod === 'download'
                ? 'bg-white text-neutral-900 shadow-xs dark:bg-slate-800 dark:text-white'
                : 'text-neutral-600 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
            }`}
            onClick={() => setDeliveryMethod('download')}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Direct Download
          </button>

          <button
            type="button"
            className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold transition ${
              deliveryMethod === 'email'
                ? 'bg-white text-neutral-900 shadow-xs dark:bg-slate-800 dark:text-white'
                : 'text-neutral-600 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
            }`}
            onClick={() => setDeliveryMethod('email')}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            Send to Email
            <span className="rounded-full bg-blue-600 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider text-white">
              PRO
            </span>
          </button>
        </div>

        {/* Configuration Fields */}
        <div className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
                Date range
              </label>
              <DateRangePicker value={range} onChange={setRange} />
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
                Event filter (optional)
              </label>
              <Select
                value={event}
                onValueChange={setEvent}
                items={eventNames.map((eventName) => ({ value: eventName, label: eventName }))}
                placeholder="All events"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
                  Row cap (max 50,000)
                </label>
                <div className="flex gap-1">
                  {['1000', '10000', '50000'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setLimit(preset)}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-mono transition ${
                        limit === preset
                          ? 'bg-neutral-900 text-white dark:bg-white dark:text-black font-semibold'
                          : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800'
                      }`}
                    >
                      {Number(preset) >= 1000 ? `${Number(preset) / 1000}k` : preset}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="number"
                min={1}
                max={50000}
                className={inputClass}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
                Format
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFormat('csv')}
                  className={`flex flex-col items-start rounded-md border p-2 text-left transition ${
                    format === 'csv'
                      ? 'border-neutral-900 bg-neutral-50/70 text-neutral-900 ring-1 ring-neutral-900 dark:border-white dark:bg-slate-900 dark:text-white dark:ring-white'
                      : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400'
                  }`}
                >
                  <span className="text-xs font-bold">CSV</span>
                  <span className="text-[10px] text-neutral-400 dark:text-slate-500">Spreadsheet ready</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFormat('json')}
                  className={`flex flex-col items-start rounded-md border p-2 text-left transition ${
                    format === 'json'
                      ? 'border-neutral-900 bg-neutral-50/70 text-neutral-900 ring-1 ring-neutral-900 dark:border-white dark:bg-slate-900 dark:text-white dark:ring-white'
                      : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400'
                  }`}
                >
                  <span className="text-xs font-bold">JSON</span>
                  <span className="text-[10px] text-neutral-400 dark:text-slate-500">Full payload fidelity</span>
                </button>
              </div>
            </div>
          </div>

          {/* Email Recipient or Pro Upsell */}
          {deliveryMethod === 'email' ? (
            isProOrSelfHosted ? (
              <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3.5 dark:border-blue-900/40 dark:bg-blue-950/20">
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-blue-900 dark:text-blue-300">
                  Recipient email address
                </label>
                <div className="relative">
                  <input
                    type="email"
                    placeholder="analyst@company.com"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    className="h-10 w-full rounded-md border border-blue-200 bg-white px-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 dark:border-blue-800 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-blue-700/80 dark:text-blue-300/80">
                  We'll generate the {format.toUpperCase()} archive and deliver it as an email attachment with an executive summary.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-neutral-900 dark:text-white">Email Exports with TraceIQ Pro</h4>
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                        PRO PLAN
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-600 dark:text-slate-400 leading-relaxed">
                      Deliver automated CSV & JSON exports directly to individual emails or distribution lists.
                    </p>
                    <Link
                      href="/dashboard/settings/billing"
                      className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-slate-200"
                    >
                      Upgrade to Pro
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </Link>
                  </div>
                </div>
              </div>
            )
          ) : null}
        </div>

        {/* Feedback Alerts */}
        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            <svg className="h-4 w-4 shrink-0 text-red-500 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        ) : null}

        {successMessage ? (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
            <svg className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>{successMessage}</span>
          </div>
        ) : null}

        {/* Footer Actions */}
        <div className="mt-6 flex items-center justify-between border-t border-neutral-100 pt-4 dark:border-slate-800/80">
          <p className="text-[11px] text-neutral-400 dark:text-slate-500">
            {format === 'csv' ? 'CSV flattens top properties' : 'JSON preserves full nested trees'}
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="h-9 rounded-md border border-neutral-300 bg-white px-3.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition"
            >
              Cancel
            </button>

            {deliveryMethod === 'download' ? (
              <button
                type="button"
                onClick={handleDownload}
                disabled={busy}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-neutral-900 px-4 text-xs font-bold text-white transition hover:bg-neutral-800 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-slate-200"
              >
                {busy ? (
                  <>
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" />
                    </svg>
                    Generating export…
                  </>
                ) : (
                  <>
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Download {format.toUpperCase()}
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleEmailExport}
                disabled={busy || !isProOrSelfHosted}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? (
                  <>
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" />
                    </svg>
                    Sending email…
                  </>
                ) : (
                  <>
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                    Send to Email
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
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

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
  'h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm font-normal text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-white dark:focus:ring-white/10';
