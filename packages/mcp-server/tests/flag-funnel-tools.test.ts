import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirmationMessage } from '../src/confirmations.js';
import { dashboardLink } from '../src/links.js';
import { tools } from '../src/tools.js';
import { JsonObject } from '../src/types.js';
import { validateArgs } from '../src/validate.js';

const tool = (name: string) => {
  const found = tools.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`no tool ${name}`);
  return found;
};

const call = (name: string, args: JsonObject = {}) => tool(name).handler(validateArgs(tool(name).schema, args));

interface Call {
  method: string;
  url: URL;
  body: unknown;
}

/** Answers GETs with `getBody` and everything else with `{ ok: true }`. */
function stubApi(getBody: unknown = {}) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL | string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ method, url: new URL(String(input)), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(JSON.stringify(method === 'GET' ? getBody : { ok: true }), { status: 200 });
    })
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('create_feature_flag', () => {
  it('creates the flag off at 100% by default', async () => {
    const calls = stubApi();
    await call('create_feature_flag', { key: 'new-checkout' });
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url.pathname).toBe('/v1/dashboard/flags');
    expect(calls[0].body).toEqual({ key: 'new-checkout', enabled: false, rolloutPercentage: 100 });
  });

  it('passes rollout, environment and targeting through', async () => {
    const calls = stubApi();
    const targetingGroups = [{ name: 'Pro', rolloutPercentage: 50, rules: [{ property: 'plan', operator: 'eq', value: 'pro' }] }];
    await call('create_feature_flag', {
      key: 'new-checkout',
      name: 'New checkout',
      enabled: true,
      rolloutPercentage: 25,
      environment: 'staging',
      targetingGroups,
      projectId: 'p1'
    });
    expect(calls[0].body).toEqual({
      key: 'new-checkout',
      name: 'New checkout',
      enabled: true,
      rolloutPercentage: 25,
      environment: 'staging',
      targetingGroups,
      projectId: 'p1'
    });
  });

  it('rejects a bad rollout or operator before calling the API', async () => {
    const calls = stubApi();
    await expect(call('create_feature_flag', { key: 'x', rolloutPercentage: 150 })).rejects.toThrow(/0 to 100/);
    await expect(
      call('create_feature_flag', { key: 'x', targetingGroups: [{ rules: [{ property: 'plan', operator: 'equals', value: 'pro' }] }] })
    ).rejects.toThrow(/operator must be one of/);
    expect(calls).toHaveLength(0);
  });

  it('asks to confirm only when the flag is turned on at creation', () => {
    expect(confirmationMessage('create_feature_flag', { key: 'x', enabled: false })).toBeNull();
    expect(confirmationMessage('create_feature_flag', { key: 'x', enabled: true, rolloutPercentage: 10 })).toMatch(/10% of matching users/);
  });

  it('links to the new flag', () => {
    expect(dashboardLink('create_feature_flag', {}, { id: 'flag_9', key: 'x' })).toMatch(/\/dashboard\/flags\/flag_9$/);
  });
});

describe('update_feature_flag', () => {
  it('sends only the fields that change', async () => {
    const calls = stubApi();
    await call('update_feature_flag', { flagId: 'flag 1', rolloutPercentage: 40.4 });
    expect(calls[0].method).toBe('PUT');
    expect(calls[0].url.pathname).toBe('/v1/dashboard/flags/flag%201');
    expect(calls[0].body).toEqual({ rolloutPercentage: 40 });
  });

  it('needs something to change', async () => {
    stubApi();
    await expect(call('update_feature_flag', { flagId: 'f', projectId: 'p1' })).rejects.toThrow(/at least one field/);
  });

  it('asks to confirm changes to who gets the flag, not renames', () => {
    expect(confirmationMessage('update_feature_flag', { flagId: 'f', name: 'Renamed' })).toBeNull();
    expect(confirmationMessage('update_feature_flag', { flagId: 'f', rolloutPercentage: 50 })).toMatch(/set rollout to 50%/);
    expect(confirmationMessage('update_feature_flag', { flagId: 'f', targetingGroups: [] })).toMatch(/remove its targeting/);
    expect(confirmationMessage('update_feature_flag', { flagId: 'f', enabled: false })).toMatch(/turn it off/);
  });
});

describe('funnels', () => {
  it('creates a funnel with plain and labelled steps', async () => {
    const calls = stubApi();
    await call('create_funnel', { name: 'Signup', steps: ['signup_started', { eventName: 'email_verified', label: 'Verified' }] });
    expect(calls[0].body).toEqual({ name: 'Signup', steps: ['signup_started', { eventName: 'email_verified', label: 'Verified' }] });
  });

  it('rejects a malformed step', async () => {
    stubApi();
    await expect(call('create_funnel', { name: 'x', steps: ['a', { label: 'no event' }] })).rejects.toThrow(/Step 2/);
  });

  it('renames a funnel and keeps its saved steps in order', async () => {
    const calls = stubApi({
      id: 'fnl_1',
      name: 'Old',
      steps: [
        { order: 1, eventName: 'paid', label: 'Paid' },
        { order: 0, eventName: 'cart', label: null }
      ]
    });
    await call('update_funnel', { funnelId: 'fnl_1', name: 'Checkout' });
    expect(calls.map((c) => c.method)).toEqual(['GET', 'PUT']);
    expect(calls[1].body).toEqual({ name: 'Checkout', steps: ['cart', { eventName: 'paid', label: 'Paid' }] });
  });

  it('replaces steps and keeps the saved name', async () => {
    const calls = stubApi({ id: 'fnl_1', name: 'Checkout', steps: [] });
    await call('update_funnel', { funnelId: 'fnl_1', steps: ['a', 'b'] });
    expect(calls[1].body).toEqual({ name: 'Checkout', steps: ['a', 'b'] });
  });

  it('skips the lookup when both are given', async () => {
    const calls = stubApi();
    await call('update_funnel', { funnelId: 'fnl_1', name: 'N', steps: ['a', 'b'] });
    expect(calls.map((c) => c.method)).toEqual(['PUT']);
  });
});
