import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ManageDeps, runManageCommand } from '../src/manage/commands.js';
import { mapPostHogEvent, readPostHogExport } from '../src/manage/posthog-import.js';

const pageview = {
  uuid: '018f-aaaa',
  event: '$pageview',
  distinct_id: 'user_1',
  timestamp: '2024-03-01T10:00:00.000Z',
  properties: {
    $current_url: 'https://app.example.com/pricing?utm_source=x',
    $pathname: '/pricing',
    $referrer: '$direct',
    $title: 'Pricing',
    $session_id: 'sess_1',
    $device_id: 'dev_1',
    $lib: 'web',
    $os: 'Mac OS X',
    $browser: 'Chrome',
    $device_type: 'Desktop',
    utm_source: 'x'
  }
};

describe('mapPostHogEvent', () => {
  it('maps $pageview to $page with page context, device and identity', () => {
    const result = mapPostHogEvent(pageview);
    expect('event' in result).toBe(true);
    if (!('event' in result)) return;
    expect(result.event).toMatchObject({
      eventName: '$page',
      userId: 'user_1',
      anonymousId: 'dev_1',
      sessionId: 'sess_1',
      timestamp: '2024-03-01T10:00:00.000Z',
      properties: { name: 'Pricing', utm_source: 'x' },
      deviceInfo: { platform: 'web', os: 'Mac OS X', browser: 'Chrome', deviceType: 'desktop' },
      context: {
        page: { url: 'https://app.example.com/pricing?utm_source=x', path: '/pricing', search: '?utm_source=x', title: 'Pricing', utm: { source: 'x' } },
        import: { source: 'posthog', uuid: '018f-aaaa' }
      }
    });
    // "$direct" is PostHog's placeholder, not a referrer.
    expect(result.event.context.page).not.toHaveProperty('referrer');
  });

  it('keeps custom events and drops PostHog $ metadata', () => {
    const result = mapPostHogEvent({
      event: 'checkout_started',
      distinct_id: 'user_1',
      timestamp: '2024-03-01 10:00:00.123',
      properties: JSON.stringify({ cartValue: 42, $lib: 'web', $geoip_city_name: 'Lagos' })
    });
    expect(result).toMatchObject({
      event: { eventName: 'checkout_started', properties: { cartValue: 42 }, timestamp: '2024-03-01T10:00:00.123Z' }
    });
    if ('event' in result) expect(result.event.properties).not.toHaveProperty('$lib');
  });

  it('treats anonymous events as anonymous IDs', () => {
    const result = mapPostHogEvent({ event: 'clicked', distinct_id: 'anon_9', timestamp: '2024-03-01T10:00:00Z', properties: { $is_identified: false } });
    expect(result).toMatchObject({ event: { anonymousId: 'anon_9' } });
    if ('event' in result) expect(result.event.userId).toBeUndefined();
  });

  it('maps $identify/$set to $identify traits and links the anonymous ID', () => {
    const result = mapPostHogEvent({
      event: '$identify',
      distinct_id: 'user_1',
      timestamp: '2024-03-01T10:00:00Z',
      properties: { $anon_distinct_id: 'anon_9', $set: { plan: 'pro' }, $set_once: { signup: '2024-01-01', plan: 'free' } }
    });
    expect(result).toMatchObject({
      event: { eventName: '$identify', userId: 'user_1', anonymousId: 'anon_9', properties: { traits: { plan: 'pro', signup: '2024-01-01' } } }
    });
  });

  it('maps $create_alias to $alias', () => {
    const result = mapPostHogEvent({ event: '$create_alias', distinct_id: 'user_1', timestamp: '2024-03-01T10:00:00Z', properties: { alias: 'guest_1' } });
    expect(result).toMatchObject({ event: { eventName: '$alias', userId: 'user_1', properties: { previousId: 'guest_1' } } });
  });

  it('skips PostHog-internal events and incomplete rows', () => {
    const ts = '2024-03-01T10:00:00Z';
    expect(mapPostHogEvent({ event: '$autocapture', distinct_id: 'u', timestamp: ts })).toEqual({ skipped: '$autocapture' });
    expect(mapPostHogEvent({ event: '$exception', distinct_id: 'u', timestamp: ts })).toEqual({ skipped: '$exception' });
    expect(mapPostHogEvent({ event: '$something_new', distinct_id: 'u', timestamp: ts })).toEqual({ skipped: '$something_new' });
    expect(mapPostHogEvent({ event: 'x', timestamp: ts })).toEqual({ skipped: '(missing distinct_id)' });
    expect(mapPostHogEvent({ event: 'x', distinct_id: 'u', timestamp: 'nope' })).toEqual({ skipped: '(missing or invalid timestamp)' });
  });
});

describe('traceiq import posthog', () => {
  let dir: string;
  let out: string[];
  let deps: ManageDeps;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'traceiq-import-'));
    out = [];
    process.exitCode = undefined;
    deps = {
      cwd: dir,
      env: { HOME: dir, TRACEIQ_CONFIG_DIR: path.join(dir, '.traceiq') },
      out: (line = '') => out.push(line),
      sleep: async () => true,
      openUrl: async () => {},
      now: () => Date.now()
    };
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('reads JSON Lines and JSON arrays', async () => {
    const jsonl = path.join(dir, 'a.jsonl');
    await fs.writeFile(jsonl, `${JSON.stringify(pageview)}\n\nnot json\n${JSON.stringify({ ...pageview, event: 'x' })}\n`);
    const rows = [];
    for await (const row of readPostHogExport(jsonl)) rows.push(row);
    expect(rows.map((r) => r.event?.event ?? r.error)).toEqual(['$pageview', 'not valid JSON', 'x']);

    const json = path.join(dir, 'b.json');
    await fs.writeFile(json, JSON.stringify({ results: [pageview, pageview] }));
    const arrayRows = [];
    for await (const row of readPostHogExport(json)) arrayRows.push(row);
    expect(arrayRows).toHaveLength(2);
  });

  it('sends mapped events in batches of 500 with the write key', async () => {
    const file = path.join(dir, 'events.jsonl');
    const lines = Array.from({ length: 1201 }, (_, i) => JSON.stringify({ ...pageview, event: i === 0 ? '$autocapture' : 'clicked' }));
    await fs.writeFile(file, lines.join('\n'));

    const calls: Array<{ url: string; headers: Record<string, string>; body: { projectId: string; batch: unknown[] } }> = [];
    let first = true;
    deps.fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (first) {
        first = false;
        return new Response('slow down', { status: 429 });
      }
      calls.push({ url: String(input), headers: init?.headers as Record<string, string>, body });
      return new Response(JSON.stringify({ accepted: true, results: body.batch.map(() => ({ accepted: true })) }), { status: 200 });
    }) as typeof fetch;

    await runManageCommand(
      'import',
      ['posthog', 'events.jsonl', '--write-key', 'trq_test', '--project', 'proj_a', '--api-url', 'https://api.example.com/'],
      deps
    );

    expect(process.exitCode).toBeUndefined();
    expect(calls.map((c) => c.body.batch.length)).toEqual([500, 500, 200]);
    expect(calls[0].url).toBe('https://api.example.com/v1/events/batch');
    expect(calls[0].headers['x-traceiq-write-key']).toBe('trq_test');
    expect(calls[0].body.projectId).toBe('proj_a');
    const text = out.join('\n');
    expect(text).toContain('$autocapture');
  });

  it('sends nothing on --dry-run', async () => {
    const file = path.join(dir, 'events.jsonl');
    await fs.writeFile(file, JSON.stringify(pageview));
    let called = false;
    deps.fetchImpl = (async () => {
      called = true;
      return new Response('{}');
    }) as typeof fetch;

    await runManageCommand('import', ['posthog', file, '--dry-run'], deps);
    expect(called).toBe(false);
    expect(process.exitCode).toBeUndefined();
  });

  it('requires a write key to send', async () => {
    const file = path.join(dir, 'events.jsonl');
    await fs.writeFile(file, JSON.stringify(pageview));
    await runManageCommand('import', ['posthog', file, '--project', 'proj_a'], deps);
    expect(process.exitCode).toBe(1);
  });
});

describe('traceiq import posthog --posthog-key (direct pull)', () => {
  let dir: string;
  let out: string[];
  let deps: ManageDeps;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'traceiq-pull-'));
    out = [];
    process.exitCode = undefined;
    deps = {
      cwd: dir,
      env: { HOME: dir, TRACEIQ_CONFIG_DIR: path.join(dir, '.traceiq') },
      out: (line = '') => out.push(line),
      sleep: async () => true,
      openUrl: async () => {},
      now: () => Date.parse('2024-03-20T00:00:00Z')
    };
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await fs.rm(dir, { recursive: true, force: true });
  });

  function fakePostHog(options: { failRun?: number; gzip?: boolean } = {}) {
    const log: Array<{ method: string; url: string; auth?: string; body?: any }> = [];
    const sent: unknown[] = [];
    let runs = 0;
    const polls = new Map<string, number>();
    const impl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      log.push({ method, url, auth, body });

      if (url.startsWith('https://api.traceiq.test/')) {
        sent.push(...body.batch);
        return Response.json({ accepted: true, results: body.batch.map(() => ({ accepted: true })) });
      }
      const base = 'https://eu.posthog.com/api/projects/42/file_download_batch_exports/';
      if (url === base && method === 'GET') return Response.json({ results: [] });
      if (url === base && method === 'POST') {
        runs += 1;
        return Response.json({ id: `run${runs}` }, { status: 202 });
      }
      const poll = url.match(/exports\/(run\d+)\/$/);
      if (poll) {
        const id = poll[1];
        const n = (polls.get(id) ?? 0) + 1;
        polls.set(id, n);
        if (options.failRun && id === `run${options.failRun}`) return Response.json({ status: 'Failed', error: 'boom' });
        return Response.json(n === 1 ? { status: 'Running' } : { status: 'Completed', files: ['file1'] });
      }
      const download = url.match(/exports\/(run\d+)\/download\/file1\/$/);
      if (download) return new Response(null, { status: 302, headers: { location: `https://signed.example/${download[1]}` } });
      const signed = url.match(/^https:\/\/signed\.example\/run(\d+)$/);
      if (signed) {
        const n = Number(signed[1]);
        const text = [
          JSON.stringify({ ...pageview, uuid: `p${n}`, timestamp: `2024-03-0${n}T10:00:00Z` }),
          JSON.stringify({ event: 'signed_up', distinct_id: 'user_1', timestamp: `2024-03-0${n}T11:00:00Z`, properties: { plan: 'pro' } })
        ].join('\n');
        const { gzipSync } = await import('node:zlib');
        return new Response(options.gzip ? gzipSync(text) : text);
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch;
    return { impl, log, sent };
  }

  const pullArgs = [
    'posthog',
    '--posthog-key', 'phx_secret',
    '--posthog-project', '42',
    '--posthog-host', 'eu',
    '--since', '2024-03-01',
    '--until', '2024-03-11',
    '--write-key', 'trq_test',
    '--project', 'proj_a',
    '--api-url', 'https://api.traceiq.test'
  ];

  it('exports week by week, downloads without the API key, and imports the events', async () => {
    const posthog = fakePostHog({ gzip: true });
    deps.fetchImpl = posthog.impl;
    await runManageCommand('import', pullArgs, deps);

    expect(process.exitCode).toBeUndefined();
    const creates = posthog.log.filter((c) => c.method === 'POST' && c.url.endsWith('file_download_batch_exports/'));
    expect(creates.map((c) => [c.body.data_interval_start, c.body.data_interval_end])).toEqual([
      ['2024-03-01T00:00:00.000Z', '2024-03-08T00:00:00.000Z'],
      ['2024-03-08T00:00:00.000Z', '2024-03-11T00:00:00.000Z']
    ]);
    expect(creates[0].body).toMatchObject({ model: 'events', file: { format: 'JSONLines' } });
    expect(creates[0].body.exclude).toContain('$autocapture');
    expect(posthog.log.filter((c) => c.url.includes('posthog.com')).every((c) => c.auth === 'Bearer phx_secret')).toBe(true);
    expect(posthog.log.filter((c) => c.url.startsWith('https://signed.example/')).every((c) => c.auth === undefined)).toBe(true);
    expect(posthog.log.filter((c) => c.url.startsWith('https://api.traceiq.test/')).every((c) => !JSON.stringify(c).includes('phx_secret'))).toBe(true);
    expect(posthog.sent).toHaveLength(4);
    expect(posthog.sent).toEqual(expect.arrayContaining([expect.objectContaining({ eventName: '$page' }), expect.objectContaining({ eventName: 'signed_up' })]));
  });

  it('checks access on --dry-run without starting an export', async () => {
    const posthog = fakePostHog();
    deps.fetchImpl = posthog.impl;
    const info: string[] = [];
    const original = console.log;
    console.log = (...parts: unknown[]) => info.push(parts.join(' '));
    try {
      await runManageCommand('import', [...pullArgs, '--dry-run'], deps);
    } finally {
      console.log = original;
    }
    expect(process.exitCode).toBeUndefined();
    expect(posthog.log.map((c) => c.method)).toEqual(['GET']);
    expect(info.join('\n')).toContain('2 weekly exports');
  });

  it('says where to resume when a later week fails', async () => {
    const posthog = fakePostHog({ failRun: 2 });
    deps.fetchImpl = posthog.impl;
    const info: string[] = [];
    const original = console.log;
    console.log = (...parts: unknown[]) => info.push(parts.join(' '));
    try {
      await runManageCommand('import', pullArgs, deps);
    } finally {
      console.log = original;
    }
    expect(process.exitCode).toBe(1);
    expect(posthog.sent).toHaveLength(2);
    expect(info.join('\n')).toContain('--since 2024-03-08T00:00:00.000Z');
  });

  it('requires --since and a project', async () => {
    await runManageCommand('import', ['posthog', '--posthog-key', 'phx_x', '--posthog-project', '42'], deps);
    expect(process.exitCode).toBe(1);
  });
});
