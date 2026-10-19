import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplayRecorder, sampleSession } from '../src/core/replay';
import { sanitizeTransportEvent } from '../src/core/replay-privacy';

const rrweb = vi.hoisted(() => ({
  options: undefined as undefined | { emit: (event: unknown) => void; maskInputOptions: Record<string, boolean>;
    blockSelector: string; inlineStylesheet: boolean; inlineImages: boolean },
  synchronousEvent: undefined as unknown,
  record: vi.fn((options: { emit: (event: unknown) => void; maskInputOptions: Record<string, boolean>;
    blockSelector: string; inlineStylesheet: boolean; inlineImages: boolean }) => {
    rrweb.options = options;
    if (rrweb.synchronousEvent) options.emit(rrweb.synchronousEvent);
    return vi.fn();
  })
}));
vi.mock('@rrweb/record', () => ({ record: rrweb.record }));

const CANARIES = ['CANARY_HIDDEN_Z8p4', 'CANARY_TEXT_A9q3', 'CANARY_QUERY_B7m2', 'CANARY_FRAGMENT_C6n1', 'CANARY_CREDENTIALS_D5k0'];

function recorderEvent() {
  return { type: 3, timestamp: Date.now(), data: { source: 0, styleMutation: { property: 'background-image',
    value: `url(https://example.test/style?token=${CANARIES[2]})` }, adds: [{ node: { tagName: 'div', childNodes: [
    { tagName: 'input', attributes: { type: 'hidden', value: CANARIES[0] } },
    { tagName: 'p', textContent: `password=${CANARIES[1]}` },
    { tagName: 'a', attributes: { href: `https://${CANARIES[4]}:pw@example.test/?token=${CANARIES[2]}#${CANARIES[3]}`,
      style: `background:u\\72l(https://example.test/?token=${CANARIES[2]})`, rr_dataURL: `data:image/png,${CANARIES[0]}` } },
    { tagName: 'link', attributes: { _cssText: `.card{display:grid;color:red;background:url(https://example.test/a?token=${CANARIES[2]})}` } },
    { tagName: 'iframe', attributes: { src: `https://example.test/?token=${CANARIES[2]}` }, childNodes: [{ textContent: CANARIES[1] }] }
  ] } }] } };
}

function configResponse() {
  return new Response(JSON.stringify({ enabled: true, sampleRate: 1, maxDurationSeconds: 60, privacyMode: 'balanced',
    requireConsent: true, maskSelectors: [], blockSelectors: [], ignoreSelectors: [],
    flowTriggerEventNames: ['onboarding_started'] }), { status: 200 });
}

beforeEach(() => {
  rrweb.options = undefined;
  rrweb.synchronousEvent = undefined;
  rrweb.record.mockClear();
  vi.stubGlobal('window', { addEventListener: vi.fn() });
  vi.stubGlobal('document', { addEventListener: vi.fn(), visibilityState: 'visible' });
  vi.stubGlobal('CompressionStream', undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ReplayRecorder security gates', () => {
  it('makes a stable sampling decision for a session', () => {
    expect(sampleSession('sess_stable', 0.5)).toBe(sampleSession('sess_stable', 0.5));
    expect(sampleSession('sess', 0)).toBe(false);
    expect(sampleSession('sess', 1)).toBe(true);
  });

  it('does not import/start rrweb before required consent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => configResponse()));
    const recorder = new ReplayRecorder('https://api.example', { enabled: true },
      () => ({ projectId: 'proj', writeKey: 'key', sessionId: 'sess' }), () => false, vi.fn());
    await expect(recorder.start()).resolves.toBe(false);
    expect(rrweb.record).not.toHaveBeenCalled();
  });

  it('aborts a pending startup and never invokes rrweb after consent revocation', async () => {
    let resolveConfig!: (response: Response) => void;
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => {
      requestSignal = init?.signal as AbortSignal;
      return new Promise<Response>((resolve) => { resolveConfig = resolve; });
    }));
    const recorder = new ReplayRecorder('https://api.example', { enabled: true },
      () => ({ projectId: 'proj', writeKey: 'key', sessionId: 'sess' }), () => true, vi.fn());
    const starting = recorder.start();
    await vi.waitFor(() => expect(requestSignal).toBeDefined());
    recorder.revokeConsent();
    expect(requestSignal?.aborted).toBe(true);
    resolveConfig(configResponse());
    await expect(starting).resolves.toBe(false);
    expect(rrweb.record).not.toHaveBeenCalled();
  });

  it('removes canaries from the actual outgoing browser chunk', async () => {
    const chunks: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/config')) return configResponse();
      if (url.includes('/authorize')) return new Response(JSON.stringify({ token: 'upload-token', expiresAt: new Date(Date.now() + 300_000).toISOString() }), { status: 200 });
      if (url.includes('/chunks')) { chunks.push(String(init?.body)); return new Response('{}', { status: 200 }); }
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const recorder = new ReplayRecorder('https://api.example', { enabled: true },
      () => ({ projectId: 'proj', writeKey: 'write-key', sessionId: 'sess', anonymousId: 'anon' }), () => true, vi.fn());
    await expect(recorder.start()).resolves.toBe(true);
    expect(rrweb.record).not.toHaveBeenCalled();
    recorder.eventAccepted('onboarding_started');
    await vi.waitFor(() => expect(rrweb.record).toHaveBeenCalledTimes(1));
    expect(rrweb.options?.maskInputOptions.hidden).toBe(true);
    expect(rrweb.options?.blockSelector).toContain('iframe:not([data-traceiq-replay-safe-frame="true"])');
    expect(rrweb.options?.inlineStylesheet).toBe(true);
    expect(rrweb.options?.inlineImages).toBe(false);
    rrweb.options?.emit(recorderEvent());
    recorder.stop();
    await vi.waitFor(() => expect(chunks.length).toBe(1));
    for (const canary of CANARIES) expect(chunks[0]).not.toContain(canary);
    const authorization = fetchMock.mock.calls.find(([url]) => String(url).includes('/authorize'));
    expect(String((authorization?.[1] as RequestInit).body)).toContain('"consentGranted":true');
    const chunkRequest = fetchMock.mock.calls.find(([url]) => String(url).includes('/chunks'));
    expect((chunkRequest?.[1] as RequestInit).headers).toMatchObject({ 'x-traceiq-replay-token': 'upload-token' });
  });

  it('sanitizes rrweb events emitted synchronously during record startup', async () => {
    const chunks: string[] = [];
    rrweb.synchronousEvent = recorderEvent();
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/config')) return configResponse();
      if (url.includes('/authorize')) return new Response(JSON.stringify({
        token: 'upload-token', expiresAt: new Date(Date.now() + 300_000).toISOString()
      }), { status: 200 });
      if (url.includes('/chunks')) chunks.push(String(init?.body));
      return new Response('{}', { status: 200 });
    }));
    const recorder = new ReplayRecorder('https://api.example', { enabled: true },
      () => ({ projectId: 'proj', writeKey: 'write-key', sessionId: 'sess', anonymousId: 'anon' }), () => true, vi.fn());
    await recorder.start();
    recorder.eventAccepted('onboarding_started');
    await vi.waitFor(() => expect(rrweb.record).toHaveBeenCalledTimes(1));
    recorder.stop();
    await vi.waitFor(() => expect(chunks.length).toBe(1));
    for (const canary of CANARIES) expect(chunks[0]).not.toContain(canary);
  });

  it('discards an upload that is pending when consent is revoked', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/config')) return configResponse();
      if (url.includes('/authorize')) return new Response(JSON.stringify({
        token: 'upload-token', expiresAt: new Date(Date.now() + 300_000).toISOString()
      }), { status: 200 });
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const recorder = new ReplayRecorder('https://api.example', { enabled: true },
      () => ({ projectId: 'proj', writeKey: 'write-key', sessionId: 'sess', anonymousId: 'anon' }), () => true, vi.fn());
    await recorder.start();
    recorder.eventAccepted('onboarding_started');
    await vi.waitFor(() => expect(rrweb.record).toHaveBeenCalledTimes(1));
    rrweb.options?.emit(recorderEvent());
    recorder.stop();
    recorder.revokeConsent();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/chunks'))).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/complete'))).toBe(false);
  });

  it('recursively sanitizes an event before transport in Balanced mode', () => {
    const serialized = JSON.stringify(sanitizeTransportEvent(recorderEvent(), 'balanced'));
    for (const canary of CANARIES) expect(serialized).not.toContain(canary);
    expect(serialized).toContain('display:grid');
    expect(serialized).toContain('color:red');
    expect(serialized).toContain('background:none');
  });

  it('keeps SVG geometry intact while still masking text and inputs', () => {
    const event = { type: 2, timestamp: 1, data: { node: { tagName: 'svg', attributes: { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor' }, childNodes: [
      { tagName: 'polyline', attributes: { points: '22 12 18 12 15 21 9 3 6 12 2 12' }, childNodes: [] },
      { tagName: 'path', attributes: { d: 'M4111 1111 1111 1111L12 2a10 10 0 1 0 0 20Z', transform: 'matrix(1 0 0 1 120 340) rotate(45 12 12)' }, childNodes: [] },
      { tagName: 'text', attributes: { 'data-card': '4111 1111 1111 1111' }, childNodes: [{ type: 3, textContent: 'Card 4111 1111 1111 1111' }] },
      { tagName: 'input', attributes: { value: 'secret-value', width: '4111 1111 1111 1111 hello' }, childNodes: [] }
    ] } } };
    const sanitized = sanitizeTransportEvent(event, 'strict') as typeof event;
    const [polyline, path, text, input] = sanitized.data.node.childNodes as Array<{ attributes: Record<string, string>; childNodes: Array<{ textContent: string }> }>;
    expect(sanitized.data.node.attributes).toEqual({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor' });
    expect(polyline.attributes.points).toBe('22 12 18 12 15 21 9 3 6 12 2 12');
    expect(path.attributes.d).toBe('M4111 1111 1111 1111L12 2a10 10 0 1 0 0 20Z');
    expect(path.attributes.transform).toBe('matrix(1 0 0 1 120 340) rotate(45 12 12)');
    expect(text.attributes['data-card']).not.toContain('4111');
    expect(text.childNodes[0].textContent).not.toContain('4111');
    expect(input.attributes.value).toMatch(/^\*+$/);
    // Only pure geometry passes through: anything else in a geometry attribute is still scrubbed.
    expect(input.attributes.width).toContain('[redacted]');
  });

  it('prevents recording attempts until revoked consent is explicitly granted again', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const recorder = new ReplayRecorder('https://api.example', { enabled: true },
      () => ({ projectId: 'proj', writeKey: 'key', sessionId: 'sess' }), () => false, vi.fn());
    recorder.revokeConsent();
    await expect(recorder.start()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stays armed without importing rrweb until a selected flow event is accepted', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/config')) return configResponse();
      if (url.includes('/authorize')) return new Response(JSON.stringify({
        token: 'upload-token', expiresAt: new Date(Date.now() + 300_000).toISOString()
      }), { status: 200 });
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const recorder = new ReplayRecorder('https://api.example', { enabled: true },
      () => ({ projectId: 'proj', writeKey: 'key', sessionId: 'sess' }), () => true, vi.fn());

    await expect(recorder.start()).resolves.toBe(true);
    recorder.eventAccepted('unrelated_event');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(rrweb.record).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/authorize'))).toBe(false);
  });

  it('keeps the configured maximum duration as the recording stop boundary', async () => {
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/config')) return configResponse();
      if (url.includes('/authorize')) return new Response(JSON.stringify({
        token: 'upload-token', expiresAt: new Date(Date.now() + 300_000).toISOString()
      }), { status: 200 });
      return new Response('{}', { status: 200 });
    }));
    const recorder = new ReplayRecorder('https://api.example', { enabled: true },
      () => ({ projectId: 'proj', writeKey: 'key', sessionId: 'sess' }), () => true, vi.fn());

    await recorder.start();
    recorder.eventAccepted('onboarding_started');
    await vi.waitFor(() => expect(rrweb.record).toHaveBeenCalledTimes(1));

    expect(timeoutSpy.mock.calls.some((call) => call[1] === 60_000)).toBe(true);
    recorder.stop({ discard: true });
  });

  it('flow trigger matches -> authorizes -> starts rrweb -> flushes multiple chunks with consistent startedAt', async () => {
    const chunkBodies: Array<Record<string, unknown>> = [];
    const t0 = 1726135000000;
    const t1 = t0 + 10_000;

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/config')) return configResponse();
      if (url.includes('/authorize')) return new Response(JSON.stringify({
        token: 'upload-token-123', expiresAt: new Date(Date.now() + 300_000).toISOString()
      }), { status: 200 });
      if (url.includes('/chunks')) {
        chunkBodies.push(JSON.parse(String(init?.body)));
        return new Response('{}', { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const recorder = new ReplayRecorder('https://api.example', { enabled: true },
      () => ({ projectId: 'proj_a', writeKey: 'wk_test', sessionId: 'sess_test', anonymousId: 'anon_test' }),
      () => true, vi.fn());

    await recorder.start();
    recorder.eventAccepted('onboarding_started');
    await vi.waitFor(() => expect(rrweb.record).toHaveBeenCalledTimes(1));

    // Emit first event (DOM full snapshot)
    rrweb.options?.emit({ type: 2, timestamp: t0, data: { node: { tagName: 'div', childNodes: [] } } });
    await vi.waitFor(() => expect(chunkBodies.length).toBe(1));

    expect(chunkBodies[0].sequence).toBe(0);
    expect(chunkBodies[0].startedAt).toBe(new Date(t0).toISOString());
    expect(chunkBodies[0].endedAt).toBe(new Date(t0).toISOString());

    // Emit second event (subsequent mutation 10s later)
    rrweb.options?.emit({ type: 3, timestamp: t1, data: { source: 0, adds: [] } });
    recorder.stop();
    await vi.waitFor(() => expect(chunkBodies.length).toBe(2));

    expect(chunkBodies[1].sequence).toBe(1);
    expect(chunkBodies[1].startedAt).toBe(new Date(t0).toISOString());
    expect(chunkBodies[1].endedAt).toBe(new Date(t1).toISOString());
  });

  it('handles multiple separate recording activations across the same session with distinct replay lifecycles', async () => {
    const chunkBodies: Array<Record<string, unknown>> = [];
    let authorizeCount = 0;
    const t0 = 1726135000000;
    const t1 = t0 + 600_000; // 10 minutes later

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/config')) return configResponse();
      if (url.includes('/authorize')) {
        authorizeCount += 1;
        return new Response(JSON.stringify({
          token: `upload-token-${authorizeCount}`,
          replayId: `rpl_${authorizeCount}`,
          expiresAt: new Date(Date.now() + 300_000).toISOString()
        }), { status: 200 });
      }
      if (url.includes('/chunks')) {
        chunkBodies.push(JSON.parse(String(init?.body)));
        return new Response('{}', { status: 200 });
      }
      if (url.includes('/complete')) {
        return new Response('{}', { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const recorder = new ReplayRecorder('https://api.example', { enabled: true },
      () => ({ projectId: 'proj_a', writeKey: 'wk_test', sessionId: 'sess_test', anonymousId: 'anon_test' }),
      () => true, vi.fn());

    await recorder.start();

    // Activation 1: Flow trigger triggers activation A
    recorder.eventAccepted('onboarding_started');
    await vi.waitFor(() => expect(rrweb.record).toHaveBeenCalledTimes(1));

    rrweb.options?.emit({ type: 2, timestamp: t0, data: { node: { tagName: 'div', childNodes: [] } } });
    await vi.waitFor(() => expect(chunkBodies.length).toBe(1));
    expect(chunkBodies[0].sequence).toBe(0);
    expect(chunkBodies[0].startedAt).toBe(new Date(t0).toISOString());

    // Stop activation 1
    recorder.stop();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Activation 2: Another flow trigger later in the same session triggers activation B
    recorder.eventAccepted('onboarding_started');
    await vi.waitFor(() => expect(rrweb.record).toHaveBeenCalledTimes(2));

    rrweb.options?.emit({ type: 2, timestamp: t1, data: { node: { tagName: 'div', childNodes: [] } } });
    await vi.waitFor(() => expect(chunkBodies.length).toBe(2));
    expect(chunkBodies[1].sequence).toBe(0);
    expect(chunkBodies[1].startedAt).toBe(new Date(t1).toISOString());
    expect(authorizeCount).toBe(2);
  });
});
