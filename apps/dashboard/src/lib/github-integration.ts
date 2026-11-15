/**
 * TraceIQ GitHub App helpers for the settings card (separate from GitHub sign-in).
 * Pure functions plus a guarded sessionStorage copy of the install state.
 */

export interface GitHubInstallationInfo {
  installationId: string;
  accountLogin: string;
  accountType: string | null;
  repositorySelection: 'all' | 'selected';
  status: 'active' | 'suspended';
  connectedAt: string;
  manageUrl: string;
}

export interface GitHubProjectRepo {
  projectId: string;
  repoFullName: string;
  defaultBranch: string;
  appSubdirectory: string;
}

export interface GitHubRepoOption {
  id: number;
  fullName: string;
  defaultBranch: string;
  private: boolean;
}

export interface GitHubStatusResponse {
  configured: boolean;
  organizationId: string;
  canManage: boolean;
  project: { id: string; name: string } | null;
  connected: boolean;
  installation: GitHubInstallationInfo | null;
  projectRepo: GitHubProjectRepo | null;
}

export const GITHUB_RETURN_PARAMS = ['github', 'reason', 'github_installation_id', 'github_code', 'github_state'] as const;
export const GITHUB_STATE_STORAGE_KEY = 'traceiq.github.installState';

export type GitHubReturn =
  | { kind: 'complete'; installationId: string; code: string; state: string | null }
  | { kind: 'error'; reason: string }
  | null;

export function readGitHubReturn(params: URLSearchParams): GitHubReturn {
  const flag = params.get('github');
  if (flag === 'complete') {
    const installationId = params.get('github_installation_id');
    const code = params.get('github_code');
    if (!installationId || !code) return { kind: 'error', reason: 'missing_code' };
    return { kind: 'complete', installationId, code, state: params.get('github_state') };
  }
  if (flag === 'error') return { kind: 'error', reason: params.get('reason') ?? 'github_error' };
  return null;
}

export function stripGitHubReturn(href: string): string {
  const url = new URL(href);
  for (const key of GITHUB_RETURN_PARAMS) url.searchParams.delete(key);
  return url.pathname + url.search + url.hash;
}

const RETURN_MESSAGES: Record<string, string> = {
  pending_approval: 'An owner of that GitHub organization has to approve the TraceIQ app first. Try again once it is approved.',
  missing_installation: 'GitHub did not say which installation was made. Try installing again.',
  missing_code: 'GitHub did not send back a sign-in code. In the GitHub App settings, turn on “Request user authorization (OAuth) during installation”.',
  not_configured: 'The GitHub App is not set up on this TraceIQ server.',
  github_error: 'GitHub returned an error. Try installing again.'
};

export function githubReturnMessage(reason: string): string {
  return RETURN_MESSAGES[reason] ?? RETURN_MESSAGES.github_error;
}

/** Keeps the install state for the return trip. Storage can be blocked; that is fine. */
export function stashInstallState(state: string) {
  try {
    window.sessionStorage.setItem(GITHUB_STATE_STORAGE_KEY, state);
  } catch {
    // The URL copy is used instead.
  }
}

/** The state from the URL when GitHub sent it back, else the stashed copy. Clears the stash. */
export function takeInstallState(fromUrl: string | null): string | null {
  let stashed: string | null = null;
  try {
    stashed = window.sessionStorage.getItem(GITHUB_STATE_STORAGE_KEY);
    window.sessionStorage.removeItem(GITHUB_STATE_STORAGE_KEY);
  } catch {
    stashed = null;
  }
  return fromUrl || stashed;
}

/** A folder inside the repo, as the API accepts it, or null when it is not one. */
export function normalizeSubdirectoryInput(value: string): string | null {
  const trimmed = value.trim().replace(/^\.\/+/, '').replace(/\/+$/, '');
  if (!trimmed || trimmed === '.') return '';
  if (trimmed.startsWith('/') || trimmed.includes('\\') || trimmed.length > 200) return null;
  const parts = trimmed.split('/');
  return parts.some((part) => !part || part === '.' || part === '..') ? null : parts.join('/');
}

export interface DetectedAppInfo {
  folder: string;
  framework: string;
  label: string;
  supported: boolean;
  packageManager: string | null;
}

export interface SetupPlanSummary {
  files: Array<{ path: string; action: 'create' | 'update' }>;
  envVars: Array<{ name: string; secret: boolean; exampleValue: string; description: string }>;
  manualSteps: string[];
  installCommand: string;
}

export interface SetupPullRequestInfo {
  number: number;
  url: string;
}

export type SetupPreview =
  | { status: 'ready'; app: DetectedAppInfo; plan: SetupPlanSummary }
  | { status: 'pick_folder'; candidates: DetectedAppInfo[] }
  | { status: 'unsupported' | 'already_installed' | 'file_exists' | 'invalid_output'; app: DetectedAppInfo; message: string }
  | { status: 'pull_request_open'; pullRequest: SetupPullRequestInfo };

/** One line for each stage of the GitHub path in the Setup Wizard. */
export function setupStage(input: {
  configured: boolean;
  installed: boolean;
  suspended: boolean;
  repoLinked: boolean;
  pullRequest: boolean;
}): 'hidden' | 'install' | 'suspended' | 'pick_repo' | 'preview' | 'pull_request' {
  if (!input.configured && !input.installed) return 'hidden';
  if (!input.installed) return 'install';
  if (input.suspended) return 'suspended';
  if (!input.repoLinked) return 'pick_repo';
  return input.pullRequest ? 'pull_request' : 'preview';
}
