import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserTraceIQClient } from '../src/core/client';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key)
  };
}

describe('alias()', () => {
  const sent: Array<Record<string, any>> = [];

  beforeEach(() => {
    sent.length = 0;
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('window', {
      localStorage: memoryStorage(),
      sessionStorage: memoryStorage(),
      location: { origin: 'https://app.example.test', href: 'https://app.example.test/', pathname: '/', search: '' },
      addEventListener: () => undefined
    });
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return { ok: true, status: 202, headers: new Headers() };
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  function start() {
    const client = new BrowserTraceIQClient();
    client.initialize({
      projectId: 'proj_1',
      writeKey: 'wk',
      endpoint: 'https://api.example.test',
      autoTrackPageViews: false,
      autoCaptureExceptions: false,
      autoCaptureRageClicks: false,
      autoCaptureWebVitals: false
    });
    return client;
  }

  const aliases = () => sent.filter((event) => event.eventName === '$alias');

  it('links an explicit previous ID to the new user ID', async () => {
    start().alias('user_123', 'guest_8f2c');
    await vi.waitFor(() => expect(aliases()).toHaveLength(1));
    expect(aliases()[0]).toMatchObject({ userId: 'user_123', properties: { previousId: 'guest_8f2c' } });
  });

  it('defaults the previous ID to the current user, then the anonymous ID', async () => {
    const client = start();
    client.alias('user_a');
    client.identify({ userId: 'user_a' });
    client.alias('user_b');
    await vi.waitFor(() => expect(aliases()).toHaveLength(2));
    const [first, second] = aliases();
    expect(first.properties.previousId).toBe(first.anonymousId);
    expect(first.properties.previousId).toMatch(/^anon/);
    expect(second).toMatchObject({ userId: 'user_b', properties: { previousId: 'user_a' } });
  });

  it('ignores an alias of an ID to itself', async () => {
    const client = start();
    client.identify({ userId: 'user_a' });
    client.alias('user_a');
    client.alias('user_b', 'user_b');
    client.track('done');
    await vi.waitFor(() => expect(sent.some((event) => event.eventName === 'done')).toBe(true));
    expect(aliases()).toHaveLength(0);
  });
});
