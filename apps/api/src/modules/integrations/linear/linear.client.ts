import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { TokenCipher } from '../common/token-cipher';

export const LINEAR_AUTHORIZE_URL = 'https://linear.app/oauth/authorize';
export const LINEAR_TOKEN_URL = 'https://api.linear.app/oauth/token';
export const LINEAR_REVOKE_URL = 'https://api.linear.app/oauth/revoke';
export const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';
/** Never `admin`: TraceIQ only reads teams/labels and creates issues. */
export const LINEAR_SCOPES = ['read', 'write', 'issues:create'] as const;

const DEFAULT_REDIRECT = 'https://api.traceiq.run/v1/integrations/linear/callback';
const TIMEOUT_MS = 10_000;
/** Refresh a little before Linear's expiry so a request never races it. */
const REFRESH_MARGIN_MS = 60_000;

export interface LinearTokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string[];
}

export interface LinearWorkspace {
  id: string;
  name: string;
  urlKey: string | null;
}

export interface LinearTeam {
  id: string;
  name: string;
  key: string;
}

export interface LinearLabel {
  id: string;
  name: string;
  color: string | null;
  /** Null for workspace-wide labels. */
  teamId: string | null;
}

export interface LinearIssueRef {
  id: string;
  identifier: string;
  url: string;
}

export interface CreateLinearIssueInput {
  teamId: string;
  title: string;
  description?: string;
  labelIds?: string[];
}

/** What the client needs from a `linear_connections` row. */
export type LinearConnectionRecord = {
  id: string;
  organizationId: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string | null;
  tokenExpiresAt: string | Date | null;
  status: 'active' | 'needs_reconnect';
};

/** Linear rejected the credentials. The connection has been marked "needs reconnect". */
export class LinearAuthError extends Error {
  readonly name = 'LinearAuthError';

  constructor(message = 'Linear rejected the connection. Reconnect Linear in Settings.') {
    super(message);
  }
}

/** Any other Linear failure (network, rate limit, validation). Message is safe to show. */
export class LinearApiError extends Error {
  readonly name = 'LinearApiError';

  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

interface GraphQLError {
  message?: string;
  extensions?: { code?: string; type?: string; userPresentableMessage?: string };
}

/**
 * Thin wrapper over Linear's OAuth endpoints and GraphQL API. Configured by
 * LINEAR_CLIENT_ID / LINEAR_CLIENT_SECRET (and optionally LINEAR_REDIRECT_URL).
 * Tokens are only ever held in memory for the length of a request.
 */
@Injectable()
export class LinearClient {
  private readonly logger = new Logger(LinearClient.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly cipher: TokenCipher
  ) {}

  get clientId(): string {
    return (process.env.LINEAR_CLIENT_ID ?? '').trim();
  }

  private get clientSecret(): string {
    return (process.env.LINEAR_CLIENT_SECRET ?? '').trim();
  }

  /** Root secret for signing the OAuth `state`. Only meaningful when configured. */
  get stateSecret(): string {
    return this.clientSecret;
  }

  get redirectUri(): string {
    const explicit = (process.env.LINEAR_REDIRECT_URL ?? '').trim();
    if (explicit) return explicit;
    const api = (process.env.TRACEIQ_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');
    return api ? `${api}/v1/integrations/linear/callback` : DEFAULT_REDIRECT;
  }

  get isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: LINEAR_SCOPES.join(','),
      state,
      // Issues and comments are authored by the TraceIQ app, not the person who connected.
      actor: 'app',
      prompt: 'consent'
    });
    return `${LINEAR_AUTHORIZE_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<LinearTokenSet> {
    return this.tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      client_id: this.clientId,
      client_secret: this.clientSecret
    });
  }

  async refresh(refreshToken: string): Promise<LinearTokenSet> {
    return this.tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret
    });
  }

  /** Best effort: true when Linear confirmed the revoke. Never throws. */
  async revoke(accessToken: string): Promise<boolean> {
    try {
      const response = await fetch(LINEAR_REVOKE_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: accessToken, token_type_hint: 'access_token' }),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      // 400/401 means the token is already gone, which is the outcome we want.
      return response.ok || response.status === 400 || response.status === 401;
    } catch (error) {
      this.logger.warn(`Linear token revoke failed: ${error instanceof Error ? error.name : 'unknown error'}`);
      return false;
    }
  }

  /** The workspace a freshly issued token belongs to. Used once, at connect time. */
  async fetchWorkspace(accessToken: string): Promise<LinearWorkspace> {
    const data = await this.graphql<{ organization: { id: string; name: string; urlKey?: string | null } }>(
      accessToken,
      'query TraceIQWorkspace { organization { id name urlKey } }'
    );
    if (!data.organization?.id) throw new LinearApiError('Linear did not return a workspace.');
    return { id: data.organization.id, name: data.organization.name, urlKey: data.organization.urlKey ?? null };
  }

  async listTeams(connection: LinearConnectionRecord): Promise<LinearTeam[]> {
    const data = await this.withConnection(connection, (token) =>
      this.graphql<{ teams: { nodes: LinearTeam[] } }>(
        token,
        'query TraceIQTeams { teams(first: 250) { nodes { id name key } } }'
      )
    );
    return (data.teams?.nodes ?? []).map((team) => ({ id: team.id, name: team.name, key: team.key }));
  }

  /** Labels usable on issues in `teamId`: the team's own plus workspace-wide labels. */
  async listLabels(connection: LinearConnectionRecord, teamId: string): Promise<LinearLabel[]> {
    const data = await this.withConnection(connection, (token) =>
      this.graphql<{ issueLabels: { nodes: Array<{ id: string; name: string; color?: string | null; team?: { id: string } | null }> } }>(
        token,
        `query TraceIQLabels($teamId: ID!) {
          issueLabels(first: 250, filter: { or: [{ team: { id: { eq: $teamId } } }, { team: { null: true } }] }) {
            nodes { id name color team { id } }
          }
        }`,
        { teamId }
      )
    );
    return (data.issueLabels?.nodes ?? []).map((label) => ({
      id: label.id,
      name: label.name,
      color: label.color ?? null,
      teamId: label.team?.id ?? null
    }));
  }

  async createIssue(connection: LinearConnectionRecord, input: CreateLinearIssueInput): Promise<LinearIssueRef> {
    const data = await this.withConnection(connection, (token) =>
      this.graphql<{ issueCreate: { success: boolean; issue: LinearIssueRef | null } }>(
        token,
        `mutation TraceIQIssueCreate($input: IssueCreateInput!) {
          issueCreate(input: $input) { success issue { id identifier url } }
        }`,
        {
          input: {
            teamId: input.teamId,
            title: input.title,
            ...(input.description ? { description: input.description } : {}),
            ...(input.labelIds?.length ? { labelIds: input.labelIds } : {})
          }
        }
      )
    );
    if (!data.issueCreate?.success || !data.issueCreate.issue) throw new LinearApiError('Linear did not create the issue.');
    return data.issueCreate.issue;
  }

  /**
   * Runs `request` with the connection's decrypted token, refreshing it first when it
   * is about to expire. When Linear rejects the token (and a refresh cannot fix it),
   * the connection is marked `needs_reconnect` and a {@link LinearAuthError} is thrown.
   */
  async withConnection<T>(connection: LinearConnectionRecord, request: (accessToken: string) => Promise<T>): Promise<T> {
    if (connection.status === 'needs_reconnect') throw new LinearAuthError();

    let accessToken = this.cipher.decrypt(connection.accessTokenEncrypted);
    const expiresAt = connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt).getTime() : null;
    if (expiresAt !== null && expiresAt - REFRESH_MARGIN_MS <= Date.now() && connection.refreshTokenEncrypted) {
      accessToken = await this.refreshConnection(connection);
    }

    try {
      return await request(accessToken);
    } catch (error) {
      if (!(error instanceof LinearAuthError)) throw error;
      // One retry with a fresh token when we have a refresh token; otherwise give up.
      if (connection.refreshTokenEncrypted) {
        const refreshed = await this.refreshConnection(connection);
        try {
          return await request(refreshed);
        } catch (retryError) {
          if (retryError instanceof LinearAuthError) await this.markNeedsReconnect(connection);
          throw retryError;
        }
      }
      await this.markNeedsReconnect(connection);
      throw error;
    }
  }

  async markNeedsReconnect(connection: Pick<LinearConnectionRecord, 'id'> & Partial<LinearConnectionRecord>): Promise<void> {
    if (connection.status) connection.status = 'needs_reconnect';
    await this.database.query(
      `UPDATE linear_connections SET status = 'needs_reconnect', updated_at = now() WHERE id = $1`,
      [connection.id]
    );
  }

  private async refreshConnection(connection: LinearConnectionRecord): Promise<string> {
    let tokens: LinearTokenSet;
    try {
      tokens = await this.refresh(this.cipher.decrypt(connection.refreshTokenEncrypted!));
    } catch (error) {
      if (error instanceof LinearAuthError) await this.markNeedsReconnect(connection);
      throw error;
    }
    const accessTokenEncrypted = this.cipher.encrypt(tokens.accessToken);
    // Linear rotates refresh tokens; keep the old one only if no new one was issued.
    const refreshTokenEncrypted = tokens.refreshToken ? this.cipher.encrypt(tokens.refreshToken) : connection.refreshTokenEncrypted;
    await this.database.query(
      `UPDATE linear_connections
       SET access_token_encrypted = $2, refresh_token_encrypted = $3, token_expires_at = $4, status = 'active', updated_at = now()
       WHERE id = $1`,
      [connection.id, accessTokenEncrypted, refreshTokenEncrypted, tokens.expiresAt]
    );
    connection.accessTokenEncrypted = accessTokenEncrypted;
    connection.refreshTokenEncrypted = refreshTokenEncrypted;
    connection.tokenExpiresAt = tokens.expiresAt;
    return tokens.accessToken;
  }

  private async tokenRequest(form: Record<string, string>): Promise<LinearTokenSet> {
    let response: Response;
    try {
      response = await fetch(LINEAR_TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(form),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch {
      throw new LinearApiError('Could not reach Linear. Try again.');
    }
    const body = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string | string[];
      error?: string;
    };
    if (!response.ok || !body.access_token) {
      // invalid_grant: the code or refresh token is used, expired or revoked.
      if (body.error === 'invalid_grant' || response.status === 401) throw new LinearAuthError();
      throw new LinearApiError(`Linear token request failed (${body.error ?? response.status}).`, response.status);
    }
    const scopes = Array.isArray(body.scope) ? body.scope : (body.scope ?? '').split(/[\s,]+/).filter(Boolean);
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      expiresAt: typeof body.expires_in === 'number' ? new Date(Date.now() + body.expires_in * 1000).toISOString() : null,
      scopes
    };
  }

  private async graphql<T>(accessToken: string, query: string, variables?: Record<string, unknown>): Promise<T> {
    let response: Response;
    try {
      response = await fetch(LINEAR_GRAPHQL_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ query, variables: variables ?? {} }),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch {
      throw new LinearApiError('Could not reach Linear. Try again.');
    }
    const body = (await response.json().catch(() => ({}))) as { data?: T; errors?: GraphQLError[] };
    const errors = body.errors ?? [];
    const authFailed =
      response.status === 401 ||
      errors.some((e) => e.extensions?.code === 'AUTHENTICATION_ERROR' || e.extensions?.type === 'authentication error');
    if (authFailed) throw new LinearAuthError();
    if (response.status === 429 || errors.some((e) => e.extensions?.code === 'RATELIMITED')) {
      throw new LinearApiError('Linear is rate limiting requests. Try again in a minute.', 429);
    }
    if (!response.ok || errors.length || !body.data) {
      const first = errors[0];
      const message = first?.extensions?.userPresentableMessage ?? first?.message ?? `Linear request failed (${response.status}).`;
      throw new LinearApiError(message, response.status);
    }
    return body.data;
  }
}
