import { BadRequestException } from '@nestjs/common';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { createGunzip } from 'node:zlib';
import { assertDnsSafeUrl, fetchWithSafeRedirects } from '../../common/url';
import { POSTHOG_SKIPPED_EVENTS, PostHogEvent } from './posthog-mapper';

/**
 * Server-side client for PostHog "file download exports"
 * (POST /api/projects/:id/file_download_batch_exports/): PostHog's supported route for
 * one-off bulk exports. Their /query endpoint is not; PostHog rejects connectors built
 * on it. Each export covers at most one week. The host is user-supplied, so every
 * request is checked against private and reserved addresses first.
 */

export const POSTHOG_MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface PostHogConnection {
  host: string;
  projectId: string;
  apiKey: string;
}

export interface PostHogWindow {
  start: Date;
  end: Date;
}

export class PostHogError extends Error {}

const HOST_ALIASES: Record<string, string> = {
  us: 'https://us.posthog.com',
  eu: 'https://eu.posthog.com',
  'app.posthog.com': 'https://us.posthog.com',
  'us.i.posthog.com': 'https://us.posthog.com',
  'eu.i.posthog.com': 'https://eu.posthog.com'
};

export function normalizePostHogHost(value: unknown): string {
  const raw = (typeof value === 'string' && value.trim() ? value.trim() : 'us').replace(/\/+$/, '');
  const bare = raw.toLowerCase().replace(/^https?:\/\//, '');
  const alias = HOST_ALIASES[raw.toLowerCase()] ?? HOST_ALIASES[bare];
  if (alias) return alias;
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(url).origin;
  } catch {
    throw new BadRequestException('PostHog host is not a valid URL.');
  }
}

export function planWindows(since: Date, until: Date): PostHogWindow[] {
  const windows: PostHogWindow[] = [];
  for (let start = since.getTime(); start < until.getTime(); start += POSTHOG_MAX_WINDOW_MS) {
    windows.push({ start: new Date(start), end: new Date(Math.min(start + POSTHOG_MAX_WINDOW_MS, until.getTime())) });
  }
  return windows;
}

export class PostHogClient {
  constructor(
    private readonly connection: PostHogConnection,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly checkUrl: (url: string) => Promise<unknown> = (url) => assertDnsSafeUrl(url, 'PostHog host')
  ) {}

  private url(suffix = ''): string {
    return `${this.connection.host}/api/projects/${encodeURIComponent(this.connection.projectId)}/file_download_batch_exports/${suffix}`;
  }

  private async request(suffix: string, init: RequestInit, action: string): Promise<Response> {
    const url = this.url(suffix);
    for (let attempt = 1; ; attempt++) {
      await this.checkUrl(url);
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          ...init,
          redirect: 'manual',
          headers: { Authorization: `Bearer ${this.connection.apiKey}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) }
        });
      } catch (error) {
        if (attempt >= 5) throw new PostHogError(`Could not reach PostHog: ${error instanceof Error ? error.message : String(error)}`);
        await this.sleep(1000 * 2 ** (attempt - 1));
        continue;
      }
      if ((response.status === 429 || response.status >= 500) && attempt < 6) {
        const retryAfter = Number(response.headers.get('retry-after'));
        await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** (attempt - 1));
        continue;
      }
      if (response.ok || (response.status >= 300 && response.status < 400 && suffix.includes('/download/'))) return response;
      throw new PostHogError(await describeFailure(response, action));
    }
  }

  /** Validates key, scopes, host and project without starting (and paying for) an export. */
  async checkAccess(): Promise<void> {
    await this.request('', { method: 'GET' }, 'list exports');
  }

  async startExport(window: PostHogWindow): Promise<string> {
    const response = await this.request(
      '',
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
    if (!body.id) throw new PostHogError('PostHog did not return an export ID.');
    return body.id;
  }

  /** Returns the file IDs once complete, or null while running. */
  async exportStatus(runId: string): Promise<string[] | null> {
    const response = await this.request(`${encodeURIComponent(runId)}/`, { method: 'GET' }, 'check the export');
    const body = (await response.json()) as { status?: string; files?: string[]; error?: string };
    switch (body.status) {
      case 'Completed':
        return body.files ?? [];
      case 'Cancelled':
        throw new PostHogError('The export was cancelled in PostHog.');
      case 'FailedBilling':
        throw new PostHogError(`PostHog stopped the export for billing reasons: ${body.error ?? 'no details'}. Check your PostHog billing, then resume.`);
      case 'Failed':
        throw new PostHogError(`The PostHog export failed: ${body.error ?? 'no details'}`);
      default:
        return null;
    }
  }

  async cancelExport(runId: string): Promise<void> {
    try {
      await this.request(`${encodeURIComponent(runId)}/cancel/`, { method: 'POST' }, 'cancel the export');
    } catch {
      // best effort
    }
  }

  /**
   * Streams the events of one exported file. PostHog redirects to a temporary signed
   * URL that carries its own authentication; the API key is never sent there.
   */
  async *readFile(runId: string, fileId: string): AsyncGenerator<PostHogEvent | { error: string }> {
    let response = await this.request(`${encodeURIComponent(runId)}/download/${encodeURIComponent(fileId)}/`, { method: 'GET' }, 'download the export');
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new PostHogError('PostHog redirected the download without a location.');
      response = await fetchWithSafeRedirects(new URL(location, this.connection.host).toString(), {}, { field: 'PostHog download URL' });
      if (!response.ok) throw new PostHogError(`Downloading the export file failed with HTTP ${response.status}.`);
    }
    if (!response.body) return;
    yield* readJsonLines(Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>));
  }
}

async function describeFailure(response: Response, action: string): Promise<string> {
  const text = await response.text().catch(() => '');
  let detail = text.slice(0, 300) || response.statusText;
  try {
    const body = JSON.parse(text) as { detail?: unknown };
    if (body.detail) detail = String(body.detail);
  } catch {
    // not JSON
  }
  if (response.status === 401) return `PostHog rejected the API key: ${detail}. Use a personal API key (phx_...).`;
  if (response.status === 403) {
    return `The PostHog key cannot ${action}: ${detail}. Give it the batch_export:read and batch_export:write scopes and access to this project.`;
  }
  if (response.status === 404) return 'PostHog returned 404. Check the PostHog project ID (the number after /project/ in your PostHog URL) and the region.';
  return `PostHog returned HTTP ${response.status} while trying to ${action}: ${detail}`;
}

export async function* readJsonLines(stream: Readable): AsyncGenerator<PostHogEvent | { error: string }> {
  const iterator = stream[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (first.done) return;
  const head = Buffer.from(first.value as Uint8Array);
  async function* rest() {
    yield head;
    for (let next = await iterator.next(); !next.done; next = await iterator.next()) yield Buffer.from(next.value as Uint8Array);
  }
  const combined = Readable.from(rest());
  const input = head[0] === 0x1f && head[1] === 0x8b ? combined.pipe(createGunzip()) : combined;
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const text of lines) {
    const trimmed = text.trim();
    if (!trimmed) continue;
    try {
      yield JSON.parse(trimmed) as PostHogEvent;
    } catch {
      yield { error: 'not valid JSON' };
    }
  }
}
