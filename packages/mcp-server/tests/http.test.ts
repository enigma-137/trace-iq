import { createServer, IncomingMessage, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** A stand-in TraceIQ API that knows two tokens and records who called what. */
const seen: { path: string; token: string | undefined }[] = [];
let api: Server;
let mcp: { server: Server; close: () => Promise<void> };
let mcpUrl: string;

const tokenOf = (req: IncomingMessage) => /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];

beforeAll(async () => {
  api = createServer((req, res) => {
    const token = tokenOf(req);
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    seen.push({ path, token });
    if (token !== 'tok_alice' && token !== 'tok_bob') {
      res.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ message: 'Invalid token' }));
      return;
    }
    const body = path === '/v1/dashboard/me' ? { user: { id: token, authMethod: 'pat', scopes: ['funnels:read'] } } : [{ id: `funnel_of_${token}` }];
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
  process.env.TRACEIQ_API_URL = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;

  const { createHttpApp } = await import('../src/http.js');
  const app = createHttpApp({ publicUrl: 'https://mcp.example/mcp', issuer: 'https://api.example' });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  mcp = app;
  mcpUrl = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await mcp.close();
  await new Promise<void>((resolve) => api.close(() => resolve()));
});

async function connect(token: string) {
  const client = new Client({ name: 'test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${mcpUrl}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } }
  });
  await client.connect(transport);
  return { client, transport };
}

describe('remote MCP over HTTP', () => {
  it('publishes protected resource metadata pointing at the API', async () => {
    const response = await fetch(`${mcpUrl}/.well-known/oauth-protected-resource/mcp`);
    expect(await response.json()).toMatchObject({
      resource: 'https://mcp.example/mcp',
      authorization_servers: ['https://api.example'],
      bearer_methods_supported: ['header']
    });
  });

  it('answers 401 with a resource_metadata challenge without a valid token', async () => {
    const init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' };
    const missing = await fetch(`${mcpUrl}/mcp`, init);
    expect(missing.status).toBe(401);
    expect(missing.headers.get('www-authenticate')).toBe('Bearer resource_metadata="https://mcp.example/.well-known/oauth-protected-resource/mcp"');

    const wrong = await fetch(`${mcpUrl}/mcp`, { ...init, headers: { ...init.headers, Authorization: 'Bearer nope' } });
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get('www-authenticate')).toContain('error="invalid_token"');
  });

  it('runs each tool call with the caller’s own token', async () => {
    const alice = await connect('tok_alice');
    const bob = await connect('tok_bob');

    const tools = await alice.client.listTools();
    expect(tools.tools.length).toBeGreaterThan(60);

    const [fromAlice, fromBob] = await Promise.all([
      alice.client.callTool({ name: 'list_funnels', arguments: {} }),
      bob.client.callTool({ name: 'list_funnels', arguments: {} })
    ]);
    expect((fromAlice.content as { text: string }[])[0].text).toContain('funnel_of_tok_alice');
    expect((fromBob.content as { text: string }[])[0].text).toContain('funnel_of_tok_bob');

    const funnelCalls = seen.filter((entry) => entry.path === '/v1/dashboard/funnels').map((entry) => entry.token);
    expect(funnelCalls.sort()).toEqual(['tok_alice', 'tok_bob']);

    await alice.client.close();
    await bob.client.close();
  });

  it('refuses a session used with another token', async () => {
    const alice = await connect('tok_alice');
    const response = await fetch(`${mcpUrl}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tok_bob',
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'Mcp-Session-Id': alice.transport.sessionId!,
        'Mcp-Protocol-Version': '2025-06-18'
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    });
    expect(response.status).toBe(403);
    await alice.client.close();
  });

  it('asks for initialize first when there is no session', async () => {
    const response = await fetch(`${mcpUrl}/mcp`, {
      method: 'POST',
      headers: { Authorization: 'Bearer tok_alice', 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    });
    expect(response.status).toBe(400);
  });
});
