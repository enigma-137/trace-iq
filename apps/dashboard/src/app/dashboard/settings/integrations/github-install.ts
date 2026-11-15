'use client';

import { readApiError } from '@/lib/api-error';
import { toast } from '@/lib/toast';
import { githubReturnMessage, readGitHubReturn, stashInstallState, stripGitHubReturn, takeInstallState } from '@/lib/github-integration';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const GITHUB_INTEGRATION_API = `${apiBaseUrl}/v1/integrations/github`;

type AuthHeaders = () => Promise<Record<string, string> | null>;

/**
 * Starts the GitHub App installation. `returnTo: 'setup'` brings the browser back to the
 * Setup Wizard instead of Settings. Resolves true when the browser is leaving for GitHub.
 */
export async function startGitHubInstall(
  authHeaders: AuthHeaders,
  options: { projectId?: string; returnTo?: 'settings' | 'setup' } = {}
): Promise<boolean> {
  try {
    const headers = await authHeaders();
    if (!headers) {
      toast.error('Your dashboard session expired. Sign in again.');
      return false;
    }
    const query = new URLSearchParams();
    if (options.projectId) query.set('projectId', options.projectId);
    if (options.returnTo) query.set('returnTo', options.returnTo);
    const response = await fetch(`${GITHUB_INTEGRATION_API}/install${query.size ? `?${query.toString()}` : ''}`, { headers });
    if (!response.ok) {
      toast.error(await readApiError(response, 'Could not start the GitHub installation.'));
      return false;
    }
    const { url, state } = (await response.json()) as { url: string; state: string };
    stashInstallState(state);
    window.location.assign(url);
    return true;
  } catch (error) {
    toast.error(await readApiError(error, 'Could not start the GitHub installation.'));
    return false;
  }
}

/**
 * Finishes an installation the browser just came back from: clears the code from the
 * address bar first, then posts it with the signed-in session. The server checks that the
 * person finishing is the one who started. Call once per page load.
 */
export async function completeGitHubReturn(authHeaders: AuthHeaders): Promise<'none' | 'connected' | 'failed'> {
  const returned = readGitHubReturn(new URLSearchParams(window.location.search));
  if (!returned) return 'none';
  window.history.replaceState(null, '', stripGitHubReturn(window.location.href));

  if (returned.kind === 'error') {
    takeInstallState(null);
    toast.error(githubReturnMessage(returned.reason), { title: 'GitHub not connected' });
    return 'failed';
  }
  try {
    const state = takeInstallState(returned.state);
    const headers = await authHeaders();
    if (!headers) {
      toast.error('Your dashboard session expired. Sign in again, then install the GitHub App.');
      return 'failed';
    }
    if (!state) {
      toast.error('This installation was not started from this browser. Start it again.', { title: 'GitHub not connected' });
      return 'failed';
    }
    const response = await fetch(`${GITHUB_INTEGRATION_API}/complete`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ installationId: returned.installationId, code: returned.code, state })
    });
    if (!response.ok) {
      toast.error(await readApiError(response, 'Could not connect GitHub.'), { title: 'GitHub not connected' });
      return 'failed';
    }
    const body = (await response.json()) as { installation?: { accountLogin?: string } };
    toast.success(`Installed on ${body.installation?.accountLogin ?? 'your GitHub account'}. Now choose the repository.`, { title: 'GitHub connected' });
    return 'connected';
  } catch (error) {
    toast.error(await readApiError(error, 'Could not connect GitHub.'), { title: 'GitHub not connected' });
    return 'failed';
  }
}
