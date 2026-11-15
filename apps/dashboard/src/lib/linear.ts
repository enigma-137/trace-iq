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
  autoCreate?: boolean;
  autoCreateMinOccurrences?: number | null;
  autoCreateMinUsers?: number | null;
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

/** The auto-create form as typed: thresholds stay strings until saved. */
export interface AutoCreateDraft {
  enabled: boolean;
  minOccurrences: string;
  minUsers: string;
}

export interface AutoCreateRule {
  enabled: boolean;
  minOccurrences: number | null;
  minUsers: number | null;
}

export const MAX_AUTO_CREATE_THRESHOLD = 1_000_000;

export function autoCreateDraft(settings?: LinearProjectSettings | null): AutoCreateDraft {
  return {
    enabled: settings?.autoCreate ?? false,
    minOccurrences: settings?.autoCreateMinOccurrences ? String(settings.autoCreateMinOccurrences) : '',
    minUsers: settings?.autoCreateMinUsers ? String(settings.autoCreateMinUsers) : ''
  };
}

/** Checks the form the same way the API does, so mistakes show before saving. */
export function parseAutoCreateDraft(draft: AutoCreateDraft): { rule: AutoCreateRule } | { error: string } {
  const parse = (raw: string, label: string): number | null | string => {
    const value = raw.trim();
    if (!value) return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_AUTO_CREATE_THRESHOLD) {
      return `${label} must be a whole number from 1 to ${MAX_AUTO_CREATE_THRESHOLD.toLocaleString('en-US')}.`;
    }
    return parsed;
  };
  const minOccurrences = parse(draft.minOccurrences, 'Occurrences');
  if (typeof minOccurrences === 'string') return { error: minOccurrences };
  const minUsers = parse(draft.minUsers, 'Affected users');
  if (typeof minUsers === 'string') return { error: minUsers };
  if (draft.enabled && minOccurrences === null && minUsers === null) {
    return { error: 'Set an occurrences or affected users threshold to turn on auto-create.' };
  }
  return { rule: { enabled: draft.enabled, minOccurrences, minUsers } };
}

export function sameAutoCreate(draft: AutoCreateDraft, settings?: LinearProjectSettings | null): boolean {
  const saved = autoCreateDraft(settings);
  return draft.enabled === saved.enabled && draft.minOccurrences.trim() === saved.minOccurrences && draft.minUsers.trim() === saved.minUsers;
}

/** "Synced from Linear" note for an error whose status a Linear webhook last changed. */
export function linearSyncNote(
  statusSource: string | null | undefined,
  status: string,
  identifier?: string | null
): string | null {
  if (statusSource !== 'linear') return null;
  const issue = identifier ? ` ${identifier}` : '';
  if (status === 'resolved') return `Resolved because Linear issue${issue} was closed. Synced from Linear.`;
  // A regression comes from new occurrences, not from Linear, so it gets no note.
  if (status === 'open') return `Reopened because Linear issue${issue} was reopened. Synced from Linear.`;
  return null;
}
