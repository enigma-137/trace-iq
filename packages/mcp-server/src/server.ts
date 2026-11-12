import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { ApiError, DASHBOARD_URL, DEFAULT_PROJECT_ID } from './client.js';
import { confirmationMessage, confirmationSchema, isConfirmed } from './confirmations.js';
import { dashboardLink } from './links.js';
import { prompts } from './prompts.js';
import { readResource, resourceTemplates, staticResources } from './resources.js';
import { tools } from './tools.js';
import { JsonObject, Tool } from './types.js';
import { validateArgs } from './validate.js';

export const SERVER_VERSION = '0.5.0';

export const SERVER_INSTRUCTIONS = [
  'TraceIQ is product analytics plus API and error monitoring.',
  'Start with whoami (or the traceiq://me resource) to see the projects and scopes the token has.',
  'Most tools take an optional projectId; without one they use the default project.',
  'Results include a link to the matching TraceIQ dashboard page; offer it to the user.'
].join(' ');

/**
 * Builds the TraceIQ MCP server with every tool, prompt and resource registered.
 * Transport-agnostic: index.ts connects it to stdio.
 */
export function createServer(): Server {
  const server = new Server(
    { name: 'traceiq-mcp', title: 'TraceIQ', version: SERVER_VERSION },
    { capabilities: { tools: {}, prompts: {}, resources: {} }, instructions: SERVER_INSTRUCTIONS }
  );

  const toolIndex = new Map(tools.map((tool) => [tool.name, tool]));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: `${tool.description}\n\nRequired scopes: ${tool.requiredScopes.length ? tool.requiredScopes.join(', ') : 'none'}.`,
      inputSchema: tool.schema,
      annotations: { ...tool.annotations, title: tool.title },
      _meta: { requiredScopes: tool.requiredScopes.join(', ') }
    }))
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = toolIndex.get(request.params.name);
    if (!tool) return errorResult(`Unknown tool: ${request.params.name}`);

    try {
      const args = validateArgs(tool.schema, withDefaultProject(tool, request.params.arguments)) as JsonObject;

      const message = confirmationMessage(tool.name, args);
      if (message && server.getClientCapabilities()?.elicitation?.form) {
        const answer = await server.elicitInput({ mode: 'form', message, requestedSchema: confirmationSchema });
        if (!isConfirmed(answer)) {
          return textResult({ cancelled: true, message: `Not done: the user did not confirm ${tool.name}.` }, null);
        }
      }

      const result = await tool.handler(args);
      return textResult(result, dashboardLink(tool.name, args, result));
    } catch (error) {
      return errorResult(describeError(error, tool));
    }
  });

  const promptIndex = new Map(prompts.map((prompt) => [prompt.name, prompt]));

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: prompts.map((prompt) => ({
      name: prompt.name,
      title: prompt.title,
      description: prompt.description,
      arguments: prompt.arguments
    }))
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const prompt = promptIndex.get(request.params.name);
    if (!prompt) throw new Error(`Unknown prompt: ${request.params.name}`);
    const args = request.params.arguments ?? {};
    for (const argument of prompt.arguments) {
      if (argument.required && !args[argument.name]) throw new Error(`Missing required argument "${argument.name}".`);
    }
    return {
      description: prompt.description,
      messages: [{ role: 'user' as const, content: { type: 'text' as const, text: prompt.render(args) } }]
    };
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: staticResources }));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates }));
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => ({
    contents: [await readResource(request.params.uri, tools)]
  }));

  return server;
}

/** Fills projectId from TRACEIQ_PROJECT_ID when the tool takes one and the call left it out. */
export function withDefaultProject(tool: Tool, args: unknown, defaultProjectId = DEFAULT_PROJECT_ID): unknown {
  if (!defaultProjectId || !tool.schema.properties.projectId) return args;
  const given = args && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
  if (given.projectId !== undefined && given.projectId !== '') return args;
  return { ...given, projectId: defaultProjectId };
}

/** Turns auth failures into something the user can fix. */
export function describeError(error: unknown, tool: Tool, dashboardUrl = DASHBOARD_URL): string {
  const message = error instanceof Error ? error.message : 'Unknown TraceIQ MCP error.';
  if (!(error instanceof ApiError)) return message;
  const tokens = `${dashboardUrl}/dashboard/settings`;
  if (error.status === 401) {
    return `${message}\nTraceIQ did not accept the token. Check TRACEIQ_API_KEY, or create a new personal access token at ${tokens}.`;
  }
  if (error.status === 403) {
    const scopes = tool.requiredScopes.length ? `${tool.name} needs the scopes: ${tool.requiredScopes.join(', ')}. ` : '';
    return `${message}\n${scopes}If the token is missing one, create a token that has it at ${tokens} (Personal access tokens). If the scopes are right, your role on this project may not allow it. Run whoami to see what the token can do.`;
  }
  return message;
}

function textResult(value: unknown, link: string | null) {
  const structured =
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : { result: value ?? null };
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify(value ?? null, null, 2) },
      ...(link
        ? [{ type: 'resource_link' as const, uri: link, name: 'Open in TraceIQ', description: 'The TraceIQ dashboard page for this result.', mimeType: 'text/html' }]
        : [])
    ],
    structuredContent: link ? { ...structured, _links: { dashboard: link } } : structured
  };
}

function errorResult(message: string) {
  return { isError: true, content: [{ type: 'text' as const, text: message }] };
}
