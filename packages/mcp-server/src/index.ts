#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { API_URL, ensureConfigured } from './client.js';
import { tools } from './tools.js';
import { JsonObject, JsonValue } from './types.js';
import { validateArgs } from './validate.js';

ensureConfigured();

const server = new Server(
  {
    name: 'traceiq-mcp',
    version: '0.2.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

const toolIndex = new Map(tools.map((tool) => [tool.name, tool]));

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((tool) => ({
    name: tool.name,
    description: `${tool.description}\n\nRequired scopes: ${tool.requiredScopes.join(', ')}.`,
    inputSchema: tool.schema,
    annotations: {
      ...tool.annotations,
      title: tool.title
    },
    _meta: { requiredScopes: tool.requiredScopes.join(', ') }
  }))
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = toolIndex.get(request.params.name);
  if (!tool) {
    return errorResult(`Unknown tool: ${request.params.name}`);
  }

  try {
    const args = validateArgs(tool.schema, request.params.arguments);
    const result = await tool.handler(args as JsonObject);
    return textResult(result as JsonValue);
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : 'Unknown TraceIQ MCP error.');
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`TraceIQ MCP server connected to ${API_URL}.`);

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