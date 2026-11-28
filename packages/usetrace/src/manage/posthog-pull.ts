import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { POSTHOG_SKIPPED_EVENTS, PostHogEvent, readJsonLines } from './posthog-import.js';

/**
 * Pulls events straight from a PostHog project with PostHog "file download
 * exports" (POST /api/projects/:id/file_download_batch_exports/), the export
 * route PostHog supports for one-off bulk copies. Their /query endpoint is not:
 * PostHog rejects or rate-limits connectors built on it.
 *
 * Each export covers at most one week, so a longer range is pulled one week at a
 * time: start the export, poll until it completes, download its JSON Lines files
 * and stream the events out. PostHog bills these exports per exported row, so
 * events we would skip anyway are excluded on PostHog's side.
 */

export const POSTHOG_MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface PostHogWindow {
  start: Date;
  end: Date;
}

export interface PostHogPullOptions {
  host: string;
  projectId: string;
  apiKey: string;
  fetchImpl: typeof fetch;
  /** Resolves false when the user interrupts (Ctrl+C). */
  sleep: (ms: number) => Promise<boolean>;
  pollIntervalMs?: number;
  onStatus?: (message: string) => void;
}

export type PulledRow =
  | { line: number; event?: PostHogEvent; error?: string; windowDone?: undefined }
  | { windowDone: PostHogWindow; line?: undefined; event?: undefined; error?: undefined };

export class PostHogPullError extends Error {
  constructor(message: string, readonly hint?: string) {
    super(message);
    this.name = 'PostHogPullError';
  }
}

const HOST_ALIASES: Record<string, string> = {
  us: 'https://us.posthog.com',
  eu: 'https://eu.posthog.com',
  'app.posthog.com': 'https://us.posthog.com',
  'us.i.posthog.com': 'https://us.posthog.com',
  'eu.i.posthog.com': 'https://eu.posthog.com'
};

/** Accepts "us", "eu", a bare host or a full URL. Ingestion hosts map to their app host. */
export function normalizePostHogHost(value: string | undefined): string {
  const raw = (value ?? 'us').trim().replace(/\/+$/, '');
  const alias = HOST_ALIASES[raw.toLowerCase()] ?? HOST_ALIASES[raw.toLowerCase().replace(/^https?:\/\//, '')];
  if (alias) return alias;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

/** Splits [since, until) into windows of at most one week. */
export function planWindows(since: Date, until: Date): PostHogWindow[] {
  const windows: PostHogWindow[] = [];
  for (let start = since.getTime(); start < until.getTime(); start += POSTHOG_MAX_WINDOW_MS) {
    windows.push({ start: new Date(start), end: new Date(Math.min(start + POSTHOG_MAX_WINDOW_MS, until.getTime())) });
  }
  return windows;
}

function exportsUrl(options: PostHogPullOptions, suffix = ''): string {
  return `${options.host}/api/projects/${encodeURIComponent(options.projectId)}/file_download_batch_exports/${suffix}`;
}

async function errorDetail(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  try {
    const body = JSON.parse(text) as { detail?: unknown; code?: unknown };
    if (body.detail) return String(body.detail);
  } catch {
    // not JSON
  }
  return text.slice(0, 300) || response.statusText;
}

async function failFor(response: Response, action: string): Promise<never> {
  const detail = await errorDetail(response);
  if (response.status === 401) {
    throw new PostHogPullError(`PostHog rejected the API key while ${action}: ${detail}`, 'Use a personal API key (phx_...) from PostHog → Settings → Personal API keys.');
  }
  if (response.status === 403) {
    throw new PostHogPullError(
      `The PostHog key cannot ${action}: ${detail}`,
      'Give the personal API key the batch_export:read and batch_export:write scopes, and access to this project.'
    );
  }
  if (response.status === 404) {
    throw new PostHogPullError(`PostHog returned 404 while ${action}.`, 'Check --posthog-project (the numeric project ID in your PostHog URL) and --posthog-host (us, eu or your self-hosted URL).');
  }
  throw new PostHogPullError(`PostHog returned HTTP ${response.status} while ${action}: ${detail}`);
}

/**
 * Sends a PostHog API request, waiting and retrying on 429 (e.g. the limit of
 * 20 concurrent exports per project) and 5xx.
 */
async function request(options: PostHogPullOptions, url: string, init: RequestInit, action: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    let response: Response;
    try {
      response = await options.fetchImpl(url, {
        ...init,
        headers: { Authorization: `Bearer ${options.apiKey}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) }
      });
    } catch (error) {
      if (attempt >= 5) throw new PostHogPullError(`Could not reach ${options.host}: ${error instanceof Error ? error.message : String(error)}`);
      if (!(await options.sleep(1000 * 2 ** (attempt - 1)))) throw new PostHogPullError('Interrupted.');
      continue;
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 6) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** (attempt - 1);
      options.onStatus?.(`PostHog is busy (HTTP ${response.status}), retrying in ${Math.round(waitMs / 1000)}s`);
      if (!(await options.sleep(waitMs))) throw new PostHogPullError('Interrupted.');
      continue;
    }
    if (!response.ok && !(init.redirect === 'manual' && response.status >= 300 && response.status < 400)) {
      return failFor(response, action);
    }
    return response;
  }
}

/** Checks the key, host and project without starting (and paying for) an export. */
export async function checkPostHogAccess(options: PostHogPullOptions): Promise<void> {
  await request(options, exportsUrl(options), { method: 'GET' }, 'list exports');
}

async function startExport(options: PostHogPullOptions, window: PostHogWindow): Promise<string> {
  const response = await request(
    options,
    exportsUrl(options),
    {
      method: 'POST',
      body: JSON.stringify({
        model: 'events',
        data_interval_start: window.start.toISOString(),
        data_interval_end: window.end.toISOString(),
        exclude: POSTHOG_SKIPPED_EVENTS,
        file: { format: 'JSONLines' }
      })
    },
    'start an export'
  );
  const body = (await response.json()) as { id?: string };
  if (!body.id) throw new PostHogPullError('PostHog did not return an export ID.');
  return body.id;
}

async function cancelExport(options: PostHogPullOptions, runId: string): Promise<void> {
  try {
    await options.fetchImpl(exportsUrl(options, `${runId}/cancel/`), { method: 'POST', headers: { Authorization: `Bearer ${options.apiKey}` } });
  } catch {
    // best effort
  }
}

async function waitForExport(options: PostHogPullOptions, runId: string): Promise<string[]> {
  const interval = options.pollIntervalMs ?? 5000;
  for (;;) {
    const response = await request(options, exportsUrl(options, `${runId}/`), { method: 'GET' }, 'check the export');
    const body = (await response.json()) as { status?: string; files?: string[]; error?: string };
    switch (body.status) {
      case 'Completed':
        return body.files ?? [];
      case 'Cancelled':
        throw new PostHogPullError('The PostHog export was cancelled.');
      case 'FailedBilling':
        throw new PostHogPullError(`PostHog stopped the export for billing reasons: ${body.error ?? 'no details'}`, 'Check your PostHog billing or limits, then run the import again.');
      case 'Failed':
        throw new PostHogPullError(`The PostHog export failed: ${body.error ?? 'no details'}`);
    }
    if (!(await options.sleep(interval))) {
      await cancelExport(options, runId);
      throw new PostHogPullError('Interrupted.');
    }
  }
}

/**
 * Downloads one exported file. PostHog answers with a redirect to a temporary
 * signed URL that carries its own authentication; the API key is not sent there.
 */
async function downloadFile(options: PostHogPullOptions, runId: string, fileId: string): Promise<Readable> {
  let response = await request(options, exportsUrl(options, `${runId}/download/${encodeURIComponent(fileId)}/`), { method: 'GET', redirect: 'manual' }, 'download the export');
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location) throw new PostHogPullError('PostHog redirected the download without a location.');
    response = await options.fetchImpl(new URL(location, options.host).toString());
    if (!response.ok) throw new PostHogPullError(`Downloading the export file failed with HTTP ${response.status}.`);
  }
  if (!response.body) throw new PostHogPullError('The export file was empty.');
  return Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>);
}

/** Yields every event in [since, until), one week-long export at a time. */
export async function* pullPostHogEvents(options: PostHogPullOptions, windows: PostHogWindow[]): AsyncGenerator<PulledRow> {
  let line = 0;
  for (const [i, window] of windows.entries()) {
    const label = `${window.start.toISOString().slice(0, 10)} → ${window.end.toISOString().slice(0, 10)}`;
    options.onStatus?.(`Exporting week ${i + 1} of ${windows.length} from PostHog (${label})...`);
    const runId = await startExport(options, window);
    const files = await waitForExport(options, runId);
    for (const fileId of files) {
      const stream = await downloadFile(options, runId, fileId);
      for await (const row of readJsonLines(stream, line)) {
        line = row.line;
        yield row;
      }
    }
    yield { windowDone: window };
  }
}
