import { request } from './client.js';
import { shapeResponse } from './shape.js';
import { Tool } from './types.js';

/**
 * MCP resources: read-only context a client can attach to a conversation without a
 * tool call (in Claude, through the "+" / @ menu). Fixed resources cover the account;
 * templates take a project id.
 */

export interface StaticResource {
  uri: string;
  name: string;
  title: string;
  description: string;
  mimeType: string;
}

export interface ResourceTemplate {
  uriTemplate: string;
  name: string;
  title: string;
  description: string;
  mimeType: string;
}

export const staticResources: StaticResource[] = [
  {
    uri: 'traceiq://projects',
    name: 'projects',
    title: 'TraceIQ projects',
    description: 'The projects this token can see, with ids and your role on each.',
    mimeType: 'application/json'
  },
  {
    uri: 'traceiq://me',
    name: 'me',
    title: 'TraceIQ account',
    description: 'Who the token belongs to, its scopes, and the tools it cannot use.',
    mimeType: 'application/json'
  },
  {
    uri: 'traceiq://tools',
    name: 'tools',
    title: 'TraceIQ tools and scopes',
    description: 'Every TraceIQ tool with the token scopes it needs.',
    mimeType: 'text/markdown'
  }
];

const PROJECT_COLLECTIONS: Record<string, { title: string; description: string; path: string }> = {
  'event-names': {
    title: 'Event names',
    description: 'Every event name tracked in a project, for writing queries and funnels.',
    path: '/v1/dashboard/insights/event-names'
  },
  funnels: { title: 'Funnels', description: 'Saved funnels in a project, with their steps.', path: '/v1/dashboard/funnels' },
  dashboards: { title: 'Dashboards', description: 'Custom dashboards in a project.', path: '/v1/dashboard/dashboards' }
};

export const resourceTemplates: ResourceTemplate[] = Object.entries(PROJECT_COLLECTIONS).map(([key, collection]) => ({
  uriTemplate: `traceiq://projects/{projectId}/${key}`,
  name: `project-${key}`,
  title: collection.title,
  description: collection.description,
  mimeType: 'application/json'
}));

export function toolsMarkdown(tools: Tool[]): string {
  const rows = tools.map(
    (tool) =>
      `| \`${tool.name}\` | ${tool.requiredScopes.length ? tool.requiredScopes.join(', ') : 'none'} | ${
        tool.annotations.readOnlyHint ? 'read' : tool.annotations.destructiveHint ? 'destructive' : 'write'
      } |`
  );
  return ['# TraceIQ MCP tools', '', '| Tool | Scopes | Kind |', '| --- | --- | --- |', ...rows].join('\n');
}

export interface ResourceContents {
  uri: string;
  mimeType: string;
  text: string;
}

/** Reads a traceiq:// resource. Throws for unknown URIs. */
export async function readResource(uri: string, tools: Tool[]): Promise<ResourceContents> {
  const json = (value: unknown): ResourceContents => ({ uri, mimeType: 'application/json', text: JSON.stringify(value, null, 2) });

  if (uri === 'traceiq://projects') return json(shapeResponse(await request('GET', '/v1/dashboard/projects'), { maxItems: 100 }));
  if (uri === 'traceiq://me') {
    const { whoami } = await import('./account-tools.js');
    return json(await whoami(tools));
  }
  if (uri === 'traceiq://tools') return { uri, mimeType: 'text/markdown', text: toolsMarkdown(tools) };

  const match = /^traceiq:\/\/projects\/([^/]+)\/([a-z-]+)$/.exec(uri);
  const collection = match ? PROJECT_COLLECTIONS[match[2]] : undefined;
  if (match && collection) {
    const projectId = decodeURIComponent(match[1]);
    return json(shapeResponse(await request('GET', collection.path, { query: { projectId } }), { maxItems: 200 }));
  }

  throw new Error(`Unknown TraceIQ resource: ${uri}`);
}
