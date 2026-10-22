import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { EventsService } from '../src/modules/events/events.service';
import {
  CaptureSettings,
  DEFAULT_CAPTURE_SETTINGS,
  REDACTED,
  normalizeApiRequest,
  stripApiRequestPayload
} from '../src/modules/requests/request-capture';
import { RequestsService, decodeCursor, encodeCursor, validateSettings } from '../src/modules/requests/requests.service';
import { affected, empty, mockDatabase, rows } from './helpers/mock-db';

const enabled: CaptureSettings = { ...DEFAULT_CAPTURE_SETTINGS, enabled: true, captureBodies: true };

function normalize(properties: Record<string, unknown>, settings: CaptureSettings | null = null) {
  return normalizeApiRequest({
    id: 'req_1',
    eventId: 'evt_1',
    organizationId: 'org_1',
    projectId: 'proj_1',
    occurredAt: new Date('2026-10-15T10:00:00.000Z'),
    properties,
    settings
  });
}

const base = { method: 'post', path: '/orders/:id', status: 201, durationMs: 42.123 };

describe('normalizeApiRequest', () => {
  it('normalizes metadata and defaults to metadata-only', () => {
    const record = normalize({
      ...base,
      requestId: 'req-abc',
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      service: 'billing-api',
      environment: 'production',
      url: 'https://api.example.test/orders/9?token=secret#frag',
      requestSize: '120',
      responseSize: 512
    });
    expect(record).toMatchObject({
      method: 'POST',
      route: '/orders/:id',
      statusCode: 201,
      durationMs: 42.12,
      requestId: 'req-abc',
      service: 'billing-api',
      environment: 'production',
      host: 'api.example.test',
      url: 'https://api.example.test/orders/9',
      requestSize: 120,
      responseSize: 512,
      captureState: 'metadata_only',
      payload: null
    });
    expect(record?.captureReason).toMatch(/did not send a payload/);
    expect(JSON.stringify(record)).not.toContain('secret');
  });

  it('returns null for malformed requests so they are never half-recorded', () => {
    expect(normalize({ method: 'GET', path: '/x' })).toBeNull();
    expect(normalize({ ...base, status: 'abc' })).toBeNull();
    expect(normalize({ ...base, status: 1200 })).toBeNull();
  });

  it('drops invalid correlation ids', () => {
    const record = normalize({ ...base, requestId: 'has spaces <script>', traceId: 'x'.repeat(300) });
    expect(record?.requestId).toBeNull();
    expect(record?.traceId).toBeNull();
  });

  it('discards payloads when the project has not enabled capture', () => {
    const record = normalize({
      ...base,
      payload: { request: { headers: { 'x-custom': 'a' }, body: { name: 'Ada' }, contentType: 'application/json' } }
    });
    expect(record?.captureState).toBe('metadata_only');
    expect(record?.payload).toBeNull();
    expect(record?.captureReason).toMatch(/disabled for this project/);
  });

  it('respects service and route allow-lists', () => {
    const payload = { request: { body: '{}', contentType: 'application/json' } };
    const services = normalize({ ...base, service: 'web', payload }, { ...enabled, services: ['billing-api'] });
    expect(services?.captureState).toBe('metadata_only');
    expect(services?.captureReason).toMatch(/service "web"/);

    const routes = normalize({ ...base, service: 'billing-api', payload }, { ...enabled, routes: ['/admin'] });
    expect(routes?.captureState).toBe('metadata_only');

    const allowed = normalize({ ...base, service: 'billing-api', payload }, { ...enabled, routes: ['/orders'] });
    expect(allowed?.captureState).toBe('captured');
  });

  it('redacts sensitive headers, query params and body fields before persistence', () => {
    const record = normalize(
      {
        ...base,
        payload: {
          request: {
            headers: { Authorization: 'Bearer abc.def.ghi', Cookie: 'sid=1', 'X-Trace': 'ok', 'X-Session-Token': 't' },
            query: { page: '2', api_key: 'k-123', next: 'Bearer abcdefghijklmnop' },
            contentType: 'application/json',
            body: JSON.stringify({
              email: 'ada@example.test',
              password: 'hunter2',
              profile: { cardNumber: '4111 1111 1111 1111', note: 'card 4111111111111111 on file', plan: 'pro' }
            })
          },
          response: { headers: { 'set-cookie': 'a=b' }, contentType: 'application/json', body: { ok: true } }
        }
      },
      enabled
    );

    expect(record?.captureState).toBe('redacted');
    const payload = record?.payload as any;
    expect(payload.request.headers.authorization).toBe(REDACTED);
    expect(payload.request.headers.cookie).toBe(REDACTED);
    expect(payload.request.headers['x-session-token']).toBe(REDACTED);
    expect(payload.request.headers['x-trace']).toBe('ok');
    expect(payload.request.query).toEqual({ page: '2', api_key: REDACTED, next: REDACTED });
    expect(payload.request.body.state).toBe('redacted');
    expect(payload.request.body.value).toEqual({
      email: REDACTED,
      password: REDACTED,
      profile: { cardNumber: REDACTED, note: `card ${REDACTED} on file`, plan: 'pro' }
    });
    expect(payload.response.headers['set-cookie']).toBe(REDACTED);
    expect(payload.response.body).toMatchObject({ state: 'captured', value: { ok: true } });
    const serialized = JSON.stringify(record);
    for (const secret of ['hunter2', 'abc.def.ghi', 'k-123', '4111', 'ada@example.test', 'sid=1']) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('applies project-configured redact fields', () => {
    const record = normalize(
      { ...base, payload: { request: { contentType: 'application/json', body: { customerRef: 'C-1', plan: 'pro' } } } },
      { ...enabled, redactFields: ['customer_ref'] }
    );
    expect((record?.payload as any).request.body.value).toEqual({ customerRef: REDACTED, plan: 'pro' });
  });

  it('truncates bodies over the size limit and never stores binary content', () => {
    const big = normalize(
      { ...base, payload: { response: { contentType: 'text/plain', body: 'x'.repeat(5000) } } },
      { ...enabled, maxBodyBytes: 100 }
    );
    const response = (big?.payload as any).response.body;
    expect(response.state).toBe('truncated');
    expect(response.value).toHaveLength(100);
    expect(response.size).toBe(5000);

    const binary = normalize(
      { ...base, payload: { response: { contentType: 'image/png', body: 'PNG...' } } },
      enabled
    );
    expect((binary?.payload as any).response.body.state).toBe('unavailable');
    expect(JSON.stringify(binary)).not.toContain('PNG...');
  });

  it('keeps headers but explains when bodies are not captured', () => {
    const record = normalize(
      { ...base, payload: { request: { headers: { accept: 'json' }, body: { a: 1 }, contentType: 'application/json' } } },
      { ...enabled, captureBodies: false }
    );
    const request = (record?.payload as any).request;
    expect(request.headers).toEqual({ accept: 'json' });
    expect(request.body.state).toBe('not_captured');
    expect(request.body.value).toBeUndefined();
  });

  it('records an explicit unavailable state from the SDK', () => {
    const record = normalize({ ...base, payload: { state: 'unavailable', reason: 'streamed response' } }, enabled);
    expect(record?.captureState).toBe('unavailable');
    expect(record?.captureReason).toBe('streamed response');
    expect(record?.payload).toBeNull();
  });
});

describe('stripApiRequestPayload', () => {
  it('removes payloads and query strings from $api_request events only', () => {
    const props = { path: '/a?x=1', url: 'https://h.test/a?token=1', payload: { request: { body: 'secret' } } };
    expect(stripApiRequestPayload('$api_request', props)).toEqual({ path: '/a', url: 'https://h.test/a' });
    expect(stripApiRequestPayload('signup', props)).toBe(props);
  });
});

describe('EventsService $api_request ingestion', () => {
  function makeService(settings: Record<string, unknown> | null = null) {
    const db = mockDatabase((text) => {
      if (text.includes('FROM project_write_keys pwk')) return rows([{ project_id: 'proj_1', organization_id: 'org_1' }]);
      if (text.includes('FROM api_request_capture_settings')) return settings ? rows([settings]) : empty();
      return affected(1);
    });
    const webhooks = { deliverForEvent: vi.fn().mockResolvedValue(undefined) };
    const achievements = { afterProjectIngest: vi.fn().mockResolvedValue(undefined) };
    const requests = new RequestsService(db as never, {} as never);
    const service = new EventsService(
      db as never,
      webhooks as never,
      achievements as never,
      { consumeProjectEvents: vi.fn().mockResolvedValue({}) } as never,
      undefined,
      requests
    );
    return { db, webhooks, service };
  }

  const payload = {
    request: { headers: { authorization: 'Bearer zzzzzzzzzz' }, contentType: 'application/json', body: '{"password":"p"}' }
  };

  it('stores the event without payload and writes a metadata-only request record', async () => {
    const { db, webhooks, service } = makeService();
    await service.ingest({
      writeKey: 'key',
      projectId: 'proj_1',
      eventName: '$api_request',
      properties: { ...base, requestId: 'req-1', payload }
    });

    const eventInsert = db.queryCalls(/INSERT INTO events/)[0];
    expect(JSON.stringify(eventInsert.values)).not.toContain('payload');
    expect(JSON.stringify(eventInsert.values)).not.toContain('zzzzzzzzzz');
    expect(JSON.stringify(webhooks.deliverForEvent.mock.calls)).not.toContain('zzzzzzzzzz');

    const requestInsert = db.queryCalls(/INSERT INTO api_requests/);
    expect(requestInsert).toHaveLength(1);
    expect(requestInsert[0].values).toContain('metadata_only');
    expect(requestInsert[0].values).toContain('req-1');
    expect(requestInsert[0].values).toContain('proj_1');
    expect(JSON.stringify(requestInsert[0].values)).not.toContain('zzzzzzzzzz');
    // Same transaction as the event write.
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it('stores a redacted payload when the project allows capture', async () => {
    const { db, service } = makeService({
      enabled: true,
      services: [],
      routes: [],
      capture_headers: true,
      capture_bodies: true,
      redact_fields: [],
      max_body_bytes: 8192
    });
    await service.ingestBatch('key', 'proj_1', [
      { eventName: '$api_request', properties: { ...base, payload } },
      { eventName: 'signup' }
    ]);
    const requestInsert = db.queryCalls(/INSERT INTO api_requests/);
    expect(requestInsert).toHaveLength(1);
    const values = JSON.stringify(requestInsert[0].values);
    expect(values).toContain('redacted');
    expect(values).not.toContain('zzzzzzzzzz');
    expect(values).not.toContain('"p"');
  });

  it('keeps the event when the request insert fails (savepoint rollback)', async () => {
    const db = mockDatabase((text) => {
      if (text.includes('FROM project_write_keys pwk')) return rows([{ project_id: 'proj_1', organization_id: 'org_1' }]);
      if (text.includes('INSERT INTO api_requests')) throw new Error('relation "api_requests" does not exist');
      return affected(1);
    });
    const service = new EventsService(
      db as never,
      { deliverForEvent: vi.fn().mockResolvedValue(undefined) } as never,
      { afterProjectIngest: vi.fn().mockResolvedValue(undefined) } as never,
      { consumeProjectEvents: vi.fn().mockResolvedValue({}) } as never,
      undefined,
      new RequestsService(db as never, {} as never)
    );
    const result = await service.ingest({ writeKey: 'key', projectId: 'proj_1', eventName: '$api_request', properties: base });
    expect(result.accepted).toBe(true);
    expect(db.queryCalls(/INSERT INTO events/)).toHaveLength(1);
    expect(db.queryCalls('ROLLBACK TO SAVEPOINT api_requests_insert')).toHaveLength(1);
  });

  it('does not write request records for other events', async () => {
    const { db, service } = makeService();
    await service.ingest({ writeKey: 'key', projectId: 'proj_1', eventName: 'signup' });
    expect(db.queryCalls(/INSERT INTO api_requests/)).toHaveLength(0);
    expect(db.queryCalls(/api_request_capture_settings/)).toHaveLength(0);
  });
});

// ─── RequestsService ──────────────────────────────────────────────────────────

const user = { id: 'usr_1', authMethod: 'supabase' } as never;
const project = { id: 'proj_1', name: 'Shop', role: 'owner', organizationId: 'org_1' };

function projectsFor(resolved: typeof project | null = project) {
  return {
    resolveActiveProject: vi.fn(async (_user: unknown, projectId?: string) => {
      if (projectId && projectId !== resolved?.id) throw new NotFoundException('Project not found or not accessible.');
      return resolved;
    }),
    requireActiveProject: vi.fn(async (_user: unknown, projectId?: string) => {
      if (!resolved || (projectId && projectId !== resolved.id)) throw new NotFoundException('nope');
      return resolved;
    })
  };
}

const requestRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'req_1',
  occurredAt: '2026-10-15T10:00:00.000Z',
  requestId: 'rid-1',
  traceId: 'trace-1',
  service: 'api',
  environment: 'production',
  method: 'GET',
  route: '/orders',
  statusCode: 200,
  durationMs: '12.5',
  responseSize: null,
  captureState: 'metadata_only',
  projectId: 'proj_1',
  sessionId: null,
  userId: null,
  ...overrides
});

describe('RequestsService queries', () => {
  it('scopes every list query to the resolved project and applies filters server-side', async () => {
    const db = mockDatabase(() => rows([requestRow()]));
    const service = new RequestsService(db as never, projectsFor() as never);
    const result = await service.list(user, {
      range: '7d',
      service: 'api',
      method: 'get',
      status: '5xx',
      environment: 'production',
      capture: 'payload',
      route: '/orders',
      search: '50%_off'
    });

    expect(result.requests).toHaveLength(1);
    expect(result.requests[0].durationMs).toBe(12.5);
    const call = db.queryCalls(/FROM api_requests/)[0];
    expect(call.values[0]).toBe('proj_1');
    expect(call.text).toContain('project_id = $1');
    expect(call.text).toContain('service = $');
    expect(call.text).toContain('method = $');
    expect(call.values).toContain('GET');
    expect(call.values).toContain(500);
    expect(call.text).toContain("capture_state IN ('captured', 'redacted')");
    expect(call.values).toContain('%50\\%\\_off%');
    expect(call.text).toMatch(/ORDER BY occurred_at DESC, id DESC/);
    expect(db.queryCalls(/statement_timeout/)).toHaveLength(1);
  });

  it('rejects a project the user cannot access', async () => {
    const db = mockDatabase(() => rows([]));
    const service = new RequestsService(db as never, projectsFor() as never);
    await expect(service.list(user, { projectId: 'proj_other' })).rejects.toBeInstanceOf(NotFoundException);
    expect(db.queryCalls(/FROM api_requests/)).toHaveLength(0);
  });

  it('paginates with keyset cursors', async () => {
    const page = Array.from({ length: 3 }, (_, i) =>
      requestRow({ id: `req_${i}`, occurredAt: `2026-10-15T10:00:0${5 - i}.000Z` })
    );
    const db = mockDatabase(() => rows(page));
    const service = new RequestsService(db as never, projectsFor() as never);
    const first = await service.list(user, { limit: 2 });
    expect(first.requests).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();

    await service.list(user, { limit: 2, cursor: first.nextCursor ?? undefined });
    const second = db.queryCalls(/FROM api_requests/)[1];
    expect(second.text).toContain('(occurred_at, id) < (');
    expect(second.values).toContain('req_1');
  });

  it('paginates duration sort by (duration, id) and rejects mismatched cursors', async () => {
    const cursor = encodeCursor({ k: 'duration', v: 900, id: 'req_9' });
    expect(decodeCursor(cursor, 'duration')).toEqual({ k: 'duration', v: 900, id: 'req_9' });
    expect(() => decodeCursor(cursor, 'time')).toThrow(BadRequestException);
    expect(() => decodeCursor('garbage', 'time')).toThrow(BadRequestException);

    const db = mockDatabase(() => rows([]));
    const service = new RequestsService(db as never, projectsFor() as never);
    await service.list(user, { sort: 'duration', cursor });
    const call = db.queryCalls(/FROM api_requests/)[0];
    expect(call.text).toContain('(duration_ms, id) < (');
    expect(call.text).toContain('ORDER BY duration_ms DESC, id DESC');
  });

  it('rejects unsupported filters and oversized ranges', async () => {
    const service = new RequestsService(mockDatabase(() => rows([])) as never, projectsFor() as never);
    await expect(service.list(user, { method: 'BREW' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.list(user, { status: 'bad' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.list(user, { capture: 'all-the-things' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.list(user, { from: '2026-01-01T00:00:00Z', to: '2026-03-01T00:00:00Z' })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('computes summary metrics: server-error rate and p95', async () => {
    const db = mockDatabase((text) =>
      text.includes('percentile_cont')
        ? rows([{ total: 400, server_errors: 7, p95: 812.345, captured: 10, redacted: 5, metadata_only: 380, unavailable: 5 }])
        : empty()
    );
    const service = new RequestsService(db as never, projectsFor() as never);
    const { summary } = await service.summary(user, { range: '24h', service: 'api' });
    expect(summary).toEqual({
      total: 400,
      serverErrors: 7,
      errorRate: 1.75,
      p95: 812.3,
      captures: { captured: 10, redacted: 5, metadataOnly: 380, unavailable: 5 }
    });
    const call = db.queryCalls(/percentile_cont/)[0];
    expect(call.text).toContain('status_code >= 500');
    expect(call.values).toContain('api');
  });

  it('returns a zeroed summary for an empty window', async () => {
    const db = mockDatabase(() => rows([{ total: 0, server_errors: 0, p95: null, captured: 0, redacted: 0, metadata_only: 0, unavailable: 0 }]));
    const service = new RequestsService(db as never, projectsFor() as never);
    const { summary } = await service.summary(user, {});
    expect(summary.errorRate).toBe(0);
    expect(summary.p95).toBe(0);
  });

  it('returns 404 for a request id outside the active project', async () => {
    const db = mockDatabase(() => empty());
    const service = new RequestsService(db as never, projectsFor() as never);
    await expect(service.detail(user, 'req_x')).rejects.toBeInstanceOf(NotFoundException);
    const call = db.queryCalls(/FROM api_requests/)[0];
    expect(call.text).toContain('id = $1 AND project_id = $2');
    expect(call.values).toEqual(['req_x', 'proj_1']);
  });
});

describe('RequestsService correlation', () => {
  it('reports no instrumentation instead of inventing spans when ids are missing', async () => {
    const db = mockDatabase((text) =>
      text.includes('FROM api_requests WHERE id') ? rows([requestRow({ requestId: null, traceId: null })]) : empty()
    );
    const service = new RequestsService(db as never, projectsFor() as never);
    const timeline = await service.timeline(user, 'req_1');
    expect(timeline.instrumented).toBe(false);
    expect(timeline.entries).toHaveLength(1);
    const related = await service.related(user, 'req_1');
    expect(related.logs).toEqual([]);
    expect(related.errors).toEqual([]);
    expect(db.queryCalls(/observability_logs/)).toHaveLength(0);
    expect(db.queryCalls(/FROM events/)).toHaveLength(0);
  });

  it('links logs, errors and synthetic runs by exact request/trace id within the project', async () => {
    const db = mockDatabase((text) => {
      if (text.includes('FROM api_requests WHERE id')) return rows([requestRow()]);
      if (text.includes('FROM observability_logs')) {
        return rows([{ id: 'log_1', timestamp: '2026-10-15T10:00:00.010Z', service: 'api', operation: 'db.query', status: 'success', durationMs: 4, matchedBy: 'request_id' }]);
      }
      if (text.includes('FROM events')) return rows([{ id: 'evt_9', type: 'TypeError', message: 'boom', matchedBy: 'request_id' }]);
      if (text.includes('FROM synthetic_runs')) return rows([{ id: 'run_1', monitorId: 'mon_1', status: 'failed' }]);
      return empty();
    });
    const service = new RequestsService(db as never, projectsFor() as never);
    const related = await service.related(user, 'req_1');

    expect(related.logs).toHaveLength(1);
    expect(related.errors).toEqual([{ id: 'evt_9', type: 'TypeError', message: 'boom', matchedBy: 'request_id' }]);
    expect(related.syntheticRuns).toHaveLength(1);

    const logs = db.queryCalls(/FROM observability_logs/)[0];
    expect(logs.values[0]).toBe('proj_1');
    expect(logs.values).toContain('rid-1');
    expect(logs.values).toContain('trace-1');
    expect(logs.text).not.toMatch(/session_id|distinct_id/);
    const errors = db.queryCalls(/FROM events/)[0];
    expect(errors.text).toContain("properties->>'requestId' = $4");
    expect(errors.values[0]).toBe('proj_1');
    const runs = db.queryCalls(/FROM synthetic_runs/)[0];
    expect(runs.text).toContain('r.project_id = $1');
    expect(runs.values).toContain('rid-1');

    const timeline = await service.timeline(user, 'req_1');
    expect(timeline.instrumented).toBe(true);
    expect(timeline.entries.map((e) => e.kind)).toEqual(['request', 'log']);
    expect(timeline.entries[1].offsetMs).toBe(10);
  });

  it('nests timeline entries only through recorded span and request ids', async () => {
    const db = mockDatabase((text) => {
      if (text.includes('FROM api_requests WHERE id')) return rows([requestRow({ spanId: 'span-a', parentSpanId: null })]);
      if (text.includes('FROM api_requests')) {
        return rows([
          requestRow({ id: 'req_2', requestId: 'rid-2', occurredAt: '2026-10-15T10:00:00.002Z', spanId: 'span-b', parentSpanId: 'span-a' }),
          requestRow({ id: 'req_3', requestId: null, occurredAt: '2026-10-15T10:00:00.003Z', spanId: 'span-c', parentSpanId: 'span-missing' })
        ]);
      }
      if (text.includes('FROM observability_logs')) {
        return rows([
          { id: 'log_1', timestamp: '2026-10-15T10:00:00.004Z', level: 'info', message: 'query ok', service: 'api', operation: 'db.query', status: 'success', durationMs: 4, requestId: 'rid-2', matchedBy: 'trace_id' },
          { id: 'log_2', timestamp: '2026-10-15T10:00:00.005Z', level: 'warn', message: 'slow', service: 'api', operation: 'cache', status: 'warning', durationMs: 1, requestId: null, matchedBy: 'trace_id' }
        ]);
      }
      return empty();
    });
    const service = new RequestsService(db as never, projectsFor() as never);
    const timeline = await service.timeline(user, 'req_1');
    const parents = Object.fromEntries(timeline.entries.map((e) => [e.id, e.parentId]));
    expect(parents).toEqual({ req_1: null, req_2: 'req_1', req_3: null, log_1: 'req_2', log_2: null });
    expect(timeline.entries.find((e) => e.id === 'log_1')).toMatchObject({ level: 'info', message: 'query ok' });
  });
});

describe('capture settings', () => {
  it('validates input', () => {
    expect(validateSettings({ enabled: true, routes: ['/api'], services: ['a', 'a'] })).toMatchObject({
      enabled: true,
      routes: ['/api'],
      services: ['a'],
      captureHeaders: true,
      captureBodies: false,
      maxBodyBytes: 8192
    });
    expect(() => validateSettings({ maxBodyBytes: 10_000_000 })).toThrow(BadRequestException);
    expect(() => validateSettings({ routes: ['api'] })).toThrow(BadRequestException);
    expect(() => validateSettings({ services: 'x' as never })).toThrow(BadRequestException);
  });

  it('only lets owners/admins with a session change settings', async () => {
    const db = mockDatabase(() => affected(1));
    const member = new RequestsService(db as never, projectsFor({ ...project, role: 'member' }) as never);
    await expect(member.updateCaptureSettings(user, { enabled: true })).rejects.toBeInstanceOf(ForbiddenException);

    const owner = new RequestsService(db as never, projectsFor() as never);
    await expect(
      owner.updateCaptureSettings({ id: 'usr_1', authMethod: 'pat' } as never, { enabled: true })
    ).rejects.toBeInstanceOf(ForbiddenException);

    const result = await owner.updateCaptureSettings(user, { enabled: true, captureBodies: true });
    expect(result.settings.enabled).toBe(true);
    const upsert = db.queryCalls(/INSERT INTO api_request_capture_settings/)[0];
    expect(upsert.values[0]).toBe('proj_1');
  });

  it('reads default metadata-only settings when none are stored', async () => {
    const service = new RequestsService(mockDatabase(() => empty()) as never, projectsFor() as never);
    const result = await service.getCaptureSettings(user);
    expect(result.settings).toEqual(DEFAULT_CAPTURE_SETTINGS);
    expect(result.canEdit).toBe(true);
  });
});
