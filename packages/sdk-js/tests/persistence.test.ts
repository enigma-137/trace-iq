import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserTraceIQClient } from '../src/core/client';

const KEY = 'traceiq.pendingEvents.proj_1';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void values.set(key, value)),
    removeItem: vi.fn((key: string) => void values.delete(key))
  };
}

function reply(status: number) {
  return { ok: status >= 200 && status < 300, status, headers: new Headers() };
}

/** A fresh "page": new window globals sharing the same localStorage. */
function page(localStorage: ReturnType<typeof memoryStorage>, navigatorState = { onLine: true }) {
  const listeners: Record<string, Array<() => void>> = {};
  vi.stubGlobal('navigator', navigatorState);
  vi.stubGlobal('window', {
    localStorage,
    sessionStorage: memoryStorage(),
    location: { origin: 'https://app.example.test', href: 'https://app.example.test/', pathname: '/', search: '' },
    addEventListener: (type: string, listener: () => void) => (listeners[type] ??= []).push(listener)
  });
  return { listeners };
}

function start(extra: Record<string, unknown> = {}) {
  const client = new BrowserTraceIQClient();
  client.initialize({
    projectId: 'proj_1',
    writeKey: 'wk',
    endpoint: 'https://api.example.test',
    autoTrackPageViews: false,
    autoCaptureExceptions: false,
    autoCaptureRageClicks: false,
    autoCaptureWebVitals: false,
    ...extra
  });
  return client;
}

function send(client: BrowserTraceIQClient, eventName: string) {
  return (client as unknown as { sendEvent: (n: string, p: Record<string, unknown>) => Promise<void> }).sendEvent(eventName, {});
}

function stored(localStorage: ReturnType<typeof memoryStorage>) {
  const raw = localStorage.values.get(KEY);
  return raw ? (JSON.parse(raw) as Array<{ payload: { eventName: string } }>) : [];
}

describe('browser SDK persistence of delayed events', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('never touches storage when the first attempt succeeds', async () => {
    const localStorage = memoryStorage();
    page(localStorage);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(202)));
    await send(start(), 'checkout_started');
    expect(localStorage.setItem.mock.calls.filter(([key]) => key === KEY)).toHaveLength(0);
  });

  it('saves an event while it is being retried and removes it once delivered', async () => {
    const localStorage = memoryStorage();
    page(localStorage);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply(503)).mockResolvedValue(reply(202)));
    const sent = send(start(), 'checkout_started');

    await vi.advanceTimersByTimeAsync(0);
    expect(stored(localStorage).map((e) => e.payload.eventName)).toEqual(['checkout_started']);
    await vi.runAllTimersAsync();
    await sent;
    expect(localStorage.values.has(KEY)).toBe(false);
  });

  it('resends events the previous page could not deliver, once', async () => {
    const localStorage = memoryStorage();
    page(localStorage);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const failed = send(start({ maxRetries: 0 }), 'payment_failed');
    await vi.runAllTimersAsync();
    await failed;
    expect(stored(localStorage).map((e) => e.payload.eventName)).toEqual(['payment_failed']);
    const original = stored(localStorage)[0].payload;

    // Next page load: the saved event is claimed, resent with its original payload, and cleared.
    page(localStorage);
    const fetchMock = vi.fn().mockResolvedValue(reply(202));
    vi.stubGlobal('fetch', fetchMock);
    start();
    expect(localStorage.values.has(KEY)).toBe(false); // claimed before sending, so a second tab won't resend it
    await vi.runAllTimersAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(original);
    expect(localStorage.values.has(KEY)).toBe(false);
  });

  it('saves events sent while offline before waiting for the connection', async () => {
    const localStorage = memoryStorage();
    const navigatorState = { onLine: false };
    const { listeners } = page(localStorage, navigatorState);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(202)));
    const sent = send(start(), 'offline_click');

    await vi.advanceTimersByTimeAsync(0);
    expect(stored(localStorage).map((e) => e.payload.eventName)).toEqual(['offline_click']);
    navigatorState.onLine = true;
    listeners.online?.forEach((listener) => listener());
    await sent;
    expect(localStorage.values.has(KEY)).toBe(false);
  });

  it('drops a saved event that the API permanently rejects', async () => {
    const localStorage = memoryStorage();
    page(localStorage);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply(503)).mockResolvedValue(reply(400)));
    const sent = send(start(), 'bad_event');
    await vi.runAllTimersAsync();
    await sent;
    expect(localStorage.values.has(KEY)).toBe(false);
  });

  it('can be turned off, and ignores entries older than a day', async () => {
    const localStorage = memoryStorage();
    page(localStorage);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const sent = send(start({ maxRetries: 0, persistUndeliveredEvents: false }), 'private_event');
    await vi.runAllTimersAsync();
    await sent;
    expect(localStorage.values.has(KEY)).toBe(false);

    localStorage.values.set(KEY, JSON.stringify([
      { id: 'old', savedAt: Date.now() - 25 * 60 * 60 * 1000, payload: { eventName: 'stale' } }
    ]));
    page(localStorage);
    const fetchMock = vi.fn().mockResolvedValue(reply(202));
    vi.stubGlobal('fetch', fetchMock);
    start();
    await vi.runAllTimersAsync();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
