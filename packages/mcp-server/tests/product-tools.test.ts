import { afterEach, describe, expect, it, vi } from 'vitest';
import { productTools } from '../src/product-tools.js';
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

function stubApi(body: unknown = { ok: true }) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL | string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', url: new URL(String(input)), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(JSON.stringify(body), { status: 200 });
    })
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('product tools', () => {
  it('are all registered', () => {
    const names = new Set(tools.map((candidate) => candidate.name));
    for (const product of productTools) expect(names).toContain(product.name);
  });

  it('marks deletes destructive and reads read-only', () => {
    expect(tool('delete_cohort').annotations.destructiveHint).toBe(true);
    for (const name of ['list_dashboards', 'get_experiment_results', 'get_survey_results', 'list_webhook_deliveries']) {
      expect(tool(name).annotations.readOnlyHint, name).toBe(true);
    }
  });

  it('runs an insight query with the query fields and filters', async () => {
    const calls = stubApi({ type: 'trend', data: {} });
    await call('run_insight_query', {
      event: 'checkout_completed',
      measure: 'unique',
      breakdown: 'plan',
      days: 14,
      filters: [{ field: 'country', operator: 'is', value: 'NG' }],
      projectId: 'p1'
    });
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url.pathname).toBe('/v1/dashboard/insights/query');
    expect(calls[0].body).toEqual({
      projectId: 'p1',
      type: 'trend',
      query: { event: 'checkout_completed', measure: 'unique', breakdown: 'plan', days: '14' },
      filters: [{ field: 'country', operator: 'is', value: 'NG' }]
    });
  });

  it('asks for a property before summing, and a funnel id for funnels', async () => {
    stubApi();
    await expect(call('run_insight_query', { event: 'purchase', measure: 'sum' })).rejects.toThrow('needs a numeric "property"');
    await expect(call('run_insight_query', { type: 'funnel' })).rejects.toThrow('needs a "funnelId"');
  });

  it('adds a widget from an inline insight, or from a saved one', async () => {
    const calls = stubApi();
    await call('add_dashboard_widget', { dashboardId: 'd1', title: 'Signups', type: 'trend', event: 'signup', interval: 'day', days: 30 });
    expect(calls[0].url.pathname).toBe('/v1/dashboard/dashboards/d1/widgets');
    expect(calls[0].body).toEqual({
      title: 'Signups',
      newInsight: { name: 'Signups', type: 'trend', query: { event: 'signup', interval: 'day', days: '30' }, visualization: { chartType: 'line' } }
    });

    await call('add_dashboard_widget', { dashboardId: 'd1', title: 'Saved', insightId: 'ins_1' });
    expect(calls[1].body).toEqual({ title: 'Saved', insightId: 'ins_1' });

    await expect(call('add_dashboard_widget', { dashboardId: 'd1', title: 'Nothing' })).rejects.toThrow('Pass an "insightId"');
  });

  it('sends the project id in the body for status changes', async () => {
    const calls = stubApi();
    await call('set_experiment_status', { experimentId: 'exp 1', status: 'completed', winnerVariantKey: 'variant_b', projectId: 'p1' });
    expect(calls[0].url.pathname).toBe('/v1/dashboard/experiments/exp%201/status');
    expect(calls[0].body).toEqual({ projectId: 'p1', status: 'completed', winnerVariantKey: 'variant_b' });
  });

  it('sends the project id in the query, with no body, where the endpoint reads it there', async () => {
    const calls = stubApi();
    await call('delete_cohort', { cohortId: 'c1', projectId: 'p1' });
    await call('set_synthetic_monitor_paused', { monitorId: 'm1', paused: true, projectId: 'p1' });
    await call('set_synthetic_monitor_paused', { monitorId: 'm1', paused: false });
    await call('retry_webhook_delivery', { deliveryId: 'del_1', projectId: 'p1' });

    expect(calls.map((entry) => `${entry.method} ${entry.url.pathname}`)).toEqual([
      'DELETE /v1/dashboard/cohorts/c1',
      'POST /v1/dashboard/synthetic-monitors/m1/pause',
      'POST /v1/dashboard/synthetic-monitors/m1/resume',
      'POST /v1/dashboard/webhooks/deliveries/del_1/retry'
    ]);
    expect(calls[0].url.searchParams.get('projectId')).toBe('p1');
    expect(calls.every((entry) => entry.body === undefined)).toBe(true);
  });

  it('passes list filters through the query string', async () => {
    const calls = stubApi();
    await call('list_webhook_deliveries', { webhookId: 'w1', status: 'failed', limit: 10 });
    expect(calls[0].url.pathname).toBe('/v1/dashboard/webhooks/w1/deliveries');
    expect(Object.fromEntries(calls[0].url.searchParams)).toEqual({ status: 'failed', limit: '10' });
  });
});
