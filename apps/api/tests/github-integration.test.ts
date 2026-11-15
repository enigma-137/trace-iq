import { ForbiddenException, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHmac, createVerify, generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveStateKey, signIntegrationState, verifyIntegrationState } from '../src/modules/integrations/common/signed-state';
import {
  DefaultBranchWriteError,
  GitHubAppClient,
  isRepoFullName,
  normalizePrivateKey,
  normalizeSubdirectory,
  signAppJwt
} from '../src/modules/integrations/github/github-app.client';
import { GitHubService } from '../src/modules/integrations/github/github.service';
import { GitHubWebhookService, verifyGitHubWebhook } from '../src/modules/integrations/github/github-webhook.service';
import { MockDb, empty, mockDatabase, rows } from './helpers/mock-db';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PRIVATE_PEM = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
const CLIENT_SECRET = 'gh-client-secret';
const STATE_KEY = deriveStateKey(CLIENT_SECRET, 'github-install');
const WEBHOOK_SECRET = 'gh-webhook-secret';

const owner = { id: 'usr_owner', authMethod: 'supabase' as const };
const member = { id: 'usr_member', authMethod: 'supabase' as const };
const pat = { id: 'usr_owner', authMethod: 'pat' as const, scopes: ['projects:read'] };

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function configure() {
  process.env.GITHUB_APP_ID = '12345';
  process.env.GITHUB_APP_SLUG = 'traceiq-test';
  process.env.GITHUB_APP_CLIENT_ID = 'Iv1.client';
  process.env.GITHUB_APP_CLIENT_SECRET = CLIENT_SECRET;
  process.env.GITHUB_APP_PRIVATE_KEY = PRIVATE_PEM.replace(/\n/g, '\\n');
  process.env.DASHBOARD_URL = 'https://app.test';
}

function unconfigure() {
  for (const key of ['GITHUB_APP_ID', 'GITHUB_APP_SLUG', 'GITHUB_APP_CLIENT_ID', 'GITHUB_APP_CLIENT_SECRET', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_APP_WEBHOOK_SECRET', 'DASHBOARD_URL']) {
    delete process.env[key];
  }
}

const stateFor = (userId: string, organizationId = 'org_1', projectId?: string) =>
  signIntegrationState(STATE_KEY, { purpose: 'github-install', organizationId, userId, projectId });

describe('GitHub App JWT', () => {
  it('signs an RS256 JWT GitHub accepts: iss is the app id, backdated iat, exp under 10 minutes', () => {
    const now = Date.UTC(2026, 10, 15, 12);
    const { token, expiresAt } = signAppJwt('12345', PRIVATE_PEM, now);
    const [header, payload, signature] = token.split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    expect(claims.iss).toBe('12345');
    expect(claims.iat).toBe(now / 1000 - 60);
    expect(claims.exp - now / 1000).toBeLessThanOrEqual(600);
    expect(expiresAt).toBe(claims.exp * 1000);
    const valid = createVerify('RSA-SHA256').update(`${header}.${payload}`).verify(publicKey, Buffer.from(signature, 'base64url'));
    expect(valid).toBe(true);
  });

  it('accepts private keys with escaped newlines or base64', () => {
    expect(normalizePrivateKey(PRIVATE_PEM.replace(/\n/g, '\\n')).trim()).toBe(PRIVATE_PEM.trim());
    expect(normalizePrivateKey(Buffer.from(PRIVATE_PEM).toString('base64')).trim()).toBe(PRIVATE_PEM.trim());
    // A normalized key still signs.
    expect(() => signAppJwt('1', normalizePrivateKey(PRIVATE_PEM.replace(/\n/g, '\\n')))).not.toThrow();
  });
});

describe('GitHub install state', () => {
  it('is signed for the github-install purpose only', () => {
    const state = stateFor('usr_owner');
    expect(verifyIntegrationState(STATE_KEY, state, 'github-install')).toMatchObject({ organizationId: 'org_1', userId: 'usr_owner' });
    expect(() => verifyIntegrationState(STATE_KEY, state, 'linear-connect')).toThrow(/purpose/);
    expect(() => verifyIntegrationState(deriveStateKey(CLIENT_SECRET, 'linear-connect'), state, 'github-install')).toThrow(/signature/);
  });
});

describe('repository input checks', () => {
  it('accepts only folders inside the repository', () => {
    expect(normalizeSubdirectory(undefined)).toBe('');
    expect(normalizeSubdirectory('')).toBe('');
    expect(normalizeSubdirectory('./apps/web/')).toBe('apps/web');
    expect(normalizeSubdirectory('../secrets')).toBeNull();
    expect(normalizeSubdirectory('apps/../..')).toBeNull();
    expect(normalizeSubdirectory('/etc')).toBeNull();
    expect(normalizeSubdirectory('apps\\web')).toBeNull();
    expect(normalizeSubdirectory('apps//web')).toBeNull();
    expect(normalizeSubdirectory('a\nb')).toBeNull();
    expect(normalizeSubdirectory(42)).toBeNull();
  });

  it('accepts owner/name repository names only', () => {
    expect(isRepoFullName('acme/web-app')).toBe(true);
    expect(isRepoFullName('acme/web.app_1')).toBe(true);
    expect(isRepoFullName('acme')).toBe(false);
    expect(isRepoFullName('acme/../x')).toBe(false);
    expect(isRepoFullName('acme/web/extra')).toBe(false);
    expect(isRepoFullName('acme/..')).toBe(false);
  });
});

describe('GitHubAppClient', () => {
  const fetchMock = vi.fn();
  let client: GitHubAppClient;
  const repo = { id: 1, fullName: 'acme/web', defaultBranch: 'main', private: true, htmlUrl: 'https://github.com/acme/web' };

  beforeEach(() => {
    configure();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    client = new GitHubAppClient();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    unconfigure();
  });

  it('mints an installation token with the app JWT and caches it until shortly before expiry', async () => {
    fetchMock.mockImplementation(async () => json({ token: 'ghs_one', expires_at: new Date(Date.now() + 60 * 60_000).toISOString() }, 201));
    await expect(client.installationToken(77)).resolves.toBe('ghs_one');
    await expect(client.installationToken(77)).resolves.toBe('ghs_one');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/app/installations/77/access_tokens');
    expect(init.method).toBe('POST');
    const jwt = String(init.headers.authorization).replace('Bearer ', '');
    expect(JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).iss).toBe('12345');
  });

  it('re-mints a token that is about to expire, and shares one mint between concurrent callers', async () => {
    let n = 0;
    fetchMock.mockImplementation(async () => {
      n += 1;
      // The first token expires in 2 minutes: inside the refresh margin.
      const ttl = n === 1 ? 2 * 60_000 : 60 * 60_000;
      return json({ token: `ghs_${n}`, expires_at: new Date(Date.now() + ttl).toISOString() }, 201);
    });
    await expect(client.installationToken(77)).resolves.toBe('ghs_1');
    const [a, b] = await Promise.all([client.installationToken(77), client.installationToken(77)]);
    expect([a, b]).toEqual(['ghs_2', 'ghs_2']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never writes to the default branch', async () => {
    await expect(client.commitFiles(77, repo, 'main', [{ path: 'a', content: 'b' }], 'msg')).rejects.toBeInstanceOf(DefaultBranchWriteError);
    await expect(client.commitFiles(77, repo, 'refs/heads/main', [{ path: 'a', content: 'b' }], 'msg')).rejects.toBeInstanceOf(DefaultBranchWriteError);
    await expect(client.createBranch(77, repo, 'main', 'sha')).rejects.toBeInstanceOf(DefaultBranchWriteError);
    await expect(client.createPullRequest(77, repo, { head: 'main', title: 't', body: 'b' })).rejects.toBeInstanceOf(DefaultBranchWriteError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('commits files as one fast-forward commit on a feature branch and opens a PR against the default branch', async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    fetchMock.mockImplementation(async (url: string, init: { method?: string; body?: string }) => {
      calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : undefined });
      if (url.endsWith('/access_tokens')) return json({ token: 'ghs_x', expires_at: new Date(Date.now() + 3_600_000).toISOString() }, 201);
      if (url.endsWith('/git/ref/heads/traceiq/setup')) return json({ object: { sha: 'parent_sha' } });
      if (url.endsWith('/git/commits/parent_sha')) return json({ sha: 'parent_sha', tree: { sha: 'base_tree' } });
      if (url.endsWith('/git/trees')) return json({ sha: 'new_tree' }, 201);
      if (url.endsWith('/git/commits')) return json({ sha: 'new_commit' }, 201);
      if (url.endsWith('/git/refs/heads/traceiq/setup')) return json({ object: { sha: 'new_commit' } });
      if (url.endsWith('/pulls')) return json({ number: 7, html_url: 'https://github.com/acme/web/pull/7', state: 'open', head: { ref: 'traceiq/setup' }, base: { ref: 'main' } }, 201);
      throw new Error(`unexpected ${url}`);
    });

    await expect(client.commitFiles(77, repo, 'traceiq/setup', [{ path: 'src/traceiq.ts', content: 'init()' }], 'Add TraceIQ')).resolves.toBe('new_commit');
    const tree = calls.find((c) => c.url.endsWith('/git/trees'))!;
    expect(tree.body).toEqual({ base_tree: 'base_tree', tree: [{ path: 'src/traceiq.ts', mode: '100644', type: 'blob', content: 'init()' }] });
    const update = calls.find((c) => c.method === 'PATCH')!;
    expect(update.body).toEqual({ sha: 'new_commit', force: false });
    expect(calls.some((c) => c.url.includes('/heads/main'))).toBe(false);

    const pull = await client.createPullRequest(77, repo, { head: 'traceiq/setup', title: 'Set up TraceIQ', body: 'Body' });
    expect(pull).toEqual({ number: 7, url: 'https://github.com/acme/web/pull/7', state: 'open', head: 'traceiq/setup', base: 'main' });
    expect(calls.at(-1)!.body).toMatchObject({ head: 'traceiq/setup', base: 'main' });
  });

  it('reads files (base64) and reports missing ones as null', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/access_tokens')) return json({ token: 'ghs_x', expires_at: new Date(Date.now() + 3_600_000).toISOString() }, 201);
      if (url.includes('/contents/package.json')) return json({ type: 'file', encoding: 'base64', content: Buffer.from('{"name":"web"}').toString('base64') });
      return json({ message: 'Not Found' }, 404);
    });
    await expect(client.readFile(77, 'acme/web', 'package.json', 'main')).resolves.toBe('{"name":"web"}');
    await expect(client.readFile(77, 'acme/web', 'missing.json')).resolves.toBeNull();
  });
});

describe('GitHubService', () => {
  const fetchMock = vi.fn();
  let db: MockDb;
  let roles: Record<string, string>;
  let installation: Record<string, unknown> | null;
  let installationOwner: string | null;
  let service: GitHubService;
  let client: GitHubAppClient;
  const projects = { requireActiveProject: vi.fn(), requireWritableProject: vi.fn(), resolveActiveProject: vi.fn() };

  function github(handlers: { userInstallations?: number[]; installation?: Record<string, unknown>; tokenError?: string } = {}) {
    fetchMock.mockImplementation(async (url: string, init: { method?: string } = {}) => {
      if (url === 'https://github.com/login/oauth/access_token') {
        return handlers.tokenError ? json({ error: handlers.tokenError }) : json({ access_token: 'ghu_user', token_type: 'bearer' });
      }
      if (url.startsWith('https://api.github.com/user/installations')) {
        return json({ total_count: 1, installations: (handlers.userInstallations ?? [77]).map((id) => ({ id })) });
      }
      if (url.startsWith('https://api.github.com/applications/')) return new Response(null, { status: 204 });
      if (url === 'https://api.github.com/app/installations/77' && (init.method ?? 'GET') === 'GET') {
        return json(handlers.installation ?? { id: 77, account: { login: 'acme', type: 'Organization' }, repository_selection: 'selected', suspended_at: null });
      }
      if (url === 'https://api.github.com/app/installations/77' && init.method === 'DELETE') return new Response(null, { status: 204 });
      if (url.endsWith('/access_tokens')) return json({ token: 'ghs_x', expires_at: new Date(Date.now() + 3_600_000).toISOString() }, 201);
      if (url === 'https://api.github.com/repos/acme/web') {
        return json({ id: 1, full_name: 'acme/web', default_branch: 'main', private: true, html_url: 'https://github.com/acme/web' });
      }
      if (url.includes('/contents/apps/web')) return json([{ name: 'package.json' }]);
      if (url.includes('/contents/')) return json({ message: 'Not Found' }, 404);
      if (url.startsWith('https://api.github.com/repos/')) return json({ message: 'Not Found' }, 404);
      throw new Error(`unexpected ${url}`);
    });
  }

  beforeEach(() => {
    configure();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    roles = { usr_owner: 'owner', usr_member: 'member' };
    installation = null;
    installationOwner = null;
    db = mockDatabase((text, values) => {
      if (text.includes('FROM organization_members om') && text.includes('om.organization_id = $1 AND om.user_id = $2')) {
        const role = roles[values[1] as string];
        return role ? rows([{ role }]) : empty();
      }
      if (text.includes('FROM organization_members om')) {
        const role = roles[values[0] as string];
        return role ? rows([{ organizationId: 'org_1', role }]) : empty();
      }
      if (text.includes('FROM github_installations WHERE installation_id = $1 FOR UPDATE')) {
        return installationOwner ? rows([{ organizationId: installationOwner }]) : empty();
      }
      if (text.includes('FROM github_installations WHERE organization_id = $1')) return installation ? rows([installation]) : empty();
      if (text.includes('INSERT INTO github_installations')) {
        return rows([{ id: values[0], organizationId: values[1], installationId: String(values[2]), accountLogin: values[3], accountType: values[4], repositorySelection: values[5], status: values[6], installedByUserId: values[7], createdAt: '2026-11-15T00:00:00Z' }]);
      }
      if (text.includes('INSERT INTO github_project_repos')) {
        return rows([{ projectId: values[0], installationId: String(values[1]), repoId: String(values[2]), repoFullName: values[3], defaultBranch: values[4], appSubdirectory: values[5] }]);
      }
      return empty();
    });
    projects.requireActiveProject.mockReset();
    projects.requireWritableProject.mockReset().mockResolvedValue({ id: 'proj_1', name: 'Web', organizationId: 'org_1', role: 'owner' });
    projects.resolveActiveProject.mockReset().mockResolvedValue({ id: 'proj_1', name: 'Web', organizationId: 'org_1', role: 'owner' });
    client = new GitHubAppClient();
    service = new GitHubService(db as never, projects as never, client);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    unconfigure();
  });

  describe('install', () => {
    it('returns the app installation URL with a signed state, for owners and admins only', async () => {
      const result = await service.createInstallUrl(owner, {});
      const url = new URL(result.url);
      expect(url.origin + url.pathname).toBe('https://github.com/apps/traceiq-test/installations/new');
      expect(url.searchParams.get('state')).toBe(result.state);
      expect(verifyIntegrationState(STATE_KEY, result.state, 'github-install')).toMatchObject({ organizationId: 'org_1', userId: 'usr_owner' });
      await expect(service.createInstallUrl(member, {})).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.createInstallUrl(pat, {})).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('needs the GitHub App to be configured', async () => {
      delete process.env.GITHUB_APP_PRIVATE_KEY;
      await expect(service.createInstallUrl(owner, {})).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('callback', () => {
    it('forwards the installation to the dashboard without storing anything', () => {
      const state = stateFor('usr_owner', 'org_1', 'proj_1');
      const url = new URL(service.forwardCallback({ installation_id: '77', setup_action: 'install', code: 'c1', state }));
      expect(url.origin + url.pathname).toBe('https://app.test/dashboard/settings/integrations');
      expect(Object.fromEntries(url.searchParams)).toEqual({
        github: 'complete', github_installation_id: '77', github_code: 'c1', github_state: state, projectId: 'proj_1'
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(db.query).not.toHaveBeenCalled();
    });

    it('returns to the setup wizard when the install started there, and ignores unknown pages', async () => {
      const fromWizard = await service.createInstallUrl(owner, {}, 'setup');
      expect(verifyIntegrationState(STATE_KEY, fromWizard.state, 'github-install').returnTo).toBe('setup');
      const url = new URL(service.forwardCallback({ installation_id: '77', code: 'c1', state: fromWizard.state }));
      expect(url.pathname).toBe('/dashboard/setup');
      expect(url.searchParams.get('github')).toBe('complete');

      const elsewhere = await service.createInstallUrl(owner, {}, 'https://evil.test');
      expect(verifyIntegrationState(STATE_KEY, elsewhere.state, 'github-install').returnTo).toBeUndefined();
      expect(new URL(service.forwardCallback({ installation_id: '77', code: 'c1', state: elsewhere.state })).pathname).toBe('/dashboard/settings/integrations');
    });

    it('reports pending approvals and missing values', () => {
      const flag = (u: string) => Object.fromEntries(new URL(u).searchParams);
      expect(flag(service.forwardCallback({ setup_action: 'request' }))).toMatchObject({ github: 'error', reason: 'pending_approval' });
      expect(flag(service.forwardCallback({ installation_id: 'abc', code: 'c' }))).toMatchObject({ github: 'error', reason: 'missing_installation' });
      expect(flag(service.forwardCallback({ installation_id: '77' }))).toMatchObject({ github: 'error', reason: 'missing_code' });
    });
  });

  describe('complete', () => {
    it('links an installation the signed-in GitHub user can access', async () => {
      github();
      const result = await service.completeInstall(owner, { installationId: '77', code: 'c1', state: stateFor('usr_owner', 'org_1', 'proj_1') });
      expect(result).toMatchObject({
        connected: true,
        projectId: 'proj_1',
        installation: { installationId: '77', accountLogin: 'acme', accountType: 'Organization', repositorySelection: 'selected', status: 'active' }
      });
      expect(result.installation.manageUrl).toBe('https://github.com/organizations/acme/settings/installations/77');
      const insert = db.queryCalls('INSERT INTO github_installations')[0];
      expect(insert.values.slice(1)).toEqual(['org_1', 77, 'acme', 'Organization', 'selected', 'active', 'usr_owner']);
      // The user token is only used for the check, then revoked; it is never stored.
      expect(fetchMock.mock.calls.some(([u]) => String(u).startsWith('https://api.github.com/applications/Iv1.client/token'))).toBe(true);
      expect(JSON.stringify(db.calls)).not.toContain('ghu_user');
    });

    it('refuses an installation id the GitHub user cannot access (edited installation_id)', async () => {
      github({ userInstallations: [99] });
      await expect(service.completeInstall(owner, { installationId: '77', code: 'c1', state: stateFor('usr_owner') })).rejects.toMatchObject({
        response: { code: 'GITHUB_INSTALLATION_NOT_YOURS' }
      });
      expect(db.queryCalls('INSERT INTO github_installations')).toHaveLength(0);
    });

    it('refuses a forwarded link finished by a different TraceIQ user', async () => {
      github();
      roles.usr_attacker = 'owner';
      await expect(service.completeInstall(owner, { installationId: '77', code: 'c1', state: stateFor('usr_attacker', 'org_attacker') })).rejects.toMatchObject({
        response: { code: 'GITHUB_STATE_USER_MISMATCH' }
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses an installation already connected to another organization', async () => {
      github();
      installationOwner = 'org_other';
      await expect(service.completeInstall(owner, { installationId: '77', code: 'c1', state: stateFor('usr_owner') })).rejects.toMatchObject({
        response: { code: 'GITHUB_INSTALLATION_IN_USE' }
      });
      expect(db.queryCalls('INSERT INTO github_installations')).toHaveLength(0);
    });

    it('rejects bad codes, bad states, members and PATs', async () => {
      github({ tokenError: 'bad_verification_code' });
      await expect(service.completeInstall(owner, { installationId: '77', code: 'bad', state: stateFor('usr_owner') })).rejects.toMatchObject({
        response: { code: 'GITHUB_CODE_INVALID' }
      });
      const expired = signIntegrationState(STATE_KEY, { purpose: 'github-install', organizationId: 'org_1', userId: 'usr_owner' }, 600, Date.now() - 700_000);
      await expect(service.completeInstall(owner, { installationId: '77', code: 'c', state: expired })).rejects.toMatchObject({ response: { code: 'GITHUB_STATE_EXPIRED' } });
      await expect(service.completeInstall(owner, { installationId: '77', code: 'c', state: 'junk' })).rejects.toMatchObject({ response: { code: 'GITHUB_STATE_INVALID' } });
      await expect(service.completeInstall(owner, { installationId: '-1', code: 'c', state: stateFor('usr_owner') })).rejects.toThrow(/required/);
      await expect(service.completeInstall(pat, { installationId: '77', code: 'c', state: stateFor('usr_owner') })).rejects.toBeInstanceOf(ForbiddenException);
      roles.usr_member = 'member';
      await expect(service.completeInstall(member, { installationId: '77', code: 'c', state: stateFor('usr_member') })).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('repos and project links', () => {
    beforeEach(() => {
      installation = { id: 'ghi_1', organizationId: 'org_1', installationId: '77', accountLogin: 'acme', accountType: 'Organization', repositorySelection: 'selected', status: 'active', installedByUserId: 'usr_owner', createdAt: '2026-11-15T00:00:00Z' };
    });

    it('links a repo the installation can see, with the app folder', async () => {
      github();
      const { projectRepo } = await service.linkProjectRepo(owner, 'proj_1', { repoFullName: 'acme/web', subdirectory: 'apps/web/' });
      expect(projectRepo).toMatchObject({ projectId: 'proj_1', installationId: '77', repoId: '1', repoFullName: 'acme/web', defaultBranch: 'main', appSubdirectory: 'apps/web' });
    });

    it('rejects repos outside the installation, missing folders and path tricks', async () => {
      github();
      await expect(service.linkProjectRepo(owner, 'proj_1', { repoFullName: 'other/secret' })).rejects.toMatchObject({ response: { code: 'GITHUB_NOT_FOUND' } });
      await expect(service.linkProjectRepo(owner, 'proj_1', { repoFullName: 'acme/web', subdirectory: 'apps/api' })).rejects.toThrow(/no folder/);
      await expect(service.linkProjectRepo(owner, 'proj_1', { repoFullName: 'acme/web', subdirectory: '../x' })).rejects.toThrow(/folder inside/);
      await expect(service.linkProjectRepo(owner, 'proj_1', { repoFullName: 'not a repo' })).rejects.toThrow(/owner\/name/);
      expect(db.queryCalls('INSERT INTO github_project_repos')).toHaveLength(0);
    });

    it('requires an active installation and a manager', async () => {
      installation = { ...installation, status: 'suspended' };
      await expect(service.linkProjectRepo(owner, 'proj_1', { repoFullName: 'acme/web' })).rejects.toMatchObject({ response: { code: 'GITHUB_SUSPENDED' } });
      installation = null;
      await expect(service.listRepos(owner, {})).rejects.toMatchObject({ response: { code: 'GITHUB_NOT_CONNECTED' } });
      projects.requireWritableProject.mockResolvedValue({ id: 'proj_1', organizationId: 'org_1', role: 'member' });
      await expect(service.linkProjectRepo(member, 'proj_1', { repoFullName: 'acme/web' })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('reports status with the project link', async () => {
      const status = await service.getStatus(member, {});
      expect(status).toMatchObject({ configured: true, connected: true, canManage: false, project: { id: 'proj_1' }, installation: { accountLogin: 'acme' } });
    });

    it('disconnect uninstalls the app on GitHub and removes the installation', async () => {
      github();
      await expect(service.disconnect(owner, {})).resolves.toEqual({ disconnected: true, uninstalled: true });
      expect(fetchMock.mock.calls.some(([u, init]) => u === 'https://api.github.com/app/installations/77' && init.method === 'DELETE')).toBe(true);
      expect(db.queryCalls('DELETE FROM github_installations WHERE organization_id = $1')[0].values).toEqual(['org_1']);
      await expect(service.disconnect(member, {})).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('status for someone outside the organization is not found', async () => {
    await expect(service.getStatus({ id: 'usr_stranger', authMethod: 'supabase' }, {})).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('GitHub webhooks', () => {
  const sign = (body: string, secret = WEBHOOK_SECRET) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  let db: MockDb;
  let known: boolean;
  let service: GitHubWebhookService;
  const client = { forgetInstallation: vi.fn() };

  beforeEach(() => {
    known = true;
    client.forgetInstallation.mockReset();
    db = mockDatabase((text) => {
      if (/DELETE FROM github_installations|UPDATE github_installations/.test(text)) return known ? rows([{ '?column?': 1 }]) : empty();
      return empty();
    });
    service = new GitHubWebhookService(db as never, client as never);
  });

  it('verifies X-Hub-Signature-256 over the raw body', () => {
    const body = JSON.stringify({ action: 'deleted', installation: { id: 77 } });
    expect(verifyGitHubWebhook(WEBHOOK_SECRET, Buffer.from(body), sign(body))).toMatchObject({ action: 'deleted' });
    expect(() => verifyGitHubWebhook(WEBHOOK_SECRET, Buffer.from(body), sign(body, 'wrong'))).toThrow(UnauthorizedException);
    expect(() => verifyGitHubWebhook(WEBHOOK_SECRET, Buffer.from(body), sign(body).replace('sha256=', ''))).toThrow(UnauthorizedException);
    expect(() => verifyGitHubWebhook(WEBHOOK_SECRET, Buffer.from(body), undefined)).toThrow(UnauthorizedException);
    expect(() => verifyGitHubWebhook(WEBHOOK_SECRET, Buffer.from(body.replace('77', '78')), sign(body))).toThrow(UnauthorizedException);
    expect(() => verifyGitHubWebhook('', Buffer.from(body), sign(body))).toThrow(ServiceUnavailableException);
  });

  it('removes the installation (and its repo links) when the app is uninstalled', async () => {
    await expect(service.handle('installation', { action: 'deleted', installation: { id: 77 } })).resolves.toBe('uninstalled');
    expect(db.queryCalls('DELETE FROM github_installations WHERE installation_id = $1')[0].values).toEqual([77]);
    expect(client.forgetInstallation).toHaveBeenCalledWith(77);
    known = false;
    await expect(service.handle('installation', { action: 'deleted', installation: { id: 78 } })).resolves.toBe('unknown_installation');
  });

  it('tracks suspend and unsuspend', async () => {
    await expect(service.handle('installation', { action: 'suspend', installation: { id: 77 } })).resolves.toBe('suspended');
    expect(db.queryCalls('UPDATE github_installations SET status')[0].values).toEqual([77, 'suspended']);
    await expect(service.handle('installation', { action: 'unsuspend', installation: { id: 77 } })).resolves.toBe('unsuspended');
    expect(db.queryCalls('UPDATE github_installations SET status')[1].values).toEqual([77, 'active']);
  });

  it('unlinks projects from repositories the app lost access to', async () => {
    await expect(
      service.handle('installation_repositories', {
        action: 'removed',
        installation: { id: 77 },
        repository_selection: 'selected',
        repositories_removed: [{ id: 1, full_name: 'acme/web' }, { id: 'bad' as unknown as number }]
      })
    ).resolves.toBe('repositories_updated');
    expect(db.queryCalls('DELETE FROM github_project_repos')[0].values).toEqual([77, [1]]);
  });

  it('ignores other events and payloads without an installation', async () => {
    await expect(service.handle('push', { installation: { id: 77 } })).resolves.toBe('ignored');
    await expect(service.handle('installation', { action: 'created', installation: { id: 77 } })).resolves.toBe('ignored');
    await expect(service.handle('installation', { action: 'deleted' })).resolves.toBe('ignored');
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('GitHubController authorization', () => {
  it('authenticates dashboard routes and checks PAT scopes on reads', async () => {
    const { GitHubController } = await import('../src/modules/integrations/github/github.controller');
    const authService = {
      getDashboardUser: vi.fn(async (header?: string) => {
        if (!header) throw new UnauthorizedException();
        return { id: 'usr_1', authMethod: 'pat', scopes: [] };
      }),
      requireScope: vi.fn(() => {
        throw new ForbiddenException('Personal access token requires "projects:read" scope.');
      })
    };
    const githubService = { createInstallUrl: vi.fn(), completeInstall: vi.fn(), getStatus: vi.fn(), listRepos: vi.fn(), linkProjectRepo: vi.fn(), disconnect: vi.fn() };
    const controller = new GitHubController(authService as never, githubService as never, {} as never, {} as never, {} as never);
    await expect(controller.install(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.complete({}, undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.linkProject('proj_1', {}, undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.disconnect(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.status('Bearer tiq_pat_x')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.repos('Bearer tiq_pat_x')).rejects.toBeInstanceOf(ForbiddenException);
    expect(Object.values(githubService).every((fn) => fn.mock.calls.length === 0)).toBe(true);
  });
});
