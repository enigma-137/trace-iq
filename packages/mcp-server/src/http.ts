#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { createServer as createHttpServer, IncomingMessage, Server as HttpServer, ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { API_URL, withToken } from './client.js';
import { MCP_SCOPES } from './scopes.js';
import { createServer } from './server.js';

/**
 * Remote MCP over Streamable HTTP. Each caller sends their own bearer token: either an
 * OAuth access token from the TraceIQ API (the API is the authorization server) or a
 * personal access token. Tokens are checked against the API and every tool call runs
 * with the caller's token, so one process can serve many users.
 */

export interface HttpOptions {
  /** Public URL of the MCP endpoint, e.g. https://api.traceiq.run/mcp. */
  publicUrl: string;
  /** OAuth issuer (the TraceIQ API's public URL). */
  issuer: string;
  /** Where to check tokens; the API's internal URL. */
  apiUrl?: string;
  sessionIdleMs?: number;
}

interface Session {
  transport: StreamableHTTPServerTransport;
  server: Server;
  tokenHash: string;
  lastSeen: number;
}

const MAX_BODY_BYTES = 1_048_576;
const TOKEN_CACHE_MS = 60_000;

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export function protectedResourceMetadata(options: HttpOptions) {
  return {
    resource: options.publicUrl,
    authorization_servers: [options.issuer],
    scopes_supported: MCP_SCOPES,
    bearer_methods_supported: ['header'],
    resource_name: 'TraceIQ',
    resource_documentation: 'https://traceiq.run/docs'
  };
}

export function metadataUrl(publicUrl: string): string {
  const url = new URL(publicUrl);
  const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
  return `${url.origin}/.well-known/oauth-protected-resource${path}`;
}

function setCors(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-Id');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, WWW-Authenticate');
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

function rpcError(res: ServerResponse, status: number, message: string, headers: Record<string, string> = {}) {
  sendJson(res, status, { jsonrpc: '2.0', error: { code: -32000, message }, id: null }, headers);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Request body too large.'), { status: 413 });
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error('Request body is not valid JSON.'), { status: 400 });
  }
}

export function createHttpApp(options: HttpOptions): { server: HttpServer; sessions: Map<string, Session>; close: () => Promise<void> } {
  const apiUrl = (options.apiUrl ?? API_URL).replace(/\/$/, '');
  const mcpPath = new URL(options.publicUrl).pathname.replace(/\/$/, '') || '/mcp';
  const resourceMetadataUrl = metadataUrl(options.publicUrl);
  const challenge = (detail?: string) => ({
    'WWW-Authenticate': `Bearer resource_metadata="${resourceMetadataUrl}"${detail ? `, error="invalid_token", error_description="${detail}"` : ''}`
  });

  const sessions = new Map<string, Session>();
  const validTokens = new Map<string, number>();

  async function tokenIsValid(token: string): Promise<boolean> {
    const key = hash(token);
    const cachedUntil = validTokens.get(key);
    if (cachedUntil && cachedUntil > Date.now()) return true;
    const response = await fetch(`${apiUrl}/v1/dashboard/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401) return false;
    if (!response.ok) throw new Error(`TraceIQ API answered ${response.status} while checking the token.`);
    validTokens.set(key, Date.now() + TOKEN_CACHE_MS);
    if (validTokens.size > 10_000) validTokens.clear();
    return true;
  }

  const idleMs = options.sessionIdleMs ?? 30 * 60_000;
  const sweeper = setInterval(() => {
    const cutoff = Date.now() - idleMs;
    for (const [id, session] of sessions) {
      if (session.lastSeen < cutoff) {
        sessions.delete(id);
        void session.transport.close();
      }
    }
  }, 60_000);
  sweeper.unref();

  async function handleMcp(req: IncomingMessage, res: ServerResponse) {
    const header = req.headers.authorization ?? '';
    const token = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim();
    if (!token) return rpcError(res, 401, 'Sign in to TraceIQ to use this server.', challenge());
    if (!(await tokenIsValid(token))) return rpcError(res, 401, 'The TraceIQ token is invalid, expired or revoked.', challenge('The token is invalid or expired'));

    const body = req.method === 'POST' ? await readJson(req) : undefined;
    const sessionId = req.headers['mcp-session-id'];
    const tokenHash = hash(token);

    if (typeof sessionId === 'string' && sessionId) {
      const session = sessions.get(sessionId);
      if (!session) return rpcError(res, 404, 'Session not found. Reconnect to start a new one.');
      // A session belongs to whoever opened it.
      if (session.tokenHash !== tokenHash) return rpcError(res, 403, 'This session belongs to a different token.');
      session.lastSeen = Date.now();
      return withToken(token, () => session.transport.handleRequest(req, res, body));
    }

    if (req.method !== 'POST' || !isInitializeRequest(body)) {
      return rpcError(res, 400, 'Send an initialize request first, without an Mcp-Session-Id header.');
    }

    const server = createServer();
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, { transport, server, tokenHash, lastSeen: Date.now() });
      },
      onsessionclosed: (id) => {
        sessions.delete(id);
      }
    });
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };
    await server.connect(transport);
    return withToken(token, () => transport.handleRequest(req, res, body));
  }

  const server = createHttpServer(async (req, res) => {
    setCors(res);
    try {
      const path = new URL(req.url ?? '/', 'http://localhost').pathname.replace(/\/$/, '') || '/';
      if (req.method === 'OPTIONS') {
        res.writeHead(204).end();
        return;
      }
      if (req.method === 'GET' && path.startsWith('/.well-known/oauth-protected-resource')) {
        return sendJson(res, 200, protectedResourceMetadata(options));
      }
      if (req.method === 'GET' && path === '/health') return sendJson(res, 200, { ok: true, sessions: sessions.size });
      if (path === mcpPath) return await handleMcp(req, res);
      return sendJson(res, 404, { error: 'not_found' });
    } catch (error) {
      if (res.headersSent) return;
      const status = (error as { status?: number }).status ?? 500;
      rpcError(res, status, status === 500 ? 'TraceIQ MCP server error.' : (error as Error).message);
      if (status === 500) console.error(error);
    }
  });

  return {
    server,
    sessions,
    close: async () => {
      clearInterval(sweeper);
      await Promise.all([...sessions.values()].map((session) => session.transport.close()));
      sessions.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  };
}

function optionsFromEnv(): HttpOptions & { port: number; host: string } {
  const port = Number(process.env.PORT ?? process.env.TRACEIQ_MCP_PORT ?? 8787);
  const publicUrl = (process.env.TRACEIQ_MCP_PUBLIC_URL ?? `http://localhost:${port}/mcp`).replace(/\/$/, '');
  const issuer = (process.env.TRACEIQ_OAUTH_ISSUER ?? new URL(publicUrl).origin).replace(/\/$/, '');
  return { port, host: process.env.HOST ?? '0.0.0.0', publicUrl, issuer };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const options = optionsFromEnv();
  const { server } = createHttpApp(options);
  server.listen(options.port, options.host, () => {
    console.error(`TraceIQ MCP server listening on ${options.host}:${options.port}, public URL ${options.publicUrl}, API ${API_URL}.`);
  });
}
