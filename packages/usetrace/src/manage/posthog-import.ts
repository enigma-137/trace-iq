import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';

/**
 * Turns events from a PostHog export into TraceIQ ingestion events.
 *
 * Accepted input: JSON Lines (one event per line, as written by PostHog batch
 * exports), a JSON array of events, or a `{ "results": [...] }` API response.
 * Each event needs at least `event`, `distinct_id` and `timestamp`.
 */

export interface PostHogEvent {
  uuid?: string;
  event?: string;
  distinct_id?: string | number;
  timestamp?: string;
  properties?: Record<string, unknown> | string;
  [key: string]: unknown;
}

/** Same shape as one item of `POST /v1/events/batch`. */
export interface TraceIQImportEvent {
  eventName: string;
  userId?: string;
  anonymousId?: string;
  sessionId?: string;
  properties: Record<string, unknown>;
  deviceInfo?: Record<string, unknown>;
  context: Record<string, unknown>;
  timestamp: string;
}

export type MapResult = { event: TraceIQImportEvent } | { skipped: string };

/**
 * PostHog-internal events with no TraceIQ equivalent. Old `$exception` events are
 * skipped on purpose: importing them would reopen error issues and could fire
 * alerts or create Linear tickets for errors that are long gone.
 */
export const POSTHOG_SKIPPED_EVENTS = [
  '$autocapture',
  '$pageleave',
  '$feature_flag_called',
  '$web_vitals',
  '$rageclick',
  '$dead_click',
  '$copy_autocapture',
  '$groupidentify',
  '$exception',
  '$opt_in',
  '$snapshot',
  '$heatmap',
  '$feature_view',
  '$feature_interaction',
  'survey shown',
  'survey sent',
  'survey dismissed'
];

const SKIPPED_BY_DEFAULT = new Set(POSTHOG_SKIPPED_EVENTS);

const PLATFORMS: Record<string, string> = {
  web: 'web',
  'posthog-ios': 'ios',
  'posthog-android': 'android',
  'posthog-react-native': 'react-native',
  'posthog-flutter': 'flutter'
};

const UTM_KEYS =['source', 'medium', 'campaign', 'term', 'content'] as const;

function str(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/** Custom properties without PostHog's `$`-prefixed metadata (library, browser, geo, ...). */
function customProperties(props: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(props).filter(([key]) => !key.startsWith('$')));
}

function pageContext(props: Record<string, unknown>): Record<string, unknown> | undefined {
  const url = str(props.$current_url);
  let path = str(props.$pathname);
  let search: string | undefined;
  if (url) {
    try {
      const parsed = new URL(url);
      path = path ?? parsed.pathname;
      search = parsed.search || undefined;
    } catch {
      // Not an absolute URL (e.g. a mobile screen); keep what we have.
    }
  }
  const referrer = str(props.$referrer);
  const title = str(props.title) ?? str(props.$title);
  const utm = compact(Object.fromEntries(UTM_KEYS.map((key) => [key, str(props[`utm_${key}`])])));

  if (!url && !path && !referrer && !title && Object.keys(utm).length === 0) return undefined;
  return compact({
    url,
    path,
    search,
    referrer: referrer === '$direct' ? undefined : referrer,
    title,
    utm: Object.keys(utm).length > 0 ? utm : undefined
  });
}

function deviceInfo(props: Record<string, unknown>): Record<string, unknown> | undefined {
  const info = compact({
    platform: PLATFORMS[str(props.$lib) ?? ''],
    os: str(props.$os),
    osVersion: str(props.$os_version),
    deviceType: str(props.$device_type)?.toLowerCase(),
    browser: str(props.$browser),
    browserVersion: str(props.$browser_version),
    locale: str(props.$locale) ?? str(props.$browser_language)
  });
  return Object.keys(info).length > 0 ? info : undefined;
}

function normalizeTimestamp(value: unknown): string | undefined {
  const raw = str(value);
  if (!raw) return undefined;
  // PostHog exports sometimes use "2024-01-02 03:04:05.678" (no T, no zone): that is UTC.
  const iso = /^\d{4}-\d{2}-\d{2} \d/.test(raw) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? `${raw.replace(' ', 'T')}Z` : raw;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * Maps one PostHog event. Who the event belongs to: PostHog marks anonymous
 * events with `$is_identified: false`; those keep the distinct_id as an
 * anonymous ID. Everything else is attributed to the distinct_id as a user ID,
 * with `$device_id` / `$anon_distinct_id` as the anonymous ID so TraceIQ links
 * the earlier anonymous activity to the user.
 */
export function mapPostHogEvent(raw: PostHogEvent): MapResult {
  const name = str(raw.event);
  if (!name) return { skipped: '(missing event name)' };

  const distinctId = str(raw.distinct_id);
  if (!distinctId) return { skipped: '(missing distinct_id)' };

  const timestamp = normalizeTimestamp(raw.timestamp);
  if (!timestamp) return { skipped: '(missing or invalid timestamp)' };

  let props: Record<string, unknown>;
  if (typeof raw.properties === 'string') {
    try {
      props = obj(JSON.parse(raw.properties));
    } catch {
      props = {};
    }
  } else {
    props = obj(raw.properties);
  }

  const anonymous = props.$is_identified === false;
  const userId = anonymous ? undefined : distinctId;
  const linkedAnonymousId = str(props.$anon_distinct_id) ?? str(props.$device_id);
  const anonymousId = anonymous ? distinctId : linkedAnonymousId !== distinctId ? linkedAnonymousId : undefined;

  const page = pageContext(props);
  const context: Record<string, unknown> = compact({
    page,
    import: compact({ source: 'posthog', uuid: str(raw.uuid) })
  });

  const base = compact({
    userId,
    anonymousId,
    sessionId: str(props.$session_id),
    deviceInfo: deviceInfo(props),
    context,
    timestamp
  });

  switch (name) {
    case '$pageview':
      return {
        event: { ...base, eventName: '$page', properties: compact({ name: page?.title ?? page?.path, ...customProperties(props) }) }
      };
    case '$screen':
      return {
        event: { ...base, eventName: '$page', properties: compact({ name: str(props.$screen_name), ...customProperties(props) }) }
      };
    case '$identify':
    case '$set': {
      if (anonymous) return { skipped: name };
      const traits = { ...obj(props.$set_once), ...obj(props.$set) };
      return { event: { ...base, eventName: '$identify', properties: { traits } } };
    }
    case '$create_alias': {
      const previousId = str(props.alias);
      if (!previousId || previousId === distinctId) return { skipped: name };
      return {
        event: { ...base, userId: distinctId, anonymousId: undefined, eventName: '$alias', properties: { previousId } }
      };
    }
  }

  if (SKIPPED_BY_DEFAULT.has(name) || name.startsWith('$')) return { skipped: name };

  return { event: { ...base, eventName: name, properties: customProperties(props) } };
}

function unwrap(parsed: unknown): PostHogEvent[] {
  if (Array.isArray(parsed)) return parsed as PostHogEvent[];
  const record = obj(parsed);
  if (Array.isArray(record.results)) return record.results as PostHogEvent[];
  if ('event' in record) return [record as PostHogEvent];
  throw new Error('Expected JSON Lines, a JSON array of events, or an object with a "results" array.');
}

/**
 * Reads a PostHog export one event at a time. JSON Lines files are streamed so
 * exports larger than memory work; a JSON array is read whole.
 */
export async function* readPostHogExport(file: string): AsyncGenerator<{ line: number; event?: PostHogEvent; error?: string }> {
  const handle = await fs.open(file, 'r');
  let head = '';
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(4096), 0, 4096, 0);
    head = buffer.subarray(0, bytesRead).toString('utf8').trimStart();
  } finally {
    await handle.close();
  }

  if (head.startsWith('[') || (head.startsWith('{') && /^\{\s*"(results|next|columns)"/.test(head))) {
    const events = unwrap(JSON.parse(await fs.readFile(file, 'utf8')));
    for (let i = 0; i < events.length; i++) yield { line: i + 1, event: events[i] };
    return;
  }

  yield* readJsonLines(createReadStream(file));
}

/** Reads JSON Lines from a stream, transparently un-gzipping it if needed. */
export async function* readJsonLines(stream: Readable, startLine = 0): AsyncGenerator<{ line: number; event?: PostHogEvent; error?: string }> {
  const input = await maybeGunzip(stream);
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let line = startLine;
  for await (const text of lines) {
    line += 1;
    const trimmed = text.trim();
    if (!trimmed) continue;
    try {
      yield { line, event: JSON.parse(trimmed) as PostHogEvent };
    } catch {
      yield { line, error: 'not valid JSON' };
    }
  }
}

async function maybeGunzip(stream: Readable): Promise<Readable> {
  const iterator = stream[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (first.done) return Readable.from([]);
  const head = Buffer.from(first.value as Uint8Array);
  async function* rest() {
    yield head;
    for (let next = await iterator.next(); !next.done; next = await iterator.next()) yield Buffer.from(next.value as Uint8Array);
  }
  const combined = Readable.from(rest());
  return head[0] === 0x1f && head[1] === 0x8b ? combined.pipe(createGunzip()) : combined;
}

