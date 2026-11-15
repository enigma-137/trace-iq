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
import { TokenCipher } from '../common/token-cipher';
import {
  LinearApiError,
  LinearAuthError,
  LinearClient,
  LinearConnectionRecord,
  LinearLabel,
  LinearTeam
} from './linear.client';

const STATE_PURPOSE = 'linear-connect';
const MANAGE_ROLES = ['owner', 'admin'];

export type LinearConnectionRow = LinearConnectionRecord & {
  workspaceId: string;
  workspaceName: string | null;
  workspaceUrlKey: string | null;
  scopes: string[];
  connectedByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type LinearProjectSettings = {
  projectId: string;
  workspaceId: string;
  teamId: string;
  teamName: string | null;
  teamKey: string | null;
  labelId: string | null;
  labelName: string | null;
  autoCreate: boolean;
  autoCreateMinOccurrences: number | null;
  autoCreateMinUsers: number | null;
  updatedAt: string;
};

export interface AutoCreateInput {
  enabled?: unknown;
  minOccurrences?: unknown;
  minUsers?: unknown;
}

/** Highest threshold accepted; anything above is a typo rather than a real rule. */
export const MAX_AUTO_CREATE_THRESHOLD = 1_000_000;

export interface OrganizationScope {
  organizationId?: string;
  projectId?: string;
}

interface ResolvedOrganization {
  organizationId: string;
  role: string;
  projectId?: string;
}

const CONNECTION_COLUMNS = `
  id,
  organization_id AS "organizationId",
  access_token_encrypted AS "accessTokenEncrypted",
  refresh_token_encrypted AS "refreshTokenEncrypted",
  token_expires_at AS "tokenExpiresAt",
  scopes,
  workspace_id AS "workspaceId",
  workspace_name AS "workspaceName",
  workspace_url_key AS "workspaceUrlKey",
  status,
  connected_by_user_id AS "connectedByUserId",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

const SETTINGS_COLUMNS = `
  s.project_id AS "projectId",
  s.workspace_id AS "workspaceId",
  s.team_id AS "teamId",
  s.team_name AS "teamName",
  s.team_key AS "teamKey",
  s.label_id AS "labelId",
  s.label_name AS "labelName",
  s.auto_create_linear_issues AS "autoCreate",
  s.auto_create_min_occurrences AS "autoCreateMinOccurrences",
  s.auto_create_min_users AS "autoCreateMinUsers",
  s.updated_at AS "updatedAt"
`;

export const dashboardUrl = () => (process.env.DASHBOARD_URL ?? 'https://traceiq.run').replace(/\/+$/, '');

export const SETTINGS_PATH = '/dashboard/settings/integrations';

/** A URL on the dashboard's integrations settings page with the given query. */
export function settingsReturnUrl(params: Record<string, string | undefined>): string {
  const url = new URL(`${dashboardUrl()}${SETTINGS_PATH}`);
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
  return url.toString();
}

@Injectable()
export class LinearService {
  private readonly logger = new Logger(LinearService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService,
    private readonly linear: LinearClient,
    private readonly cipher: TokenCipher
  ) {}

  /** Step 1: the Linear authorize URL, carrying a signed state for this org and person. */
  async createConnectUrl(user: DashboardUser, scope: OrganizationScope) {
    this.requireInteractive(user);
    this.requireConfigured();
    this.cipher.assertConfigured();
    const org = await this.resolveOrganization(user, scope);
    this.requireManager(org.role);

    const state = signIntegrationState(this.stateKey(), {
      purpose: STATE_PURPOSE,
      organizationId: org.organizationId,
      userId: user.id,
      ...(org.projectId ? { projectId: org.projectId } : {})
    });
    return {
      url: this.linear.authorizeUrl(state),
      expiresAt: new Date(Date.now() + DEFAULT_STATE_TTL_SECONDS * 1000).toISOString()
    };
  }

  /**
   * Step 2: Linear sends the browser back to the API. Nothing is exchanged here: the
   * callback has no session, so it cannot know who is in the browser. It checks the
   * state's signature and forwards the code to the dashboard, which finishes with the
   * signed-in session ({@link completeConnect}). Never throws.
   */
  forwardCallback(params: { code?: string; state?: string; error?: string }): string {
    const fail = (reason: string, projectId?: string) => settingsReturnUrl({ linear: 'error', reason, projectId });
    if (!this.linear.isConfigured) return fail('not_configured');
    if (!params.state) return fail('invalid_state');

    let claims;
    try {
      claims = verifyIntegrationState(this.stateKey(), params.state, STATE_PURPOSE);
    } catch (error) {
      return fail(error instanceof InvalidStateError && error.reason === 'expired' ? 'expired' : 'invalid_state');
    }
    if (params.error) return fail(params.error === 'access_denied' ? 'cancelled' : 'linear_error', claims.projectId);
    if (!params.code) return fail('missing_code', claims.projectId);
    return settingsReturnUrl({ linear: 'complete', linear_code: params.code, linear_state: params.state, projectId: claims.projectId });
  }

  /**
   * Step 3: the dashboard posts the forwarded code with the signed-in session. The
   * person finishing must be the person who started (the user in the signed state),
   * so a connect link sent to someone else cannot attach their Linear workspace to
   * the sender's organization. Membership and role are checked again here.
   */
  async completeConnect(user: DashboardUser, body: { code?: unknown; state?: unknown }) {
    this.requireInteractive(user);
    this.requireConfigured();
    this.cipher.assertConfigured();
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    const state = typeof body?.state === 'string' ? body.state.trim() : '';
    if (!code || !state) throw new BadRequestException('code and state are required.');

    let claims;
    try {
      claims = verifyIntegrationState(this.stateKey(), state, STATE_PURPOSE);
    } catch (error) {
      const expired = error instanceof InvalidStateError && error.reason === 'expired';
      throw new BadRequestException({
        code: expired ? 'LINEAR_STATE_EXPIRED' : 'LINEAR_STATE_INVALID',
        message: expired ? 'The Linear connection took too long. Start it again.' : 'This Linear connection link is not valid. Start it again.'
      });
    }
    if (claims.userId !== user.id) {
      throw new ForbiddenException({
        code: 'LINEAR_STATE_USER_MISMATCH',
        message: 'This Linear connection was started by a different TraceIQ user. Start it again from Settings.'
      });
    }
    // The person may have lost access between starting and finishing.
    const role = await this.memberRole(claims.organizationId, user.id);
    if (!role) throw new NotFoundException('Organization not found or not accessible.');
    this.requireManager(role);

    let tokens;
    let workspace;
    try {
      tokens = await this.linear.exchangeCode(code);
      workspace = await this.linear.fetchWorkspace(tokens.accessToken);
    } catch (error) {
      // Log the failure class only; never the code, state or any token.
      this.logger.warn(`Linear connect failed for organization ${claims.organizationId}: ${describeError(error)}`);
      if (error instanceof LinearAuthError) {
        throw new BadRequestException({ code: 'LINEAR_CODE_INVALID', message: 'Linear did not accept the sign-in. Try connecting again.' });
      }
      throw toHttpError(error);
    }

    await this.database.transaction(async (client) => {
      const previous = await client.query<{ workspaceId: string }>(
        `SELECT workspace_id AS "workspaceId" FROM linear_connections WHERE organization_id = $1 FOR UPDATE`,
        [claims.organizationId]
      );
      await client.query(
        `INSERT INTO linear_connections
           (id, organization_id, access_token_encrypted, refresh_token_encrypted, token_expires_at, scopes,
            workspace_id, workspace_name, workspace_url_key, status, connected_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10)
         ON CONFLICT (organization_id) DO UPDATE SET
           access_token_encrypted = EXCLUDED.access_token_encrypted,
           refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
           token_expires_at = EXCLUDED.token_expires_at,
           scopes = EXCLUDED.scopes,
           workspace_id = EXCLUDED.workspace_id,
           workspace_name = EXCLUDED.workspace_name,
           workspace_url_key = EXCLUDED.workspace_url_key,
           status = 'active',
           connected_by_user_id = EXCLUDED.connected_by_user_id,
           updated_at = now()`,
        [
          `lin_${randomUUID().replace(/-/g, '')}`,
          claims.organizationId,
          this.cipher.encrypt(tokens.accessToken),
          tokens.refreshToken ? this.cipher.encrypt(tokens.refreshToken) : null,
          tokens.expiresAt,
          tokens.scopes,
          workspace.id,
          workspace.name,
          workspace.urlKey,
          user.id
        ]
      );
      // Team and label ids belong to a workspace; drop ones from a different workspace.
      const previousWorkspace = previous.rows[0]?.workspaceId;
      if (previousWorkspace && previousWorkspace !== workspace.id) {
        await client.query(
          `DELETE FROM linear_project_settings
           WHERE project_id IN (SELECT id FROM projects WHERE organization_id = $1)`,
          [claims.organizationId]
        );
      }
    });

    return {
      connected: true,
      organizationId: claims.organizationId,
      projectId: claims.projectId ?? null,
      workspace: { id: workspace.id, name: workspace.name, urlKey: workspace.urlKey }
    };
  }

  /** Connection status for the organization, plus its teams when the connection works. */
  async getStatus(user: DashboardUser, scope: OrganizationScope) {
    const org = await this.resolveOrganization(user, scope);
    // The project whose defaults the settings card edits: the requested one, else the active one.
    const project = await this.projects.resolveActiveProject(user, org.projectId, org.organizationId);
    const base = {
      configured: this.linear.isConfigured,
      organizationId: org.organizationId,
      canManage: MANAGE_ROLES.includes(org.role),
      project: project ? { id: project.id, name: project.name } : null
    };
    const connection = await this.findConnection(org.organizationId);
    if (!connection) return { ...base, connected: false as const, status: 'not_connected' as const };

    let teams: LinearTeam[] = [];
    let error: string | null = null;
    if (connection.status === 'active') {
      try {
        teams = await this.linear.listTeams(connection);
      } catch (cause) {
        if (!(cause instanceof LinearAuthError)) error = cause instanceof LinearApiError ? cause.message : 'Could not load Linear teams.';
      }
    }

    const settings = await this.database.query<LinearProjectSettings>(
      `SELECT ${SETTINGS_COLUMNS}
       FROM linear_project_settings s
       JOIN projects p ON p.id = s.project_id
       WHERE p.organization_id = $1 AND s.workspace_id = $2
       ORDER BY p.created_at`,
      [org.organizationId, connection.workspaceId]
    );

    return {
      ...base,
      connected: true as const,
      // `connection.status` is updated in place if listing teams hit a 401.
      status: connection.status,
      workspace: { id: connection.workspaceId, name: connection.workspaceName, urlKey: connection.workspaceUrlKey },
      connectedAt: connection.createdAt,
      connectedByUserId: connection.connectedByUserId,
      teams,
      projects: settings.rows,
      error
    };
  }

  /** Labels a project could apply in `teamId`, for the settings picker. */
  async listLabels(user: DashboardUser, teamId: string, scope: OrganizationScope): Promise<{ labels: LinearLabel[] }> {
    if (!teamId?.trim()) throw new BadRequestException('teamId is required.');
    const org = await this.resolveOrganization(user, scope);
    const connection = await this.requireActiveConnection(org.organizationId);
    return { labels: await this.callLinear(() => this.linear.listLabels(connection, teamId.trim())) };
  }

  /** Disconnects the organization: revokes the token with Linear (best effort) and forgets it. */
  async disconnect(user: DashboardUser, scope: OrganizationScope) {
    this.requireInteractive(user);
    const org = await this.resolveOrganization(user, scope);
    this.requireManager(org.role);

    const connection = await this.findConnection(org.organizationId);
    if (!connection) return { disconnected: false, revoked: false };

    let revoked = false;
    try {
      revoked = await this.linear.revoke(this.cipher.decrypt(connection.accessTokenEncrypted));
    } catch (error) {
      // An undecryptable token (rotated key) cannot be revoked; still forget it locally.
      this.logger.warn(`Linear token could not be decrypted for revoke: ${describeError(error)}`);
    }

    await this.database.transaction(async (client) => {
      await client.query(
        `DELETE FROM linear_project_settings WHERE project_id IN (SELECT id FROM projects WHERE organization_id = $1)`,
        [org.organizationId]
      );
      await client.query(`DELETE FROM linear_connections WHERE organization_id = $1`, [org.organizationId]);
    });
    return { disconnected: true, revoked };
  }

  /** Saves the project's default team (and optional label) for new Linear issues. */
  /**
   * Saves the project's default team, optional label and, when `autoCreate` is sent,
   * the auto-create rule. Omitting `autoCreate` keeps the current rule.
   */
  async saveProjectSettings(user: DashboardUser, projectId: string, body: { teamId?: unknown; labelId?: unknown; autoCreate?: unknown }) {
    this.requireInteractive(user);
    const project = await this.projects.requireWritableProject(user, projectId);
    this.requireManager(project.role);

    const teamId = typeof body?.teamId === 'string' ? body.teamId.trim() : '';
    if (!teamId) throw new BadRequestException('teamId is required.');
    const labelId = body?.labelId === null || body?.labelId === undefined || body?.labelId === ''
      ? null
      : typeof body.labelId === 'string' ? body.labelId.trim() : undefined;
    if (labelId === undefined) throw new BadRequestException('labelId must be a string or null.');
    const autoCreate = body?.autoCreate === undefined ? null : parseAutoCreate(body.autoCreate);

    const connection = await this.requireActiveConnection(project.organizationId);
    // Validate against Linear so the project never stores an id from another workspace.
    const teams = await this.callLinear(() => this.linear.listTeams(connection));
    const team = teams.find((candidate) => candidate.id === teamId);
    if (!team) throw new BadRequestException('That team is not in the connected Linear workspace.');

    let label: LinearLabel | undefined;
    if (labelId) {
      const labels = await this.callLinear(() => this.linear.listLabels(connection, team.id));
      label = labels.find((candidate) => candidate.id === labelId);
      if (!label) throw new BadRequestException('That label is not available for this team.');
    }

    const saved = await this.database.query<LinearProjectSettings>(
      `INSERT INTO linear_project_settings AS s
         (project_id, workspace_id, team_id, team_name, team_key, label_id, label_name, updated_by_user_id,
          auto_create_linear_issues, auto_create_min_occurrences, auto_create_min_users)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($10::boolean, false), $11, $12)
       ON CONFLICT (project_id) DO UPDATE SET
         workspace_id = EXCLUDED.workspace_id,
         team_id = EXCLUDED.team_id,
         team_name = EXCLUDED.team_name,
         team_key = EXCLUDED.team_key,
         label_id = EXCLUDED.label_id,
         label_name = EXCLUDED.label_name,
         updated_by_user_id = EXCLUDED.updated_by_user_id,
         -- $9: whether this request set the auto-create rule.
         auto_create_linear_issues = CASE WHEN $9 THEN EXCLUDED.auto_create_linear_issues ELSE s.auto_create_linear_issues END,
         auto_create_min_occurrences = CASE WHEN $9 THEN EXCLUDED.auto_create_min_occurrences ELSE s.auto_create_min_occurrences END,
         auto_create_min_users = CASE WHEN $9 THEN EXCLUDED.auto_create_min_users ELSE s.auto_create_min_users END,
         updated_at = now()
       RETURNING ${SETTINGS_COLUMNS}`,
      [
        project.id, connection.workspaceId, team.id, team.name, team.key, label?.id ?? null, label?.name ?? null, user.id,
        autoCreate !== null, autoCreate?.enabled ?? null, autoCreate?.minOccurrences ?? null, autoCreate?.minUsers ?? null
      ]
    );
    return { settings: saved.rows[0] };
  }

  /** Active connection for an organization, for other modules (e.g. creating issues). */
  async requireActiveConnection(organizationId: string): Promise<LinearConnectionRow> {
    const connection = await this.findConnection(organizationId);
    if (!connection) throw new NotFoundException({ code: 'LINEAR_NOT_CONNECTED', message: 'Linear is not connected for this organization.' });
    if (connection.status !== 'active') {
      throw new ConflictException({ code: 'LINEAR_NEEDS_RECONNECT', message: 'Linear needs to be reconnected in Settings.' });
    }
    return connection;
  }

  async findConnection(organizationId: string): Promise<LinearConnectionRow | null> {
    const result = await this.database.query<LinearConnectionRow>(
      `SELECT ${CONNECTION_COLUMNS} FROM linear_connections WHERE organization_id = $1`,
      [organizationId]
    );
    return result.rows[0] ?? null;
  }

  /** Maps Linear failures onto HTTP errors with codes the dashboard can act on. */
  private async callLinear<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (error) {
      throw toHttpError(error);
    }
  }

  private async resolveOrganization(user: DashboardUser, scope: OrganizationScope): Promise<ResolvedOrganization> {
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
    return org;
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
    if (!MANAGE_ROLES.includes(role)) throw new ForbiddenException('Only owners and admins can manage the Linear integration.');
  }

  /** Connecting a third-party account is a signed-in action, never a personal access token. */
  private requireInteractive(user: DashboardUser) {
    if (user.authMethod === 'pat') throw new ForbiddenException('Personal access tokens cannot manage integrations.');
  }

  private requireConfigured() {
    if (!this.linear.isConfigured) throw new ServiceUnavailableException('Linear is not set up on this TraceIQ server.');
  }

  private stateKey() {
    return deriveStateKey(this.linear.stateSecret, STATE_PURPOSE);
  }
}

/** Validates the auto-create rule: off, or on with at least one positive whole-number threshold. */
export function parseAutoCreate(value: unknown): { enabled: boolean; minOccurrences: number | null; minUsers: number | null } {
  if (!value || typeof value !== 'object') throw new BadRequestException('autoCreate must be an object.');
  const input = value as AutoCreateInput;
  if (typeof input.enabled !== 'boolean') throw new BadRequestException('autoCreate.enabled must be true or false.');
  const threshold = (raw: unknown, name: string) => {
    if (raw === undefined || raw === null || raw === '') return null;
    const parsed = typeof raw === 'string' ? Number(raw) : raw;
    if (typeof parsed !== 'number' || !Number.isInteger(parsed) || parsed < 1 || parsed > MAX_AUTO_CREATE_THRESHOLD) {
      throw new BadRequestException(`autoCreate.${name} must be a whole number from 1 to ${MAX_AUTO_CREATE_THRESHOLD.toLocaleString('en-US')}.`);
    }
    return parsed;
  };
  const minOccurrences = threshold(input.minOccurrences, 'minOccurrences');
  const minUsers = threshold(input.minUsers, 'minUsers');
  if (input.enabled && minOccurrences === null && minUsers === null) {
    throw new BadRequestException('Set an occurrences or affected users threshold to turn on auto-create.');
  }
  return { enabled: input.enabled, minOccurrences, minUsers };
}

/**
 * Linear failures as HTTP errors with codes the dashboard acts on:
 * LINEAR_NEEDS_RECONNECT (409) and LINEAR_ERROR (502). Anything else passes through.
 */
export function toHttpError(error: unknown): unknown {
  if (error instanceof LinearAuthError) {
    return new ConflictException({ code: 'LINEAR_NEEDS_RECONNECT', message: 'Linear needs to be reconnected in Settings.' });
  }
  if (error instanceof LinearApiError) return new BadGatewayException({ code: 'LINEAR_ERROR', message: error.message });
  return error;
}

export function describeError(error: unknown): string {
  if (error instanceof LinearApiError) return `${error.name}${error.status ? ` (${error.status})` : ''}`;
  if (error instanceof Error) return error.name;
  return 'unknown error';
}
