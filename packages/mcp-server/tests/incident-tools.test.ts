import { afterEach, describe, expect, it, vi } from 'vitest';
import { topEndpoints } from '../src/incident-tools.js';
import { prompts } from '../src/prompts.js';
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

/** Answers each request from `routes` by path; an unknown path is a 404. */
function stubApi(routes: Record<string, { status?: number; body: unknown }>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push({ method: init?.method ?? 'GET', url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const route = routes[url.pathname];
      if (!route) return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });
      return new Response(JSON.stringify(route.body), { status: route.status ?? 200 });
    })
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('incident tools', () => {
  it('searches logs inside the chosen window with the filters given', async () => {
    const calls = stubApi({ '/v1/dashboard/logs': { body: { logs: [], total: 0 } } });
    const before = Date.now();
    await call('search_logs', { window: '1h', level: 'error', traceId: 't1', limit: 500 });
    const params = calls[0].url.searchParams;
    expect(params.get('level')).toBe('error');
    expect(params.get('traceId')).toBe('t1');
    expect(params.get('limit')).toBe('200');
    const span = new Date(params.get('to')!).getTime() - new Date(params.get('from')!).getTime();
    expect(span).toBe(60 * 60_000);
    expect(new Date(params.get('to')!).getTime()).toBeGreaterThanOrEqual(before);
  });

  it('returns a request even when its timeline cannot be loaded', async () => {
    stubApi({
      '/v1/dashboard/requests/r1': { body: { request: { id: 'r1', statusCode: 0 } } },
      '/v1/dashboard/requests/r1/related': { body: { requests: [] } }
    });
    const result = (await call('get_request', { requestId: 'r1' })) as JsonObject;
    expect(result.request).toEqual({ id: 'r1', statusCode: 0 });
    expect(result.timeline).toBeNull();
    expect(result.notes).toEqual(['Timeline unavailable: Not found.']);
  });

  it('resolves an error issue with a PATCH and needs a status or an assignee', async () => {
    const calls = stubApi({ '/v1/dashboard/errors/issues/iss_1': { body: { id: 'iss_1', status: 'resolved' } } });
    await call('update_error_issue', { issueId: 'iss_1', status: 'resolved', projectId: 'p1' });
    expect(calls[0].method).toBe('PATCH');
    expect(calls[0].body).toEqual({ projectId: 'p1', status: 'resolved' });
    await expect(call('update_error_issue', { issueId: 'iss_1' })).rejects.toThrow('Pass a "status"');
  });

  it('investigates an incident and skips the parts the token cannot read', async () => {
    stubApi({
      '/v1/dashboard/insights/health': { body: { status: 'outage', summary: 'Outage: 3 requests got no response' } },
      '/v1/dashboard/requests/summary': { body: { total: 40, errorRate: 7.5 } },
      '/v1/dashboard/requests': {
        body: {
          requests: [
            { id: 'r3', method: 'POST', route: '/api/login', statusCode: 0 },
            { id: 'r2', method: 'POST', route: '/api/login', statusCode: 0 },
            { id: 'r1', method: 'GET', route: '/api/me', statusCode: 502 }
          ]
        }
      },
      '/v1/dashboard/logs': { body: { logs: [] } },
      '/v1/dashboard/errors': { body: { issues: [{ id: 'iss_9', type: 'TypeError', message: 'Failed to fetch' }] } },
      '/v1/dashboard/replays': { status: 403, body: { message: 'Missing scope replays:read' } }
    });

    const result = (await call('investigate_incident', { window: '1h' })) as JsonObject;

    expect(result.health).toMatchObject({ status: 'outage' });
    expect(result.failingEndpoints).toEqual([
      { method: 'POST', route: '/api/login', count: 2, statuses: { '0': 2 } },
      { method: 'GET', route: '/api/me', count: 1, statuses: { '502': 1 } }
    ]);
    expect(result.replays).toBeNull();
    expect(result.notes).toEqual(['Replays unavailable: the token lacks the scope for it.']);
    const steps = result.nextSteps as string[];
    expect(steps[0]).toContain('requestId "r3"');
    expect(steps.some((step) => step.includes('no response'))).toBe(true);
    expect(steps.some((step) => step.includes('issueId "iss_9"'))).toBe(true);
  });

  it('groups failing requests by endpoint, busiest first', () => {
    expect(topEndpoints([{ method: 'GET', path: '/a', status: 500 }])).toEqual([{ method: 'GET', route: '/a', count: 1, statuses: { '500': 1 } }]);
  });
});

describe('prompts', () => {
  const toolNames = new Set(tools.map((candidate) => candidate.name));

  it.each(prompts.map((prompt) => [prompt.name, prompt] as const))('%s only names tools that exist', (_name, prompt) => {
    const text = prompt.render({ project: 'Nuwell', funnel: 'Checkout', window: '6h' });
    const mentioned = text.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [];
    for (const name of mentioned) expect(toolNames, name).toContain(name);
    expect(prompt.name).toMatch(/^[a-z][a-z-]*$/);
  });

  it('passes the window through to investigate_incident', () => {
    const text = prompts.find((prompt) => prompt.name === 'incident-review')!.render({ window: '6h' });
    expect(text).toContain('investigate_incident with window "6h"');
  });
});
