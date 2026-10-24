import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserTraceIQClient } from '../src/core/client';

function client(extra: Record<string, unknown> = {}) {
  const instance = new BrowserTraceIQClient();
  (instance as unknown as { options: Record<string, unknown> }).options = {
    projectId: 'proj_1',
    writeKey: 'wk_test',
    endpoint: 'https://api.example.test/',
    environment: 'production',
    ...extra
  };
  (instance as unknown as { sessionId: string }).sessionId = 'sess_1';
  (instance as unknown as { anonymousId: string }).anonymousId = 'anon_1';
  return instance;
}

function send(instance: BrowserTraceIQClient, eventName = 'checkout_started') {
  return (instance as unknown as { sendEvent: (n: string, p: Record<string, unknown>) => Promise<void> }).sendEvent(
    eventName,
    {}
  );
}

function reply(status: number, headers: Record<string, string> = {}) {
  return { ok: status >= 200 && status < 300, status, headers: new Headers(headers) };
}

describe('browser SDK delivery retries', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('retries a 5xx with backoff and sends the same payload', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(503)).mockResolvedValueOnce(reply(202));
    vi.stubGlobal('fetch', fetchMock);

    const sent = send(client());
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1250);
    await sent;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body);
  });

  it('does not retry other 4xx responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(400));
    vi.stubGlobal('fetch', fetchMock);
    const sent = send(client());
    await vi.runAllTimersAsync();
    await sent;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxRetries network failures without throwing', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    const sent = send(client({ maxRetries: 2 }));
    await vi.runAllTimersAsync();
    await expect(sent).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('maxRetries: 0 sends once', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(500));
    vi.stubGlobal('fetch', fetchMock);
    const sent = send(client({ maxRetries: 0 }));
    await vi.runAllTimersAsync();
    await sent;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('waits for Retry-After on a 429', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(429, { 'retry-after': '5' })).mockResolvedValue(reply(202));
    vi.stubGlobal('fetch', fetchMock);

    const sent = send(client());
    await vi.advanceTimersByTimeAsync(4900);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    await sent;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('holds sends while offline and delivers once the browser is back online', async () => {
    const listeners: Record<string, Array<() => void>> = {};
    const navigatorState = { onLine: false, userAgent: 'test' };
    vi.stubGlobal('navigator', navigatorState);
    vi.stubGlobal('window', {
      addEventListener: (type: string, listener: () => void) => (listeners[type] ??= []).push(listener)
    });
    const fetchMock = vi.fn().mockResolvedValue(reply(202));
    vi.stubGlobal('fetch', fetchMock);

    const sent = send(client());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).not.toHaveBeenCalled();

    navigatorState.onLine = true;
    listeners.online?.forEach((listener) => listener());
    await sent;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries log batches too', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(502)).mockResolvedValue(reply(202));
    vi.stubGlobal('fetch', fetchMock);
    const traceiq = client();
    traceiq.log('error', 'payment failed');

    const flushed = traceiq.flushLogs();
    await vi.runAllTimersAsync();
    await flushed;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.example.test/v1/logs/batch');
  });
});
