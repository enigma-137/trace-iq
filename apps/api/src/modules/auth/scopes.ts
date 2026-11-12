/**
 * Every scope a personal access token (or OAuth access token) can carry. Each one is
 * enforced somewhere with AuthService.requireScope(). The dashboard's token form mirrors
 * this list in apps/dashboard/src/app/dashboard/settings/PersonalAccessTokensPanel.tsx.
 */
export const ALLOWED_SCOPES = [
  'projects:read',
  'analytics:read',
  'analytics:write',
  'insights:read',
  'insights:write',
  'funnels:read',
  'funnels:write',
  'users:read',
  'cohorts:read',
  'cohorts:write',
  'dashboards:read',
  'dashboards:write',
  'errors:read',
  'errors:write',
  'flags:read',
  'flags:write',
  'alerts:read',
  'alerts:write',
  'links:read',
  'links:write',
  'experiments:read',
  'experiments:write',
  'surveys:read',
  'surveys:write',
  'replays:read',
  'replays:write',
  'webhooks:read',
  'webhooks:write',
  'synthetic_monitors:read',
  'synthetic_monitors:write',
  'exports:read',
  'sourcemaps:write'
] as const;

export const ALLOWED_SCOPE_SET = new Set<string>(ALLOWED_SCOPES);

/** Scopes the MCP server's read tools use. Granted by default when connecting an assistant. */
export const MCP_READ_SCOPES = [
  'projects:read',
  'analytics:read',
  'insights:read',
  'funnels:read',
  'users:read',
  'errors:read',
  'flags:read',
  'alerts:read',
  'links:read',
  'cohorts:read',
  'dashboards:read',
  'experiments:read',
  'surveys:read',
  'replays:read',
  'webhooks:read',
  'synthetic_monitors:read'
];

/** Scopes the MCP server's write tools use. Granted only when the user allows changes. */
export const MCP_WRITE_SCOPES = [
  'funnels:write',
  'errors:write',
  'flags:write',
  'alerts:write',
  'links:write',
  'cohorts:write',
  'dashboards:write',
  'experiments:write',
  'surveys:write',
  'webhooks:write',
  'synthetic_monitors:write'
];
