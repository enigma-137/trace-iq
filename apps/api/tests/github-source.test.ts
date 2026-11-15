import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubApiError } from '../src/modules/integrations/github/github-app.client';
import { parseRepoUrl, subdirectoryFromTreePath } from '../src/modules/integrations/github/repo-url';
import { GitHubSetupService } from '../src/modules/integrations/github/setup/github-setup.service';
import { GitHubSourceContextService } from '../src/modules/integrations/github/source-context.service';
import { mockDatabase } from './helpers/mock-db';

const user = { id: 'usr_1', authMethod: 'supabase' as const };

describe('parseRepoUrl', () => {
  it('reads what people paste', () => {
    expect(parseRepoUrl('https://github.com/acme/web')).toEqual({ fullName: 'acme/web', treePath: null });
    expect(parseRepoUrl('https://github.com/acme/web/')).toEqual({ fullName: 'acme/web', treePath: null });
    expect(parseRepoUrl('github.com/acme/web.git')).toEqual({ fullName: 'acme/web', treePath: null });
    expect(parseRepoUrl('https://www.github.com/acme/web?tab=readme#x')).toEqual({ fullName: 'acme/web', treePath: null });
    expect(parseRepoUrl('git@github.com:acme/web.git')).toEqual({ fullName: 'acme/web', treePath: null });
    expect(parseRepoUrl('ssh://git@github.com/acme/web.git')).toEqual({ fullName: 'acme/web', treePath: null });
    expect(parseRepoUrl('acme/web')).toEqual({ fullName: 'acme/web', treePath: null });
    expect(parseRepoUrl('  https://github.com/acme/web/tree/main/apps/web  ')).toEqual({ fullName: 'acme/web', treePath: 'main/apps/web' });
    expect(parseRepoUrl('https://github.com/acme/web/blob/main/README.md')).toEqual({ fullName: 'acme/web', treePath: null });
  });

  it('refuses other hosts and malformed input', () => {
    expect(parseRepoUrl('https://gitlab.com/acme/web')).toBeNull();
    expect(parseRepoUrl('https://github.com.evil.test/acme/web')).toBeNull();
    expect(parseRepoUrl('https://github.com/acme')).toBeNull();
    expect(parseRepoUrl('https://github.com/acme/..')).toBeNull();
    expect(parseRepoUrl('not a url')).toBeNull();
    expect(parseRepoUrl(42)).toBeNull();
    expect(parseRepoUrl('')).toBeNull();
  });

  it('takes the folder from a default-branch tree link only', () => {
    expect(subdirectoryFromTreePath('main/apps/web', 'main')).toBe('apps/web');
    expect(subdirectoryFromTreePath('main', 'main')).toBe('');
    // Another branch: the folder may not exist on the default branch, so ignore it.
    expect(subdirectoryFromTreePath('feature/x/apps/web', 'main')).toBe('');
    expect(subdirectoryFromTreePath(null, 'main')).toBe('');
  });
});

describe('GitHubSourceContextService', () => {
  let client: Record<string, ReturnType<typeof vi.fn>>;
  let githubService: { projectRepoForMember: ReturnType<typeof vi.fn> };
  let service: GitHubSourceContextService;
  const linked = {
    project: { id: 'proj_1' },
    installation: { installationId: '77', status: 'active' },
    link: { repoFullName: 'acme/web', defaultBranch: 'main', appSubdirectory: 'apps/web' }
  };
  const pulls = [{ number: 12, url: 'https://github.com/acme/web/pull/12', title: 'Checkout', state: 'closed', merged: true }];

  beforeEach(() => {
    client = {
      getCommit: vi.fn().mockResolvedValue(null),
      getTagCommitSha: vi.fn().mockResolvedValue(null),
      pullRequestsForCommit: vi.fn().mockResolvedValue(pulls)
    };
    githubService = { projectRepoForMember: vi.fn().mockResolvedValue(linked) };
    service = new GitHubSourceContextService(githubService as never, client as never);
  });

  it('resolves a SHA release to an exact commit with its pull requests', async () => {
    client.getCommit.mockResolvedValue({ sha: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', url: 'https://github.com/acme/web/commit/a1b2c3d' });
    const context = await service.resolve(user, 'proj_1', 'a1b2c3d');
    expect(context).toEqual({
      linked: true,
      repo: { fullName: 'acme/web', htmlUrl: 'https://github.com/acme/web', defaultBranch: 'main', appSubdirectory: 'apps/web' },
      ref: { exact: true, sha: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', commitUrl: 'https://github.com/acme/web/commit/a1b2c3d', source: 'commit', pullRequests: pulls }
    });
    expect(client.getTagCommitSha).not.toHaveBeenCalled();
  });

  it('resolves a version through its tag, with or without the v prefix', async () => {
    client.getTagCommitSha.mockImplementation(async (_id: number, _repo: string, tag: string) => (tag === 'v2.4.1' ? 'tagsha' : null));
    const context = await service.resolve(user, 'proj_1', '2.4.1');
    expect(context).toMatchObject({ linked: true, ref: { exact: true, sha: 'tagsha', source: 'tag', commitUrl: 'https://github.com/acme/web/commit/tagsha' } });
    expect(client.getTagCommitSha.mock.calls.map((call) => call[2])).toEqual(['2.4.1', 'v2.4.1']);
    expect(client.getCommit).not.toHaveBeenCalled();
  });

  it('falls back to the default branch, marked as not exact', async () => {
    await expect(service.resolve(user, 'proj_1', 'release-candidate')).resolves.toMatchObject({ linked: true, ref: { exact: false, branch: 'main' } });
    await expect(service.resolve(user, 'proj_1', '')).resolves.toMatchObject({ ref: { exact: false, branch: 'main' } });
  });

  it('caches per project and release, after the membership check', async () => {
    client.getCommit.mockResolvedValue({ sha: 'abcdef1', url: 'u' });
    await service.resolve(user, 'proj_1', 'abcdef1');
    await service.resolve(user, 'proj_1', 'abcdef1');
    expect(client.getCommit).toHaveBeenCalledTimes(1);
    expect(githubService.projectRepoForMember).toHaveBeenCalledTimes(2);
  });

  it('says not linked when there is no installation or repository', async () => {
    githubService.projectRepoForMember.mockResolvedValue({ project: { id: 'proj_1' }, installation: null, link: null });
    await expect(service.resolve(user, 'proj_1', 'abc1234')).resolves.toEqual({ linked: false });
    expect(client.getCommit).not.toHaveBeenCalled();
  });

  it('still returns the commit when the pull request lookup fails', async () => {
    client.getCommit.mockResolvedValue({ sha: 'abcdef1', url: 'u' });
    client.pullRequestsForCommit.mockRejectedValue(new GitHubApiError('boom', 500));
    await expect(service.resolve(user, 'proj_1', 'abcdef1')).resolves.toMatchObject({ ref: { exact: true, pullRequests: [] } });
  });
});

describe('setup PR from a pasted URL', () => {
  let client: Record<string, ReturnType<typeof vi.fn>>;
  let githubService: Record<string, ReturnType<typeof vi.fn>>;
  let service: GitHubSetupService;

  beforeEach(() => {
    client = { getRepo: vi.fn().mockResolvedValue({ id: 1, fullName: 'acme/web', defaultBranch: 'main', private: true, htmlUrl: '' }) };
    githubService = {
      requireLinkedInstallation: vi.fn().mockResolvedValue({ installationId: '77', manageUrl: 'https://github.com/settings/installations/77' }),
      linkProjectRepo: vi.fn().mockResolvedValue({})
    };
    service = new GitHubSetupService(mockDatabase() as never, githubService as never, client as never);
    vi.spyOn(service, 'createSetupPullRequest').mockResolvedValue({ created: true, pullRequest: { number: 7, url: 'u', state: 'open', head: 'traceiq/setup', base: 'main' } } as never);
  });

  it('links the repository (folder from a tree link) and opens the PR in one step', async () => {
    await expect(service.createFromUrl(user, 'proj_1', { repoUrl: 'https://github.com/acme/web/tree/main/apps/web' })).resolves.toMatchObject({ created: true });
    expect(githubService.linkProjectRepo).toHaveBeenCalledWith(user, 'proj_1', { repoFullName: 'acme/web', subdirectory: 'apps/web' });
    expect(service.createSetupPullRequest).toHaveBeenCalledWith(user, 'proj_1');
  });

  it('lets an explicit folder override the URL', async () => {
    await service.createFromUrl(user, 'proj_1', { repoUrl: 'acme/web', subdirectory: 'apps/site' });
    expect(githubService.linkProjectRepo).toHaveBeenCalledWith(user, 'proj_1', { repoFullName: 'acme/web', subdirectory: 'apps/site' });
  });

  it('refuses bad URLs and repositories the app cannot see, without linking', async () => {
    await expect(service.createFromUrl(user, 'proj_1', { repoUrl: 'https://gitlab.com/acme/web' })).rejects.toMatchObject({ response: { code: 'GITHUB_REPO_URL_INVALID' } });
    client.getRepo.mockRejectedValue(new GitHubApiError('Not Found', 404));
    const attempt = service.createFromUrl(user, 'proj_1', { repoUrl: 'https://github.com/acme/secret' });
    await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
    await expect(attempt).rejects.toMatchObject({ response: { code: 'GITHUB_REPO_NOT_VISIBLE', manageUrl: 'https://github.com/settings/installations/77' } });
    expect(githubService.linkProjectRepo).not.toHaveBeenCalled();
    expect(service.createSetupPullRequest).not.toHaveBeenCalled();
  });

  it('needs an installation the person can manage before reading the URL’s repository', async () => {
    githubService.requireLinkedInstallation.mockRejectedValue(new NotFoundException({ code: 'GITHUB_NOT_CONNECTED' }));
    await expect(service.createFromUrl(user, 'proj_1', { repoUrl: 'acme/web' })).rejects.toMatchObject({ response: { code: 'GITHUB_NOT_CONNECTED' } });
    expect(client.getRepo).not.toHaveBeenCalled();
  });
});

describe('GitHubAppClient tag lookup', () => {
  it('follows annotated tags to their commit', async () => {
    const { GitHubAppClient } = await import('../src/modules/integrations/github/github-app.client');
    const client = new GitHubAppClient();
    vi.spyOn(client, 'installationToken').mockResolvedValue('ghs_x');
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/git/ref/tags/v1.0.0')) return new Response(JSON.stringify({ object: { sha: 'tagobj', type: 'tag' } }), { status: 200 });
      if (url.endsWith('/git/tags/tagobj')) return new Response(JSON.stringify({ object: { sha: 'commitsha' } }), { status: 200 });
      return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(client.getTagCommitSha(77, 'acme/web', 'v1.0.0')).resolves.toBe('commitsha');
    await expect(client.getTagCommitSha(77, 'acme/web', 'v9')).resolves.toBeNull();
    await expect(client.getCommit(77, 'acme/web', 'deadbee')).resolves.toBeNull();
    vi.unstubAllGlobals();
  });
});
