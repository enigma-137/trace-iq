import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebhooksService, type DeliverableEvent } from '../src/modules/webhooks/webhooks.service';
import { affected, mockDatabase, rows, type MockDb } from './helpers/mock-db';

vi.mock('../src/common/url', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/common/url')>();
  return {
    ...actual,
    assertDnsSafeUrl: vi.fn().mockImplementation((url: string) => Promise.resolve(url))
  };
});

const baseEvent: DeliverableEvent = {
  id: 'evt_1',
  eventName: 'signup',
  userId: 'usr_1',
  anonymousId: null,
  sessionId: null,
  properties: { plan: 'pro' },
  occurredAt: '2026-01-01T00:00:00.000Z'
};

function makeHook(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'whk_1',
    project_id: 'proj_1',
    name: 'Slack',
    url: 'https://hooks.example.com/x',
    secret: null,
    event_names: null,
    enabled: true,
    status: 'active',
    failure_count: 0,
    last_status: null,
    last_delivered_at: null,
    archived_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

function makeService(db: MockDb) {
  const projects = {
    resolveActiveProject: vi.fn().mockResolvedValue({ id: 'proj_1', name: 'Default', role: 'admin' }),
    requireActiveProject: vi.fn().mockResolvedValue({ id: 'proj_1', name: 'Default', role: 'admin' }),
    requireWritableProject: vi.fn().mockResolvedValue({ id: 'proj_1', name: 'Default', role: 'admin' })
  };
  return new WebhooksService(db as never, projects as never);
}

describe('WebhooksService', () => {
  let service: WebhooksService;
  let db: MockDb;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: vi.fn().mockResolvedValue(JSON.stringify({ received: true }))
    }));
  });

  afterEach(() => {
    if (service) {
      service.onModuleDestroy();
    }
    vi.unstubAllGlobals();
  });

  describe('deliverForEvent', () => {
    it('does nothing when the project has no active webhooks', async () => {
      db = mockDatabase((text) => (text.includes('FROM webhooks') ? rows([]) : affected(0)));
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      service = makeService(db);
      await service.deliverForEvent('proj_1', baseEvent);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('posts event payload with standard headers and context', async () => {
      db = mockDatabase((text) => (text.includes('FROM webhooks') ? rows([makeHook()]) : affected(1)));
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: vi.fn().mockResolvedValue('ok')
      });
      vi.stubGlobal('fetch', fetchMock);

      service = makeService(db);
      await service.deliverForEvent('proj_1', baseEvent);

      // Wait a tick for async background execution
      await new Promise((r) => setTimeout(r, 60));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://hooks.example.com/x');
      expect(init.method).toBe('POST');
      expect(init.headers['content-type']).toBe('application/json');
      expect(init.headers['x-traceiq-event']).toBe('signup');
      expect(init.headers['x-traceiq-delivery-id']).toMatch(/^whd_/);

      const body = JSON.parse(init.body);
      expect(body.id).toBe('evt_1');
      expect(body.event).toBe('signup');
      expect(body.project_id).toBe('proj_1');
      expect(body.user_id).toBe('usr_1');
      expect(body.properties).toEqual({ plan: 'pro' });
      expect(body.context.webhook_id).toBe('whk_1');
      expect(body.context.attempt).toBe(1);
    });

    it('signs the payload with dual HMAC signatures when secret is set', async () => {
      const secret = 'whsec_secret123';
      db = mockDatabase((text) => (text.includes('FROM webhooks') ? rows([makeHook({ secret })]) : affected(1)));
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: vi.fn().mockResolvedValue('ok')
      });
      vi.stubGlobal('fetch', fetchMock);

      service = makeService(db);
      await service.deliverForEvent('proj_1', baseEvent);
      await new Promise((r) => setTimeout(r, 60));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0];
      const timestamp = init.headers['x-traceiq-timestamp'];
      const signature = init.headers['x-traceiq-signature'];
      const legacySignature = init.headers['x-traceiq-signature-legacy'];

      expect(signature).toMatch(/^sha256=/);
      const expectedModern = createHmac('sha256', secret).update(`${timestamp}.${init.body}`).digest('hex');
      expect(signature).toBe(`sha256=${expectedModern}`);

      expect(legacySignature).toMatch(/^sha256=/);
      const expectedLegacy = createHmac('sha256', secret).update(init.body).digest('hex');
      expect(legacySignature).toBe(`sha256=${expectedLegacy}`);
    });

    it('filters out events when webhook has an event filter list', async () => {
      db = mockDatabase((text) =>
        text.includes('FROM webhooks') ? rows([makeHook({ event_names: ['purchase'] })]) : affected(0)
      );
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      service = makeService(db);
      await service.deliverForEvent('proj_1', baseEvent);
      await new Promise((r) => setTimeout(r, 60));

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('test', () => {
    it('executes a live test payload and returns structured debug output', async () => {
      db = mockDatabase((text) => {
        if (text.includes('SELECT * FROM webhooks')) return rows([makeHook()]);
        return affected(1);
      });
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: vi.fn().mockResolvedValue('{"status":"ok"}')
      });
      vi.stubGlobal('fetch', fetchMock);

      service = makeService(db);
      const result = await service.test({ id: 'usr_1' } as never, 'whk_1');

      expect(result.ok).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.response.body).toBe('{"status":"ok"}');
      expect(result.request.headers['x-traceiq-event']).toBe('$webhook_test');
    });
  });

  describe('rotateSecret', () => {
    it('rotates secret and archives previous secret', async () => {
      db = mockDatabase((text) => {
        if (text.includes('SELECT * FROM webhooks')) {
          return rows([makeHook({ secret: 'whsec_old123456789012345678901234' })]);
        }
        return affected(1);
      });

      service = makeService(db);
      const result = await service.rotateSecret({ id: 'usr_1' } as never, 'whk_1');

      expect(result.id).toBe('whk_1');
      expect(result.secret).toMatch(/^whsec_/);
      expect(result.secret).not.toBe('whsec_old123456789012345678901234');

      const updates = db.queryCalls(/UPDATE webhooks/);
      expect(updates).toHaveLength(1);
      expect(updates[0].values[3]).toBe('whsec_old123456789012345678901234');
    });
  });
});
