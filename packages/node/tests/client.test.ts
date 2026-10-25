import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { TraceIQ, normalizeApiPath } from '../src';

function fetchReturning(...statuses: number[]) {
  const queue = [...statuses];
  return vi.fn(async () => new Response(null, { status: queue.shift() ?? 202 }));
}

function client(fetchImpl: typeof fetch, extra: Partial<ConstructorParameters<typeof TraceIQ>[0]> = {}) {
  const traceiq = new TraceIQ({
    projectId: 'proj_test',
    writeKey: 'trq_test',
    endpoint: 'https://api.example.com/',
    flushIntervalMs: 0,
    fetchImpl,
    ...extra
  });
  // Skip real backoff waits between retries.
  vi.spyOn(traceiq as unknown as { delay: (ms: number) => Promise<void> }, 'delay').mockResolvedValue();
  return traceiq;
}

function sentBody(fetchImpl: ReturnType<typeof vi.fn>, call = 0) {
  const [url, init] = fetchImpl.mock.calls[call] as [string, RequestInit];
  return { url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
}

describe('TraceIQ node client', () => {
  it('requires credentials', () => {
    expect(() => new TraceIQ({ projectId: '', writeKey: 'k' })).toThrow(/projectId/);
    expect(() => new TraceIQ({ projectId: 'p', writeKey: '' })).toThrow(/writeKey/);
  });

  it('sends queued events as one batch with the write key', async () => {
    const fetchImpl = fetchReturning(202);
    const traceiq = client(fetchImpl);
    traceiq.capture({ event: 'payout_succeeded', userId: 'user_1', properties: { amount: 500 } });
    traceiq.identify({ userId: 'user_1', traits: { plan: 'pro' } });
    await traceiq.shutdown();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const { url, headers, body } = sentBody(fetchImpl);
    expect(url).toBe('https://api.example.com/v1/events/batch');
    expect(headers['x-traceiq-write-key']).toBe('trq_test');
    expect(body.batch.map((e: { eventName: string }) => e.eventName)).toEqual(['payout_succeeded', '$identify']);
    expect(body.batch[0].properties).toEqual({ amount: 500 });
  });

  it('flushes automatically once flushAt events are queued', async () => {
    const fetchImpl = fetchReturning(202);
    const traceiq = client(fetchImpl, { flushAt: 2 });
    traceiq.capture({ event: 'a' });
    expect(fetchImpl).not.toHaveBeenCalled();
    traceiq.capture({ event: 'b' });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
  });

  it('drops a batch the API rejects with 4xx without retrying', async () => {
    const fetchImpl = fetchReturning(400);
    const onError = vi.fn();
    const traceiq = client(fetchImpl, { onError });
    traceiq.capture({ event: 'bad' });
    await traceiq.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledOnce();
  });

  it('retries 5xx and 429 responses, then succeeds', async () => {
    const fetchImpl = fetchReturning(503, 429, 202);
    const onError = vi.fn();
    const traceiq = client(fetchImpl, { onError, maxRetries: 3 });
    traceiq.capture({ event: 'flaky' });
    await traceiq.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports the error once retries are exhausted', async () => {
    const fetchImpl = fetchReturning(500, 500, 500);
    const onError = vi.fn();
    const traceiq = client(fetchImpl, { onError, maxRetries: 2 });
    traceiq.capture({ event: 'down' });
    await traceiq.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(onError).toHaveBeenCalledOnce();
  });
});

describe('request middleware', () => {
  function fakeResponse(contentType = 'application/json') {
    const res = new EventEmitter() as EventEmitter & Record<string, unknown>;
    const headers: Record<string, string> = { 'content-type': contentType };
    res.statusCode = 201;
    res.setHeader = (name: string, value: string) => {
      headers[name.toLowerCase()] = value;
    };
    res.getHeader = (name: string) => headers[name.toLowerCase()];
    return { res, headers };
  }

  it('records an $api_request and stamps events captured during the request', async () => {
    const fetchImpl = fetchReturning(202);
    const traceiq = client(fetchImpl);
    const { res, headers } = fakeResponse();
    const middleware = traceiq.middleware({ service: 'billing-api' });

    middleware(
      { method: 'post', originalUrl: '/v1/users/12345/payouts?debug=1', headers: { 'x-request-id': 'req_abc123' } },
      res as never,
      () => traceiq.capture({ event: 'payout_started' })
    );
    res.emit('finish');
    await traceiq.flush();

    expect(headers['x-request-id']).toBe('req_abc123');
    const [inside, request] = sentBody(fetchImpl).body.batch;
    expect(inside.properties.requestId).toBe('req_abc123');
    expect(request.eventName).toBe('$api_request');
    expect(request.properties).toMatchObject({
      method: 'POST',
      path: '/v1/users/:id/payouts',
      status: 201,
      ok: true,
      requestId: 'req_abc123',
      service: 'billing-api',
      url: '/v1/users/12345/payouts'
    });
  });

  it('continues a browser traceparent, nesting the server span under the browser span', async () => {
    const fetchImpl = fetchReturning(202);
    const traceiq = client(fetchImpl);
    const { res } = fakeResponse();
    const traceId = '0af7651916cd43dd8448eb211c80319c';
    const browserSpanId = 'b7ad6b7169203331';

    traceiq.middleware()(
      { method: 'GET', originalUrl: '/v1/profile', headers: { traceparent: `00-${traceId}-${browserSpanId}-01` } },
      res as never,
      () => {}
    );
    res.emit('finish');
    await traceiq.flush();

    const [request] = sentBody(fetchImpl).body.batch;
    expect(request.properties.traceId).toBe(traceId);
    expect(request.properties.parentSpanId).toBe(browserSpanId);
    expect(request.properties.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(request.properties.spanId).not.toBe(browserSpanId);
  });

  it('skips HTML page responses by default', async () => {
    const fetchImpl = fetchReturning(202);
    const traceiq = client(fetchImpl);
    const { res } = fakeResponse('text/html; charset=utf-8');
    traceiq.middleware()({ method: 'GET', originalUrl: '/pricing', headers: {} }, res as never, () => {});
    res.emit('finish');
    await traceiq.flush();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('normalizeApiPath', () => {
  it.each([
    ['/users/123', '/users/:id'],
    ['/orders/3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b/items', '/orders/:id/items'],
    ['/health?verbose=1#top', '/health'],
    ['', '/']
  ])('%s -> %s', (input, expected) => {
    expect(normalizeApiPath(input)).toBe(expected);
  });
});
