import { ApiError, API_URL, DASHBOARD_URL, DEFAULT_PROJECT_ID, request } from './client.js';
import { JsonValue, Tool } from './types.js';

interface MeResponse {
  user?: { id?: string; email?: string | null; authMethod?: string | null; scopes?: string[] | null };
}

/** Who the token belongs to, what it can do, and which tools it cannot use. */
export async function whoami(allTools: Tool[]) {
  const me = (await request('GET', '/v1/dashboard/me')) as MeResponse;
  const scopes = me.user?.scopes ?? null;

  let projects: JsonValue | string;
  try {
    projects = await request('GET', '/v1/dashboard/projects');
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 403) throw error;
    projects = 'Unavailable: the token lacks the "projects:read" scope.';
  }

  // Scopes are null for browser sessions, which can do everything.
  const unavailableTools = scopes
    ? allTools
        .filter((tool) => tool.requiredScopes.some((scope) => !scopes.includes(scope)))
        .map((tool) => ({ tool: tool.name, missingScopes: tool.requiredScopes.filter((scope) => !scopes.includes(scope)) }))
    : [];

  return {
    user: { id: me.user?.id ?? null, email: me.user?.email ?? null, authMethod: me.user?.authMethod ?? null },
    scopes,
    unavailableTools,
    projects,
    defaultProjectId: DEFAULT_PROJECT_ID ?? null,
    apiUrl: API_URL,
    dashboardUrl: DASHBOARD_URL,
    manageTokensAt: `${DASHBOARD_URL}/dashboard/settings`
  };
}

export const accountTools: Tool[] = [
  {
    name: 'whoami',
    title: 'Who am I',
    description:
      'Show who the TraceIQ token belongs to, its scopes, the projects it can see, the default project, and which tools it cannot use (with the scopes they are missing). Call this first when a tool fails with a permission error, or to pick a project.',
    requiredScopes: [],
    annotations: { readOnlyHint: true },
    schema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => {
      const { tools } = await import('./tools.js');
      return whoami(tools);
    }
  }
];
