'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { detectFormat, readEventsFile, type ImportFormat } from './file-reader';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const CHUNK_EVENTS = 500;
const CHUNK_BYTES = 800_000; // the API accepts request bodies up to 1 MB

export interface ImportJob {
  id: string;
  source: string;
  status: 'running' | 'cancelling' | 'cancelled' | 'completed' | 'failed' | 'interrupted';
  sourceHost: string;
  sourceProject: string;
  rangeStart: string;
  rangeEnd: string;
  completedThrough: string | null;
  windowsTotal: number;
  windowsDone: number;
  read: number;
  imported: number;
  skipped: number;
  rejected: number;
  skippedEvents: Record<string, number>;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

interface ImportPanelProps {
  projectId?: string | null;
  projectName?: string | null;
  initialJobs: ImportJob[];
}

interface FileProgress {
  read: number;
  imported: number;
  skipped: number;
  rejected: number;
  skippedEvents: Record<string, number>;
  errors: string[];
  format: ImportFormat | null;
  done: boolean;
  stopped: boolean;
}

export function ImportPanel({ projectId, projectName, initialJobs }: ImportPanelProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const getToken = useCallback(async () => {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, [supabase]);

  const api = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      const token = await getToken();
      if (!token) throw new Error('Your session has expired. Sign in again.');
      const response = await fetch(`${apiBaseUrl}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) }
      });
      if (!response.ok) throw new Error(await readError(response));
      return (await response.json()) as T;
    },
    [getToken]
  );

  const projectQuery = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-950 sm:p-8">
        <div className="max-w-3xl space-y-3">
          {projectName ? (
            <span className="inline-flex rounded-full border border-neutral-200 bg-neutral-100 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              Importing into: {projectName}
            </span>
          ) : null}
          <h1 className="text-2xl font-bold tracking-tight text-neutral-950 dark:text-white sm:text-3xl">Import events</h1>
          <p className="text-sm leading-relaxed text-neutral-600 dark:text-slate-400">
            Bring your history with you. Imported events keep their original timestamps and locations, so trends,
            funnels and retention cover the time before you switched to TraceIQ.
          </p>
          <ul className="grid gap-1.5 pt-1 text-xs text-neutral-600 dark:text-slate-400 sm:grid-cols-2">
            <Check>Original timestamps, users and sessions are kept</Check>
            <Check>Webhooks are not triggered for imported events</Check>
            <Check>Imported events count toward your monthly events</Check>
            <Check>Only owners and admins can import</Check>
          </ul>
        </div>
      </section>

      <FormatsSection />

      <FileImportCard api={api} projectId={projectId} />

      <PostHogSection api={api} projectId={projectId} projectQuery={projectQuery} initialJobs={initialJobs} />
    </div>
  );
}

// ─── Supported formats ──────────────────────────────────────────────────────

function FormatsSection() {
  const formats = [
    {
      badge: 'PostHog',
      title: 'PostHog events',
      files: '.jsonl  .json  .gz',
      body: 'JSON Lines from PostHog batch or file download exports (gzipped or not), a JSON array of events, or a saved API response with a "results" array.',
      fields: 'event, distinct_id, timestamp, properties'
    },
    {
      badge: 'TraceIQ',
      title: 'TraceIQ export',
      files: '.json',
      body: 'A JSON file from the Export page of this or another TraceIQ project, including self-hosted instances.',
      fields: 'occurredAt, eventName, userId, properties, …'
    },
    {
      badge: 'TraceIQ',
      title: 'TraceIQ events',
      files: '.jsonl  .json  .gz',
      body: 'Events in the same shape the SDKs send, one per line or as an array. Use this to load data from any other tool after a small transform.',
      fields: 'eventName, timestamp, userId | anonymousId, properties'
    }
  ];

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-base font-bold tracking-tight text-neutral-900 dark:text-white">Supported formats</h2>
        <p className="text-xs text-neutral-500 dark:text-slate-400">
          The format is detected from the file. CSV is not supported, because it can’t carry nested event properties.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {formats.map((format) => (
          <div key={format.title} className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">{format.title}</h3>
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold text-neutral-700 dark:bg-slate-800 dark:text-slate-300">
                {format.badge}
              </span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-neutral-400 dark:text-slate-500">{format.files}</p>
            <p className="mt-3 text-xs leading-relaxed text-neutral-600 dark:text-slate-400">{format.body}</p>
            <p className="mt-3 rounded-md bg-neutral-50 px-2.5 py-1.5 font-mono text-[11px] text-neutral-700 dark:bg-slate-900 dark:text-slate-300">
              {format.fields}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── File upload ────────────────────────────────────────────────────────────

type Api = <T>(path: string, init?: RequestInit) => Promise<T>;

function FileImportCard({ api, projectId }: { api: Api; projectId?: string | null }) {
  const [file, setFile] = useState<File | null>(null);
  const [formatChoice, setFormatChoice] = useState<'auto' | ImportFormat>('auto');
  const [progress, setProgress] = useState<FileProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const stopRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function runImport() {
    if (!file) return;
    setBusy(true);
    setError(null);
    stopRef.current = false;
    const state: FileProgress = { read: 0, imported: 0, skipped: 0, rejected: 0, skippedEvents: {}, errors: [], format: null, done: false, stopped: false };
    setProgress({ ...state });

    let format: ImportFormat | null = formatChoice === 'auto' ? null : formatChoice;
    let chunk: unknown[] = [];
    let chunkBytes = 0;

    const send = async () => {
      if (chunk.length === 0) return;
      const result = await api<{ read: number; imported: number; skipped: number; rejected: number; skippedEvents: Record<string, number>; errors: string[] }>(
        '/v1/dashboard/import/events',
        { method: 'POST', body: JSON.stringify({ projectId, format, events: chunk }) }
      );
      chunk = [];
      chunkBytes = 0;
      state.imported += result.imported;
      state.skipped += result.skipped;
      state.rejected += result.rejected;
      for (const [name, count] of Object.entries(result.skippedEvents ?? {})) state.skippedEvents[name] = (state.skippedEvents[name] ?? 0) + count;
      for (const message of result.errors ?? []) if (state.errors.length < 5) state.errors.push(message);
      setProgress({ ...state });
    };

    try {
      for await (const row of readEventsFile(file)) {
        if (stopRef.current) {
          state.stopped = true;
          break;
        }
        state.read += 1;
        if ('error' in row) {
          state.skipped += 1;
          state.skippedEvents['(lines that are not valid JSON)'] = (state.skippedEvents['(lines that are not valid JSON)'] ?? 0) + 1;
          continue;
        }
        if (!format) {
          format = detectFormat(row.value);
          if (!format) throw new Error('Could not tell the format from the first event. Pick the format above.');
          state.format = format;
        }
        const size = JSON.stringify(row.value).length;
        if (chunk.length > 0 && (chunk.length >= CHUNK_EVENTS || chunkBytes + size > CHUNK_BYTES)) await send();
        if (size > CHUNK_BYTES) {
          state.rejected += 1;
          if (state.errors.length < 5) state.errors.push(`An event on row ${state.read} is larger than 800 KB and was not imported.`);
          continue;
        }
        chunk.push(row.value);
        chunkBytes += size;
      }
      if (!state.stopped) await send();
      state.done = true;
      setProgress({ ...state });
    } catch (err) {
      setError(
        `${err instanceof Error ? err.message : 'Import failed.'}${state.imported > 0 ? ` ${state.imported.toLocaleString()} events were imported before this; importing the file again would import those twice.` : ''}`
      );
      setProgress({ ...state });
    } finally {
      setBusy(false);
    }
  }

  function pick(selected: File | null | undefined) {
    if (!selected) return;
    setFile(selected);
    setProgress(null);
    setError(null);
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-4">
        <h2 className="text-base font-bold tracking-tight text-neutral-900 dark:text-white">Upload a file</h2>
        <p className="text-xs text-neutral-500 dark:text-slate-400">
          The file is read in your browser and sent in batches of up to 500 events. Keep this tab open until it finishes.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files?.[0]);
          }}
          disabled={busy}
          className={`flex min-h-[120px] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
            dragging
              ? 'border-blue-500 bg-blue-50/50 dark:border-cyan-400 dark:bg-cyan-500/5'
              : 'border-neutral-300 hover:border-neutral-400 dark:border-slate-700 dark:hover:border-slate-600'
          }`}
        >
          {file ? (
            <>
              <span className="break-all text-sm font-semibold text-neutral-900 dark:text-white">{file.name}</span>
              <span className="text-xs text-neutral-500 dark:text-slate-400">{formatBytes(file.size)} · click to choose another file</span>
            </>
          ) : (
            <>
              <span className="text-sm font-semibold text-neutral-900 dark:text-white">Drop a file here or click to choose</span>
              <span className="text-xs text-neutral-500 dark:text-slate-400">.jsonl, .json, .ndjson or .gz</span>
            </>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".json,.jsonl,.ndjson,.gz,application/json,application/gzip"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />

        <div className="flex flex-col gap-3">
          <label className="grid gap-1 text-xs font-semibold text-neutral-700 dark:text-slate-300">
            Format
            <select
              value={formatChoice}
              onChange={(e) => setFormatChoice(e.target.value as 'auto' | ImportFormat)}
              disabled={busy}
              className={inputClass}
            >
              <option value="auto">Detect automatically</option>
              <option value="posthog">PostHog</option>
              <option value="traceiq">TraceIQ</option>
            </select>
          </label>
          {busy ? (
            <button type="button" onClick={() => (stopRef.current = true)} className={secondaryButton}>
              Stop
            </button>
          ) : (
            <button type="button" onClick={runImport} disabled={!file} className={primaryButton}>
              Import file
            </button>
          )}
        </div>
      </div>

      {error ? <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{error}</p> : null}

      {progress ? (
        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-neutral-600 dark:text-slate-400">
            <span>
              <strong className="text-neutral-900 dark:text-white">{progress.imported.toLocaleString()}</strong> imported
            </span>
            <span>{progress.read.toLocaleString()} read</span>
            <span>{progress.skipped.toLocaleString()} skipped</span>
            {progress.rejected > 0 ? <span className="text-red-600 dark:text-red-400">{progress.rejected.toLocaleString()} rejected</span> : null}
            {progress.format ? <span>Format: {progress.format === 'posthog' ? 'PostHog' : 'TraceIQ'}</span> : null}
            <span className="font-semibold">
              {busy ? 'Importing…' : progress.done ? 'Done' : progress.stopped ? 'Stopped' : ''}
            </span>
          </div>
          {busy ? <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800"><div className="h-full w-1/3 animate-pulse rounded-full bg-blue-600 dark:bg-cyan-400" /></div> : null}
          <SkippedList skipped={progress.skippedEvents} />
          {progress.errors.length > 0 ? (
            <ul className="space-y-1 text-xs text-red-600 dark:text-red-400">
              {progress.errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

// ─── PostHog ────────────────────────────────────────────────────────────────

function PostHogSection({
  api,
  projectId,
  projectQuery,
  initialJobs
}: {
  api: Api;
  projectId?: string | null;
  projectQuery: string;
  initialJobs: ImportJob[];
}) {
  const [tab, setTab] = useState<'dashboard' | 'cli'>('dashboard');
  const [jobs, setJobs] = useState<ImportJob[]>(initialJobs);
  const [host, setHost] = useState<'us' | 'eu' | 'custom'>('us');
  const [customHost, setCustomHost] = useState('');
  const [posthogProjectId, setPosthogProjectId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [since, setSince] = useState(() => toDateInput(new Date(Date.now() - 30 * 86_400_000)));
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState<'check' | 'start' | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const active = jobs.some((job) => job.status === 'running' || job.status === 'cancelling');

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ jobs: ImportJob[] }>(`/v1/dashboard/import/jobs${projectQuery}`);
      setJobs(data.jobs);
    } catch {
      // keep the last known state
    }
  }, [api, projectQuery]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [active, refresh]);

  const body = () => ({
    projectId,
    host: host === 'custom' ? customHost : host,
    posthogProjectId,
    apiKey,
    since,
    until: until || undefined
  });

  async function check() {
    setBusy('check');
    setMessage(null);
    try {
      await api('/v1/dashboard/import/posthog/check', { method: 'POST', body: JSON.stringify(body()) });
      setMessage({ tone: 'ok', text: 'Connected. The key can read and create exports for this PostHog project.' });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Check failed.' });
    } finally {
      setBusy(null);
    }
  }

  async function start() {
    setBusy('start');
    setMessage(null);
    try {
      await api('/v1/dashboard/import/posthog', { method: 'POST', body: JSON.stringify(body()) });
      setApiKey('');
      setMessage({ tone: 'ok', text: 'Import started. It keeps running if you leave this page.' });
      await refresh();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not start the import.' });
    } finally {
      setBusy(null);
    }
  }

  async function cancel(job: ImportJob) {
    try {
      await api(`/v1/dashboard/import/jobs/${encodeURIComponent(job.id)}/cancel${projectQuery}`, { method: 'POST' });
    } finally {
      await refresh();
    }
  }

  function resume(job: ImportJob) {
    setTab('dashboard');
    setSince((job.completedThrough ?? job.rangeStart).slice(0, 10));
    setUntil(job.rangeEnd.slice(0, 10));
    setPosthogProjectId(job.sourceProject);
    if (job.sourceHost === 'https://us.posthog.com') setHost('us');
    else if (job.sourceHost === 'https://eu.posthog.com') setHost('eu');
    else {
      setHost('custom');
      setCustomHost(job.sourceHost);
    }
    setMessage({ tone: 'ok', text: 'Form filled in from where the import stopped. Paste your PostHog key to continue.' });
  }

  const ready = posthogProjectId.trim() && apiKey.trim() && since && (host !== 'custom' || customHost.trim());
  const cliHost = host === 'custom' ? customHost || 'https://posthog.example.com' : host;

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-base font-bold tracking-tight text-neutral-900 dark:text-white">Import from PostHog</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-neutral-500 dark:text-slate-400">
            TraceIQ pulls your events straight from PostHog with your PostHog API key: no export to download. Or upload a
            file you already exported above.
          </p>
        </div>
        <div className="inline-flex shrink-0 rounded-lg border border-neutral-200 p-0.5 text-xs font-semibold dark:border-slate-800">
          {(['dashboard', 'cli'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-md px-3 py-1.5 transition ${
                tab === key ? 'bg-neutral-900 text-white dark:bg-white dark:text-black' : 'text-neutral-600 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {key === 'dashboard' ? 'In the dashboard' : 'With the CLI'}
            </button>
          ))}
        </div>
      </div>

      <ol className="mt-5 grid gap-3 text-xs leading-relaxed text-neutral-600 dark:text-slate-400 md:grid-cols-3">
        <Step n={1}>
          In PostHog, go to <strong>Settings → Personal API keys</strong> and create a key with the{' '}
          <Mono>batch_export:read</Mono> and <Mono>batch_export:write</Mono> scopes.
        </Step>
        <Step n={2}>
          Find your PostHog project ID: the number after <Mono>/project/</Mono> in your PostHog URL. Note whether you use
          US or EU cloud.
        </Step>
        <Step n={3}>
          Pick how far back to go. TraceIQ asks PostHog for one export per week, downloads it and imports it.
        </Step>
      </ol>

      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
        PostHog bills these exports per exported row. Events TraceIQ would skip anyway ($autocapture,
        $feature_flag_called and other PostHog-internal events) are left out of the export. Try a short range first.
      </div>

      {tab === 'dashboard' ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className={labelClass}>
            PostHog region
            <select value={host} onChange={(e) => setHost(e.target.value as 'us' | 'eu' | 'custom')} className={inputClass}>
              <option value="us">US cloud (us.posthog.com)</option>
              <option value="eu">EU cloud (eu.posthog.com)</option>
              <option value="custom">Self-hosted</option>
            </select>
          </label>
          <label className={labelClass}>
            PostHog project ID
            <input value={posthogProjectId} onChange={(e) => setPosthogProjectId(e.target.value)} inputMode="numeric" placeholder="12345" className={inputClass} />
          </label>
          {host === 'custom' ? (
            <label className={`${labelClass} md:col-span-2`}>
              PostHog URL
              <input value={customHost} onChange={(e) => setCustomHost(e.target.value)} placeholder="https://posthog.example.com" className={inputClass} />
            </label>
          ) : null}
          <label className={`${labelClass} md:col-span-2`}>
            Personal API key
            <input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="phx_..."
              className={inputClass}
            />
            <span className="font-normal text-neutral-400 dark:text-slate-500">Used only while the import runs. It is never stored.</span>
          </label>
          <label className={labelClass}>
            From (UTC)
            <input type="date" value={since} onChange={(e) => setSince(e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            To (UTC)
            <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={inputClass} />
            <span className="font-normal text-neutral-400 dark:text-slate-500">Leave empty to import up to now.</span>
          </label>

          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <button type="button" onClick={check} disabled={!ready || busy !== null} className={secondaryButton}>
              {busy === 'check' ? 'Checking…' : 'Check connection'}
            </button>
            <button type="button" onClick={start} disabled={!ready || busy !== null || active} className={primaryButton}>
              {busy === 'start' ? 'Starting…' : 'Start import'}
            </button>
            {active ? <span className="text-xs text-neutral-500 dark:text-slate-400">An import is already running for this project.</span> : null}
          </div>
          {message ? (
            <p
              className={`md:col-span-2 rounded-md px-3 py-2 text-xs ${
                message.tone === 'ok'
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
                  : 'border border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300'
              }`}
            >
              {message.text}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-5 space-y-3 text-xs leading-relaxed text-neutral-600 dark:text-slate-400">
          <p>
            The CLI does the same thing from your terminal. Log in with a personal access token that has the{' '}
            <Mono>imports:write</Mono> scope (create one in{' '}
            <Link href="/dashboard/settings" className="font-semibold text-blue-600 hover:underline dark:text-cyan-400">
              Settings → Personal access tokens
            </Link>
            ).
          </p>
          <Snippet
            code={`npx traceiq-cli login
export POSTHOG_PERSONAL_API_KEY=phx_...

# Check the key and see the plan, without starting an export
npx traceiq-cli import posthog --project ${projectId ?? 'YOUR_PROJECT_ID'} \\
  --posthog-host ${cliHost} --posthog-project ${posthogProjectId || '12345'} --since ${since} --dry-run

# Import
npx traceiq-cli import posthog --project ${projectId ?? 'YOUR_PROJECT_ID'} \\
  --posthog-host ${cliHost} --posthog-project ${posthogProjectId || '12345'} --since ${since}`}
          />
          <p>Already have a PostHog export file? Import it from the terminal too:</p>
          <Snippet code={`npx traceiq-cli import posthog events.jsonl --project ${projectId ?? 'YOUR_PROJECT_ID'}`} />
          <p>
            If an import stops partway, the CLI prints the <Mono>--since</Mono> value to continue from.{' '}
            <Link href="/docs?page=migrate-posthog" className="font-semibold text-blue-600 hover:underline dark:text-cyan-400">
              Full migration guide →
            </Link>
          </p>
        </div>
      )}

      {jobs.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Recent PostHog imports</h3>
          <ul className="mt-3 divide-y divide-neutral-100 rounded-lg border border-neutral-200 dark:divide-slate-800 dark:border-slate-800">
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} onCancel={() => cancel(job)} onResume={() => resume(job)} />
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-5 text-xs text-neutral-500 dark:text-slate-400">
        Dashboards, funnels, cohorts and feature flags are definitions rather than events, so they aren’t imported.{' '}
        <Link href="/docs?page=migrate-posthog" className="font-semibold text-blue-600 hover:underline dark:text-cyan-400">
          See the PostHog migration guide
        </Link>{' '}
        for mapping SDK calls and recreating them.
      </p>
    </section>
  );
}

const STATUS_LABEL: Record<ImportJob['status'], { label: string; tone: string }> = {
  running: { label: 'Running', tone: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' },
  cancelling: { label: 'Cancelling', tone: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  cancelled: { label: 'Cancelled', tone: 'bg-neutral-100 text-neutral-600 dark:bg-slate-800 dark:text-slate-300' },
  completed: { label: 'Completed', tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  failed: { label: 'Failed', tone: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' },
  interrupted: { label: 'Interrupted', tone: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' }
};

function JobRow({ job, onCancel, onResume }: { job: ImportJob; onCancel: () => void; onResume: () => void }) {
  const status = STATUS_LABEL[job.status] ?? STATUS_LABEL.failed;
  const pct = job.windowsTotal > 0 ? Math.round((job.windowsDone / job.windowsTotal) * 100) : 0;
  const canResume = (job.status === 'failed' || job.status === 'interrupted' || job.status === 'cancelled') && job.completedThrough !== job.rangeEnd;

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${status.tone}`}>{status.label}</span>
          <span className="font-semibold text-neutral-900 dark:text-white">
            {job.rangeStart.slice(0, 10)} → {job.rangeEnd.slice(0, 10)}
          </span>
          <span className="text-neutral-400 dark:text-slate-500">
            {job.sourceHost.replace(/^https:\/\//, '')} · project {job.sourceProject}
          </span>
        </div>
        <div className="flex gap-2">
          {job.status === 'running' ? (
            <button type="button" onClick={onCancel} className="text-xs font-semibold text-red-600 hover:underline dark:text-red-400">
              Cancel
            </button>
          ) : null}
          {canResume ? (
            <button type="button" onClick={onResume} className="text-xs font-semibold text-blue-600 hover:underline dark:text-cyan-400">
              Continue from {(job.completedThrough ?? job.rangeStart).slice(0, 10)}
            </button>
          ) : null}
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
        <div className="h-full rounded-full bg-blue-600 transition-all dark:bg-cyan-400" style={{ width: `${job.status === 'completed' ? 100 : pct}%` }} />
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-500 dark:text-slate-400">
        <span>
          Week {Math.min(job.windowsDone + (job.status === 'running' ? 1 : 0), job.windowsTotal)} of {job.windowsTotal}
        </span>
        <span>
          <strong className="text-neutral-900 dark:text-white">{job.imported.toLocaleString()}</strong> imported
        </span>
        <span>{job.skipped.toLocaleString()} skipped</span>
        {job.rejected > 0 ? <span className="text-red-600 dark:text-red-400">{job.rejected.toLocaleString()} rejected</span> : null}
      </div>
      {job.error ? <p className="text-xs text-red-600 dark:text-red-400">{job.error}</p> : null}
      <SkippedList skipped={job.skippedEvents} />
    </li>
  );
}

// ─── Small pieces ───────────────────────────────────────────────────────────

function SkippedList({ skipped }: { skipped: Record<string, number> }) {
  const entries = Object.entries(skipped).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  return (
    <details className="text-xs text-neutral-500 dark:text-slate-400">
      <summary className="cursor-pointer select-none">Skipped events with no TraceIQ equivalent</summary>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
        {entries.slice(0, 20).map(([name, count]) => (
          <li key={name} className="flex justify-between gap-3 rounded bg-neutral-50 px-2 py-1 font-mono dark:bg-slate-900">
            <span className="truncate">{name}</span>
            <span>{count.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Check({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <svg className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 6L9 17l-5-5" />
      </svg>
      {children}
    </li>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 rounded-lg bg-neutral-50 p-3 dark:bg-slate-900/60">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[10px] font-bold text-white dark:bg-white dark:text-black">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[11px] text-neutral-800 dark:bg-slate-800 dark:text-slate-200">{children}</code>;
}

function Snippet({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg bg-neutral-950 p-4 pr-16 font-mono text-xs text-neutral-200 dark:bg-slate-900">{code}</pre>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="absolute right-2 top-2 rounded border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[11px] font-semibold text-neutral-200 hover:bg-neutral-800"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(', ');
    return body.message ?? `Request failed with ${response.status}`;
  } catch {
    return `Request failed with ${response.status}`;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const labelClass = 'grid gap-1 text-xs font-semibold text-neutral-700 dark:text-slate-300';
const inputClass =
  'h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm font-normal text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-white dark:focus:ring-white/10';
const primaryButton =
  'inline-flex h-10 items-center justify-center rounded-lg bg-neutral-900 px-5 text-sm font-bold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-slate-200';
const secondaryButton =
  'inline-flex h-10 items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';
