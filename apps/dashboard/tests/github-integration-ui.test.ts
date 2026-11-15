import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GITHUB_STATE_STORAGE_KEY,
  setupStage,
  githubReturnMessage,
  normalizeSubdirectoryInput,
  readGitHubReturn,
  stashInstallState,
  stripGitHubReturn,
  takeInstallState
} from '../src/lib/github-integration';

const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('GitHub return flags', () => {
  it('reads a forwarded installation, with or without the state', () => {
    expect(readGitHubReturn(new URLSearchParams('github=complete&github_installation_id=77&github_code=c&github_state=s.1'))).toEqual({
      kind: 'complete', installationId: '77', code: 'c', state: 's.1'
    });
    expect(readGitHubReturn(new URLSearchParams('github=complete&github_installation_id=77&github_code=c'))).toEqual({
      kind: 'complete', installationId: '77', code: 'c', state: null
    });
    expect(readGitHubReturn(new URLSearchParams('github=complete&github_installation_id=77'))).toEqual({ kind: 'error', reason: 'missing_code' });
    expect(readGitHubReturn(new URLSearchParams('github=error&reason=pending_approval'))).toEqual({ kind: 'error', reason: 'pending_approval' });
    expect(readGitHubReturn(new URLSearchParams('linear=complete'))).toBeNull();
  });

  it('strips the code but keeps other parameters (including Linear ones)', () => {
    expect(stripGitHubReturn('https://app.test/dashboard/settings/integrations?github=complete&github_code=c&github_installation_id=1&github_state=s&projectId=p')).toBe(
      '/dashboard/settings/integrations?projectId=p'
    );
  });

  it('explains each reason, with a fallback', () => {
    expect(githubReturnMessage('pending_approval')).toMatch(/approve/);
    expect(githubReturnMessage('missing_code')).toMatch(/Request user authorization/);
    expect(githubReturnMessage('new_reason')).toBe(githubReturnMessage('github_error'));
  });
});

describe('install state copy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers the URL copy, falls back to the stash, and clears it', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key)
      }
    });
    stashInstallState('stashed');
    expect(store.get(GITHUB_STATE_STORAGE_KEY)).toBe('stashed');
    expect(takeInstallState(null)).toBe('stashed');
    expect(store.has(GITHUB_STATE_STORAGE_KEY)).toBe(false);
    stashInstallState('stashed');
    expect(takeInstallState('from-url')).toBe('from-url');
  });

  it('survives blocked storage', () => {
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
        removeItem: () => undefined
      }
    });
    expect(() => stashInstallState('x')).not.toThrow();
    expect(takeInstallState('from-url')).toBe('from-url');
    expect(takeInstallState(null)).toBeNull();
  });
});

describe('app folder input', () => {
  it('matches the API rules', () => {
    expect(normalizeSubdirectoryInput('')).toBe('');
    expect(normalizeSubdirectoryInput('./apps/web/')).toBe('apps/web');
    expect(normalizeSubdirectoryInput('../x')).toBeNull();
    expect(normalizeSubdirectoryInput('/abs')).toBeNull();
    expect(normalizeSubdirectoryInput('a\\b')).toBeNull();
  });
});

describe('GitHub settings card', () => {
  const card = read('app/dashboard/settings/integrations/GitHubIntegrationCard.tsx');

  it('finishes the installation once per load, through the shared helper', () => {
    expect(card).toContain('handledReturn.current = true');
    expect(card).toContain('await completeGitHubReturn(authHeaders)');
    expect(card).toContain("startGitHubInstall(authHeaders, { projectId, returnTo: 'settings' })");
  });

  it('the shared helper clears the code from the URL before posting it with the session', () => {
    const helper = read('app/dashboard/settings/integrations/github-install.ts');
    expect(helper).toContain('`${GITHUB_INTEGRATION_API}/complete`');
    expect(helper.indexOf('window.history.replaceState')).toBeLessThan(helper.indexOf('`${GITHUB_INTEGRATION_API}/complete`'));
    expect(helper).toContain('stashInstallState(state)');
    expect(helper).toContain('takeInstallState(returned.state)');
    expect(helper).toContain("query.set('returnTo', options.returnTo)");
  });

  it('links a repository and folder, and confirms before uninstalling', () => {
    expect(card).toContain('JSON.stringify({ repoFullName, subdirectory: folder })');
    expect(card).toContain('Disconnect GitHub?');
    expect(card).toContain("method: 'DELETE'");
    expect(card).toContain('never pushes to your default branch');
  });

  it('unlinks only this project, and only when a repository is linked', () => {
    expect(card).toContain('`${GITHUB_API}/projects/${encodeURIComponent(project.id)}`, { method: \'DELETE\', headers }');
    expect(card).toContain('{status.projectRepo ? (');
    expect(card).toContain("{busy === 'unlink' ? 'Unlinking…' : 'Unlink'}");
  });

  it('is on the integrations page next to Linear', () => {
    const page = read('app/dashboard/settings/integrations/page.tsx');
    expect(page).toContain('<GitHubIntegrationCard');
    expect(page).toContain('<LinearIntegrationCard');
  });
});

describe('Setup Wizard GitHub path', () => {
  const base = { configured: true, installed: true, suspended: false, repoLinked: true, pullRequest: false };

  it('walks install → repository → preview → pull request', () => {
    expect(setupStage({ ...base, configured: false, installed: false })).toBe('hidden');
    expect(setupStage({ ...base, installed: false })).toBe('install');
    expect(setupStage({ ...base, suspended: true })).toBe('suspended');
    expect(setupStage({ ...base, repoLinked: false })).toBe('pick_repo');
    expect(setupStage(base)).toBe('preview');
    expect(setupStage({ ...base, pullRequest: true })).toBe('pull_request');
    // Already installed on a server without the app configured: still shown.
    expect(setupStage({ ...base, configured: false })).toBe('preview');
  });

  const panel = read('app/dashboard/GitHubSetupPanel.tsx');
  const wizard = read('app/dashboard/SetupWizard.tsx');

  it('installs with a return to the wizard and finishes there', () => {
    expect(panel).toContain("startGitHubInstall(authHeaders, { projectId, returnTo: 'setup' })");
    expect(panel).toContain('await completeGitHubReturn(authHeaders)');
    expect(wizard).toContain("if (new URLSearchParams(window.location.search).has('github')) setCurrentStep(2);");
  });

  it('previews, opens the PR, then hands over to the first-event verification', () => {
    expect(panel).toContain('/setup-preview`');
    expect(panel).toContain("/setup-pr`, { method: 'POST'");
    expect(panel).toContain('Create setup PR');
    expect(panel).toContain('Open pull request #{pullRequest.number}');
    expect(wizard).toContain('<GitHubSetupPanel projectId={projectId} onWaitForEvent={() => setCurrentStep(4)} />');
  });

  it('handles monorepos and unsupported stacks, and keeps the manual path', () => {
    expect(panel).toContain("preview?.status === 'pick_folder'");
    expect(panel).toContain('onClick={() => void linkRepo(candidate.folder)}');
    expect(panel).toContain('The options below still work.');
    // The manual options are still in the wizard after the GitHub panel.
    expect(wizard.indexOf('<GitHubSetupPanel')).toBeLessThan(wizard.indexOf('<InstallWithAiCard'));
    expect(wizard).toContain('Option C: Manual Installation Tabs');
  });
});
