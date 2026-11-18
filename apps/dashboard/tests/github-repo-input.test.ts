import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveRepoInput, setupWizardHref } from '../src/lib/github-integration';

const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const repos = [
  { id: 1, fullName: 'HalxDocs/fiskana', defaultBranch: 'main', private: true },
  { id: 2, fullName: 'HalxDocs/web', defaultBranch: 'main', private: false },
  { id: 3, fullName: 'other-org/web', defaultBranch: 'main', private: false }
];

describe('typing a repository', () => {
  it('accepts owner/name, URLs and ssh remotes', () => {
    expect(resolveRepoInput('acme/api')).toBe('acme/api');
    expect(resolveRepoInput(' https://github.com/acme/api/ ')).toBe('acme/api');
    expect(resolveRepoInput('github.com/acme/api.git')).toBe('acme/api');
    expect(resolveRepoInput('https://github.com/acme/api/tree/main/apps/web')).toBe('acme/api');
    expect(resolveRepoInput('git@github.com:acme/api.git')).toBe('acme/api');
  });

  it('resolves a bare name from the visible repositories, else the installed account', () => {
    expect(resolveRepoInput('fiskana', { repos, accountLogin: 'HalxDocs' })).toBe('HalxDocs/fiskana');
    expect(resolveRepoInput('FISKANA', { repos, accountLogin: 'HalxDocs' })).toBe('HalxDocs/fiskana');
    // Two repositories are called "web": use the installed account's.
    expect(resolveRepoInput('web', { repos, accountLogin: 'HalxDocs' })).toBe('HalxDocs/web');
    // Not in the (possibly partial) list: still typed against the installed account.
    expect(resolveRepoInput('repo-1000', { repos, accountLogin: 'HalxDocs' })).toBe('HalxDocs/repo-1000');
    expect(resolveRepoInput('repo-1000', { repos })).toBeNull();
  });

  it('uses the listed spelling and rejects what cannot be a repository', () => {
    expect(resolveRepoInput('halxdocs/FISKANA', { repos })).toBe('HalxDocs/fiskana');
    expect(resolveRepoInput('')).toBeNull();
    expect(resolveRepoInput('a/b/c')).toBeNull();
    expect(resolveRepoInput('acme/..')).toBeNull();
    expect(resolveRepoInput('https://gitlab.com/acme/api')).toBeNull();
    expect(resolveRepoInput('has space/x')).toBeNull();
  });
});

describe('what happens after linking', () => {
  it('links to the Setup Wizard on its install step', () => {
    expect(setupWizardHref('proj 1')).toBe('/dashboard/setup?projectId=proj%201&step=install');
    expect(read('app/dashboard/SetupWizard.tsx')).toContain("params.get('step') === 'install'");
  });

  it('settings says no new project is needed and offers the setup PR (or the open one)', () => {
    const card = read('app/dashboard/settings/integrations/GitHubIntegrationCard.tsx');
    expect(card).toContain('label="Next step"');
    expect(card).toContain('No new project needed');
    expect(card).toContain('Get a setup PR');
    expect(card).toContain('Open PR #{status.setupPullRequest.number}');
    expect(card).toContain('Next: get a setup pull request.');
  });

  it('both repository fields can be typed into, with suggestions', () => {
    for (const file of ['app/dashboard/settings/integrations/GitHubIntegrationCard.tsx', 'app/dashboard/GitHubSetupPanel.tsx']) {
      const source = read(file);
      expect(source).toContain('<RepoNameInput');
      expect(source).toContain('resolveRepoInput(repoFullName');
      expect(source).not.toContain('Choose a repository…');
    }
    expect(read('app/dashboard/settings/integrations/RepoNameInput.tsx')).toContain('<datalist');
  });
});
