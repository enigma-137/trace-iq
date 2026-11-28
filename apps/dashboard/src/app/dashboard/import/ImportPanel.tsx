'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Upload04Icon from '@hugeicons/core-free-icons/Upload04Icon';
import CloudDownloadIcon from '@hugeicons/core-free-icons/CloudDownloadIcon';
import { DashboardDialog } from '@/app/dashboard/DashboardDialog';
import { ActionCard, HelpTip, Notice, buttonClass, fieldClass } from '@/components/dashboard/CalmUI';
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

type Api = <T>(path: string, init?: RequestInit) => Promise<T>;

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
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950 dark:text-white">Import events</h1>
          <HelpTip label="What importing keeps">
            <ul className="space-y-1.5">
              <li>Original timestamps, users and sessions are kept, so trends, funnels and retention cover the time before TraceIQ.</li>
              <li>Webhooks are not triggered for imported events.</li>
              <li>Imported events count toward your monthly events.</li>
              <li>Only owners and admins can import.</li>
            </ul>
          </HelpTip>
        </div>
        <p className="text-sm text-neutral-500 dark:text-slate-400">
          Bring your history with you{projectName ? (
            <>
              {' '}into <span className="font-semibold text-blue-600 dark:text-blue-400">{projectName}</span>
            </>
          ) : null}
          .
        </p>
      </header>

      <PostHogAndFile api={api} projectId={projectId} projectQuery={projectQuery} initialJobs={initialJobs} />
    </div>
  );
}

// ─── Layout: the two ways in, then the history ──────────────────────────────

function PostHogAndFile({
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
  const posthog = usePostHogImport(api, projectId, projectQuery, initialJobs);

  return (
    <>
      <div className="grid gap-5 md:grid-cols-2">
        <FileImportCard api={api} projectId={projectId} />

        <ActionCard
          icon={CloudDownloadIcon}
          tone="orange"
          title="Import from PostHog"
          description="Pull events straight from PostHog with an API key. Nothing to download."
          helpLabel="How the PostHog import works"
          help={
            <div className="space-y-2">
              <p>TraceIQ asks PostHog for one export per week of your range, downloads it on the server and imports it. It keeps running if you leave the page.</p>
              <p>PostHog bills exports per exported row, so try a short range first. PostHog-internal events TraceIQ would skip anyway are left out of the export.</p>
            </div>
          }
        >
          <button type="button" onClick={() => posthog.openForm()} className={buttonClass.orange}>
            Connect PostHog
          </button>
          <button type="button" onClick={() => posthog.setCliOpen(true)} className={buttonClass.link}>
            Use the CLI instead
          </button>
        </ActionCard>
      </div>

      <ImportHistory jobs={posthog.jobs} onCancel={posthog.cancel} onResume={posthog.resume} />

      <PostHogFormDialog posthog={posthog} />
      <PostHogCliDialog posthog={posthog} projectId={projectId} />
    </>
  );
}

// ─── File upload ────────────────────────────────────────────────────────────

function FileImportCard({ api, projectId }: { api: Api; projectId?: string | null }) {
  const [open, setOpen] = useState(false);
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

  const statusLine = progress
    ? busy
      ? `Importing… ${progress.imported.toLocaleString()} imported so far`
      : progress.done
        ? `Last file: ${progress.imported.toLocaleString()} events imported`
        : progress.stopped
          ? `Stopped after ${progress.imported.toLocaleString()} events`
          : null
    : null;

  return (
    <>
      <ActionCard
        icon={Upload04Icon}
        tone="blue"
        title="Upload a file"
        description="A PostHog or TraceIQ export: .jsonl, .json or .gz."
        helpLabel="Supported file formats"
        help={<FormatsHelp />}
      >
        <button type="button" onClick={() => setOpen(true)} className={buttonClass.blue}>
          {busy ? 'View progress' : 'Choose a file'}
        </button>
        {statusLine ? <span className="text-xs text-neutral-500 dark:text-slate-400">{statusLine}</span> : null}
      </ActionCard>

      <DashboardDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Upload a file"
        description="Read in your browser and sent in batches of 500 events. Keep this tab open until it finishes."
        maxWidthClass="max-w-xl"
      >
        <div className="space-y-4">
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
            className={`flex min-h-[140px] w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
              dragging
                ? 'border-blue-600 bg-blue-50 dark:border-blue-400 dark:bg-blue-500/10'
                : 'border-neutral-200 hover:border-blue-600 hover:bg-blue-50/40 dark:border-slate-700 dark:hover:border-blue-400 dark:hover:bg-blue-500/5'
            }`}
          >
            {file ? (
              <>
                <span className="break-all text-sm font-semibold text-neutral-900 dark:text-white">{file.name}</span>
                <span className="text-xs text-neutral-500 dark:text-slate-400">{formatBytes(file.size)} · click to choose another</span>
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

          <label className={fieldClass.label}>
            <span className="flex items-center gap-1.5">
              Format
              <HelpTip label="Supported file formats">
                <FormatsHelp />
              </HelpTip>
            </span>
            <select
              value={formatChoice}
              onChange={(e) => setFormatChoice(e.target.value as 'auto' | ImportFormat)}
              disabled={busy}
              className={fieldClass.input}
            >
              <option value="auto">Detect automatically</option>
              <option value="posthog">PostHog</option>
              <option value="traceiq">TraceIQ</option>
            </select>
          </label>

          {error ? <Notice tone="error">{error}</Notice> : null}

          {progress ? (
            <div className="space-y-3 rounded-xl bg-neutral-50 p-4 dark:bg-slate-900/60">
              <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-xs text-neutral-500 dark:text-slate-400">
                <span>
                  <strong className="text-base font-semibold text-neutral-900 dark:text-white">{progress.imported.toLocaleString()}</strong> imported
                </span>
                <span>{progress.read.toLocaleString()} read</span>
                <span>{progress.skipped.toLocaleString()} skipped</span>
                {progress.rejected > 0 ? <span className="text-red-600 dark:text-red-400">{progress.rejected.toLocaleString()} rejected</span> : null}
                {progress.format ? <span>{progress.format === 'posthog' ? 'PostHog' : 'TraceIQ'} format</span> : null}
                <span className="font-semibold text-neutral-700 dark:text-slate-200">
                  {busy ? 'Importing…' : progress.done ? 'Done' : progress.stopped ? 'Stopped' : ''}
                </span>
              </div>
              {busy ? (
                <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-slate-800">
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-600" />
                </div>
              ) : null}
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

          <div className="flex justify-end gap-3 pt-1">
            {busy ? (
              <button type="button" onClick={() => (stopRef.current = true)} className={buttonClass.quiet}>
                Stop
              </button>
            ) : (
              <>
                <button type="button" onClick={() => setOpen(false)} className={buttonClass.quiet}>
                  Close
                </button>
                <button type="button" onClick={runImport} disabled={!file} className={buttonClass.blue}>
                  Import file
                </button>
              </>
            )}
          </div>
        </div>
      </DashboardDialog>
    </>
  );
}

function FormatsHelp() {
  return (
    <div className="space-y-2.5">
      <p>The format is detected from the file.</p>
      <p>
        <strong className="text-neutral-900 dark:text-white">PostHog events</strong>: JSON Lines from a PostHog export (gzipped or not), a JSON array, or a saved API response with a <Mono>results</Mono> array.
      </p>
      <p>
        <strong className="text-neutral-900 dark:text-white">TraceIQ export</strong>: a file from the Export page of any TraceIQ project, self-hosted included.
      </p>
      <p>
        <strong className="text-neutral-900 dark:text-white">TraceIQ events</strong>: events shaped like the SDKs send them (<Mono>eventName</Mono>, <Mono>timestamp</Mono>, <Mono>userId</Mono>, <Mono>properties</Mono>), one per line or as an array.
      </p>
      <p>CSV is not supported, because it can’t carry nested event properties.</p>
    </div>
  );
}

// ─── PostHog ────────────────────────────────────────────────────────────────

function usePostHogImport(api: Api, projectId: string | null | undefined, projectQuery: string, initialJobs: ImportJob[]) {
  const [formOpen, setFormOpen] = useState(false);
  const [cliOpen, setCliOpen] = useState(false);
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
      setMessage(null);
      setFormOpen(false);
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
    setSince((job.completedThrough ?? job.rangeStart).slice(0, 10));
    setUntil(job.rangeEnd.slice(0, 10));
    setPosthogProjectId(job.sourceProject);
    if (job.sourceHost === 'https://us.posthog.com') setHost('us');
    else if (job.sourceHost === 'https://eu.posthog.com') setHost('eu');
    else {
      setHost('custom');
      setCustomHost(job.sourceHost);
    }
    setMessage({ tone: 'ok', text: 'Filled in from where the import stopped. Paste your PostHog key to continue.' });
    setFormOpen(true);
  }

  function openForm() {
    setMessage(null);
    setFormOpen(true);
  }

  const ready = Boolean(posthogProjectId.trim() && apiKey.trim() && since && (host !== 'custom' || customHost.trim()));

  return {
    jobs,
    active,
    formOpen,
    setFormOpen,
    cliOpen,
    setCliOpen,
    openForm,
    host,
    setHost,
    customHost,
    setCustomHost,
    posthogProjectId,
    setPosthogProjectId,
    apiKey,
    setApiKey,
    since,
    setSince,
    until,
    setUntil,
    busy,
    message,
    ready,
    check,
    start,
    cancel,
    resume
  };
}

type PostHogImport = ReturnType<typeof usePostHogImport>;

function PostHogFormDialog({ posthog }: { posthog: PostHogImport }) {
  const p = posthog;
  return (
    <DashboardDialog
      open={p.formOpen}
      onClose={() => p.setFormOpen(false)}
      title="Import from PostHog"
      description="Your key is used only while the import runs. It is never stored."
      maxWidthClass="max-w-xl"
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={fieldClass.label}>
            PostHog region
            <select value={p.host} onChange={(e) => p.setHost(e.target.value as 'us' | 'eu' | 'custom')} className={fieldClass.input}>
              <option value="us">US cloud</option>
              <option value="eu">EU cloud</option>
              <option value="custom">Self-hosted</option>
            </select>
          </label>
          <label className={fieldClass.label}>
            <span className="flex items-center gap-1.5">
              PostHog project ID
              <HelpTip label="Where to find the PostHog project ID" align="end">
                The number after <Mono>/project/</Mono> in your PostHog URL, for example <Mono>us.posthog.com/project/12345</Mono>.
              </HelpTip>
            </span>
            <input value={p.posthogProjectId} onChange={(e) => p.setPosthogProjectId(e.target.value)} inputMode="numeric" placeholder="12345" className={fieldClass.input} />
          </label>
          {p.host === 'custom' ? (
            <label className={`${fieldClass.label} sm:col-span-2`}>
              PostHog URL
              <input value={p.customHost} onChange={(e) => p.setCustomHost(e.target.value)} placeholder="https://posthog.example.com" className={fieldClass.input} />
            </label>
          ) : null}
          <label className={`${fieldClass.label} sm:col-span-2`}>
            <span className="flex items-center gap-1.5">
              Personal API key
              <HelpTip label="How to create a PostHog API key">
                In PostHog, open <strong>Settings → Personal API keys</strong> and create a key with the <Mono>batch_export:read</Mono> and{' '}
                <Mono>batch_export:write</Mono> scopes.
              </HelpTip>
            </span>
            <input type="password" autoComplete="off" value={p.apiKey} onChange={(e) => p.setApiKey(e.target.value)} placeholder="phx_..." className={fieldClass.input} />
          </label>
          <label className={fieldClass.label}>
            From (UTC)
            <input type="date" value={p.since} onChange={(e) => p.setSince(e.target.value)} className={fieldClass.input} />
          </label>
          <label className={fieldClass.label}>
            <span className="flex items-center gap-1.5">
              To (UTC)
              <HelpTip label="About the end date" align="end">
                Leave it empty to import up to now.
              </HelpTip>
            </span>
            <input type="date" value={p.until} onChange={(e) => p.setUntil(e.target.value)} className={fieldClass.input} />
          </label>
        </div>

        <Notice tone="warn">PostHog bills exports per row. Try a short range first.</Notice>
        {p.active ? <Notice tone="warn">An import is already running for this project. Wait for it to finish or cancel it.</Notice> : null}
        {p.message ? <Notice tone={p.message.tone}>{p.message.text}</Notice> : null}

        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
          <button type="button" onClick={p.check} disabled={!p.ready || p.busy !== null} className={buttonClass.quiet}>
            {p.busy === 'check' ? 'Checking…' : 'Check connection'}
          </button>
          <button type="button" onClick={p.start} disabled={!p.ready || p.busy !== null || p.active} className={buttonClass.orange}>
            {p.busy === 'start' ? 'Starting…' : 'Start import'}
          </button>
        </div>
      </div>
    </DashboardDialog>
  );
}

function PostHogCliDialog({ posthog, projectId }: { posthog: PostHogImport; projectId?: string | null }) {
  const p = posthog;
  const cliHost = p.host === 'custom' ? p.customHost || 'https://posthog.example.com' : p.host;
  const project = projectId ?? 'YOUR_PROJECT_ID';
  return (
    <DashboardDialog
      open={p.cliOpen}
      onClose={() => p.setCliOpen(false)}
      title="Import from PostHog with the CLI"
      description="The same import, run from your terminal."
      maxWidthClass="max-w-2xl"
    >
      <div className="space-y-4 text-sm text-neutral-600 dark:text-slate-400">
        <p className="flex flex-wrap items-center gap-1.5">
          Log in with a personal access token that has the <Mono>imports:write</Mono> scope.
          <HelpTip label="Where to create a personal access token">
            Create one in{' '}
            <Link href="/dashboard/settings" className={buttonClass.link}>
              Settings → Personal access tokens
            </Link>
            .
          </HelpTip>
        </p>
        <Snippet
          code={`npx traceiq-cli login
export POSTHOG_PERSONAL_API_KEY=phx_...

# Check the key and see the plan, without starting an export
npx traceiq-cli import posthog --project ${project} \\
  --posthog-host ${cliHost} --posthog-project ${p.posthogProjectId || '12345'} --since ${p.since} --dry-run

# Import
npx traceiq-cli import posthog --project ${project} \\
  --posthog-host ${cliHost} --posthog-project ${p.posthogProjectId || '12345'} --since ${p.since}`}
        />
        <p>Already have a PostHog export file?</p>
        <Snippet code={`npx traceiq-cli import posthog events.jsonl --project ${project}`} />
        <p className="text-xs">
          If an import stops partway, the CLI prints the <Mono>--since</Mono> value to continue from.{' '}
          <Link href="/docs?page=migrate-posthog" className={buttonClass.link}>
            Full migration guide →
          </Link>
        </p>
      </div>
    </DashboardDialog>
  );
}

// ─── History ────────────────────────────────────────────────────────────────

function ImportHistory({ jobs, onCancel, onResume }: { jobs: ImportJob[]; onCancel: (job: ImportJob) => void; onResume: (job: ImportJob) => void }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-white">PostHog imports</h2>
        <HelpTip label="What is not imported">
          Dashboards, funnels, cohorts and feature flags are definitions rather than events, so they aren’t imported.{' '}
          <Link href="/docs?page=migrate-posthog" className={buttonClass.link}>
            The migration guide
          </Link>{' '}
          shows how to recreate them.
        </HelpTip>
      </div>
      {jobs.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-200 px-6 py-8 text-center text-sm text-neutral-500 dark:border-slate-800 dark:text-slate-400">
          No PostHog imports yet. They show up here with their progress.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} onCancel={() => onCancel(job)} onResume={() => onResume(job)} />
          ))}
        </ul>
      )}
    </section>
  );
}

const STATUS_LABEL: Record<ImportJob['status'], { label: string; tone: string }> = {
  running: { label: 'Running', tone: 'bg-blue-600 text-white' },
  cancelling: { label: 'Cancelling', tone: 'bg-orange-500 text-white' },
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
    <li className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2.5 text-sm">
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${status.tone}`}>{status.label}</span>
          <span className="font-semibold text-neutral-900 dark:text-white">
            {job.rangeStart.slice(0, 10)} → {job.rangeEnd.slice(0, 10)}
          </span>
          <span className="text-xs text-neutral-400 dark:text-slate-500">
            {job.sourceHost.replace(/^https:\/\//, '')} · project {job.sourceProject}
          </span>
        </div>
        <div className="flex gap-3">
          {job.status === 'running' ? (
            <button type="button" onClick={onCancel} className="text-xs font-semibold text-red-600 hover:underline dark:text-red-400">
              Cancel
            </button>
          ) : null}
          {canResume ? (
            <button type="button" onClick={onResume} className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">
              Continue from {(job.completedThrough ?? job.rangeStart).slice(0, 10)}
            </button>
          ) : null}
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
        <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${job.status === 'completed' ? 100 : pct}%` }} />
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

function Mono({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[11px] text-neutral-800 dark:bg-slate-800 dark:text-slate-200">{children}</code>;
}

function Snippet({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-xl bg-neutral-950 p-4 pr-16 font-mono text-xs text-neutral-200 dark:bg-slate-900">{code}</pre>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="absolute right-2 top-2 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[11px] font-semibold text-neutral-200 hover:bg-neutral-800"
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
