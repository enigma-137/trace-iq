import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from '../src/server.js';
import { tools } from '../src/tools.js';
import { buildView, widgetTools } from '../src/views.js';
import { WIDGET_HTML, WIDGET_MIME_TYPE, WIDGET_URI } from '../src/widget.js';

afterEach(() => vi.unstubAllGlobals());

async function connect() {
  const client = new Client({ name: 'test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([createServer().connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

const health = {
  project: { id: 'p1', name: 'Shop' },
  status: 'degraded',
  summary: 'Some requests are failing',
  windowMinutes: 60,
  checkedAt: '2026-11-12T10:00:00Z',
  failures: {
    exceptions: 3,
    failedRequests: 12,
    networkErrors: 0,
    serverErrors: 12,
    totalRequests: 400,
    failedActions: 0,
    affectedUsers: 5,
    topError: { type: 'TypeError', message: 'x is undefined', count: 3, users: 2 },
    topFailedRequest: { method: 'POST', path: '/api/checkout', status: 502, count: 12 },
    topFailedAction: null,
    firstAt: null,
    lastAt: null
  }
};

const funnel = {
  funnel: { id: 'f1', name: 'Checkout' },
  from: '2026-10-13T00:00:00Z',
  to: '2026-11-12T00:00:00Z',
  days: 30,
  steps: [
    { order: 0, eventName: 'cart_viewed', label: 'Cart', count: 1000, conversionFromStart: 1, conversionFromPrevious: 1, droppedFromPrevious: 0 },
    { order: 1, eventName: 'checkout_started', label: null, count: 400, conversionFromStart: 0.4, conversionFromPrevious: 0.4, droppedFromPrevious: 600 },
    { order: 2, eventName: 'purchase', label: 'Paid', count: 300, conversionFromStart: 0.3, conversionFromPrevious: 0.75, droppedFromPrevious: 100 }
  ]
};

const trends = (breakdown: string | null) => ({
  event: 'signup',
  interval: 'day',
  measure: 'count',
  property: null,
  breakdown,
  buckets: [],
  summary: { current: 30, previous: 20, days: 7 },
  series: breakdown
    ? [
        { key: 'free', points: [{ bucket: '2026-11-10T00:00:00Z', total: 5, uniques: 0, value: 5 }] },
        { key: 'pro', points: [{ bucket: '2026-11-10T00:00:00Z', total: 9, uniques: 0, value: 9 }] }
      ]
    : [
        {
          key: 'signup',
          points: [
            { bucket: '2026-11-10T00:00:00Z', total: 10, uniques: 8, value: 10 },
            { bucket: '2026-11-11T00:00:00Z', total: 20, uniques: 15, value: 20 }
          ]
        }
      ]
});

const experiment = {
  experimentId: 'e1',
  primaryMetric: 'purchase',
  totalExposures: 2000,
  totalConversions: 220,
  overallConversionRate: 0.11,
  status: 'running',
  hasEnoughData: true,
  recommendedWinner: 'b',
  variants: [
    { variantKey: 'a', variantName: 'Control', isControl: true, weight: 50, exposures: 1000, conversions: 100, conversionRate: 0.1, uplift: 0, zScore: null, pValue: null, confidence: null, isSignificant: false, sampleStatus: 'collecting' },
    { variantKey: 'b', variantName: 'New page', isControl: false, weight: 50, exposures: 1000, conversions: 120, conversionRate: 0.12, uplift: 20, zScore: 2.1, pValue: 0.03, confidence: 97, isSignificant: true, sampleStatus: 'significant' }
  ]
};

describe('views', () => {
  it('only names tools that exist', () => {
    const names = new Set(tools.map((tool) => tool.name));
    for (const name of widgetTools) expect(names, name).toContain(name);
  });

  it('draws project health with a status and the top failures', () => {
    const view = buildView('get_project_health', {}, health)!;
    expect(view.status).toEqual({ tone: 'warning', label: 'Degraded' });
    expect(view.subtitle).toBe('Some requests are failing · last 1h');
    expect(view.stats?.map((stat) => stat.value)).toEqual(['400', '12', '3', '5']);
    expect(view.notes?.[1]).toBe('Top failing request: POST /api/checkout → 502 (12×)');
  });

  it('draws a funnel and marks the biggest drop', () => {
    const view = buildView('get_funnel_results', {}, funnel)!;
    expect(view.title).toBe('Checkout');
    expect(view.stats?.map((stat) => stat.value)).toEqual(['1,000', '300', '30%']);
    const rows = view.bars!.rows;
    expect(rows.map((row) => row.label)).toEqual(['1. Cart', '2. checkout_started', '3. Paid']);
    expect(rows[1]).toMatchObject({ highlight: true, display: '400 · 40%' });
    expect(rows[1].note).toContain('600 dropped (60% of the previous step), the biggest drop');
    expect(rows[2].highlight).toBe(false);
  });

  it('draws a trend line, or ranks breakdown values', () => {
    const line = buildView('get_trends', {}, trends(null))!;
    expect(line.series?.points).toEqual([
      { x: '2026-11-10', y: 10, label: '10' },
      { x: '2026-11-11', y: 20, label: '20' }
    ]);
    expect(line.stats?.[0].delta?.text).toBe('+50% vs previous');

    const ranked = buildView('get_trends', {}, trends('plan'))!;
    expect(ranked.series).toBeUndefined();
    expect(ranked.bars?.rows.map((row) => row.label)).toEqual(['pro', 'free']);
  });

  it('draws experiment variants and names the winner', () => {
    const view = buildView('get_experiment_results', {}, experiment)!;
    expect(view.status).toEqual({ tone: 'good', label: 'New page is winning' });
    expect(view.bars?.rows.map((row) => row.display)).toEqual(['10%', '12%']);
    expect(view.bars?.rows[1].note).toBe('+20% lift · 97% confidence · significant');
  });

  it('returns null for shapes it does not know', () => {
    expect(buildView('get_funnel_results', {}, { nope: true })).toBeNull();
    expect(buildView('list_projects', {}, [])).toBeNull();
  });
});

describe('widget', () => {
  it('is a full HTML document with a script that parses', () => {
    expect(WIDGET_HTML.startsWith('<!doctype html>')).toBe(true);
    const script = /<script>([\s\S]*)<\/script>/.exec(WIDGET_HTML)?.[1];
    expect(script).toBeTruthy();
    expect(() => new Function(script!)).not.toThrow();
    expect(WIDGET_HTML).not.toMatch(/<script[^>]+src=|<link[^>]+href=/);
  });

  it('is served as an MCP Apps resource and linked from the chart tools', async () => {
    const client = await connect();
    const { resources } = await client.listResources();
    expect(resources.find((resource) => resource.uri === WIDGET_URI)).toMatchObject({ mimeType: WIDGET_MIME_TYPE });

    const read = await client.readResource({ uri: WIDGET_URI });
    expect(read.contents[0]).toMatchObject({ uri: WIDGET_URI, mimeType: 'text/html;profile=mcp-app', _meta: { ui: { prefersBorder: true } } });

    const { tools: listed } = await client.listTools();
    const withUi = listed.filter((tool) => (tool._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri === WIDGET_URI);
    expect(withUi.map((tool) => tool.name).sort()).toEqual([...widgetTools].sort());
  });

  it('puts the view in structuredContent of a tool result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(funnel), { status: 200 })));
    const client = await connect();
    const result = await client.callTool({ name: 'get_funnel_results', arguments: { funnelId: 'f1' } });
    expect(result.structuredContent).toHaveProperty('_view.title', 'Checkout');
    expect(result.structuredContent).toHaveProperty('_links.dashboard');
  });
});
