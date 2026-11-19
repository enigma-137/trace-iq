'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { clientFetch } from '@/lib/analytics-api';

interface Entry {
  slug: string;
  title: string;
  date: string;
  areas: string[];
  html: string;
}

/** Mirrors DigestSend in apps/api/src/modules/product-updates/product-updates.service.ts. */
interface DigestSend {
  status: 'sending' | 'sent' | 'failed';
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  lastError: string | null;
  sentBy: string;
  startedAt: string;
  finishedAt: string | null;
}

interface DigestStatus {
  period: string;
  subject: string;
  recipientCount: number;
  send: DigestSend | null;
}

const SITE_URL = 'https://traceiq.run';

const people = (count: number) => `${count.toLocaleString()} ${count === 1 ? 'person' : 'people'}`;

const monthLabel = (period: string) =>
  new Date(`${period}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const cardClass =
  'rounded-md border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]';
const buttonClass =
  'inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Operator console: the monthly changelog email. Pick a month, check the preview, send a
 * test to yourself, then send it to everyone who hasn't opted out. Each month goes once.
 */
export function AdminChangelogEmailSection() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [period, setPeriod] = useState<string | null>(null);
  const [status, setStatus] = useState<DigestStatus | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<'test' | 'send' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetch('/changelog/entries.json')
      .then((response) => response.json())
      .then((data: { entries: Entry[] }) => {
        setEntries(data.entries);
        setPeriod(data.entries[0]?.date.slice(0, 7) ?? null);
      })
      .catch(() => setMessage({ tone: 'error', text: 'Couldn’t load the changelog entries.' }));
  }, []);

  const months = useMemo(() => [...new Set((entries ?? []).map((entry) => entry.date.slice(0, 7)))], [entries]);

  const payload = useMemo(() => {
    const list = (entries ?? []).filter((entry) => entry.date.startsWith(`${period}-`));
    return {
      period,
      entries: list.map(({ slug, title, date, areas, html }) => ({ title, date, areas, html, url: `${SITE_URL}/changelog#${slug}` }))
    };
  }, [entries, period]);

  const loadStatus = useCallback(async () => {
    if (!period) return;
    const { data, error } = await clientFetch<DigestStatus>(`/v1/admin/changelog-digest?period=${period}`);
    if (data) setStatus(data);
    else setMessage({ tone: 'error', text: error ?? 'Couldn’t load the send status.' });
  }, [period]);

  useEffect(() => {
    if (!period || payload.entries.length === 0) return;
    setStatus(null);
    setPreview(null);
    setConfirming(false);
    setMessage(null);
    void loadStatus();
    void clientFetch<{ html: string }>('/v1/admin/changelog-digest/preview', {
      method: 'POST',
      body: JSON.stringify(payload)
    }).then(({ data, error }) => {
      if (data) setPreview(data.html);
      else setMessage({ tone: 'error', text: error ?? 'Couldn’t build the preview.' });
    });
  }, [period, payload, loadStatus]);

  // Follow a send in progress.
  useEffect(() => {
    if (status?.send?.status !== 'sending') return;
    const timer = setInterval(() => void loadStatus(), 3000);
    return () => clearInterval(timer);
  }, [status?.send?.status, loadStatus]);

  async function sendTest() {
    setBusy('test');
    setMessage(null);
    const { data, error } = await clientFetch<{ sentTo: string }>('/v1/admin/changelog-digest/test', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    setBusy(null);
    setMessage(data ? { tone: 'ok', text: `Test sent to ${data.sentTo}.` } : { tone: 'error', text: error ?? 'The test was not sent.' });
  }

  async function sendAll() {
    setBusy('send');
    setMessage(null);
    const { error } = await clientFetch<DigestSend>('/v1/admin/changelog-digest/send', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    setBusy(null);
    setConfirming(false);
    if (error) setMessage({ tone: 'error', text: error });
    await loadStatus();
  }

  const send = status?.send ?? null;
  const recipients = status?.recipientCount ?? 0;

  return (
    <section className="mb-5">
      <div className="mb-2.5 flex items-baseline justify-between gap-3 px-0.5">
        <h2 className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-white">Changelog email</h2>
        <p className="text-xs text-neutral-400 dark:text-slate-500">Monthly digest of /changelog, to every account that hasn’t opted out</p>
      </div>
      <div className={`${cardClass} grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]`}>
        <div className="grid content-start gap-4">
          <label className="grid gap-1.5 text-sm font-medium text-neutral-700 dark:text-slate-300">
            Month
            <select
              className="rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={period ?? ''}
              onChange={(event) => setPeriod(event.target.value)}
              disabled={!entries}
            >
              {months.map((month) => (
                <option key={month} value={month}>
                  {monthLabel(month)} · {(entries ?? []).filter((entry) => entry.date.startsWith(`${month}-`)).length} entries
                </option>
              ))}
            </select>
          </label>

          <dl className="grid gap-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-500 dark:text-slate-400">Subject</dt>
              <dd className="text-right font-medium text-neutral-900 dark:text-white">{status?.subject ?? '…'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-500 dark:text-slate-400">Recipients</dt>
              <dd className="font-medium text-neutral-900 dark:text-white">{status ? recipients.toLocaleString() : '…'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-500 dark:text-slate-400">Status</dt>
              <dd className="text-right font-medium">
                {!send ? (
                  <span className="text-neutral-500 dark:text-slate-400">Not sent</span>
                ) : send.status === 'sending' ? (
                  <span className="text-blue-700 dark:text-blue-300">
                    Sending… {send.sentCount.toLocaleString()} of {send.recipientCount.toLocaleString()}
                  </span>
                ) : send.status === 'sent' ? (
                  <span className="text-emerald-700 dark:text-emerald-300">
                    Sent to {send.sentCount.toLocaleString()} on {new Date(send.finishedAt ?? send.startedAt).toLocaleDateString()}
                    {send.failedCount > 0 ? `, ${send.failedCount.toLocaleString()} failed` : ''}
                  </span>
                ) : (
                  <span className="text-rose-700 dark:text-rose-300">Failed</span>
                )}
              </dd>
            </div>
          </dl>
          {send?.lastError ? <p className="text-xs text-rose-700 dark:text-rose-300">Last error: {send.lastError}</p> : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`${buttonClass} border-neutral-300 text-neutral-800 hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900`}
              onClick={() => void sendTest()}
              disabled={!preview || busy !== null}
            >
              {busy === 'test' ? 'Sending test…' : 'Send test to me'}
            </button>
            {send ? null : confirming ? (
              <>
                <button
                  type="button"
                  className={`${buttonClass} border-blue-600 bg-blue-600 text-white hover:bg-blue-700`}
                  onClick={() => void sendAll()}
                  disabled={busy !== null}
                >
                  {busy === 'send' ? 'Starting…' : `Yes, email ${people(recipients)}`}
                </button>
                <button
                  type="button"
                  className={`${buttonClass} border-transparent text-neutral-600 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white`}
                  onClick={() => setConfirming(false)}
                  disabled={busy !== null}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                className={`${buttonClass} border-blue-600 bg-blue-600 text-white hover:bg-blue-700`}
                onClick={() => setConfirming(true)}
                disabled={!preview || !status || recipients === 0 || busy !== null}
              >
                Send to {people(recipients)}
              </button>
            )}
          </div>
          {confirming ? (
            <p className="text-xs text-neutral-500 dark:text-slate-400">
              This emails everyone listed above once. It can&rsquo;t be undone, and {period ? monthLabel(period) : 'this month'} can&rsquo;t be sent again.
            </p>
          ) : null}
          {message ? (
            <p role="status" className={`text-sm ${message.tone === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
              {message.text}
            </p>
          ) : null}
        </div>

        <div className="min-h-[420px] overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-slate-800">
          {preview ? (
            <iframe title="Email preview" srcDoc={preview} sandbox="" className="h-[520px] w-full bg-white" />
          ) : (
            <p className="p-4 text-sm text-neutral-500">{entries && months.length === 0 ? 'No changelog entries yet.' : 'Building the preview…'}</p>
          )}
        </div>
      </div>
    </section>
  );
}
