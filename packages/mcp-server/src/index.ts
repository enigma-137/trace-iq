#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const API_KEY = process.env.TRACEIQ_API_KEY;
const API_URL = (process.env.TRACEIQ_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

if (!API_KEY) {
  console.error('TRACEIQ_API_KEY is required.');
  process.exit(1);
}

const server = new Server(
  {
    name: 'traceiq-mcp',
    version: '0.1.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_projects',
      description: 'List TraceIQ projects accessible with the configured personal access token.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
      }
    },
    {
      name: 'list_feature_flags',
      description: 'List feature flags for a TraceIQ project.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description: 'TraceIQ project id. If omitted, TraceIQ uses the first accessible project.'
          }
        },
        additionalProperties: false
      }
    },
    {
      name: 'toggle_feature_flag',
      description: 'Enable or disable a TraceIQ feature flag.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description: 'TraceIQ project id.'
          },
          flagId: {
            type: 'string',
            description: 'TraceIQ feature flag id.'
          },
          enabled: {
            type: 'boolean',
            description: 'Whether the flag should be enabled.'
          }
        },
        required: ['flagId', 'enabled'],
        additionalProperties: false
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case 'list_projects':
        return textResult(await apiGet('/v1/dashboard/projects'));

      case 'list_feature_flags': {
        const args = asRecord(request.params.arguments);
        const projectId = optionalString(args.projectId, 'projectId');
        return textResult(await apiGet('/v1/dashboard/flags', projectId ? { projectId } : undefined));
      }

      case 'toggle_feature_flag': {
        const args = asRecord(request.params.arguments);
        const flagId = requiredString(args.flagId, 'flagId');
        const enabled = requiredBoolean(args.enabled, 'enabled');
        const projectId = optionalString(args.projectId, 'projectId');
        return textResult(
          await apiJson('PUT', `/v1/dashboard/flags/${encodeURIComponent(flagId)}`, { enabled, projectId })
        );
      }

      default:
        return errorResult(`Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : 'Unknown TraceIQ MCP error.');
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`TraceIQ MCP server connected to ${API_URL}.`);

async function apiGet(path: string, params?: Record<string, string>): Promise<JsonValue> {
  const url = new URL(`${API_URL}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  return apiFetch(url, { method: 'GET' });
}

async function apiJson(method: 'PUT', path: string, body: Record<string, unknown>): Promise<JsonValue> {
  return apiFetch(new URL(`${API_URL}${path}`), {
    method,
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

async function apiFetch(url: URL, init: RequestInit): Promise<JsonValue> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      ...init.headers
    }
  });

  const text = await response.text();
  const data = text ? safeJson(text) : null;

  if (!response.ok) {
    const message =
      data && typeof data === 'object' && !Array.isArray(data) && typeof data.message === 'string'
        ? data.message
        : `TraceIQ API request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }

  return data;
}

function textResult(value: JsonValue) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

function errorResult(message: string) {
  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: message
      }
    ]
  };
}

function safeJson(text: string): JsonValue {
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return text;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return requiredString(value, field);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }

  return value.trim();
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${field} must be a boolean.`);
  }

  return value;
}
