import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  REPO_LIST_CAP,
  integrationsHref,
  quickSetupBlocker,
  repoVisibility,
  visibleReposSummary,
  type GitHubStatusResponse
} from '../src/lib/github-integration';
import { returningIntegration } from '../src/lib/integration-tiles';

const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const repo = (fullName: string, id = 1) => ({ id, fullName, defaultBranch: 'main', private: false });
const repos = [repo('enigma-137/nuwell-web', 1), repo('enigma-137/trace-iq', 2)];

describe('which repositories the app can see', () => {
  it('flags a typed repository the app cannot see', () => {
    expect(repoVisibility('enigma-137/nuwellx', repos)).toBe('not_visible');
    expect(repoVisibility('Enigma-137/Trace-IQ', repos)).toBe('visible');
  });

  it('does not guess when it cannot tell', () => {
    expect(repoVisibility(null, repos)).toBe('unknown');
    expect(repoVisibility('a/b', null)).toBe('unknown');
    const capped = Array.from({ length: REPO_LIST_CAP }, (_, i) => repo(`o/r${i}`, i));
    expect(repoVisibility('o/not-listed', capped)).toBe('unknown');
  });

  it('explains "selected repositories" in plain words', () => {
    expect(visibleReposSummary(repos, 'selected', 'enigma-137')).toBe('TraceIQ can see the 2 repositories you picked on GitHub: nuwell-web, trace-iq.');
    expect(visibleReposSummary([repos[0]], 'selected', 'enigma-137')).toBe('TraceIQ can see the 1 repository you picked on GitHub: nuwell-web.');
    const five = ['a', 'b', 'c', 'd', 'e'].map((name, i) => repo(`x/${name}`, i));
    expect(visibleReposSummary(five, 'selected', 'x')).toBe('TraceIQ can see the 5 repositories you picked on GitHub: a, b, c and 2 more.');
    expect(visibleReposSummary(five, 'all', 'x')).toBe('TraceIQ can see all 5 repositories on x.');
    expect(visibleReposSummary([], 'selected', 'x')).toMatch(/can’t see any/);
  });
});

describe('quick setup before GitHub is ready', () => {
  const status = (overrides: Partial<GitHubStatusResponse>): GitHubStatusResponse => ({
    configured: true,
    organizationId: 'org',
    canManage: true,
    project: { id: 'p', name: 'Web' },
    connected: true,
    installation: { installationId: '1', accountLogin: 'enigma-137', accountType: 'User', repositorySelection: 'selected', status: 'active', connectedAt: '', manageUrl: 'https://github.com/settings/installations/1' },
    projectRepo: null,
    ...overrides
  });

  it('says why the shortcut is disabled', () => {
    expect(quickSetupBlocker(status({ installation: null, connected: false }))).toBe('not_installed');
    expect(quickSetupBlocker(status({ installation: { ...status({}).installation!, status: 'suspended' } }))).toBe('suspended');
    expect(quickSetupBlocker(status({ canManage: false }))).toBe('not_allowed');
    expect(quickSetupBlocker(status({}))).toBeNull();
  });

  it('links straight to the GitHub card in Settings → Integrations', () => {
    expect(integrationsHref('proj_1')).toBe('/dashboard/settings/integrations?open=github&projectId=proj_1');
    expect(returningIntegration(new URLSearchParams('open=github'))).toBe('github');
    expect(returningIntegration(new URLSearchParams('open=linear'))).toBe('linear');
    expect(returningIntegration(new URLSearchParams('open=nope'))).toBeNull();
  });

  it('renders disabled with a reason instead of hiding, and checks visibility before submitting', () => {
    const quick = read('app/dashboard/GitHubQuickSetup.tsx');
    expect(quick).toContain('disabled={busy || blocker !== null}');
    expect(quick).toContain('Install the TraceIQ GitHub App first');
    expect(quick).toContain('{settingsLink}');
    expect(quick).toContain("disabled={busy || blocker !== null || !repoUrl.trim() || notVisible}");
    expect(quick).toContain('<RepoAccessHint');
    // Only hidden when GitHub isn't offered on this server at all.
    expect(quick).toContain('if (!status || (!status.configured && !installation)) return null;');
  });

  it('settings and the wizard panel explain repository access and block repos the app cannot see', () => {
    const card = read('app/dashboard/settings/integrations/GitHubIntegrationCard.tsx');
    expect(card).toContain('<RepoAccessHint');
    expect(card).toContain('|| notVisible}');
    expect(card).toContain('Installed. Next, choose this project’s repository below.');
    expect(read('app/dashboard/GitHubSetupPanel.tsx')).toContain('<RepoAccessHint');
    const hint = read('app/dashboard/settings/integrations/RepoAccessHint.tsx');
    expect(hint).toContain('Add it on GitHub');
    expect(hint).toContain('Check again');
  });
});
