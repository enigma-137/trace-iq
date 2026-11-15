import { Injectable } from '@nestjs/common';
import { DashboardUser } from '../../auth/auth.service';
import { GitHubAppClient } from './github-app.client';
import { GitHubService, toHttpError } from './github.service';

/** Cached answers per project and release, so an error page does not call GitHub every view. */
const CACHE_MS = 10 * 60_000;
const MAX_CACHE = 2_000;
const SHA = /^[0-9a-f]{7,40}$/i;

export type SourceContext =
  | { linked: false }
  | {
      linked: true;
      repo: { fullName: string; htmlUrl: string; defaultBranch: string; appSubdirectory: string };
      /**
       * `exact`: the release resolved to a commit, so line links are exact. Otherwise links
       * point at the default branch, where the code may have moved since the error.
       */
      ref:
        | { exact: true; sha: string; commitUrl: string; source: 'commit' | 'tag'; pullRequests: Array<{ number: number; url: string; title: string; state: string; merged: boolean }> }
        | { exact: false; branch: string };
    };

/**
 * Where an error's code lives on GitHub: the project's linked repository and the commit
 * of the release. A release that looks like a SHA is checked as a commit; otherwise a tag
 * with that name (or with a "v" prefix) is tried; failing both, the default branch.
 */
@Injectable()
export class GitHubSourceContextService {
  private readonly cache = new Map<string, { value: SourceContext; expiresAt: number }>();

  constructor(
    private readonly githubService: GitHubService,
    private readonly github: GitHubAppClient
  ) {}

  async resolve(user: DashboardUser, projectId: string, releaseParam?: string): Promise<SourceContext> {
    const { project, installation, link } = await this.githubService.projectRepoForMember(user, projectId);
    if (!installation || !link) return { linked: false };
    const release = typeof releaseParam === 'string' ? releaseParam.trim().slice(0, 200) : '';

    const key = `${project.id}:${link.repoFullName}:${link.appSubdirectory}:${release}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const installationId = Number(installation.installationId);
    const repo = {
      fullName: link.repoFullName,
      htmlUrl: `https://github.com/${link.repoFullName}`,
      defaultBranch: link.defaultBranch,
      appSubdirectory: link.appSubdirectory
    };
    let value: SourceContext;
    try {
      value = { linked: true, repo, ref: await this.resolveRef(installationId, link.repoFullName, link.defaultBranch, release) };
    } catch (error) {
      throw toHttpError(error);
    }
    if (this.cache.size >= MAX_CACHE) this.cache.clear();
    this.cache.set(key, { value, expiresAt: Date.now() + CACHE_MS });
    return value;
  }

  private async resolveRef(installationId: number, fullName: string, defaultBranch: string, release: string) {
    if (release) {
      let sha: string | null = null;
      let commitUrl = '';
      let source: 'commit' | 'tag' = 'commit';
      if (SHA.test(release)) {
        const commit = await this.github.getCommit(installationId, fullName, release);
        if (commit) ({ sha, url: commitUrl } = commit);
      }
      if (!sha) {
        for (const tag of release.startsWith('v') ? [release] : [release, `v${release}`]) {
          const tagged = await this.github.getTagCommitSha(installationId, fullName, tag);
          if (tagged) {
            sha = tagged;
            source = 'tag';
            commitUrl = `https://github.com/${fullName}/commit/${tagged}`;
            break;
          }
        }
      }
      if (sha) {
        const pullRequests = await this.github.pullRequestsForCommit(installationId, fullName, sha).catch(() => []);
        return { exact: true as const, sha, commitUrl, source, pullRequests };
      }
    }
    return { exact: false as const, branch: defaultBranch };
  }
}
