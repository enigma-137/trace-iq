import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../../database/database.service';
import { DashboardUser } from '../../auth/auth.service';
import { ProjectsService } from '../../projects/projects.service';
import {
  DEFAULT_STATE_TTL_SECONDS,
  InvalidStateError,
  deriveStateKey,
  signIntegrationState,
  verifyIntegrationState
} from '../common/signed-state';
import {
  GitHubApiError,
  GitHubAppClient,
  GitHubAuthError,
  GitHubRepo,
  isRepoFullName,
  normalizeSubdirectory
} from './github-app.client';

const STATE_PURPOSE = 'github-install';
const MANAGE_ROLES = ['owner', 'admin'];
export const SETTINGS_PATH = '/dashboard/settings/integrations';
/** Dashboard pages an install may return to. Anything else goes to settings. */
export const RETURN_PATHS: Record<string, string> = { settings: SETTINGS_PATH, setup: '/dashboard/setup' };

export type GitHubInstallationRow = {
  id: string;
  organizationId: string;
  installationId: string;
  accountLogin: string;
  accountType: string | null;
  repositorySelection: 'all' | 'selected';
  status: 'active' | 'suspended';
  installedByUserId: string;
  createdAt: string;
};

export type GitHubProjectRepo = {
  projectId: string;
  installationId: string;
  repoId: string;
  repoFullName: string;
  defaultBranch: string;
  appSubdirectory: string;
  updatedAt: string;
};

export interface OrganizationScope {
  organizationId?: string;
  projectId?: string;
}

export type GitHubSetupPullRequest = {
  repoFullName: string;
  branch: string;
  number: number;
  url: string;
  frameworkLabel: string | null;
  createdAt: string;
};

const INSTALLATION_COLUMNS = `
  id,
  organization_id AS "organizationId",
  installation_id::text AS "installationId",
  account_login AS "accountLogin",
  account_type AS "accountType",
  repository_selection AS "repositorySelection",
  status,
  installed_by_user_id AS "installedByUserId",
  created_at AS "createdAt"
`;

const PROJECT_REPO_COLUMNS = `
  project_id AS "projectId",
  installation_id::text AS "installationId",
  repo_id::text AS "repoId",
  repo_full_name AS "repoFullName",
  default_branch AS "defaultBranch",
  app_subdirectory AS "appSubdirectory",
  updated_at AS "updatedAt"
`;

export const dashboardUrl = () => (process.env.DASHBOARD_URL ?? 'https://traceiq.run').replace(/\/+$/, '');

export function settingsReturnUrl(params: Record<string, string | undefined>, returnTo?: string): string {
  const url = new URL(`${dashboardUrl()}${RETURN_PATHS[returnTo ?? ''] ?? SETTINGS_PATH}`);
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
  return url.toString();
}

function parseInstallationId(value: unknown): number | null {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^\d{1,15}$/.test(text)) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** GitHub failures as HTTP errors with codes the dashboard can act on. */
export function toHttpError(error: unknown): unknown {
  if (error instanceof GitHubAuthError) {
    return new BadGatewayException({ code: 'GITHUB_AUTH_FAILED', message: 'GitHub rejected TraceIQ’s credentials. Reinstall the GitHub App.' });
  }
  if (error instanceof GitHubApiError) {
    if (error.status === 404) return new NotFoundException({ code: 'GITHUB_NOT_FOUND', message: 'GitHub could not find that repository or the app no longer has access to it.' });
    return new BadGatewayException({ code: 'GITHUB_ERROR', message: error.message });
  }
  return error;
}

@Injectable()
export class GitHubService {
  private readonly logger = new Logger(GitHubService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService,
    private readonly github: GitHubAppClient
  ) {}

  /** Step 1: the GitHub App installation URL with a signed state for this org and person. */
  async createInstallUrl(user: DashboardUser, scope: OrganizationScope, returnTo?: string) {
    this.requireInteractive(user);
    this.requireConfigured();
    const org = await this.resolveOrganization(user, scope);
    this.requireManager(org.role);
    const state = signIntegrationState(this.stateKey(), {
      purpose: STATE_PURPOSE,
      organizationId: org.organizationId,
      userId: user.id,
      ...(org.projectId ? { projectId: org.projectId } : {}),
      ...(returnTo && RETURN_PATHS[returnTo] ? { returnTo } : {})
    });
    return {
      url: this.github.installUrl(state),
      // The dashboard keeps a copy, in case GitHub does not hand the state back.
      state,
      expiresAt: new Date(Date.now() + DEFAULT_STATE_TTL_SECONDS * 1000).toISOString()
    };
  }

  /**
   * Step 2: GitHub sends the browser back to the API after installing. `installation_id`
   * in this URL is not trustworthy (anyone can edit it), so nothing is stored here: the
   * values are forwarded to the dashboard, which finishes with the signed-in session.
   */
  forwardCallback(params: { installation_id?: string; setup_action?: string; code?: string; state?: string }): string {
    const { projectId, returnTo } = this.peekState(params.state);
    const back = (query: Record<string, string | undefined>) => settingsReturnUrl({ ...query, projectId }, returnTo);
    if (!this.github.isConfigured) return settingsReturnUrl({ github: 'error', reason: 'not_configured' });
    if (params.setup_action === 'request') return back({ github: 'error', reason: 'pending_approval' });
    const installationId = parseInstallationId(params.installation_id);
    if (!installationId) return back({ github: 'error', reason: 'missing_installation' });
    if (!params.code) return back({ github: 'error', reason: 'missing_code' });
    return back({
      github: 'complete',
      github_installation_id: String(installationId),
      github_code: params.code,
      github_state: params.state
    });
  }

  /**
   * Step 3: link the installation to the organization. Three checks, so neither an edited
   * installation_id nor a forwarded link can attach someone else's GitHub account:
   * 1. the signed state was made for this signed-in person, who is still an owner/admin;
   * 2. the one-time user code proves which GitHub user installed the app;
   * 3. that GitHub user can access the installation.
   */
  async completeInstall(user: DashboardUser, body: { installationId?: unknown; code?: unknown; state?: unknown }) {
    this.requireInteractive(user);
    this.requireConfigured();
    const installationId = parseInstallationId(body?.installationId);
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    const state = typeof body?.state === 'string' ? body.state.trim() : '';
    if (!installationId || !code || !state) throw new BadRequestException('installationId, code and state are required.');

    let claims;
    try {
      claims = verifyIntegrationState(this.stateKey(), state, STATE_PURPOSE);
    } catch (error) {
      const expired = error instanceof InvalidStateError && error.reason === 'expired';
      throw new BadRequestException({
        code: expired ? 'GITHUB_STATE_EXPIRED' : 'GITHUB_STATE_INVALID',
        message: expired ? 'The GitHub installation took too long. Start it again.' : 'This GitHub installation link is not valid. Start it again.'
      });
    }
    if (claims.userId !== user.id) {
      throw new ForbiddenException({
        code: 'GITHUB_STATE_USER_MISMATCH',
        message: 'This GitHub installation was started by a different TraceIQ user. Start it again from Settings.'
      });
    }
    const role = await this.memberRole(claims.organizationId, user.id);
    if (!role) throw new NotFoundException('Organization not found or not accessible.');
    this.requireManager(role);

    let installation;
    try {
      const userToken = await this.github.exchangeUserCode(code);
      try {
        const allowed = await this.github.userCanAccessInstallation(userToken, installationId);
        if (!allowed) {
          throw new ForbiddenException({
            code: 'GITHUB_INSTALLATION_NOT_YOURS',
            message: 'Your GitHub account cannot access that installation. Install the app from your own account or organization.'
          });
        }
      } finally {
        void this.github.revokeUserToken(userToken);
      }
      installation = await this.github.getInstallation(installationId);
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      this.logger.warn(`GitHub install failed for organization ${claims.organizationId}: ${error instanceof Error ? error.name : 'unknown error'}`);
      if (error instanceof GitHubAuthError) {
        throw new BadRequestException({ code: 'GITHUB_CODE_INVALID', message: 'GitHub did not accept the sign-in. Try installing again.' });
      }
      throw toHttpError(error);
    }

    const saved = await this.database.transaction(async (client) => {
      const owner = await client.query<{ organizationId: string }>(
        `SELECT organization_id AS "organizationId" FROM github_installations WHERE installation_id = $1 FOR UPDATE`,
        [installationId]
      );
      if (owner.rows[0] && owner.rows[0].organizationId !== claims.organizationId) {
        throw new ConflictException({
          code: 'GITHUB_INSTALLATION_IN_USE',
          message: 'That GitHub installation is already connected to another TraceIQ organization.'
        });
      }
      // A different installation for this organization replaces the old one (and its repo links).
      await client.query(`DELETE FROM github_installations WHERE organization_id = $1 AND installation_id <> $2`, [claims.organizationId, installationId]);
      const result = await client.query<GitHubInstallationRow>(
        `INSERT INTO github_installations
           (id, organization_id, installation_id, account_login, account_type, repository_selection, status, installed_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (installation_id) DO UPDATE SET
           account_login = EXCLUDED.account_login,
           account_type = EXCLUDED.account_type,
           repository_selection = EXCLUDED.repository_selection,
           status = EXCLUDED.status,
           installed_by_user_id = EXCLUDED.installed_by_user_id,
           updated_at = now()
         RETURNING ${INSTALLATION_COLUMNS}`,
        [
          `ghi_${randomUUID().replace(/-/g, '')}`,
          claims.organizationId,
          installationId,
          installation.accountLogin,
          installation.accountType,
          installation.repositorySelection,
          installation.suspended ? 'suspended' : 'active',
          user.id
        ]
      );
      return result.rows[0];
    });

    return { connected: true, projectId: claims.projectId ?? null, installation: publicInstallation(saved) };
  }

  async getStatus(user: DashboardUser, scope: OrganizationScope) {
    const org = await this.resolveOrganization(user, scope);
    const project = await this.projects.resolveActiveProject(user, org.projectId, org.organizationId);
    const installation = await this.findInstallation(org.organizationId);
    const repo = project && installation ? await this.findProjectRepo(project.id) : null;
    const setupPullRequest = project && installation ? await this.findSetupPullRequest(project.id) : null;
    return {
      configured: this.github.isConfigured,
      organizationId: org.organizationId,
      canManage: MANAGE_ROLES.includes(org.role),
      project: project ? { id: project.id, name: project.name } : null,
      connected: Boolean(installation),
      installation: installation ? publicInstallation(installation) : null,
      projectRepo: repo,
      setupPullRequest
    };
  }

  /** Repositories the installation can see. */
  async listRepos(user: DashboardUser, scope: OrganizationScope): Promise<{ repos: GitHubRepo[] }> {
    const org = await this.resolveOrganization(user, scope);
    const installation = await this.requireActiveInstallation(org.organizationId);
    try {
      return { repos: await this.github.listRepos(Number(installation.installationId)) };
    } catch (error) {
      throw toHttpError(error);
    }
  }

  /** Links a repository (and optional app folder, for monorepos) to a project. */
  async linkProjectRepo(user: DashboardUser, projectId: string, body: { repoFullName?: unknown; subdirectory?: unknown }) {
    this.requireInteractive(user);
    const project = await this.projects.requireWritableProject(user, projectId);
    this.requireManager(project.role);
    if (!isRepoFullName(body?.repoFullName)) throw new BadRequestException('repoFullName must look like owner/name.');
    const subdirectory = normalizeSubdirectory(body?.subdirectory);
    if (subdirectory === null) throw new BadRequestException('subdirectory must be a folder inside the repository, like apps/web.');

    const installation = await this.requireActiveInstallation(project.organizationId);
    const installationId = Number(installation.installationId);
    let repo: GitHubRepo;
    try {
      // Through the installation token: only repositories the user granted the app are visible.
      repo = await this.github.getRepo(installationId, body.repoFullName);
      if (subdirectory && !(await this.github.isDirectory(installationId, repo.fullName, subdirectory, repo.defaultBranch))) {
        throw new BadRequestException(`There is no folder "${subdirectory}" on ${repo.defaultBranch}.`);
      }
    } catch (error) {
      throw toHttpError(error);
    }

    const saved = await this.database.query<GitHubProjectRepo>(
      `INSERT INTO github_project_repos
         (project_id, installation_id, repo_id, repo_full_name, default_branch, app_subdirectory, linked_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (project_id) DO UPDATE SET
         installation_id = EXCLUDED.installation_id,
         repo_id = EXCLUDED.repo_id,
         repo_full_name = EXCLUDED.repo_full_name,
         default_branch = EXCLUDED.default_branch,
         app_subdirectory = EXCLUDED.app_subdirectory,
         linked_by_user_id = EXCLUDED.linked_by_user_id,
         updated_at = now()
       RETURNING ${PROJECT_REPO_COLUMNS}`,
      [project.id, installationId, repo.id, repo.fullName, repo.defaultBranch, subdirectory, user.id]
    );
    return { projectRepo: saved.rows[0] };
  }

  /** Uninstalls the app from GitHub (best effort) and forgets the installation and repo links. */
  async disconnect(user: DashboardUser, scope: OrganizationScope) {
    this.requireInteractive(user);
    const org = await this.resolveOrganization(user, scope);
    this.requireManager(org.role);
    const installation = await this.findInstallation(org.organizationId);
    if (!installation) return { disconnected: false, uninstalled: false };
    const installationId = Number(installation.installationId);
    const uninstalled = this.github.isConfigured ? await this.github.deleteInstallation(installationId) : false;
    this.github.forgetInstallation(installationId);
    // Repo links go with it (ON DELETE CASCADE).
    await this.database.query(`DELETE FROM github_installations WHERE organization_id = $1`, [org.organizationId]);
    return { disconnected: true, uninstalled };
  }

  async findInstallation(organizationId: string): Promise<GitHubInstallationRow | null> {
    const result = await this.database.query<GitHubInstallationRow>(
      `SELECT ${INSTALLATION_COLUMNS} FROM github_installations WHERE organization_id = $1`,
      [organizationId]
    );
    return result.rows[0] ?? null;
  }

  async requireActiveInstallation(organizationId: string): Promise<GitHubInstallationRow> {
    const installation = await this.findInstallation(organizationId);
    if (!installation) throw new NotFoundException({ code: 'GITHUB_NOT_CONNECTED', message: 'The TraceIQ GitHub App is not installed for this organization.' });
    if (installation.status !== 'active') {
      throw new ConflictException({ code: 'GITHUB_SUSPENDED', message: 'The TraceIQ GitHub App is suspended on GitHub. Unsuspend it to continue.' });
    }
    return installation;
  }

  async findProjectRepo(projectId: string): Promise<GitHubProjectRepo | null> {
    const result = await this.database.query<GitHubProjectRepo>(
      `SELECT ${PROJECT_REPO_COLUMNS} FROM github_project_repos WHERE project_id = $1`,
      [projectId]
    );
    return result.rows[0] ?? null;
  }

  async findSetupPullRequest(projectId: string): Promise<GitHubSetupPullRequest | null> {
    const result = await this.database.query<GitHubSetupPullRequest>(
      `SELECT repo_full_name AS "repoFullName", branch, pr_number AS "number", url, framework_label AS "frameworkLabel", created_at AS "createdAt"
       FROM github_setup_pull_requests WHERE project_id = $1`,
      [projectId]
    );
    return result.rows[0] ?? null;
  }

  /** Owner/admin with an active installation (no repository needed yet), for the paste-a-URL shortcut. */
  async requireLinkedInstallation(user: DashboardUser, projectId: string) {
    this.requireInteractive(user);
    const project = await this.projects.requireWritableProject(user, projectId);
    this.requireManager(project.role);
    return publicInstallation(await this.requireActiveInstallation(project.organizationId));
  }

  /** For any project member (reads only): the active installation and linked repository, if any. */
  async projectRepoForMember(user: DashboardUser, projectId: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const installation = await this.findInstallation(project.organizationId);
    const link = installation?.status === 'active' ? await this.findProjectRepo(project.id) : null;
    return { project, installation: installation?.status === 'active' ? installation : null, link };
  }

  /** Owner/admin and an active installation with a linked repository, for setup PRs. */
  async requireLinkedProject(user: DashboardUser, projectId: string) {
    this.requireInteractive(user);
    const project = await this.projects.requireWritableProject(user, projectId);
    this.requireManager(project.role);
    const installation = await this.requireActiveInstallation(project.organizationId);
    const link = await this.findProjectRepo(project.id);
    if (!link) {
      throw new ConflictException({ code: 'GITHUB_REPO_NOT_LINKED', message: 'Choose this project’s GitHub repository first.' });
    }
    return { project, installation, link };
  }

  /** Project and return page from a valid state, used only to build the return URL. */
  private peekState(state?: string): { projectId?: string; returnTo?: string } {
    if (!state || !this.github.isConfigured) return {};
    try {
      const claims = verifyIntegrationState(this.stateKey(), state, STATE_PURPOSE);
      return { projectId: claims.projectId, returnTo: claims.returnTo };
    } catch {
      return {};
    }
  }

  private async resolveOrganization(user: DashboardUser, scope: OrganizationScope) {
    const projectId = scope.projectId?.trim() || undefined;
    const organizationId = scope.organizationId?.trim() || undefined;
    if (projectId) {
      const project = await this.projects.requireActiveProject(user, projectId);
      if (organizationId && project.organizationId !== organizationId) throw new NotFoundException('Project not found or not accessible.');
      return { organizationId: project.organizationId, role: project.role, projectId: project.id };
    }
    const result = await this.database.query<{ organizationId: string; role: string }>(
      `SELECT o.id AS "organizationId", om.role
       FROM organization_members om
       JOIN organizations o ON o.id = om.organization_id
       WHERE om.user_id = $1
         AND ($2::text IS NULL OR o.id = $2)
         AND NOT EXISTS (
           SELECT 1 FROM account_lifecycle_requests r
           WHERE r.target_type = 'organization' AND r.target_id = o.id AND r.status = 'pending'
         )
       ORDER BY o.created_at ASC
       LIMIT 1`,
      [user.id, organizationId ?? null]
    );
    const org = result.rows[0];
    if (!org) throw new NotFoundException('Organization not found or not accessible.');
    return { ...org, projectId: undefined as string | undefined };
  }

  private async memberRole(organizationId: string, userId: string): Promise<string | null> {
    const result = await this.database.query<{ role: string }>(
      `SELECT om.role FROM organization_members om
       WHERE om.organization_id = $1 AND om.user_id = $2
         AND NOT EXISTS (
           SELECT 1 FROM account_lifecycle_requests r
           WHERE r.target_type = 'organization' AND r.target_id = om.organization_id AND r.status = 'pending'
         )`,
      [organizationId, userId]
    );
    return result.rows[0]?.role ?? null;
  }

  private requireManager(role: string) {
    if (!MANAGE_ROLES.includes(role)) throw new ForbiddenException('Only owners and admins can manage the GitHub integration.');
  }

  private requireInteractive(user: DashboardUser) {
    if (user.authMethod === 'pat') throw new ForbiddenException('Personal access tokens cannot manage integrations.');
  }

  private requireConfigured() {
    if (!this.github.isConfigured) throw new ServiceUnavailableException('The GitHub App is not set up on this TraceIQ server.');
  }

  private stateKey() {
    return deriveStateKey(this.github.stateSecret, STATE_PURPOSE);
  }
}

function publicInstallation(row: GitHubInstallationRow) {
  return {
    installationId: row.installationId,
    accountLogin: row.accountLogin,
    accountType: row.accountType,
    repositorySelection: row.repositorySelection,
    status: row.status,
    connectedAt: row.createdAt,
    manageUrl:
      row.accountType === 'Organization'
        ? `https://github.com/organizations/${encodeURIComponent(row.accountLogin)}/settings/installations/${row.installationId}`
        : `https://github.com/settings/installations/${row.installationId}`
  };
}
