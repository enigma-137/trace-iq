import { describe, expect, it, vi } from 'vitest';
import { BrowserTraceIQClient, normalizeApiPath } from '../src/core/client';

describe('browser request capture', () => {
  it('removes query strings and fragments from the groupable request path', () => {
    expect(
      normalizeApiPath(
        'https://api.example.test/users/123?access_token=canary-secret#private-fragment'
      )
    ).toBe('/users/:id');
  });

  it('does not put the raw request URL into the analytics event', () => {
    const client = new BrowserTraceIQClient();
    const track = vi.spyOn(client, 'track').mockImplementation(() => undefined);

    const capture = client as unknown as {
      recordRequest(method: string, url: string, status: number, durationMs: number): void;
    };
    capture.recordRequest(
      'GET',
      'https://api.example.test/users/123?access_token=canary-secret#private-fragment',
      200,
      12.6
    );

    expect(track).toHaveBeenCalledWith('$api_request', {
      method: 'GET',
      path: '/users/:id',
      status: 200,
      durationMs: 13,
      ok: true,
      instrumentation: 'browser',
      host: 'api.example.test'
    });
    expect(JSON.stringify(track.mock.calls)).not.toContain('canary-secret');
    expect(JSON.stringify(track.mock.calls)).not.toContain('private-fragment');
  });
  it('records the echoed request id and response size when the backend exposes them', () => {
    const client = new BrowserTraceIQClient();
    const track = vi.spyOn(client, 'track').mockImplementation(() => undefined);
    const capture = client as unknown as {
      recordRequest(method: string, url: string, status: number, durationMs: number, response?: Response): void;
    };
    const response = {
      headers: new Headers({ 'x-request-id': 'req-abc-123', 'content-length': '512' })
    } as Response;

    capture.recordRequest('POST', 'https://api.example.test/orders', 201, 40, response);

    expect(track).toHaveBeenCalledWith('$api_request', {
      method: 'POST',
      path: '/orders',
      status: 201,
      durationMs: 40,
      ok: true,
      instrumentation: 'browser',
      host: 'api.example.test',
      requestId: 'req-abc-123',
      responseSize: 512
    });
  });

  it('ignores a malformed echoed request id', () => {
    const client = new BrowserTraceIQClient();
    const track = vi.spyOn(client, 'track').mockImplementation(() => undefined);
    const capture = client as unknown as {
      recordRequest(method: string, url: string, status: number, durationMs: number, response?: Response): void;
    };
    const response = { headers: new Headers({ 'x-request-id': 'bad id <script>' }) } as Response;

    capture.recordRequest('GET', '/health', 200, 3, response);

    expect(track.mock.calls[0][1]).not.toHaveProperty('requestId');
  });

  it('captures XMLHttpRequest calls (axios and friends), skipping TraceIQ endpoints', async () => {
    const listeners: Array<() => void> = [];
    class FakeXhr {
      status = 0;
      open(_method: string, _url: string) {}
      send() {}
      addEventListener(_event: string, listener: () => void) {
        listeners.push(listener);
      }
      getResponseHeader(name: string) {
        return name === 'x-request-id' ? 'req-xhr-1' : null;
      }
    }
    vi.stubGlobal('window', { fetch: undefined, XMLHttpRequest: FakeXhr });
    try {
      const client = new BrowserTraceIQClient();
      (client as unknown as { options: Record<string, unknown> }).options = {
        projectId: 'proj_1',
        writeKey: 'wk',
        endpoint: 'https://ingest.traceiq.test'
      };
      const track = vi.spyOn(client, 'track').mockImplementation(() => undefined);
      (client as unknown as { installRequestCapture(): void }).installRequestCapture();

      const xhr = new FakeXhr();
      xhr.open('post', 'https://api.example.test/games/123/invite');
      xhr.send();
      xhr.status = 201;
      listeners.forEach((listener) => listener());

      const internal = new FakeXhr();
      internal.open('POST', 'https://ingest.traceiq.test/v1/events');
      internal.send();

      expect(track).toHaveBeenCalledTimes(1);
      expect(track.mock.calls[0][1]).toMatchObject({
        method: 'POST',
        path: '/games/:id/invite',
        status: 201,
        instrumentation: 'browser',
        requestId: 'req-xhr-1'
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('browser console capture', () => {
  it('forwards console output to logs without looping on its own diagnostics', () => {
    const original = { log: console.log, info: console.info, warn: console.warn, error: console.error };
    const silent = vi.fn();
    console.log = silent;
    console.warn = silent;
    try {
      const client = new BrowserTraceIQClient();
      (client as unknown as { options: Record<string, unknown> }).options = { projectId: 'p', writeKey: 'w' };
      const log = vi.spyOn(client, 'log').mockImplementation(() => undefined);
      (client as unknown as { installConsoleCapture(option: unknown): void }).installConsoleCapture({ levels: ['log', 'warn'] });

      console.log('Challenge sent to', { player: 'ada' });
      console.warn('[TraceIQ] Logs could not be delivered.');

      expect(silent).toHaveBeenCalledTimes(2);
      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith('info', 'Challenge sent to {"player":"ada"}', { service: 'web-console' });
    } finally {
      Object.assign(console, original);
    }
  });
});

describe('browser request capture filtering', () => {
  function capturing(option: unknown = true) {
    const client = new BrowserTraceIQClient();
    (client as unknown as { options: Record<string, unknown> }).options = {
      projectId: 'p',
      writeKey: 'w',
      endpoint: 'https://ingest.traceiq.test',
      autoCaptureRequests: option
    };
    const track = vi.spyOn(client, 'track').mockImplementation(() => undefined);
    const internals = client as unknown as {
      shouldCaptureRequest(url: string, header?: (name: string) => string | null): boolean;
      recordRequest(method: string, url: string, status: number, ms: number, r?: Response, h?: (n: string) => string | null): void;
    };
    return { client, track, internals };
  }

  it('skips Next.js navigation, prefetches, HMR and static assets but keeps API calls', () => {
    const { internals } = capturing();
    const noHeaders = () => null;
    expect(internals.shouldCaptureRequest('https://app.test/dashboard?_rsc=1x2y', noHeaders)).toBe(false);
    expect(internals.shouldCaptureRequest('https://app.test/meals', (n) => (n === 'rsc' ? '1' : null))).toBe(false);
    expect(internals.shouldCaptureRequest('https://app.test/meals', (n) => (n === 'next-router-prefetch' ? '1' : null))).toBe(false);
    expect(internals.shouldCaptureRequest('https://app.test/_next/static/chunks/main.js')).toBe(false);
    expect(internals.shouldCaptureRequest('https://app.test/logo.svg')).toBe(false);
    expect(internals.shouldCaptureRequest('https://app.test/main.abc.hot-update.json')).toBe(false);
    expect(internals.shouldCaptureRequest('https://ingest.traceiq.test/v1/events')).toBe(false);
    expect(internals.shouldCaptureRequest('https://api.app.test/v1/meals', noHeaders)).toBe(true);
    expect(internals.shouldCaptureRequest('https://api.app.test/build-status')).toBe(true);
  });

  it('drops responses that are HTML documents (page loads)', () => {
    const { track, internals } = capturing();
    internals.recordRequest('GET', 'https://app.test/about', 200, 80, undefined, (n) =>
      n === 'content-type' ? 'text/html; charset=utf-8' : null
    );
    internals.recordRequest('GET', 'https://api.app.test/meals', 200, 80, undefined, (n) =>
      n === 'content-type' ? 'application/json' : null
    );
    expect(track).toHaveBeenCalledTimes(1);
    expect(track.mock.calls[0][1]).toMatchObject({ path: '/meals' });
  });

  it('honours include / exclude lists and the page-request opt-in', () => {
    const scoped = capturing({ include: ['https://api.app.test'], exclude: [/\/health$/] }).internals;
    expect(scoped.shouldCaptureRequest('https://api.app.test/v1/meals')).toBe(true);
    expect(scoped.shouldCaptureRequest('https://api.app.test/health')).toBe(false);
    expect(scoped.shouldCaptureRequest('https://maps.googleapis.com/geocode')).toBe(false);

    const everything = capturing({ includePageRequests: true });
    expect(everything.internals.shouldCaptureRequest('https://app.test/dashboard?_rsc=1')).toBe(true);
    everything.internals.recordRequest('GET', 'https://app.test/about', 200, 80, undefined, () => 'text/html');
    expect(everything.track).toHaveBeenCalledTimes(1);
  });
});
