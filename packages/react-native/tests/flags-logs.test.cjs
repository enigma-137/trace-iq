const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const native = { Platform: { OS: 'ios', Version: '17' }, AppState: { addEventListener: () => ({ remove() {} }) } };
const originalLoad = Module._load;
Module._load = function (id, parent, isMain) {
  if (id === 'react-native') return native;
  return originalLoad.call(this, id, parent, isMain);
};
const { TraceIQReactNative } = require('../dist/client.js');
Module._load = originalLoad;
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function harness({ flags = {}, evaluateStatus = 200, logsStatus = 202 } = {}) {
  const calls = [];
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, body });
    if (url.endsWith('/v1/flags/evaluate')) return response(flags, evaluateStatus);
    if (url.endsWith('/v1/logs/batch')) return response({ accepted: body.logs.length }, logsStatus);
    if (url.endsWith('/v1/events/batch')) return response({ results: body.batch.map(() => ({ accepted: true })) });
    return response({ accepted: true });
  };
  const errors = [];
  const client = new TraceIQReactNative();
  client.initialize({ projectId: 'proj_test', writeKey: 'key', endpoint: 'https://example.test',
    flushAt: 100, flushIntervalMs: 0, maxRetries: 0, environment: 'staging', onError: (e) => errors.push(e) });
  return { client, calls, errors };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('feature flags load, read synchronously and record one exposure per value', async () => {
  const { client, calls } = harness({ flags: {
    flags: { 'new-wallet': true, beta: false },
    payloads: { 'new-wallet': { limit: 5 } },
    details: { 'new-wallet': { enabled: true, reason: 'rollout', revision: 3 } }
  } });

  assert.equal(client.isFeatureEnabled('new-wallet', true), true, 'default before load');
  assert.equal(client.isFeatureEnabled('new-wallet'), false, 'default false before load');
  assert.equal(calls.length, 0, 'no exposure before flags are loaded');

  await client.loadFeatureFlags({ plan: 'pro' });
  const evaluate = calls[0];
  assert.equal(evaluate.url, 'https://example.test/v1/flags/evaluate');
  assert.equal(evaluate.body.projectId, 'proj_test');
  assert.equal(evaluate.body.environment, 'staging');
  assert.deepEqual(evaluate.body.properties, { plan: 'pro' });
  assert.match(evaluate.body.distinctId, /^anon/);

  assert.equal(client.isFeatureEnabled('new-wallet'), true);
  assert.equal(client.isFeatureEnabled('new-wallet'), true);
  assert.equal(client.isFeatureEnabled('beta'), false);
  assert.equal(client.isFeatureEnabled('missing', true), true);
  assert.deepEqual(client.getFeatureFlagPayload('new-wallet'), { limit: 5 });
  assert.equal(client.getFeatureFlagPayload('beta', 'off'), 'off');
  await settle();

  const exposures = calls.filter((call) => call.url.endsWith('/v1/flags/exposure'));
  assert.deepEqual(exposures.map((e) => e.body.flagKey), ['new-wallet', 'beta', 'missing']);
  assert.equal(exposures[0].body.enabled, true);
  assert.equal(exposures[0].body.revision, 3);
  assert.equal(exposures[0].body.evaluationReason, 'rollout');
});

test('a failed flag load keeps defaults; reset() clears loaded flags', async () => {
  const failing = harness({ evaluateStatus: 503 });
  await failing.client.loadFeatureFlags();
  assert.equal(failing.client.isFeatureEnabled('anything', true), true);

  const { client } = harness({ flags: { flags: { 'new-wallet': true }, payloads: {} } });
  await client.loadFeatureFlags();
  assert.equal(client.isFeatureEnabled('new-wallet'), true);
  client.reset();
  assert.equal(client.isFeatureEnabled('new-wallet'), false);
});

test('log() batches lines with session and user to /v1/logs/batch on flush', async () => {
  const { client, calls } = harness();
  client.identify({ userId: 'user_1' });
  client.log('error', 'Transfer failed', { provider: 'paystack', error: new TypeError('timeout') });
  client.log('loud', 'unknown levels become info', { service: 'wallet' });
  client.log('info', '   ');
  await client.flush();

  const logsCall = calls.find((call) => call.url.endsWith('/v1/logs/batch'));
  assert.ok(logsCall, 'logs were sent');
  assert.equal(logsCall.body.projectId, 'proj_test');
  const [first, second] = logsCall.body.logs;
  assert.equal(logsCall.body.logs.length, 2);
  assert.equal(first.level, 'error');
  assert.equal(first.service, 'mobile-app');
  assert.equal(first.environment, 'staging');
  assert.equal(first.distinctId, 'user_1');
  assert.match(first.sessionId, /^ses/);
  assert.deepEqual(first.metadata, { provider: 'paystack' });
  assert.deepEqual({ name: first.errorDetails.name, message: first.errorDetails.message }, { name: 'TypeError', message: 'timeout' });
  assert.equal(second.level, 'info');
  assert.equal(second.service, 'wallet');
});

test('rejected log batches are reported through onError', async () => {
  const { client, errors } = harness({ logsStatus: 400 });
  client.log('warn', 'low balance');
  await client.flush();
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /logs rejected with 400/);
});
