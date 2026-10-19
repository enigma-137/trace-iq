import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, symlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { affected, empty, mockDatabase, rows } from './helpers/mock-db';
import { ReplayService } from '../src/modules/replay/replay.service';
import { isolateReplayEventsForPlayback, sanitizeReplayEvents } from '../src/modules/replay/replay-sanitizer';
import { ReplayTokenService } from '../src/modules/replay/replay-token.service';
import { FilesystemReplayStorage } from '../src/modules/replay/storage/filesystem-replay.storage';
import type { ReplayStorage } from '../src/modules/replay/storage/replay-storage.interface';
import { ReplayRetentionService } from '../src/modules/replay/replay-retention.service';
import { SupabaseReplayStorage } from '../src/modules/replay/storage/supabase-replay.storage';
import { createReplayStorage } from '../src/modules/replay/storage/replay-storage.factory';
import { EntitlementService } from '../src/modules/billing/entitlement.service';

const CANARIES = {
  hidden: 'CANARY_HIDDEN_Z8p4', text: 'CANARY_TEXT_A9q3', query: 'CANARY_QUERY_B7m2',
  fragment: 'CANARY_FRAGMENT_C6n1', credentials: 'CANARY_CREDENTIALS_D5k0', css: 'CANARY_CSS_E4j9'
};

class MemoryStorage implements ReplayStorage {
  objects = new Map<string, Buffer>();
  calls: string[] = [];
  assertReady = vi.fn(async () => undefined);
  put = vi.fn(async (key: string, value: Buffer) => { this.calls.push('storage.put'); this.objects.set(key, value); });
  get = vi.fn(async (key: string) => this.objects.get(key) ?? Buffer.alloc(0));
  delete = vi.fn(async (key: string) => { this.objects.delete(key); });
}

function makeService({ enabled = true, sampleRate = 1, matchedFunnelIds = ['fnl_onboarding'],
  triggerEventNames = ['onboarding_started'], existingChunk, recordingFormat = 'rrweb-json-gzip', playback = false }: {
  enabled?: boolean; sampleRate?: number; matchedFunnelIds?: string[]; triggerEventNames?: string[];
  existingChunk?: { content_sha256: string; storage_key: string };
  recordingFormat?: 'rrweb-json-gzip' | 'mobile-structural-v1'; playback?: boolean;
} = {}) {
  const now = Date.now();
  const replay = {
    id: 'rpl_test', organization_id: 'org_a', project_id: 'proj_a', session_id: 'sess_a',
    storage_prefix: 'org_a/proj_a/sess_a', privacy_mode: 'balanced',
    recording_format: recordingFormat, recording_version: recordingFormat === 'rrweb-json-gzip' ? 'rrweb@2' : '1',
    started_at: new Date(now - 1_000).toISOString(), expires_at: new Date(now + 86_400_000).toISOString(),
    chunk_count: 0, event_count: 0, compressed_size_bytes: 0, uncompressed_size_bytes: 0,
    status: 'recording', deleted_at: null
  };
  let reservation: Record<string, unknown> | undefined;
  const callOrder: string[] = [];
  const db = mockDatabase((text, values) => {
    if (text.includes('FROM replay_settings')) return rows([{ enabled, sampleRate, maxDurationSeconds: 600,
      retentionDays: 30, privacyMode: 'balanced', requireConsent: false, maskSelectors: [], blockSelectors: [], ignoreSelectors: [],
      selectedFunnelIds: matchedFunnelIds }]);
    if (text.includes('FROM replay_setting_funnels rsf') && text.includes('JOIN events e')) {
      return rows(matchedFunnelIds.map((id) => ({ id })));
    }
    if (text.includes('FROM replay_setting_funnels rsf')) {
      return rows(matchedFunnelIds.map((id, index) => ({
        id, name: `Flow ${index + 1}`, trigger_event_name: triggerEventNames[index] ?? triggerEventNames[0]
      })));
    }
    if (text.includes('pg_advisory_xact_lock')) return empty();
    if (text.includes('INSERT INTO sessions')) return affected(1);
    if (text.includes('SELECT s.id,s.user_id,s.anonymous_id,u.external_id')) {
      return rows([{ id: 'sess_a', user_id: null, anonymous_id: 'anon_a', external_id: null }]);
    }
    if (text.includes('SELECT * FROM session_replays WHERE id=$1 AND project_id=$2 AND deleted_at')) return playback ? rows([replay]) : empty();
    if (text.includes('SELECT * FROM session_replays WHERE project_id')) return rows([replay]);
    if (text.includes('INSERT INTO session_replays')) {
      Object.assign(replay, { id: values[0], recording_format: values[8], recording_version: values[9] });
      return rows([replay]);
    }
    if (text.includes('SELECT * FROM session_replays WHERE id=$1 FOR UPDATE')) return rows([replay]);
    if (text.includes('FROM replay_chunks WHERE replay_id=$1 AND sequence=$2')) {
      return existingChunk ? rows([{ id: 'rpc_existing', replay_id: replay.id, sequence: 0, status: 'ready',
        event_count: 1, compressed_size_bytes: 10, uncompressed_size_bytes: 20, ...existingChunk }]) : empty();
    }
    if (text.includes("FROM replay_chunks WHERE replay_id=$1 AND status='ready'")) {
      return existingChunk ? rows([{ id: 'rpc_existing', replay_id: replay.id, sequence: 0, status: 'ready',
        event_count: 1, compressed_size_bytes: 10, uncompressed_size_bytes: 20, ...existingChunk }]) : empty();
    }
    if (text.includes('INSERT INTO replay_chunks')) {
      callOrder.push('db.reserve');
      reservation = { id: values[0], replay_id: values[1], sequence: values[2], storage_key: values[3],
        event_count: values[4], compressed_size_bytes: values[5], uncompressed_size_bytes: values[6],
        content_sha256: values[7], status: 'uploading' };
      return affected(1);
    }
    if (text.includes('FROM replay_chunks WHERE id=$1 AND replay_id=$2')) return reservation ? rows([reservation]) : empty();
    if (text.includes("UPDATE replay_chunks SET status='ready'")) { callOrder.push('db.finalize'); return affected(1); }
    return empty();
  });
  const storage = new MemoryStorage();
  storage.put.mockImplementation(async (key: string, value: Buffer) => { callOrder.push('storage.put'); storage.objects.set(key, value); });
  const events = { authenticateWriteKey: vi.fn(async () => ({ project_id: 'proj_a', organization_id: 'org_a' })) };
  const projects = {
    requireActiveProject: vi.fn(async () => ({ id: 'proj_a', organizationId: 'org_a', role: 'owner' })),
    requireWritableProject: vi.fn(async () => ({ id: 'proj_a', organizationId: 'org_a', role: 'owner' }))
  };
  const entitlements = {
    assertReplayAvailable: vi.fn(async () => ({})), assertReplayCapacity: vi.fn(async () => ({})),
    recordReplayUsage: vi.fn(async () => undefined), assertReplaySettings: vi.fn(async () => ({})),
    getSnapshot: vi.fn(async () => ({ deploymentMode: 'self_hosted', features: { sessionReplay: true }, limits: {} }))
  };
  const tokens = new ReplayTokenService();
  const uploadToken = tokens.sign({
    projectId: 'proj_a', organizationId: 'org_a', sessionId: 'sess_a', anonymousId: 'anon_a',
    consentGranted: false, requireConsent: false, privacyMode: 'balanced', maxDurationSeconds: 600,
    maxChunks: 3_000, maxCompressedBytes: 250_000_000, maxUncompressedBytes: 250_000_000,
    matchedFunnelIds
  }, 300).token;
  const service = new ReplayService(db as never, events as never, projects as never, entitlements as never, tokens, storage);
  return { service, db, storage, projects, entitlements, tokens, uploadToken, replay, callOrder };
}

function canaryEvent(timestamp = Date.now()) {
  return { type: 2, timestamp, data: { styleMutation: { property: 'background-image',
    value: `url(https://example.test/style?token=${CANARIES.query})` }, node: { tagName: 'div', childNodes: [
    { tagName: 'input', attributes: { type: 'hidden', name: 'state', value: CANARIES.hidden } },
    { tagName: 'p', textContent: `password=${CANARIES.text}` },
    { tagName: 'a', attributes: { href: `https://${CANARIES.credentials}:pw@example.test/path?token=${CANARIES.query}#${CANARIES.fragment}` } },
    { tagName: 'img', attributes: { src: `https://example.test/a?api_key=${CANARIES.query}`, rr_src: `https://example.test/b#${CANARIES.fragment}` } },
    { tagName: 'link', attributes: { _cssText: `.card{display:grid;color:red;background:url(https://example.test/css?token=${CANARIES.css})}` } },
    { tagName: 'form', attributes: { action: `https://example.test/login?auth_code=${CANARIES.query}`, formaction: `https://example.test/go#${CANARIES.fragment}` } },
    { tagName: 'div', attributes: { style: `background:url(https://example.test/pixel?secret=${CANARIES.css}#${CANARIES.fragment})`,
      filter: `u\\72l(https://example.test/escaped?token=${CANARIES.query})`, rr_dataURL: `data:image/png,${CANARIES.hidden}` } },
    { tagName: 'iframe', attributes: { src: `https://example.test/frame?token=${CANARIES.query}` }, childNodes: [{ textContent: CANARIES.text }] }
  ] } } };
}

function mobileChunk() {
  const chunk = JSON.parse(readFileSync(new URL('../../../contracts/mobile-replay/fixtures/valid-react-native.json', import.meta.url), 'utf8'));
  const first = chunk.events[0].timestamp as number;
  const now = Date.now() - 1_000;
  for (const event of chunk.events) event.timestamp = now + event.timestamp - first;
  return chunk;
}

describe('Session Replay security', () => {
  it('keeps canary secrets out of the decompressed stored object and reserves before upload', async () => {
    const { service, storage, uploadToken, callOrder } = makeService();
    await service.ingestChunk(uploadToken, {
      projectId: 'proj_a', sessionId: 'sess_a', anonymousId: 'anon_a', sequence: 0,
      startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), events: [canaryEvent()]
    });
    const persisted = gunzipSync([...storage.objects.values()][0]).toString('utf8');
    for (const canary of Object.values(CANARIES)) expect(persisted).not.toContain(canary);
    expect(persisted).toContain('display:grid');
    expect(persisted).toContain('background:none');
    expect(callOrder).toEqual(['db.reserve', 'storage.put', 'db.finalize']);
  });

  it('rejects tokens whose session identity does not match the request', async () => {
    const { service, uploadToken } = makeService();
    await expect(service.ingestChunk(uploadToken, {
      projectId: 'proj_a', sessionId: 'sess_a', anonymousId: 'other', sequence: 0, events: [canaryEvent()]
    })).rejects.toThrow(/not valid.*identity/);
  });

  it('rejects malformed events, arbitrary path IDs, future events, and gzip bombs', async () => {
    expect(() => sanitizeReplayEvents([{ type: 2 }], 'balanced')).toThrow(/valid rrweb event/);
    const { service, uploadToken } = makeService();
    await expect(service.ingestChunk(uploadToken, {
      projectId: 'proj_a', sessionId: '../other-org', sequence: 0, events: [canaryEvent()]
    })).rejects.toThrow(/sessionId is invalid/);
    await expect(service.ingestChunk(uploadToken, {
      projectId: 'proj_a', sessionId: 'sess_a', anonymousId: 'anon_a', sequence: 0,
      events: [canaryEvent(Date.now() + 20 * 60_000)]
    })).rejects.toThrow(/clock-skew/);
    const bomb = gzipSync(Buffer.alloc(2_100_000, 65)).toString('base64');
    await expect(service.ingestChunk(uploadToken, {
      projectId: 'proj_a', sessionId: 'sess_a', anonymousId: 'anon_a', sequence: 0,
      encoding: 'gzip-base64', encodedEvents: bomb
    })).rejects.toThrow(/malformed|limit/);
  });

  it('does not issue an upload grant while replay is disabled', async () => {
    const { service, storage } = makeService({ enabled: false });
    await expect(service.authorizeUpload('write_key', {
      projectId: 'proj_a', sessionId: 'sess_a', anonymousId: 'anon_a', consentGranted: true
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.assertReady).not.toHaveBeenCalled();
  });

  it('does not initialize storage when Cloud replay lacks an entitlement', async () => {
    const { service, storage, entitlements } = makeService();
    entitlements.assertReplayAvailable.mockRejectedValueOnce(new ForbiddenException('Session Replay is not enabled.'));
    await expect(service.authorizeUpload('write_key', {
      projectId: 'proj_a', sessionId: 'sess_a', anonymousId: 'anon_a', consentGranted: true
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.assertReady).not.toHaveBeenCalled();
  });

  it('does not delete or hide historical replay metadata when a downgrade blocks new recording', async () => {
    const { service, db, entitlements } = makeService();
    entitlements.assertReplayAvailable.mockRejectedValue(new ForbiddenException('Session Replay is available on Pro.'));

    await expect(service.list({ id: 'owner' }, { projectId: 'proj_a' })).resolves.toMatchObject({
      project: { id: 'proj_a' }, replays: []
    });
    expect(db.queryCalls(/DELETE FROM session_replays|UPDATE session_replays SET status='deleting'/)).toHaveLength(0);
  });

  it('issues a short-lived grant bound to project, session, identity, consent, and limits', async () => {
    const { service, tokens } = makeService();
    const grant = await service.authorizeUpload('write_key', {
      projectId: 'proj_a', sessionId: 'sess_a', anonymousId: 'anon_a', consentGranted: true
    });
    const claims = tokens.verify(grant.token);
    expect(grant.token.split('.')).toHaveLength(2);
    expect(new Date(grant.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(300_000);
    expect(claims).toMatchObject({ projectId: 'proj_a', organizationId: 'org_a', sessionId: 'sess_a',
      anonymousId: 'anon_a', consentGranted: true, maxChunks: 3_000,
      maxCompressedBytes: 250_000_000, maxUncompressedBytes: 250_000_000,
      matchedFunnelIds: ['fnl_onboarding'] });
  });

  it('returns page-view and custom first-step triggers without exposing selected funnel IDs to the browser', async () => {
    const { service } = makeService({
      matchedFunnelIds: ['fnl_pages', 'fnl_checkout'],
      triggerEventNames: ['$page', 'checkout_started']
    });
    const config = await service.getRecorderConfig('write_key', 'proj_a');

    expect(config).toMatchObject({ enabled: true, flowTriggerEventNames: ['$page', 'checkout_started'] });
    expect(config).not.toHaveProperty('selectedFunnelIds');
  });

  it('never enables recorder config when no flow is selected', async () => {
    const { service } = makeService({ matchedFunnelIds: [] });
    await expect(service.getRecorderConfig('write_key', 'proj_a')).resolves.toMatchObject({
      enabled: false, flowTriggerEventNames: []
    });
  });

  it('applies deterministic sampling server-side before storage initialization', async () => {
    const { service, storage } = makeService({ sampleRate: 0 });
    await expect(service.authorizeUpload('write_key', {
      projectId: 'proj_a', sessionId: 'sess_a', anonymousId: 'anon_a', consentGranted: true
    })).rejects.toThrow(/sample rate/);
    expect(storage.assertReady).not.toHaveBeenCalled();
  });

  it('associates multiple matching flows with one replay session instead of creating duplicates', async () => {
    const { service, db, tokens } = makeService({
      matchedFunnelIds: ['fnl_onboarding', 'fnl_checkout'],
      triggerEventNames: ['onboarding_started', 'checkout_started']
    });
    const token = tokens.sign({
      projectId: 'proj_a', organizationId: 'org_a', sessionId: 'sess_a', anonymousId: 'anon_a',
      consentGranted: false, requireConsent: false, privacyMode: 'balanced', maxDurationSeconds: 600,
      maxChunks: 3_000, maxCompressedBytes: 250_000_000, maxUncompressedBytes: 250_000_000,
      matchedFunnelIds: ['fnl_onboarding', 'fnl_checkout']
    }, 300).token;

    await service.ingestChunk(token, {
      projectId: 'proj_a', sessionId: 'sess_a', anonymousId: 'anon_a', sequence: 0, events: [canaryEvent()]
    });

    expect(db.queryCalls(/INSERT INTO session_replay_funnels/)[0].values).toEqual([
      'rpl_test', 'proj_a', ['fnl_onboarding', 'fnl_checkout']
    ]);
    expect(db.queryCalls(/INSERT INTO session_replays/)).toHaveLength(0);
  });

  it('rejects selected funnel IDs that do not belong to the active project', async () => {
    const { service } = makeService();
    await expect(service.updateSettings({ id: 'owner' }, 'proj_a', {
      selectedFunnelIds: ['fnl_other_project']
    }, true)).rejects.toThrow(/do not belong to this project/);
  });

  it('invalidates an issued grant when the selected funnel is deleted or its first step no longer matches', async () => {
    const matches = ['fnl_onboarding'];
    const { service, uploadToken } = makeService({ matchedFunnelIds: matches });
    matches.splice(0, matches.length);

    await expect(service.ingestChunk(uploadToken, {
      projectId: 'proj_a', sessionId: 'sess_a', anonymousId: 'anon_a', sequence: 0, events: [canaryEvent()]
    })).rejects.toThrow(/no longer matches a selected Replay flow/);
  });

  it('associates only still-current matches when one flow in a multi-flow grant is removed', async () => {
    const { service, db, tokens } = makeService({ matchedFunnelIds: ['fnl_checkout'] });
    const token = tokens.sign({
      projectId: 'proj_a', organizationId: 'org_a', sessionId: 'sess_a', anonymousId: 'anon_a',
      consentGranted: false, requireConsent: false, privacyMode: 'balanced', maxDurationSeconds: 600,
      maxChunks: 3_000, maxCompressedBytes: 250_000_000, maxUncompressedBytes: 250_000_000,
      matchedFunnelIds: ['fnl_deleted', 'fnl_checkout']
    }, 300).token;

    await service.ingestChunk(token, {
      projectId: 'proj_a', sessionId: 'sess_a', anonymousId: 'anon_a', sequence: 0, events: [canaryEvent()]
    });

    expect(db.queryCalls(/INSERT INTO session_replay_funnels/)[0].values[2]).toEqual(['fnl_checkout']);
  });

  it('requires explicit acknowledgement before weakening privacy controls', async () => {
    const { service } = makeService();
    await expect(service.updateSettings({ id: 'owner' }, 'proj_a', { privacyMode: 'custom' })).rejects.toThrow(/acknowledgement/);
    await expect(service.updateSettings({ id: 'owner' }, 'proj_a', { requireConsent: false })).rejects.toThrow(/acknowledgement/);
  });

  it('deduplicates an identical ready chunk without another object write', async () => {
    const events = [canaryEvent()];
    const sanitized = sanitizeReplayEvents(events, 'balanced');
    const digest = createHash('sha256').update(gzipSync(Buffer.from(JSON.stringify(sanitized)), { level: 6 })).digest('hex');
    const { service, storage, uploadToken } = makeService({ existingChunk: {
      content_sha256: digest, storage_key: `org_a/proj_a/sess_a/000000-${digest.slice(0, 12)}.json.gz`
    } });
    const result = await service.ingestChunk(uploadToken, {
      projectId: 'proj_a', sessionId: 'sess_a', anonymousId: 'anon_a', sequence: 0, events
    });
    expect(result.duplicate).toBe(true);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it.each([
    ['chunk_count', 3_000, /chunk limit/],
    ['compressed_size_bytes', 250_000_000, /compressed byte limit/],
    ['uncompressed_size_bytes', 250_000_000, /expanded byte limit/]
  ] as const)('rechecks atomic replay total %s after object upload', async (field, competingValue, message) => {
    const { service, storage, uploadToken, replay, callOrder } = makeService();
    storage.put.mockImplementation(async (key: string, value: Buffer) => {
      callOrder.push('storage.put');
      storage.objects.set(key, value);
      replay[field] = competingValue;
    });
    await expect(service.ingestChunk(uploadToken, {
      projectId: 'proj_a', sessionId: 'sess_a', anonymousId: 'anon_a', sequence: 0, events: [canaryEvent()]
    })).rejects.toThrow(message);
    expect(storage.objects.size).toBe(0);
    expect(callOrder).not.toContain('db.finalize');
  });

  it('scopes playback lookup to the authorized project', async () => {
    const { service, db } = makeService();
    await expect(service.playback({ id: 'dashboard_user' }, 'rpl_missing', 'proj_a')).rejects.toThrow(/inaccessible/);
    expect(db.queryCalls(/FROM session_replays WHERE id=\$1 AND project_id=\$2/)[0].values).toEqual(['rpl_missing', 'proj_a']);
  });

  it('removes every recorded network URL from the playback projection', () => {
    const projected = JSON.stringify(isolateReplayEventsForPlayback([canaryEvent()]));
    expect(projected).not.toContain('example.test');
    expect(projected).not.toContain(CANARIES.query);
    expect(projected).toContain('data:,');
  });

  it('keeps SVG geometry and paint values intact through sanitizing and playback', () => {
    const source = [{ type: 2, timestamp: 1, data: { node: { tagName: 'svg', attributes: { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor' }, childNodes: [
      { tagName: 'polyline', attributes: { points: '22 12 18 12 15 21 9 3 6 12 2 12' }, childNodes: [] },
      { tagName: 'path', attributes: { d: 'M4111 1111 1111 1111L12 2Z', fill: 'url(https://images.example/pattern.svg#p)' }, childNodes: [] },
      { type: 3, textContent: 'Card 4111 1111 1111 1111' }
    ] } } }];
    const played = isolateReplayEventsForPlayback(sanitizeReplayEvents(source, 'balanced')) as unknown as typeof source;
    const [polyline, path, text] = played[0].data.node.childNodes as Array<{ attributes: Record<string, string>; textContent: string }>;
    expect(played[0].data.node.attributes).toEqual({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor' });
    expect(polyline.attributes.points).toBe('22 12 18 12 15 21 9 3 6 12 2 12');
    expect(path.attributes.d).toBe('M4111 1111 1111 1111L12 2Z');
    expect(path.attributes.fill).toBe('none');
    expect(text.textContent).not.toContain('4111');
  });

  it('preserves safe inline CSS while removing stylesheet network references', () => {
    const source = [{ type: 2, timestamp: 1, data: { node: {
      tagName: 'link', attributes: { _cssText: `@import "https://styles.example/base.css";
.card{display:grid;color:rgb(10,20,30);background-image:url("https://images.example/pixel?token=${CANARIES.query}")}
@font-face{font-family:ReplayFont;src:u\\72l(https://fonts.example/font.woff2)}
.escaped{border:1px solid red;background:u\\
rl(https://escaped.example/pixel)}` }, childNodes: []
    } } }];

    const persisted = sanitizeReplayEvents(source, 'balanced');
    const persistedJson = JSON.stringify(persisted);
    expect(persistedJson).toContain('display:grid');
    expect(persistedJson).toContain('color:rgb(10,20,30)');
    expect(persistedJson).toContain('background-image:none');
    expect(persistedJson).toContain('src:none');
    expect(persistedJson).toContain('border:1px solid red');
    expect(persistedJson).not.toContain('@import');
    expect(persistedJson).not.toContain('styles.example');
    expect(persistedJson).not.toContain('images.example');
    expect(persistedJson).not.toContain('fonts.example');
    expect(persistedJson).not.toContain('escaped.example');
    expect(persistedJson).not.toContain(CANARIES.query);

    const projectedJson = JSON.stringify(isolateReplayEventsForPlayback(persisted));
    expect(projectedJson).toContain('display:grid');
    expect(projectedJson).toContain('color:rgb(10,20,30)');
    expect(projectedJson).not.toContain('styles.example');
    expect(projectedJson).not.toContain('images.example');
    expect(projectedJson).not.toContain('fonts.example');
  });

  it('blocks iframe contents unless both explicit and same-origin SDK markers are present', () => {
    const blocked = sanitizeReplayEvents([{ type: 2, timestamp: 1, data: { node: {
      tagName: 'iframe', attributes: { 'data-traceiq-allow-replay': 'true', src: '/safe' },
      childNodes: [{ textContent: 'ordinary iframe text' }]
    } } }], 'balanced');
    expect(JSON.stringify(blocked)).not.toContain('ordinary iframe text');
    const allowed = sanitizeReplayEvents([{ type: 2, timestamp: 1, data: { node: {
      tagName: 'iframe', attributes: { 'data-traceiq-allow-replay': 'true', 'data-traceiq-replay-safe-frame': 'true', src: '/safe' },
      childNodes: [{ textContent: 'reviewed same origin' }]
    } } }], 'balanced');
    expect(JSON.stringify(allowed)).toContain('reviewed same origin');
  });

  it('confines self-hosted keys and refuses symlinked path components', async () => {
    const previous = process.env.TRACEIQ_REPLAY_STORAGE_DIR;
    const root = await mkdtemp(join(tmpdir(), 'traceiq-replay-test-'));
    process.env.TRACEIQ_REPLAY_STORAGE_DIR = root;
    try {
      const storage = new FilesystemReplayStorage();
      await expect(storage.put('../escape.json.gz', Buffer.from('x'), { contentType: 'application/json' })).rejects.toThrow(/Invalid replay storage key/);
      const outside = await mkdtemp(join(tmpdir(), 'traceiq-replay-outside-'));
      await mkdir(join(root, 'org'), { recursive: true });
      await symlink(outside, join(root, 'org', 'project'), 'junction');
      await expect(storage.put(`org/project/session/000001-${'a'.repeat(12)}.json.gz`, Buffer.from('x'), { contentType: 'application/gzip', ifNoneMatch: true })).rejects.toThrow(/symbolic link/);
    } finally {
      if (previous === undefined) delete process.env.TRACEIQ_REPLAY_STORAGE_DIR; else process.env.TRACEIQ_REPLAY_STORAGE_DIR = previous;
    }
  });

  it('uses filesystem storage without reading Supabase replay credentials', async () => {
    const root = await mkdtemp(join(tmpdir(), 'traceiq-replay-driver-test-'));
    const storage = createReplayStorage('filesystem', { TRACEIQ_REPLAY_STORAGE_DIR: root });
    expect(storage).toBeInstanceOf(FilesystemReplayStorage);
    await expect(storage.assertReady()).resolves.toBeUndefined();
  });

  it('defers Supabase credential validation until storage is needed and reports every missing value', async () => {
    const storage = createReplayStorage('supabase', {});
    expect(storage).toBeInstanceOf(SupabaseReplayStorage);
    await expect(storage.assertReady()).rejects.toThrow(
      /Missing: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REPLAY_STORAGE_BUCKET/
    );
  });

  it('runs stale reservation reconciliation before retention deletion', async () => {
    const db = mockDatabase((text) => text.includes('SELECT id FROM session_replays') ? rows([{ id: 'rpl_expired' }]) : empty());
    const replays = { reconcileStaleUploads: vi.fn(async () => ({ scanned: 2, reconciled: 2 })), deleteById: vi.fn(async () => true) };
    const worker = new ReplayRetentionService(db as never, replays as never);
    await expect(worker.runSweep()).resolves.toEqual({ scanned: 1, deleted: 1, reservations: { scanned: 2, reconciled: 2 } });
    expect(replays.reconcileStaleUploads).toHaveBeenCalledBefore(replays.deleteById);
  });

  it('does not report deletion success when no replay row was deleted', async () => {
    const { service } = makeService();
    vi.spyOn(service, 'deleteById').mockResolvedValue(false);
    await expect(service.delete({ id: 'owner' }, 'missing', 'proj_a')).rejects.toThrow(/not found|could not be deleted/);
  });

  it('makes Cloud replay available to Pro without requiring an explicit allow override', async () => {
    const db = mockDatabase((text) => text.includes('entitlement_overrides') ? empty() : rows([{
      plan_key: 'pro', status: 'active', grace_period_ends_at: null, subscription_updated_at: null,
      projects: '1', members: '1', events: '0', ai_insights: '0', replay_sessions: '0', replay_storage_bytes: '0'
    }]));
    const entitlements = new EntitlementService(db as never, { deploymentMode: 'cloud' });
    await expect(entitlements.assertReplayAvailable('org_a')).resolves.toMatchObject({
      plan: 'pro', features: { sessionReplay: true }
    });
  });

  it('rejects authorization when this session has not entered a selected flow', async () => {
    const { service, storage } = makeService({ matchedFunnelIds: [] });
    await expect(service.authorizeUpload('write_key', {
      projectId: 'proj_a', sessionId: 'sess_a', anonymousId: 'anon_a', consentGranted: true
    })).rejects.toThrow(/has not entered a selected Replay flow/);
    expect(storage.assertReady).not.toHaveBeenCalled();
  });

  it('caps optional Supabase signed URLs at one minute and validates object keys', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ signedURL: '/object/sign/private' }), { status: 200 }));
    try {
      const storage = new SupabaseReplayStorage({
        SUPABASE_URL: 'https://storage.example',
        SUPABASE_SERVICE_ROLE_KEY: 'service-secret',
        REPLAY_STORAGE_BUCKET: 'session-replays'
      });
      const key = `org/project/session/000001-${'a'.repeat(12)}.json.gz`;
      await storage.getSignedUrl(key, 3600);
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(JSON.parse(String(init.body))).toEqual({ expiresIn: 60 });
      expect(String(fetchMock.mock.calls[0][0])).not.toContain('service-secret');
      await expect(storage.get('../escape')).rejects.toThrow(/Invalid replay storage key/);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('permits small client/server clock skew on chunk upload', async () => {
    const { service, uploadToken, replay } = makeService();
    const skewMs = 15_000;
    replay.started_at = new Date(Date.now() - skewMs).toISOString();
    const eventTime = Date.now() - skewMs + 1000;
    const result = await service.ingestChunk(uploadToken, {
      projectId: 'proj_a', sessionId: 'sess_a', anonymousId: 'anon_a', sequence: 0,
      startedAt: new Date(Date.now() - skewMs).toISOString(),
      endedAt: new Date(eventTime).toISOString(),
      events: [canaryEvent(eventTime)]
    });
    expect(result.accepted).toBe(true);
  });

  it('allows delayed chunk upload within max duration and clock skew window', async () => {
    const { service, uploadToken, replay } = makeService();
    const started = Date.now() - 45_000;
    replay.started_at = new Date(started).toISOString();
    const eventTime = started + 5_000;
    const result = await service.ingestChunk(uploadToken, {
      projectId: 'proj_a', sessionId: 'sess_a', anonymousId: 'anon_a', sequence: 0,
      startedAt: new Date(started).toISOString(),
      endedAt: new Date(eventTime).toISOString(),
      events: [canaryEvent(eventTime)]
    });
    expect(result.accepted).toBe(true);
  });

  it('rejects chunk upload when claimed startedAt differs from authoritative replay started_at beyond clock skew', async () => {
    const { service, uploadToken, replay } = makeService();
    const now = Date.now();
    replay.started_at = new Date(now - 1_000).toISOString();
    await expect(service.ingestChunk(uploadToken, {
      projectId: 'proj_a', sessionId: 'sess_a', anonymousId: 'anon_a', sequence: 1,
      startedAt: new Date(now - 600_000).toISOString(),
      endedAt: new Date(now).toISOString(),
      events: [canaryEvent(now)]
    })).rejects.toThrow(/startedAt does not match the authoritative replay time window/);
  });

  it('subsequent chunks with later event timestamps reuse the same authoritative startedAt without shifting replay started_at', async () => {
    const { service, uploadToken, replay, db } = makeService();
    const startTime = Date.now() - 30_000;
    replay.started_at = new Date(startTime).toISOString();

    await service.ingestChunk(uploadToken, {
      projectId: 'proj_a', sessionId: 'sess_a', anonymousId: 'anon_a', sequence: 0,
      startedAt: new Date(startTime).toISOString(),
      endedAt: new Date(startTime + 5_000).toISOString(),
      events: [canaryEvent(startTime + 5_000)]
    });

    await service.ingestChunk(uploadToken, {
      projectId: 'proj_a', sessionId: 'sess_a', anonymousId: 'anon_a', sequence: 1,
      startedAt: new Date(startTime).toISOString(),
      endedAt: new Date(startTime + 25_000).toISOString(),
      events: [canaryEvent(startTime + 25_000)]
    });

    expect(replay.started_at).toBe(new Date(startTime).toISOString());
    const updateCalls = db.queryCalls(/UPDATE session_replays/);
    for (const call of updateCalls) {
      expect(call.text).not.toContain('started_at=');
    }
  });

  it('defines additive project-confined flow targeting with non-destructive funnel deletion', async () => {
    const migration = await readFile(join(process.cwd(), 'migrations', '0032_replay_funnel_targeting.sql'), 'utf8');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS replay_setting_funnels');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS session_replay_funnels');
    expect(migration).toMatch(/FOREIGN KEY \(funnel_id, project_id\) REFERENCES funnels\(id, project_id\) ON DELETE CASCADE/);
    expect(migration).toMatch(/FOREIGN KEY \(replay_id, project_id\) REFERENCES session_replays\(id, project_id\) ON DELETE CASCADE/);
    expect(migration).not.toMatch(/DROP TABLE|DELETE FROM funnels|UPDATE funnels/i);
  });

  it('replaces the unique session replay index with a non-unique index permitting multiple replays per session', async () => {
    const migration = await readFile(join(process.cwd(), 'migrations', '0033_multi_replay_per_session.sql'), 'utf8');
    expect(migration).toContain('DROP INDEX IF EXISTS session_replays_project_session_active_idx');
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS session_replays_project_session_active_idx');
    expect(migration).toMatch(/ON session_replays\(project_id, session_id, started_at DESC\)/);
    expect(migration).not.toContain('UNIQUE');
  });

  it('allows multiple replay recording lifecycles within the same analytics session without timestamp collision', async () => {
    const storedReplays = new Map<string, any>();
    const storedReservations = new Map<string, any>();
    const db = mockDatabase((text, values) => {
      if (text.includes('FROM replay_settings')) {
        return rows([{ enabled: true, sampleRate: 1, maxDurationSeconds: 600, retentionDays: 30,
          privacyMode: 'balanced', requireConsent: false, maskSelectors: [], blockSelectors: [], ignoreSelectors: [],
          selectedFunnelIds: ['fnl_onboarding'] }]);
      }
      if (text.includes('FROM replay_setting_funnels rsf')) {
        return rows([{ id: 'fnl_onboarding', name: 'Onboarding', trigger_event_name: 'onboarding_started' }]);
      }
      if (text.includes('pg_advisory_xact_lock')) return empty();
      if (text.includes('INSERT INTO sessions')) return affected(1);
      if (text.includes('SELECT s.id,s.user_id,s.anonymous_id,u.external_id')) {
        return rows([{ id: 'sess_shared', user_id: null, anonymous_id: 'anon_shared', external_id: null }]);
      }
      if (text.includes('SELECT * FROM session_replays WHERE id=$1 AND project_id=$2')) {
        const found = storedReplays.get(values[0]);
        return found ? rows([found]) : empty();
      }
      if (text.includes('SELECT * FROM session_replays WHERE id=$1 FOR UPDATE')) {
        const found = storedReplays.get(values[0]);
        return found ? rows([found]) : empty();
      }
      if (text.includes('INSERT INTO session_replays')) {
        const created = {
          id: values[0], organization_id: values[1], project_id: values[2], session_id: values[3],
          user_id: values[4], anonymous_id: values[5], started_at: values[6], storage_prefix: values[7],
          recording_format: values[8], recording_version: values[9], privacy_mode: values[10],
          chunk_count: 0, event_count: 0, compressed_size_bytes: 0,
          uncompressed_size_bytes: 0, status: 'recording', deleted_at: null,
          expires_at: new Date(Date.now() + 86_400_000).toISOString()
        };
        storedReplays.set(values[0], created);
        return rows([created]);
      }
      if (text.includes('INSERT INTO session_replay_funnels')) return affected(1);
      if (text.includes('FROM replay_chunks WHERE replay_id=$1 AND sequence=$2')) return empty();
      if (text.includes('INSERT INTO replay_chunks')) {
        const reservation = { id: values[0], replay_id: values[1], sequence: values[2], storage_key: values[3],
          event_count: values[4], compressed_size_bytes: values[5], uncompressed_size_bytes: values[6],
          content_sha256: values[7], status: 'uploading' };
        storedReservations.set(values[0], reservation);
        return affected(1);
      }
      if (text.includes('FROM replay_chunks WHERE id=$1 AND replay_id=$2')) {
        const found = storedReservations.get(values[0]);
        return found ? rows([found]) : empty();
      }
      if (text.includes("UPDATE replay_chunks SET status='ready'")) return affected(1);
      if (text.includes('UPDATE session_replays')) return affected(1);
      return empty();
    });

    const storage = new MemoryStorage();
    const events = { authenticateWriteKey: vi.fn(async () => ({ project_id: 'proj_a', organization_id: 'org_a' })) };
    const projects = { requireActiveProject: vi.fn(), requireWritableProject: vi.fn() };
    const entitlements = {
      assertReplayAvailable: vi.fn(async () => ({})), assertReplayCapacity: vi.fn(async () => ({})),
      recordReplayUsage: vi.fn(async () => undefined), assertReplaySettings: vi.fn(async () => ({})),
      getSnapshot: vi.fn(async () => ({ deploymentMode: 'self_hosted', features: { sessionReplay: true }, limits: {} }))
    };
    const tokens = new ReplayTokenService();
    const service = new ReplayService(db as never, events as never, projects as never, entitlements as never, tokens, storage);

    const now = Date.now();
    const t0 = new Date(now - 60_000).toISOString();
    const grantA = await service.authorizeUpload('write_key', {
      projectId: 'proj_a', sessionId: 'sess_shared', anonymousId: 'anon_shared', consentGranted: true
    });
    expect(grantA.replayId).toBeDefined();

    const resultA = await service.ingestChunk(grantA.token, {
      projectId: 'proj_a', sessionId: 'sess_shared', anonymousId: 'anon_shared', sequence: 0,
      startedAt: t0, endedAt: t0, events: [canaryEvent(new Date(t0).getTime())]
    });
    expect(resultA.accepted).toBe(true);
    expect(resultA.replayId).toBe(grantA.replayId);

    // Later, in the same analytics session, activation B starts with a new startedAt (e.g. 50s later)
    const t1 = new Date(now - 10_000).toISOString();
    const grantB = await service.authorizeUpload('write_key', {
      projectId: 'proj_a', sessionId: 'sess_shared', anonymousId: 'anon_shared', consentGranted: true
    });
    expect(grantB.replayId).toBeDefined();
    expect(grantB.replayId).not.toBe(grantA.replayId);

    const resultB = await service.ingestChunk(grantB.token, {
      projectId: 'proj_a', sessionId: 'sess_shared', anonymousId: 'anon_shared', sequence: 0,
      startedAt: t1, endedAt: t1, events: [canaryEvent(new Date(t1).getTime())]
    });
    expect(resultB.accepted).toBe(true);
    expect(resultB.replayId).toBe(grantB.replayId);
    expect(resultB.replayId).not.toBe(resultA.replayId);

    expect(storedReplays.size).toBe(2);
    expect(new Date(storedReplays.get(grantA.replayId!).started_at).toISOString()).toBe(t0);
    expect(new Date(storedReplays.get(grantB.replayId!).started_at).toISOString()).toBe(t1);
  });
});

describe('Replay sanitizer privacy modes', () => {
  it('strict masks visible text while balanced preserves only non-secret ordinary text', () => {
    const source = [{ type: 2, timestamp: 1, data: { node: { tagName: 'p', textContent: 'Welcome back' } } }];
    expect(JSON.stringify(sanitizeReplayEvents(source, 'strict'))).not.toContain('Welcome back');
    expect(JSON.stringify(sanitizeReplayEvents(source, 'balanced'))).toContain('Welcome back');
    expect(JSON.stringify(sanitizeReplayEvents([{ type: 2, timestamp: 1, data: {
      node: { tagName: 'p', textContent: `api_key=${CANARIES.text}` }
    } }], 'balanced'))).not.toContain(CANARIES.text);
  });

  it('always masks rrweb incremental input events', () => {
    const result = sanitizeReplayEvents([{ type: 3, timestamp: 1, data: { source: 5, text: CANARIES.text } }], 'balanced');
    expect(JSON.stringify(result)).not.toContain(CANARIES.text);
  });
});

describe('Mobile replay API format isolation', () => {
  const identity = { projectId: 'proj_a', sessionId: 'sess_a', anonymousId: 'anon_a' };

  it('binds a mobile grant to its format and stores a schema-validated chunk', async () => {
    const { service, tokens, storage, db } = makeService({ recordingFormat: 'mobile-structural-v1' });
    const grant = await service.authorizeUpload('write_key', {
      ...identity, consentGranted: true, recordingFormat: 'mobile-structural-v1'
    });
    expect(tokens.verify(grant.token).recordingFormat).toBe('mobile-structural-v1');

    const chunk = mobileChunk();
    const result = await service.ingestChunk(grant.token, { ...identity, sequence: 0, events: chunk });
    expect(result).toMatchObject({ accepted: true, duplicate: false, replayId: grant.replayId });
    const stored = JSON.parse(gunzipSync([...storage.objects.values()][0]).toString('utf8'));
    expect(stored).toEqual(chunk);
    expect(db.queryCalls(/INSERT INTO session_replays/)[0].values.slice(8, 10)).toEqual(['mobile-structural-v1', '1']);
    expect(db.queryCalls(/INSERT INTO replay_chunks/)[0].values[4]).toBe(chunk.events.length);
  });

  it('accepts the same mobile contract through bounded gzip-base64 transport', async () => {
    const { service, storage } = makeService({ recordingFormat: 'mobile-structural-v1' });
    const grant = await service.authorizeUpload('write_key', {
      ...identity, consentGranted: true, recordingFormat: 'mobile-structural-v1'
    });
    const chunk = mobileChunk();
    const encodedEvents = gzipSync(Buffer.from(JSON.stringify(chunk))).toString('base64');
    await service.ingestChunk(grant.token, { ...identity, sequence: 0, encoding: 'gzip-base64', encodedEvents });
    expect(JSON.parse(gunzipSync([...storage.objects.values()][0]).toString('utf8'))).toEqual(chunk);
  });

  it('rejects content-bearing fields and mismatched mobile sequences before reserving storage', async () => {
    const { service, storage, db } = makeService({ recordingFormat: 'mobile-structural-v1' });
    const grant = await service.authorizeUpload('write_key', {
      ...identity, consentGranted: true, recordingFormat: 'mobile-structural-v1'
    });
    const content = mobileChunk();
    content.events[0].nodes[1].text = CANARIES.text;
    await expect(service.ingestChunk(grant.token, { ...identity, sequence: 0, events: content }))
      .rejects.toThrow(/privacy schema/);
    const wrongSequence = mobileChunk();
    wrongSequence.sequence = 1;
    await expect(service.ingestChunk(grant.token, { ...identity, sequence: 0, events: wrongSequence }))
      .rejects.toThrow(/sequence/);
    expect(storage.put).not.toHaveBeenCalled();
    expect(db.queryCalls(/INSERT INTO replay_chunks/)).toHaveLength(0);
  });

  it('cannot use a browser grant for mobile data or a mobile grant for rrweb data', async () => {
    const { service, uploadToken } = makeService();
    await expect(service.ingestChunk(uploadToken, { ...identity, sequence: 0, events: mobileChunk() }))
      .rejects.toThrow(/rrweb/);
    const mobile = makeService({ recordingFormat: 'mobile-structural-v1' });
    const grant = await mobile.service.authorizeUpload('write_key', {
      ...identity, consentGranted: true, recordingFormat: 'mobile-structural-v1'
    });
    await expect(mobile.service.ingestChunk(grant.token, { ...identity, sequence: 0, events: [canaryEvent()] }))
      .rejects.toThrow(/privacy schema/);
  });

  it('cannot append mobile chunks to an existing browser replay', async () => {
    const { service, tokens, db } = makeService();
    const token = tokens.sign({ ...identity, organizationId: 'org_a', consentGranted: false,
      requireConsent: false, privacyMode: 'balanced', maxDurationSeconds: 600, maxChunks: 3000,
      maxCompressedBytes: 250_000_000, maxUncompressedBytes: 250_000_000,
      matchedFunnelIds: ['fnl_onboarding'], recordingFormat: 'mobile-structural-v1' }, 300).token;
    await expect(service.ingestChunk(token, { ...identity, sequence: 0, events: mobileChunk() }))
      .rejects.toThrow(/format does not match/);
    expect(db.queryCalls(/INSERT INTO replay_chunks/)).toHaveLength(0);
  });

  it('cannot append a chunk to a replay from another analytics session', async () => {
    const { service, uploadToken, replay, db } = makeService();
    replay.session_id = 'sess_other';
    await expect(service.ingestChunk(uploadToken, { ...identity, sequence: 0, events: [canaryEvent()] }))
      .rejects.toThrow(/does not belong.*session/);
    expect(db.queryCalls(/INSERT INTO replay_chunks/)).toHaveLength(0);
  });

  it('returns format-aware mobile events without sending them through rrweb playback', async () => {
    const chunk = mobileChunk();
    const compressed = gzipSync(Buffer.from(JSON.stringify(chunk)), { level: 6 });
    const digest = createHash('sha256').update(compressed).digest('hex');
    const storageKey = `org_a/proj_a/sess_a/000000-${digest.slice(0, 12)}.json.gz`;
    const { service, storage } = makeService({ recordingFormat: 'mobile-structural-v1', playback: true,
      existingChunk: { content_sha256: digest, storage_key: storageKey } });
    storage.objects.set(storageKey, compressed);
    const result = await service.playback({ id: 'owner' }, 'rpl_test', 'proj_a');
    expect(result).toMatchObject({ replayId: 'rpl_test', recordingFormat: 'mobile-structural-v1',
      recordingVersion: '1', runtime: 'react-native', platform: 'android', events: chunk.events, done: true });
  });

  it('keeps browser playback in the rrweb projection', async () => {
    const sanitized = sanitizeReplayEvents([canaryEvent()], 'balanced');
    const compressed = gzipSync(Buffer.from(JSON.stringify(sanitized)), { level: 6 });
    const digest = createHash('sha256').update(compressed).digest('hex');
    const storageKey = `org_a/proj_a/sess_a/000000-${digest.slice(0, 12)}.json.gz`;
    const { service, storage } = makeService({ playback: true,
      existingChunk: { content_sha256: digest, storage_key: storageKey } });
    storage.objects.set(storageKey, compressed);
    const result = await service.playback({ id: 'owner' }, 'rpl_test', 'proj_a');
    expect(result.recordingFormat).toBe('rrweb-json-gzip');
    expect(JSON.stringify(result.events)).not.toContain('example.test');
  });

  it('rejects a stored mobile chunk with content-bearing fields even when its checksum matches', async () => {
    const chunk = mobileChunk();
    chunk.events[0].nodes[1].text = CANARIES.text;
    const compressed = gzipSync(Buffer.from(JSON.stringify(chunk)), { level: 6 });
    const digest = createHash('sha256').update(compressed).digest('hex');
    const storageKey = `org_a/proj_a/sess_a/000000-${digest.slice(0, 12)}.json.gz`;
    const { service, storage } = makeService({ recordingFormat: 'mobile-structural-v1', playback: true,
      existingChunk: { content_sha256: digest, storage_key: storageKey } });
    storage.objects.set(storageKey, compressed);
    await expect(service.playback({ id: 'owner' }, 'rpl_test', 'proj_a')).rejects.toThrow(/privacy schema/);
  });

  it('preserves browser defaults and rejects an unsupported format before authorization', async () => {
    const { service, tokens } = makeService();
    const browser = await service.authorizeUpload('write_key', { ...identity, consentGranted: true });
    expect(tokens.verify(browser.token).recordingFormat).toBe('rrweb-json-gzip');
    await expect(service.authorizeUpload('write_key', { ...identity, consentGranted: true,
      recordingFormat: 'video' as never })).rejects.toThrow(/unsupported/);
  });
});
