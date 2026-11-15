import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GITHUB_STATE_STORAGE_KEY,
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

  it('finishes the installation with the signed-in session, once, after clearing the code from the URL', () => {
    expect(card).toContain('`${GITHUB_API}/complete`');
    expect(card).toContain('handledReturn.current = true');
    expect(card.indexOf('window.history.replaceState')).toBeLessThan(card.indexOf('`${GITHUB_API}/complete`'));
    expect(card).toContain('stashInstallState(state)');
    expect(card).toContain('takeInstallState(returned.state)');
  });

  it('links a repository and folder, and confirms before uninstalling', () => {
    expect(card).toContain('JSON.stringify({ repoFullName, subdirectory: folder })');
    expect(card).toContain('Disconnect GitHub?');
    expect(card).toContain("method: 'DELETE'");
    expect(card).toContain('never pushes to your default branch');
  });

  it('is on the integrations page next to Linear', () => {
    const page = read('app/dashboard/settings/integrations/page.tsx');
    expect(page).toContain('<GitHubIntegrationCard');
    expect(page).toContain('<LinearIntegrationCard');
  });
});
