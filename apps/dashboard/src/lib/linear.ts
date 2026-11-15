/**
 * Linear integration helpers shared by the settings card and the error page.
 * Pure functions, so the return-flag handling and error routing are testable.
 */

export const INTEGRATIONS_SETTINGS_PATH = '/dashboard/settings/integrations';

export type LinearConnectionStatus = 'not_connected' | 'active' | 'needs_reconnect';

export interface LinearTeam {
  id: string;
  name: string;
  key: string;
}

export interface LinearLabel {
  id: string;
  name: string;
  color: string | null;
  teamId: string | null;
}

export interface LinearProjectSettings {
  projectId: string;
  teamId: string;
  teamName: string | null;
  teamKey: string | null;
  labelId: string | null;
  labelName: string | null;
}

export interface LinearStatusResponse {
  configured: boolean;
  organizationId: string;
  canManage: boolean;
  project: { id: string; name: string } | null;
  connected: boolean;
  status: LinearConnectionStatus;
  workspace?: { id: string; name: string | null; urlKey: string | null };
  connectedAt?: string;
  teams?: LinearTeam[];
  projects?: LinearProjectSettings[];
  error?: string | null;
}

export interface ErrorLinearIssue {
  linearIssueId: string;
  identifier: string;
  url: string;
  createdAt: string;
}

/** Query parameters the API callback adds on its way back to settings. */
export const LINEAR_RETURN_PARAMS = ['linear', 'reason', 'linear_code', 'linear_state'] as const;

export type LinearReturn =
  | { kind: 'complete'; code: string; state: string }
  | { kind: 'error'; reason: string }
  | null;

/** What the settings page URL says about a Linear connection in progress. */
export function readLinearReturn(params: URLSearchParams): LinearReturn {
  const flag = params.get('linear');
  if (flag === 'complete') {
    const code = params.get('linear_code');
    const state = params.get('linear_state');
    return code && state ? { kind: 'complete', code, state } : { kind: 'error', reason: 'missing_code' };
  }
  if (flag === 'error') return { kind: 'error', reason: params.get('reason') ?? 'linear_error' };
  return null;
}

/** The same URL without the Linear return parameters, so a refresh never replays the code. */
export function stripLinearReturn(href: string): string {
  const url = new URL(href);
  for (const key of LINEAR_RETURN_PARAMS) url.searchParams.delete(key);
  return url.pathname + url.search + url.hash;
}

const RETURN_MESSAGES: Record<string, string> = {
  cancelled: 'You cancelled the connection in Linear. Nothing was changed.',
  expired: 'The connection took too long. Start it again.',
  invalid_state: 'This connection link is not valid. Start it again from this page.',
  missing_code: 'Linear did not send back a sign-in code. Try connecting again.',
  not_configured: 'Linear is not set up on this TraceIQ server.',
  linear_error: 'Linear returned an error. Try connecting again.'
};

export function linearReturnMessage(reason: string): string {
  return RETURN_MESSAGES[reason] ?? RETURN_MESSAGES.linear_error;
}

/** API error codes that mean "fix this in Settings → Integrations". */
const SETTINGS_ERROR_CODES = new Set(['LINEAR_NOT_CONNECTED', 'LINEAR_NEEDS_RECONNECT', 'LINEAR_TEAM_NOT_SET']);

export function needsLinearSettings(code: string | null | undefined): boolean {
  return Boolean(code && SETTINGS_ERROR_CODES.has(code));
}

/** The `code` from a TraceIQ API error body, without consuming the response. */
export async function readApiErrorCode(response: Response): Promise<string | null> {
  try {
    const body = (await response.clone().json()) as { code?: unknown; message?: unknown };
    if (typeof body?.code === 'string') return body.code;
    const nested = body?.message as { code?: unknown } | undefined;
    return nested && typeof nested === 'object' && typeof nested.code === 'string' ? nested.code : null;
  } catch {
    return null;
  }
}

export function integrationsSettingsHref(projectId?: string | null): string {
  return projectId ? `${INTEGRATIONS_SETTINGS_PATH}?projectId=${encodeURIComponent(projectId)}` : INTEGRATIONS_SETTINGS_PATH;
}

export function statusLabel(status: LinearConnectionStatus): { tone: 'success' | 'warning' | 'neutral'; text: string } {
  if (status === 'active') return { tone: 'success', text: 'Connected' };
  if (status === 'needs_reconnect') return { tone: 'warning', text: 'Needs reconnect' };
  return { tone: 'neutral', text: 'Not connected' };
}
