import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { briefTile, githubTile, linearTile, returningIntegration } from '../src/lib/integration-tiles';

const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

const installation = {
  installationId: '1',
  accountLogin: 'acme',
  accountType: 'Organization',
  repositorySelection: 'selected' as const,
  status: 'active' as const,
  connectedAt: '2026-11-15T00:00:00Z',
  manageUrl: 'https://github.com/settings/installations/1'
};
const github = { configured: true, organizationId: 'org', canManage: true, project: { id: 'p', name: 'Web' }, connected: false, installation: null, projectRepo: null };
const linear = { configured: true, organizationId: 'org', canManage: true, project: { id: 'p', name: 'Web' }, connected: false, status: 'not_connected' as const };

describe('integration tiles', () => {
  it('opens the card a provider sent the person back to', () => {
    expect(returningIntegration(new URLSearchParams('github=complete&github_code=c'))).toBe('github');
    expect(returningIntegration(new URLSearchParams('linear=error&reason=x'))).toBe('linear');
    expect(returningIntegration(new URLSearchParams('slack=connected'))).toBe('slack');
    expect(returningIntegration(new URLSearchParams('projectId=p'))).toBeNull();
  });

  it('GitHub: not available, not connected, installed with or without a repository, suspended', () => {
    expect(githubTile({ ...github, configured: false })).toMatchObject({ available: false, pill: { text: 'Not available' } });
    expect(githubTile(github)).toMatchObject({ available: true, connected: false, pill: { text: 'Not connected' } });
    expect(githubTile({ ...github, connected: true, installation })).toMatchObject({ connected: true, detail: 'On acme · no repository linked' });
    expect(
      githubTile({ ...github, connected: true, installation, projectRepo: { projectId: 'p', repoFullName: 'acme/web', defaultBranch: 'main', appSubdirectory: '' } })
    ).toMatchObject({ pill: { tone: 'success', text: 'Installed' }, detail: 'acme/web' });
    expect(githubTile({ ...github, connected: true, installation: { ...installation, status: 'suspended' } }).pill).toEqual({ tone: 'warning', text: 'Suspended' });
  });

  it('Linear: shows the workspace and this project’s team, and flags a reconnect', () => {
    expect(linearTile({ ...linear, configured: false })).toMatchObject({ available: false });
    expect(linearTile(linear)).toMatchObject({ connected: false, pill: { text: 'Not connected' } });
    const connected = {
      ...linear,
      connected: true,
      status: 'active' as const,
      workspace: { id: 'w', name: 'Acme', urlKey: 'acme' },
      projects: [{ projectId: 'p', teamId: 't', teamName: 'Traceiq', teamKey: 'TRA', labelId: null, labelName: null }]
    };
    expect(linearTile(connected)).toMatchObject({ pill: { tone: 'success' }, detail: 'Acme · team TRA' });
    expect(linearTile({ ...connected, projects: [] }).detail).toBe('Acme · no team picked');
    expect(linearTile({ ...connected, status: 'needs_reconnect' }).pill.tone).toBe('warning');
  });

  it('Slack and Telegram: count the chats', () => {
    expect(briefTile('slack', true, 2).pill.text).toBe('2 channels');
    expect(briefTile('telegram', true, 1).pill.text).toBe('1 chat');
    expect(briefTile('telegram', true, 0)).toMatchObject({ connected: false, available: true });
    expect(briefTile('slack', false, 0)).toMatchObject({ available: false });
    // Already-connected chats stay manageable even if the server later turns the service off.
    expect(briefTile('slack', false, 1)).toMatchObject({ connected: true, available: true });
  });
});

describe('integrations page', () => {
  const grid = read('app/dashboard/settings/integrations/IntegrationsGrid.tsx');
  const channels = read('app/dashboard/alerts/brief-channels.tsx');

  it('lays out a responsive grid of all four, each opening its settings in a dialog', () => {
    expect(grid).toContain('grid gap-4 sm:grid-cols-2 xl:grid-cols-3');
    expect(grid).toContain("const ORDER: IntegrationKey[] = ['github', 'linear', 'slack', 'telegram'];");
    expect(grid).toContain('<BriefChannelCard kind={open} briefs={briefs} />');
    expect(grid).toContain('role="dialog"');
  });

  it('connects Slack from here and comes back here', () => {
    expect(grid).toContain("useBriefChannels(projectId, { returnTo: 'integrations' })");
    expect(channels).toContain('timezone: browserTimezone(), returnTo })');
    expect(grid).toContain("if (returning === 'slack') takeSlackReturn();");
  });

  it('the Alerts page uses the same Slack and Telegram cards', () => {
    const panel = read('app/dashboard/alerts/DailyBriefPanel.tsx');
    expect(panel).toContain("useBriefChannels(projectId, { returnTo: 'alerts' })");
    expect(panel).toContain('<BriefChannelCard kind="telegram" briefs={briefs} />');
    expect(panel).toContain('<BriefChannelCard kind="slack" briefs={briefs} />');
  });
});
