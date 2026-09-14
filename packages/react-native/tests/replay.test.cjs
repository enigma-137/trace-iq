const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const Ajv = require('ajv');
const path = require('node:path');

const native = { Platform: { OS: 'ios', Version: '17' }, AppState: { addEventListener: () => ({ remove() {} }) } };
const originalLoad = Module._load;
Module._load = function (id, parent, isMain) {
  if (id === 'react-native') return native;
  return originalLoad.call(this, id, parent, isMain);
};
const { TraceIQReactNative } = require('../dist/client.js');
Module._load = originalLoad;
const schema = require('../../../contracts/mobile-replay/v1.schema.json');
const validate = new Ajv({ strict: true }).compile(schema);
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
function harness(batchAccepted = true) {
  const calls = [];
  global.fetch = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ url, body, headers: options.headers });
    if (url.endsWith('/v1/events/batch')) return response({ accepted: true,
      results: body.batch.map(() => ({ accepted: batchAccepted })) });
    if (url.includes('/v1/replays/config')) return response({ enabled: true, sampleRate: 1,
      maxDurationSeconds: 300, flowTriggerEventNames: ['checkout_started'] });
    if (url.endsWith('/v1/replays/authorize')) return response({ token: 'test-token', replayId: 'rpl_test',
      expiresAt: new Date(Date.now() + 300_000).toISOString() });
    return response({ accepted: true });
  };
  const client = new TraceIQReactNative();
  client.initialize({ projectId: 'proj_test', writeKey: 'key', endpoint: 'https://example.test',
    flushAt: 100, flushIntervalMs: 0, replay: { enabled: true } });
  return { client, calls };
}

test('recording waits for consent and a per-event server acknowledgement', async () => {
  const { client, calls } = harness(false);
  client.capture({ event: 'checkout_started' });
  await client.flush();
  assert.equal(calls.filter((call) => call.url.endsWith('/authorize')).length, 0);
  client.grantReplayConsent();
  client.capture({ event: 'checkout_started' });
  await client.flush();
  assert.equal(client.isReplayRecording, false);
  assert.equal(calls.filter((call) => call.url.endsWith('/authorize')).length, 0);
  await client.shutdown();
});

test('accepted funnel event starts structural replay with blocked interactions removed', async () => {
  const { client, calls } = harness();
  client.grantReplayConsent();
  client.capture({ event: 'checkout_started' });
  await client.flush();
  assert.equal(client.isReplayRecording, true);
  const analytics = calls.find((call) => call.url.endsWith('/events/batch')).body.batch[0];
  assert.match(analytics.sessionId, /^ses_/);
  assert.equal(analytics.generation, undefined);
  const auth = calls.find((call) => call.url.endsWith('/authorize')).body;
  assert.equal(auth.sessionId, analytics.sessionId);
  assert.equal(auth.recordingFormat, 'mobile-structural-v1');
  client.recordReplaySnapshot('Checkout', { width: 390, height: 844, orientation: 'portrait' }, [
    { id: 1, kind: 'control', frame: { x: 0, y: 0, width: 100, height: 50, secret: 'must not leak' }, text: 'must not leak' },
    { id: 2, kind: 'blocked', frame: { x: 100, y: 0, width: 100, height: 50 } }
  ]);
  client.recordReplayTap(120, 20);
  client.recordReplayTap(30, 20);
  client.recordReplayScroll(30, 20, 0, 12);
  await client.flushReplay();
  const chunk = calls.find((call) => call.url.endsWith('/chunks')).body.events;
  assert.equal(validate(chunk), true, JSON.stringify(validate.errors));
  assert.deepEqual(chunk.events.map((event) => event.type), ['snapshot', 'tap', 'scroll']);
  assert.equal(JSON.stringify(chunk).includes('must not leak'), false);
  await client.shutdown();
});

test('reset aborts recording and drops unsent visual events', async () => {
  const { client, calls } = harness();
  client.grantReplayConsent();
  client.capture({ event: 'checkout_started' });
  await client.flush();
  client.recordReplaySnapshot('Checkout', { width: 390, height: 844, orientation: 'portrait' }, []);
  client.reset();
  await client.flushReplay();
  assert.equal(client.isReplayRecording, false);
  assert.equal(calls.filter((call) => call.url.endsWith('/chunks')).length, 0);
  await client.shutdown();
});

test('each uploaded chunk begins with a snapshot and revocation drops pending content', async () => {
  const { client, calls } = harness();
  client.grantReplayConsent();
  client.capture({ event: 'checkout_started' });
  await client.flush();
  client.recordReplaySnapshot('Checkout', { width: 390, height: 844, orientation: 'portrait' }, [
    { id: 1, kind: 'control', frame: { x: 0, y: 0, width: 100, height: 50 } }
  ]);
  await client.flushReplay();
  client.recordReplayTap(10, 10);
  await client.flushReplay();
  const chunks = calls.filter((call) => call.url.endsWith('/chunks')).map((call) => call.body.events);
  assert.deepEqual(chunks.map((chunk) => chunk.sequence), [0, 1]);
  assert.deepEqual(chunks.map((chunk) => chunk.events[0].type), ['snapshot', 'snapshot']);
  assert.ok(chunks.every((chunk) => validate(chunk)));
  client.recordReplayTap(10, 10);
  client.revokeReplayConsent();
  await client.flushReplay();
  assert.equal(client.isReplayRecording, false);
  assert.equal(calls.filter((call) => call.url.endsWith('/chunks')).length, 2);
  await client.shutdown();
});
