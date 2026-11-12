import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/client.js';
import { confirmedTools } from '../src/confirmations.js';
import { dashboardLink, linkedTools } from '../src/links.js';
import { readResource, toolsMarkdown } from '../src/resources.js';
import { createServer, describeError, withDefaultProject } from '../src/server.js';
import { tools } from '../src/tools.js';

const tool = (name: string) => tools.find((candidate) => candidate.name === name)!;

function stubApi(routes: Record<string, unknown> = {}) {
  const calls: { method: string; url: URL }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push({ method: init?.method ?? 'GET', url });
      const body = routes[url.pathname] ?? { ok: true };
      if (body instanceof Response) return body;
      return new Response(JSON.stringify(body), { status: 200 });
    })
  );
  return calls;
}

async function connect(elicit?: (message: string) => { action: 'accept' | 'decline' | 'cancel'; content?: Record<string, unknown> }) {
  const client = new Client({ name: 'test', version: '1.0.0' }, { capabilities: elicit ? { elicitation: { form: {} } } : {} });
  if (elicit) client.setRequestHandler(ElicitRequestSchema, async (request) => elicit(String(request.params.message)));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([createServer().connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

afterEach(() => vi.unstubAllGlobals());

describe('dashboard links', () => {
  it('only names tools that exist', () => {
    const names = new Set(tools.map((candidate) => candidate.name));
    for (const name of linkedTools) expect(names, name).toContain(name);
  });

  it('points at the item and keeps the project', () => {
    expect(dashboardLink('get_funnel_results', { funnelId: 'f 1', projectId: 'p1' }, {}, 'https://app.example')).toBe(
      'https://app.example/dashboard/funnels/f%201?projectId=p1'
    );
    expect(dashboardLink('get_request', { requestId: 'r1' }, {}, 'https://app.example')).toBe(
      'https://app.example/dashboard/requests?range=30d&request=r1'
    );
    expect(dashboardLink('create_dashboard', {}, { id: 'd9' }, 'https://app.example')).toBe('https://app.example/dashboard/dashboards/d9');
    expect(dashboardLink('list_projects', {}, {}, 'https://app.example')).toBeNull();
  });
});

describe('tool calls over MCP', () => {
  it('returns structured content and an Open in TraceIQ link', async () => {
    stubApi({ '/v1/dashboard/funnels': [{ id: 'f1' }] });
    const client = await connect();
    const result = await client.callTool({ name: 'list_funnels', arguments: { projectId: 'p1' } });
    const content = result.content as { type: string; uri?: string }[];
    expect(content[0].type).toBe('text');
    expect(content[1]).toMatchObject({ type: 'resource_link', name: 'Open in TraceIQ' });
    expect(content[1].uri).toMatch(/\/dashboard\/funnels\?projectId=p1$/);
    expect(result.structuredContent).toHaveProperty('_links.dashboard', content[1].uri);
  });

  it('asks before a destructive change and stops when the user says no', async () => {
    const calls = stubApi();
    const messages: string[] = [];
    const client = await connect((message) => {
      messages.push(message);
      return { action: 'accept', content: { confirm: false } };
    });
    const result = await client.callTool({ name: 'delete_funnel', arguments: { funnelId: 'f1' } });
    expect(messages[0]).toContain('Delete funnel "f1"');
    expect(result.structuredContent).toMatchObject({ cancelled: true });
    expect(calls).toHaveLength(0);
  });

  it('runs the change once confirmed', async () => {
    const calls = stubApi();
    const client = await connect(() => ({ action: 'accept', content: { confirm: true } }));
    await client.callTool({ name: 'toggle_feature_flag', arguments: { flagId: 'flag_1', enabled: false } });
    expect(calls.map((entry) => `${entry.method} ${entry.url.pathname}`)).toEqual(['PUT /v1/dashboard/flags/flag_1']);
  });

  it('runs without asking when the client has no elicitation', async () => {
    const calls = stubApi();
    const client = await connect();
    await client.callTool({ name: 'delete_alert', arguments: { alertId: 'a1' } });
    expect(calls).toHaveLength(1);
  });

  it('every confirmed tool exists and is not read-only', () => {
    for (const name of confirmedTools) expect(tool(name)?.annotations.readOnlyHint, name).not.toBe(true);
  });

  it('lists resources and templates, and reads them', async () => {
    stubApi({ '/v1/dashboard/funnels': [{ id: 'f1' }] });
    const client = await connect();
    const { resources } = await client.listResources();
    expect(resources.map((resource) => resource.uri)).toEqual(['traceiq://projects', 'traceiq://me', 'traceiq://tools', 'ui://traceiq/view.html']);
    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates.map((template) => template.uriTemplate)).toContain('traceiq://projects/{projectId}/funnels');
    const read = await client.readResource({ uri: 'traceiq://projects/p1/funnels' });
    expect(JSON.parse(String((read.contents[0] as { text: string }).text))).toEqual([{ id: 'f1' }]);
  });
});

describe('resources', () => {
  it('rejects unknown uris', async () => {
    await expect(readResource('traceiq://nope', tools)).rejects.toThrow('Unknown TraceIQ resource');
  });

  it('documents every tool and its scopes', () => {
    const markdown = toolsMarkdown(tools);
    expect(markdown).toContain('| `whoami` | none | read |');
    expect(markdown).toContain('| `delete_funnel` | funnels:write | destructive |');
  });
});

describe('whoami', () => {
  it('lists the tools a scoped token cannot use', async () => {
    stubApi({
      '/v1/dashboard/me': { user: { id: 'u1', email: 'a@b.c', authMethod: 'pat', scopes: ['projects:read', 'analytics:read'] } },
      '/v1/dashboard/projects': [{ id: 'p1' }]
    });
    const result = (await tool('whoami').handler({})) as { scopes: string[]; unavailableTools: { tool: string; missingScopes: string[] }[] };
    expect(result.scopes).toEqual(['projects:read', 'analytics:read']);
    const unavailable = new Map(result.unavailableTools.map((entry) => [entry.tool, entry.missingScopes]));
    expect(unavailable.has('list_projects')).toBe(false);
    expect(unavailable.get('delete_funnel')).toEqual(['funnels:write']);
  });

  it('copes with a token that cannot list projects', async () => {
    stubApi({
      '/v1/dashboard/me': { user: { id: 'u1', authMethod: 'pat', scopes: [] } },
      '/v1/dashboard/projects': new Response(JSON.stringify({ message: 'no' }), { status: 403 })
    });
    const result = (await tool('whoami').handler({})) as { projects: unknown };
    expect(result.projects).toMatch(/projects:read/);
  });
});

describe('defaults and errors', () => {
  it('fills the default project only where a tool takes one and none was given', () => {
    expect(withDefaultProject(tool('list_funnels'), {}, 'p_default')).toEqual({ projectId: 'p_default' });
    expect(withDefaultProject(tool('list_funnels'), { projectId: 'p1' }, 'p_default')).toEqual({ projectId: 'p1' });
    expect(withDefaultProject(tool('list_projects'), {}, 'p_default')).toEqual({});
    expect(withDefaultProject(tool('list_funnels'), {}, undefined)).toEqual({});
  });

  it('explains missing scopes and bad tokens', () => {
    const forbidden = describeError(new ApiError('Personal access token requires "funnels:write" scope.', 403), tool('delete_funnel'), 'https://app.example');
    expect(forbidden).toContain('delete_funnel needs the scopes: funnels:write');
    expect(forbidden).toContain('https://app.example/dashboard/settings');
    expect(describeError(new ApiError('Unauthorized', 401), tool('list_funnels'), 'https://app.example')).toContain('TRACEIQ_API_KEY');
    expect(describeError(new Error('boom'), tool('list_funnels'))).toBe('boom');
  });
});
