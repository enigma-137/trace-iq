import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebhooksService, type DeliverableEvent } from '../src/modules/webhooks/webhooks.service';
import { affected, mockDatabase, rows, type MockDb } from './helpers/mock-db';

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
    last_status: null,
    last_delivered_at: null,
    ...overrides
  };
}

function makeService(db: MockDb) {
  const projects = { resolveActiveProject: vi.fn(), requireActiveProject: vi.fn() };
  return new WebhooksService(db as never, projects as never);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WebhooksService.deliverForEvent', () => {
  it('does nothing when the project has no enabled webhooks', async () => {
    const db = mockDatabase((text) => (text.includes('FROM webhooks') ? rows([]) : affected(0)));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const service = makeService(db);
    await service.deliverForEvent('proj_1', baseEvent);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the event payload to every enabled webhook', async () => {
    const db = mockDatabase((text) => (text.includes('FROM webhooks') ? rows([makeHook()]) : affected(0)));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const service = makeService(db);
    await service.deliverForEvent('proj_1', baseEvent);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://hooks.example.com/x');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.webhookId).toBe('whk_1');
    expect(body.event).toBe('signup');
    expect(body.eventId).toBe('evt_1');
    expect(body.properties).toEqual({ plan: 'pro' });
  });

  it('signs the body with an HMAC when the webhook has a secret', async () => {
    const secret = 'super-secret';
    const db = mockDatabase((text) => (text.includes('FROM webhooks') ? rows([makeHook({ secret })]) : affected(0)));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const service = makeService(db);
    await service.deliverForEvent('proj_1', baseEvent);

    const [, init] = fetchMock.mock.calls[0];
    const header = init.headers['x-traceiq-signature'];
    expect(header).toMatch(/^sha256=/);
    const expected = createHmac('sha256', secret).update(init.body).digest('hex');
    expect(header).toBe(`sha256=${expected}`);
  });

  it('only delivers events matching the webhook filter list', async () => {
    const db = mockDatabase((text) =>
      text.includes('FROM webhooks') ? rows([makeHook({ event_names: ['checkout'] })]) : affected(0)
    );
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const service = makeService(db);
    await service.deliverForEvent('proj_1', baseEvent);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('records a successful delivery and marks the webhook success', async () => {
    const db = mockDatabase((text) => (text.includes('FROM webhooks') ? rows([makeHook()]) : affected(1)));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const service = makeService(db);
    await service.deliverForEvent('proj_1', baseEvent);

    const inserts = db.queryCalls(/INSERT INTO webhook_deliveries/);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values).toEqual([expect.any(String), 'whk_1', 'proj_1', 'signup', 200, true, null]);

    const updates = db.queryCalls(/UPDATE webhooks SET last_status/);
    expect(updates).toHaveLength(1);
    expect(updates[0].values).toEqual(['whk_1', 'success']);
  });

  it('records a failure when the endpoint responds non-2xx', async () => {
    const db = mockDatabase((text) => (text.includes('FROM webhooks') ? rows([makeHook()]) : affected(1)));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const service = makeService(db);
    await service.deliverForEvent('proj_1', baseEvent);

    const inserts = db.queryCalls(/INSERT INTO webhook_deliveries/);
    expect(inserts[0].values).toEqual([expect.any(String), 'whk_1', 'proj_1', 'signup', 500, false, 'Endpoint responded 500']);
  });

  it('records a failure when the network request throws', async () => {
    const db = mockDatabase((text) => (text.includes('FROM webhooks') ? rows([makeHook()]) : affected(1)));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')));

    const service = makeService(db);
    await service.deliverForEvent('proj_1', baseEvent);

    const inserts = db.queryCalls(/INSERT INTO webhook_deliveries/);
    expect(inserts[0].values).toEqual([expect.any(String), 'whk_1', 'proj_1', 'signup', null, false, 'connect ECONNREFUSED']);
  });
});
