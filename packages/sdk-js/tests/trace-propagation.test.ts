import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserTraceIQClient } from '../src/core/client';

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-01$/;

function setup(options: Record<string, unknown> = {}) {
  const originalFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}', { status: 200 }));
  vi.stubGlobal('window', { fetch: originalFetch, location: { origin: 'https://app.example.test' } });
  vi.stubGlobal('location', { origin: 'https://app.example.test', href: 'https://app.example.test/', pathname: '/' });
  const client = new BrowserTraceIQClient();
  (client as unknown as { options: Record<string, unknown> }).options = {
    projectId: 'proj_1',
    writeKey: 'wk',
    endpoint: 'https://ingest.traceiq.test',
    autoCaptureRequests: true,
    ...options
  };
  const track = vi.spyOn(client, 'track').mockImplementation(() => undefined);
  (client as unknown as { installRequestCapture(): void }).installRequestCapture();
  const fetch = (window as unknown as { fetch: typeof globalThis.fetch }).fetch;
  const sentTraceparent = (call = 0) => {
    const init = originalFetch.mock.calls[call][1];
    return init?.headers ? new Headers(init.headers).get('traceparent') : null;
  };
  return { fetch, originalFetch, track, sentTraceparent };
}

describe('browser trace propagation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends traceparent on same-origin API calls and records the same ids', async () => {
    const { fetch, track, sentTraceparent } = setup();
    await fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' } });

    const header = sentTraceparent();
    const match = TRACEPARENT.exec(header ?? '');
    expect(match).not.toBeNull();
    expect(track.mock.calls[0][1]).toMatchObject({ traceId: match![1], spanId: match![2], path: '/api/orders' });
  });

  it('keeps the app\'s own headers', async () => {
    const { fetch, originalFetch } = setup();
    await fetch('/api/orders', { headers: { authorization: 'Bearer t' } });
    const headers = new Headers(originalFetch.mock.calls[0][1]?.headers);
    expect(headers.get('authorization')).toBe('Bearer t');
    expect(headers.get('traceparent')).toMatch(TRACEPARENT);
  });

  it('does not send it cross-origin unless the origin is listed', async () => {
    const unlisted = setup();
    await unlisted.fetch('https://api.example.test/orders');
    expect(unlisted.sentTraceparent()).toBeNull();
    expect(unlisted.track.mock.calls[0][1]).not.toHaveProperty('traceId');
    vi.unstubAllGlobals();

    const listed = setup({ propagateTraceHeaders: ['https://api.example.test'] });
    await listed.fetch('https://api.example.test/orders');
    expect(listed.sentTraceparent()).toMatch(TRACEPARENT);
  });

  it('never overrides an app-supplied traceparent and can be turned off', async () => {
    const existing = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
    const appTraced = setup();
    await appTraced.fetch('/api/orders', { headers: { traceparent: existing } });
    expect(appTraced.sentTraceparent()).toBe(existing);
    expect(appTraced.track.mock.calls[0][1]).not.toHaveProperty('traceId');
    vi.unstubAllGlobals();

    const off = setup({ propagateTraceHeaders: false });
    await off.fetch('/api/orders');
    expect(off.sentTraceparent()).toBeNull();
  });

  it('never sends it to TraceIQ itself', async () => {
    const { fetch, originalFetch } = setup({ endpoint: 'https://app.example.test/traceiq' });
    await fetch('https://app.example.test/traceiq/v1/events');
    expect(originalFetch.mock.calls[0][1]).toBeUndefined();
  });

  it('adds it to same-origin XMLHttpRequest calls', () => {
    const listeners: Array<() => void> = [];
    class FakeXhr {
      status = 0;
      headers: Record<string, string> = {};
      open(_method: string, _url: string) {}
      setRequestHeader(name: string, value: string) {
        this.headers[name] = value;
      }
      send() {}
      addEventListener(_event: string, listener: () => void) {
        listeners.push(listener);
      }
      getResponseHeader() {
        return null;
      }
    }
    vi.stubGlobal('window', { fetch: undefined, XMLHttpRequest: FakeXhr, location: { origin: 'https://app.example.test' } });
    vi.stubGlobal('location', { origin: 'https://app.example.test', href: 'https://app.example.test/', pathname: '/' });
    const client = new BrowserTraceIQClient();
    (client as unknown as { options: Record<string, unknown> }).options = {
      projectId: 'proj_1', writeKey: 'wk', endpoint: 'https://ingest.traceiq.test', autoCaptureRequests: true
    };
    const track = vi.spyOn(client, 'track').mockImplementation(() => undefined);
    (client as unknown as { installRequestCapture(): void }).installRequestCapture();

    const xhr = new FakeXhr();
    xhr.open('GET', '/api/profile');
    xhr.send();
    xhr.status = 200;
    listeners.forEach((listener) => listener());

    const match = TRACEPARENT.exec(xhr.headers.traceparent ?? '');
    expect(match).not.toBeNull();
    expect(track.mock.calls[0][1]).toMatchObject({ traceId: match![1], spanId: match![2] });

    const appTraced = new FakeXhr();
    appTraced.open('GET', '/api/profile');
    appTraced.setRequestHeader('traceparent', '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01');
    appTraced.send();
    expect(appTraced.headers.traceparent).toBe('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01');
  });
});
