#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { API_URL, ensureConfigured } from './client.js';
import { createServer } from './server.js';

ensureConfigured();

const server = createServer();
await server.connect(new StdioServerTransport());
console.error(`TraceIQ MCP server connected to ${API_URL}.`);
