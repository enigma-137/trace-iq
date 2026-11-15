import { Injectable, Logger } from '@nestjs/common';
import { createSign } from 'node:crypto';

export const GITHUB_API = 'https://api.github.com';
export const GITHUB_WEB = 'https://github.com';
const API_VERSION = '2022-11-28';
const TIMEOUT_MS = 15_000;
/** GitHub allows App JWTs up to 10 minutes; stay well inside it and allow for clock drift. */
const JWT_LIFETIME_S = 9 * 60;
const JWT_BACKDATE_S = 60;
/** Installation tokens last an hour; re-mint this long before they expire. */
const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;
const MAX_REPO_PAGES = 10;

export interface GitHubInstallation {
  id: number;
  accountLogin: string;
  accountType: string | null;
  repositorySelection: 'all' | 'selected';
  suspended: boolean;
}

export interface GitHubRepo {
  id: number;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  htmlUrl: string;
}

export interface GitHubTreeEntry {
  path: string;
  type: 'blob' | 'tree' | 'commit';
  size?: number;
}

export interface FileChange {
  path: string;
  content: string;
}

export interface GitHubPullRequest {
  number: number;
  url: string;
  state: string;
  head: string;
  base: string;
}

/** GitHub refused the credentials (bad app key, revoked user token, uninstalled app). */
export class GitHubAuthError extends Error {
  readonly name = 'GitHubAuthError';
}

/** Any other GitHub failure. `status` is GitHub's HTTP status when there was one. */
export class GitHubApiError extends Error {
  readonly name = 'GitHubApiError';

  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

/** A write aimed at the repository's default branch. TraceIQ only ever proposes changes in a PR. */
export class DefaultBranchWriteError extends Error {
  readonly name = 'DefaultBranchWriteError';

  constructor(branch: string) {
    super(`Refusing to write to the default branch (${branch}). Changes go on a separate branch and a pull request.`);
  }
}

/** A GitHub App private key from an env var: PEM, with "\n" escapes or base64-encoded. */
export function normalizePrivateKey(raw: string): string {
  const value = raw.trim().replace(/^"|"$/g, '');
  if (value.includes('-----BEGIN')) return value.replace(/\\n/g, '\n');
  const decoded = Buffer.from(value, 'base64').toString('utf8');
  return decoded.includes('-----BEGIN') ? decoded : value;
}

/** RS256 JWT that authenticates as the GitHub App itself. */
export function signAppJwt(appId: string, privateKey: string, nowMs = Date.now()): { token: string; expiresAt: number } {
  const now = Math.floor(nowMs / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = { iat: now - JWT_BACKDATE_S, exp: now + JWT_LIFETIME_S, iss: appId };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode(header)}.${encode(payload)}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(privateKey).toString('base64url');
  return { token: `${unsigned}.${signature}`, expiresAt: (now + JWT_LIFETIME_S) * 1000 };
}

/** A repository-relative folder: no leading slash, no `..`, no backslashes. '' is the root. */
export function normalizeSubdirectory(value: unknown): string | null {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/^\.\/+/, '').replace(/\/+$/, '');
  if (!trimmed || trimmed === '.') return '';
  const hasControl = [...trimmed].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
  if (trimmed.length > 200 || trimmed.startsWith('/') || trimmed.includes('\\') || hasControl) return null;
  const parts = trimmed.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return null;
  return parts.join('/');
}

const REPO_NAME = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
export function isRepoFullName(value: unknown): value is string {
  return typeof value === 'string' && REPO_NAME.test(value) && !value.endsWith('/.') && !value.endsWith('/..');
}

/**
 * Talks to GitHub as the TraceIQ GitHub App: a JWT for app-level calls and short-lived
 * installation tokens (cached until just before expiry) for repository calls. Uses
 * fetch directly, like the other integration clients. Tokens are never logged.
 */
@Injectable()
export class GitHubAppClient {
  private readonly logger = new Logger(GitHubAppClient.name);
  private jwt: { token: string; expiresAt: number } | null = null;
  private readonly installationTokens = new Map<number, { token: string; expiresAt: number }>();
  private readonly pendingTokens = new Map<number, Promise<string>>();

  get appId(): string {
    return (process.env.GITHUB_APP_ID ?? '').trim();
  }

  get slug(): string {
    return (process.env.GITHUB_APP_SLUG ?? '').trim();
  }

  get clientId(): string {
    return (process.env.GITHUB_APP_CLIENT_ID ?? '').trim();
  }

  private get clientSecret(): string {
    return (process.env.GITHUB_APP_CLIENT_SECRET ?? '').trim();
  }

  private get privateKey(): string {
    return normalizePrivateKey(process.env.GITHUB_APP_PRIVATE_KEY ?? '');
  }

  /** Root secret for signing the install `state`. */
  get stateSecret(): string {
    return this.clientSecret;
  }

  get isConfigured(): boolean {
    return Boolean(this.appId && this.slug && this.clientId && this.clientSecret && (process.env.GITHUB_APP_PRIVATE_KEY ?? '').trim());
  }

  installUrl(state: string): string {
    return `${GITHUB_WEB}/apps/${encodeURIComponent(this.slug)}/installations/new?state=${encodeURIComponent(state)}`;
  }

  // ---------------------------------------------------------------- user (install check)

  /** Trades the code GitHub sends after install ("request user authorization") for a user token. */
  async exchangeUserCode(code: string): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${GITHUB_WEB}/login/oauth/access_token`, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'TraceIQ' },
        body: JSON.stringify({ client_id: this.clientId, client_secret: this.clientSecret, code }),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch {
      throw new GitHubApiError('Could not reach GitHub. Try again.');
    }
    const body = (await response.json().catch(() => ({}))) as { access_token?: string; error?: string };
    if (!response.ok || !body.access_token) {
      if (body.error === 'bad_verification_code' || body.error === 'incorrect_client_credentials') throw new GitHubAuthError(body.error);
      throw new GitHubApiError(`GitHub sign-in failed (${body.error ?? response.status}).`, response.status);
    }
    return body.access_token;
  }

  /** Whether the GitHub user behind `userToken` can access `installationId`. */
  async userCanAccessInstallation(userToken: string, installationId: number): Promise<boolean> {
    for (let page = 1; page <= MAX_REPO_PAGES; page += 1) {
      const body = await this.request<{ installations: Array<{ id: number }> }>(`/user/installations?per_page=100&page=${page}`, { token: userToken });
      if (body.installations.some((installation) => installation.id === installationId)) return true;
      if (body.installations.length < 100) return false;
    }
    return false;
  }

  /** Best effort: forget the short-lived user token once the check is done. Never throws. */
  async revokeUserToken(userToken: string): Promise<void> {
    try {
      await fetch(`${GITHUB_API}/applications/${encodeURIComponent(this.clientId)}/token`, {
        method: 'DELETE',
        headers: {
          ...baseHeaders(),
          authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ access_token: userToken }),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch {
      // Expires on its own; nothing else holds it.
    }
  }

  // ---------------------------------------------------------------- app level

  async getInstallation(installationId: number): Promise<GitHubInstallation> {
    const body = await this.request<{
      id: number;
      account?: { login?: string; type?: string } | null;
      repository_selection?: string;
      suspended_at?: string | null;
    }>(`/app/installations/${installationId}`, { token: this.appJwt() });
    return {
      id: body.id,
      accountLogin: body.account?.login ?? 'unknown',
      accountType: body.account?.type ?? null,
      repositorySelection: body.repository_selection === 'all' ? 'all' : 'selected',
      suspended: Boolean(body.suspended_at)
    };
  }

  /** Uninstalls the app from the GitHub account. Best effort: true when GitHub confirmed it. */
  async deleteInstallation(installationId: number): Promise<boolean> {
    try {
      await this.request(`/app/installations/${installationId}`, { method: 'DELETE', token: this.appJwt(), expectEmpty: true });
      this.installationTokens.delete(installationId);
      return true;
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) return true;
      this.logger.warn(`GitHub uninstall failed: ${error instanceof Error ? error.name : 'unknown error'}`);
      return false;
    }
  }

  /** Short-lived token for one installation, cached until shortly before it expires. */
  async installationToken(installationId: number): Promise<string> {
    const cached = this.installationTokens.get(installationId);
    if (cached && cached.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()) return cached.token;
    const pending = this.pendingTokens.get(installationId);
    if (pending) return pending;

    const minting = (async () => {
      const body = await this.request<{ token: string; expires_at: string }>(`/app/installations/${installationId}/access_tokens`, {
        method: 'POST',
        token: this.appJwt()
      });
      this.installationTokens.set(installationId, { token: body.token, expiresAt: new Date(body.expires_at).getTime() });
      return body.token;
    })().finally(() => this.pendingTokens.delete(installationId));
    this.pendingTokens.set(installationId, minting);
    return minting;
  }

  forgetInstallation(installationId: number) {
    this.installationTokens.delete(installationId);
  }

  // ---------------------------------------------------------------- repositories

  async listRepos(installationId: number): Promise<GitHubRepo[]> {
    const token = await this.installationToken(installationId);
    const repos: GitHubRepo[] = [];
    for (let page = 1; page <= MAX_REPO_PAGES; page += 1) {
      const body = await this.request<{ repositories: RawRepo[] }>(`/installation/repositories?per_page=100&page=${page}`, { token });
      repos.push(...body.repositories.map(toRepo));
      if (body.repositories.length < 100) break;
    }
    return repos;
  }

  async getRepo(installationId: number, fullName: string): Promise<GitHubRepo> {
    const token = await this.installationToken(installationId);
    return toRepo(await this.request<RawRepo>(`/repos/${repoPath(fullName)}`, { token }));
  }

  /** A file's text at `ref`, or null when it does not exist. */
  async readFile(installationId: number, fullName: string, path: string, ref?: string): Promise<string | null> {
    const token = await this.installationToken(installationId);
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    try {
      const body = await this.request<{ type: string; encoding?: string; content?: string }>(
        `/repos/${repoPath(fullName)}/contents/${filePath(path)}${query}`,
        { token }
      );
      if (body.type !== 'file' || body.encoding !== 'base64' || typeof body.content !== 'string') return null;
      return Buffer.from(body.content, 'base64').toString('utf8');
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) return null;
      throw error;
    }
  }

  /** Whether `path` is a folder at `ref`. */
  async isDirectory(installationId: number, fullName: string, path: string, ref?: string): Promise<boolean> {
    const token = await this.installationToken(installationId);
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    try {
      const body = await this.request<unknown>(`/repos/${repoPath(fullName)}/contents/${filePath(path)}${query}`, { token });
      return Array.isArray(body);
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) return false;
      throw error;
    }
  }

  /** The repository's file tree at `ref` (recursive). `truncated` is true for very large repos. */
  async getTree(installationId: number, fullName: string, ref: string): Promise<{ entries: GitHubTreeEntry[]; truncated: boolean }> {
    const token = await this.installationToken(installationId);
    const body = await this.request<{ tree: GitHubTreeEntry[]; truncated: boolean }>(
      `/repos/${repoPath(fullName)}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
      { token }
    );
    return { entries: body.tree.map((entry) => ({ path: entry.path, type: entry.type, size: entry.size })), truncated: Boolean(body.truncated) };
  }

  /** The commit SHA a branch points at, or null when the branch does not exist. */
  async getBranchSha(installationId: number, fullName: string, branch: string): Promise<string | null> {
    const token = await this.installationToken(installationId);
    try {
      const body = await this.request<{ object: { sha: string } }>(`/repos/${repoPath(fullName)}/git/ref/heads/${filePath(branch)}`, { token });
      return body.object.sha;
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) return null;
      throw error;
    }
  }

  /** Creates `branch` at `fromSha`. Never the default branch. */
  async createBranch(installationId: number, repo: GitHubRepo, branch: string, fromSha: string): Promise<void> {
    assertNotDefault(repo, branch);
    const token = await this.installationToken(installationId);
    await this.request(`/repos/${repoPath(repo.fullName)}/git/refs`, {
      method: 'POST',
      token,
      body: { ref: `refs/heads/${branch}`, sha: fromSha }
    });
  }

  /**
   * Commits `files` on top of `branch` as one commit and moves the branch to it
   * (fast-forward only). Refuses the default branch.
   */
  async commitFiles(installationId: number, repo: GitHubRepo, branch: string, files: FileChange[], message: string): Promise<string> {
    assertNotDefault(repo, branch);
    if (!files.length) throw new GitHubApiError('Nothing to commit.');
    const token = await this.installationToken(installationId);
    const base = `/repos/${repoPath(repo.fullName)}`;

    const ref = await this.request<{ object: { sha: string } }>(`${base}/git/ref/heads/${filePath(branch)}`, { token });
    const parent = await this.request<{ sha: string; tree: { sha: string } }>(`${base}/git/commits/${ref.object.sha}`, { token });
    const tree = await this.request<{ sha: string }>(`${base}/git/trees`, {
      method: 'POST',
      token,
      body: {
        base_tree: parent.tree.sha,
        tree: files.map((file) => ({ path: file.path, mode: '100644', type: 'blob', content: file.content }))
      }
    });
    const commit = await this.request<{ sha: string }>(`${base}/git/commits`, {
      method: 'POST',
      token,
      body: { message, tree: tree.sha, parents: [parent.sha] }
    });
    await this.request(`${base}/git/refs/heads/${filePath(branch)}`, {
      method: 'PATCH',
      token,
      body: { sha: commit.sha, force: false }
    });
    return commit.sha;
  }

  async findOpenPullRequest(installationId: number, repo: GitHubRepo, branch: string): Promise<GitHubPullRequest | null> {
    const token = await this.installationToken(installationId);
    const owner = repo.fullName.split('/')[0];
    const list = await this.request<RawPull[]>(
      `/repos/${repoPath(repo.fullName)}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}&per_page=1`,
      { token }
    );
    return list[0] ? toPull(list[0]) : null;
  }

  async createPullRequest(
    installationId: number,
    repo: GitHubRepo,
    input: { head: string; title: string; body: string }
  ): Promise<GitHubPullRequest> {
    assertNotDefault(repo, input.head);
    const token = await this.installationToken(installationId);
    const pull = await this.request<RawPull>(`/repos/${repoPath(repo.fullName)}/pulls`, {
      method: 'POST',
      token,
      body: { head: input.head, base: repo.defaultBranch, title: input.title, body: input.body, maintainer_can_modify: true }
    });
    return toPull(pull);
  }

  // ---------------------------------------------------------------- plumbing

  private appJwt(): string {
    if (this.jwt && this.jwt.expiresAt - 60_000 > Date.now()) return this.jwt.token;
    if (!this.appId || !(process.env.GITHUB_APP_PRIVATE_KEY ?? '').trim()) throw new GitHubAuthError('The GitHub App is not configured.');
    try {
      this.jwt = signAppJwt(this.appId, this.privateKey);
    } catch {
      throw new GitHubAuthError('GITHUB_APP_PRIVATE_KEY is not a valid private key.');
    }
    return this.jwt.token;
  }

  private async request<T>(
    path: string,
    options: { token: string; method?: string; body?: unknown; expectEmpty?: boolean }
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${GITHUB_API}${path}`, {
        method: options.method ?? 'GET',
        headers: {
          ...baseHeaders(),
          authorization: `Bearer ${options.token}`,
          ...(options.body !== undefined ? { 'content-type': 'application/json' } : {})
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch {
      throw new GitHubApiError('Could not reach GitHub. Try again.');
    }
    if (response.status === 401) throw new GitHubAuthError('GitHub rejected TraceIQ’s credentials.');
    if (options.expectEmpty && response.ok) return undefined as T;
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      const rateLimited = response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0');
      const message = rateLimited ? 'GitHub is rate limiting requests. Try again in a minute.' : body?.message ?? `GitHub request failed (${response.status}).`;
      throw new GitHubApiError(message, response.status);
    }
    return body as T;
  }
}

type RawRepo = { id: number; full_name: string; default_branch: string; private: boolean; html_url: string };
type RawPull = { number: number; html_url: string; state: string; head: { ref: string }; base: { ref: string } };

function toRepo(raw: RawRepo): GitHubRepo {
  return { id: raw.id, fullName: raw.full_name, defaultBranch: raw.default_branch, private: raw.private, htmlUrl: raw.html_url };
}

function toPull(raw: RawPull): GitHubPullRequest {
  return { number: raw.number, url: raw.html_url, state: raw.state, head: raw.head.ref, base: raw.base.ref };
}

function baseHeaders() {
  return { accept: 'application/vnd.github+json', 'x-github-api-version': API_VERSION, 'user-agent': 'TraceIQ' };
}

function assertNotDefault(repo: GitHubRepo, branch: string) {
  const normalized = branch.replace(/^refs\/heads\//, '');
  if (!normalized || normalized === repo.defaultBranch) throw new DefaultBranchWriteError(repo.defaultBranch);
}

function repoPath(fullName: string): string {
  if (!isRepoFullName(fullName)) throw new GitHubApiError('Invalid repository name.', 400);
  const [owner, name] = fullName.split('/');
  return `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

function filePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}
