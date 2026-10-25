import { EventEmitter } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TraceIQ, getTraceHeaders } from '../src';

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-01$/;

function fakeResponse() {
  const res = new EventEmitter() as EventEmitter & Record<string, unknown>;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  res.statusCode = 200;
  res.setHeader = (name: string, value: string) => void (headers[name.toLowerCase()] = value);
  res.getHeader = (name: string) => headers[name.toLowerCase()];
  return res;
}

/** Runs `handler` inside a request handled by `traceiq.middleware()`. */
function handle(traceiq: TraceIQ, path: string, headers: Record<string, string>, handler: () => Promise<void> | void) {
  const res = fakeResponse();
  return new Promise<void>((resolve, reject) => {
    traceiq.middleware({ service: path })({ method: 'GET', originalUrl: path, headers }, res as never, () => {
      Promise.resolve(handler()).then(() => {
        res.emit('finish');
        resolve();
      }, reject);
    });
  });
}

function sdk(sent: Array<Record<string, any>>, propagateTraceHeaders?: true | Array<string | RegExp>) {
  const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
    sent.push(...JSON.parse(String(init.body)).batch);
    return new Response(null, { status: 202 });
  });
  return new TraceIQ({
    projectId: 'proj_test',
    writeKey: 'trq_test',
    endpoint: 'https://ingest.traceiq.test',
    flushIntervalMs: 0,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    propagateTraceHeaders
  });
}

describe('getTraceHeaders', () => {
  it('is empty outside a request and carries this request\'s span inside one', async () => {
    expect(getTraceHeaders()).toEqual({});
    const sent: Array<Record<string, any>> = [];
    const traceiq = sdk(sent);
    let inside: Record<string, string> = {};
    await handle(traceiq, '/checkout', {}, () => {
      inside = traceiq.traceHeaders();
    });
    await traceiq.flush();

    const match = TRACEPARENT.exec(inside.traceparent ?? '');
    expect(match).not.toBeNull();
    const request = sent.find((event) => event.eventName === '$api_request')!;
    expect(match![1]).toBe(request.properties.traceId);
    expect(match![2]).toBe(request.properties.spanId);
  });
});

describe('automatic fetch propagation', () => {
  const calls: Array<{ url: string; traceparent: string | null }> = [];
  const originalFetch = globalThis.fetch;
  let route: ((url: string, headers: Headers) => Promise<Response>) | undefined;

  beforeAll(() => {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const headers = new Headers(init?.headers);
      calls.push({ url, traceparent: headers.get('traceparent') });
      return route ? route(url, headers) : new Response(null, { status: 200 });
    }) as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('nests a downstream service under the upstream request', async () => {
    const sent: Array<Record<string, any>> = [];
    const upstream = sdk(sent, ['http://orders.internal']);
    const downstream = sdk(sent, ['http://orders.internal']);
    route = async (url, headers) => {
      await handle(downstream, '/orders', Object.fromEntries(headers.entries()), () => undefined);
      return new Response(null, { status: 200 });
    };

    await handle(upstream, '/checkout', {}, async () => {
      await fetch('http://orders.internal/orders', { headers: { accept: 'application/json' } });
    });
    route = undefined;
    await upstream.flush();
    await downstream.flush();

    const checkout = sent.find((event) => event.properties.path === '/checkout')!.properties;
    const orders = sent.find((event) => event.properties.path === '/orders')!.properties;
    expect(orders.traceId).toBe(checkout.traceId);
    expect(orders.parentSpanId).toBe(checkout.spanId);
    expect(orders.spanId).not.toBe(checkout.spanId);
  });

  it('keeps the caller\'s headers and leaves outside-request calls, unlisted hosts and TraceIQ alone', async () => {
    const sent: Array<Record<string, any>> = [];
    const traceiq = sdk(sent, ['http://orders.internal']);
    calls.length = 0;

    await fetch('http://orders.internal/outside-a-request');
    await handle(traceiq, '/checkout', {}, async () => {
      await fetch('http://orders.internal/orders', { headers: { authorization: 'Bearer t' } });
      await fetch('https://api.stripe.test/v1/charges');
      await fetch('https://ingest.traceiq.test/v1/events/batch');
      await fetch('http://orders.internal/already', { headers: { traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01' } });
    });

    const byUrl = Object.fromEntries(calls.map((call) => [call.url, call.traceparent]));
    expect(byUrl['http://orders.internal/outside-a-request']).toBeNull();
    expect(byUrl['http://orders.internal/orders']).toMatch(TRACEPARENT);
    expect(byUrl['https://api.stripe.test/v1/charges']).toBeNull();
    expect(byUrl['https://ingest.traceiq.test/v1/events/batch']).toBeNull();
    expect(byUrl['http://orders.internal/already']).toBe('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01');
  });
});
