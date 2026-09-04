import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, symlink } from 'node:fs/promises';
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

function makeService({ enabled = true, existingChunk }: { enabled?: boolean; existingChunk?: { content_sha256: string; storage_key: string } } = {}) {
  const now = Date.now();
  const replay = {
    id: 'rpl_test', organization_id: 'org_a', project_id: 'proj_a', session_id: 'sess_a',
    storage_prefix: 'org_a/proj_a/sess_a', privacy_mode: 'balanced',
    started_at: new Date(now - 1_000).toISOString(), expires_at: new Date(now + 86_400_000).toISOString(),
    chunk_count: 0, event_count: 0, compressed_size_bytes: 0, uncompressed_size_bytes: 0,
    status: 'recording', deleted_at: null
  };
  let reservation: Record<string, unknown> | undefined;
  const callOrder: string[] = [];
  const db = mockDatabase((text, values) => {
    if (text.includes('FROM replay_settings')) return rows([{ enabled, sampleRate: 1, maxDurationSeconds: 600,
      retentionDays: 30, privacyMode: 'balanced', requireConsent: false, maskSelectors: [], blockSelectors: [], ignoreSelectors: [] }]);
    if (text.includes('pg_advisory_xact_lock')) return empty();
    if (text.includes('INSERT INTO sessions')) return affected(1);
    if (text.includes('SELECT s.id,s.user_id,s.anonymous_id,u.external_id')) {
      return rows([{ id: 'sess_a', user_id: null, anonymous_id: 'anon_a', external_id: null }]);
    }
    if (text.includes('SELECT * FROM session_replays WHERE project_id')) return rows([replay]);
    if (text.includes('SELECT * FROM session_replays WHERE id=$1 FOR UPDATE')) return rows([replay]);
    if (text.includes('FROM replay_chunks WHERE replay_id=$1 AND sequence=$2')) {
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
    maxChunks: 3_000, maxCompressedBytes: 250_000_000, maxUncompressedBytes: 250_000_000
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
      maxCompressedBytes: 250_000_000, maxUncompressedBytes: 250_000_000 });
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

  it('keeps Cloud replay unavailable until an explicit entitlement override exists', async () => {
    const db = mockDatabase((text) => text.includes('entitlement_overrides') ? empty() : rows([{
      plan_key: 'pro', status: 'active', grace_period_ends_at: null, subscription_updated_at: null,
      projects: '1', members: '1', events: '0', ai_insights: '0', replay_sessions: '0', replay_storage_bytes: '0'
    }]));
    const entitlements = new EntitlementService(db as never, { deploymentMode: 'cloud' });
    await expect(entitlements.assertReplayAvailable('org_a')).rejects.toThrow(/not enabled/);
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
