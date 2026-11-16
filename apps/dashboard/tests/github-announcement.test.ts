import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { shouldAnnounceGitHub } from '../src/app/dashboard/GitHubAnnouncement';

const installation = {
  installationId: '1',
  accountLogin: 'acme',
  accountType: 'Organization',
  repositorySelection: 'all' as const,
  status: 'active' as const,
  connectedAt: '2026-11-01T00:00:00Z',
  manageUrl: 'https://github.com/settings/installations/1'
};

describe('GitHub announcement on the Overview', () => {
  it('shows only to people who can install the app, while the organization has not', () => {
    expect(shouldAnnounceGitHub({ configured: true, canManage: true, installation: null })).toBe(true);
    expect(shouldAnnounceGitHub({ configured: true, canManage: true, installation })).toBe(false);
    expect(shouldAnnounceGitHub({ configured: true, canManage: false, installation: null })).toBe(false);
    expect(shouldAnnounceGitHub({ configured: false, canManage: true, installation: null })).toBe(false);
  });

  it('is on the Overview, under the health banner', () => {
    const page = readFileSync(new URL('../src/app/dashboard/page.tsx', import.meta.url), 'utf8');
    expect(page.indexOf('<GitHubAnnouncement')).toBeGreaterThan(page.indexOf('<HealthBanner'));
  });
});

describe('Connect GitHub hint on the stack tab', () => {
  const view = readFileSync(new URL('../src/app/dashboard/errors/ErrorTrackingClientView.tsx', import.meta.url), 'utf8');

  it('appears only when the API answered that no repository is linked', () => {
    expect(view).toContain(') : activeSource && detailProjectId ? (');
    expect(view).toContain('Connect GitHub →');
    // A failed lookup is "unknown", not "not linked", so it shows no hint.
    expect(view).toContain('const value = response.ok ? ((await response.json()) as SourceContext) : null;');
  });
});
