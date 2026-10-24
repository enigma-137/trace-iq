import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserTraceIQClient } from '../src/core/client';

function client() {
  const instance = new BrowserTraceIQClient();
  (instance as unknown as { options: Record<string, unknown> }).options = {
    projectId: 'proj_1',
    writeKey: 'wk_test',
    endpoint: 'https://api.example.test/',
    environment: 'production'
  };
  (instance as unknown as { sessionId: string }).sessionId = 'sess_1';
  (instance as unknown as { anonymousId: string }).anonymousId = 'anon_1';
  return instance;
}

describe('browser traceiq.log()', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('buffers logs and sends them as one batch tagged with the session', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal('fetch', fetchMock);
    const traceiq = client();

    traceiq.log('info', 'Level 3 started', { level: 3 });
    traceiq.log('error', 'Level 3 assets failed to load', { service: 'game-client', error: new TypeError('404 atlas.png') });
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.test/v1/logs/batch');
    expect(init.headers['x-traceiq-write-key']).toBe('wk_test');
    const body = JSON.parse(init.body);
    expect(body.projectId).toBe('proj_1');
    expect(body.logs).toHaveLength(2);
    expect(body.logs[0]).toMatchObject({
      level: 'info',
      message: 'Level 3 started',
      service: 'web-client',
      sessionId: 'sess_1',
      distinctId: 'anon_1',
      metadata: { level: 3 }
    });
    expect(body.logs[1]).toMatchObject({ level: 'error', service: 'game-client', errorDetails: { name: 'TypeError', message: '404 atlas.png' } });
    expect(body.logs[1].metadata).toBeUndefined();
  });

  it('flushes immediately once 20 logs are queued and ignores empty messages', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal('fetch', fetchMock);
    const traceiq = client();
    traceiq.log('info', '   ');
    for (let i = 0; i < 20; i += 1) traceiq.log('warn', `tick ${i}`);
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).logs).toHaveLength(20);
  });

  it('does nothing before initialize() and never throws when delivery fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    new BrowserTraceIQClient().log('error', 'not initialized');
    expect(fetchMock).not.toHaveBeenCalled();

    vi.useFakeTimers();
    const traceiq = client();
    traceiq.log('fatal' as never, 'boom');
    const flushed = traceiq.flushLogs();
    await vi.runAllTimersAsync(); // network failures are retried with backoff first
    await expect(flushed).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
