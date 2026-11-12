import { Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { PersonalAccessTokensService } from '../auth/personal-access-tokens.service';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTHORIZATION_CODE_TTL_SECONDS,
  MAX_REDIRECT_URIS,
  OAuthError,
  cleanClientName,
  grantableScopes,
  hashSecret,
  isValidCodeChallenge,
  redirectUriMatches,
  validateRedirectUri,
  verifyPkce,
  withParams
} from './oauth.logic';

export interface OAuthClient {
  id: string;
  name: string;
  redirectUris: string[];
}

export interface AuthorizeParams {
  clientId?: unknown;
  redirectUri?: unknown;
  responseType?: unknown;
  codeChallenge?: unknown;
  codeChallengeMethod?: unknown;
  scope?: unknown;
  state?: unknown;
  resource?: unknown;
}

const text = (value: unknown) => (typeof value === 'string' ? value : undefined);

@Injectable()
export class OAuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tokens: PersonalAccessTokensService
  ) {}

  /** RFC 7591 dynamic client registration for public (PKCE) clients. */
  async register(body: Record<string, unknown>) {
    const uris = body.redirect_uris;
    if (!Array.isArray(uris) || uris.length === 0 || uris.length > MAX_REDIRECT_URIS) {
      throw new OAuthError('invalid_redirect_uri', `redirect_uris must list 1 to ${MAX_REDIRECT_URIS} URIs.`);
    }
    const redirectUris = [...new Set(uris.map(validateRedirectUri))];
    const name = cleanClientName(body.client_name);
    const id = `tiq_client_${randomUUID()}`;
    const result = await this.database.query<{ created_at: Date }>(
      `INSERT INTO oauth_clients (id, name, redirect_uris) VALUES ($1, $2, $3) RETURNING created_at`,
      [id, name, redirectUris]
    );

    return {
      client_id: id,
      client_name: name,
      redirect_uris: redirectUris,
      client_id_issued_at: Math.floor(new Date(result.rows[0].created_at).getTime() / 1000),
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code']
    };
  }

  async getClient(clientId: unknown): Promise<OAuthClient> {
    if (typeof clientId !== 'string' || !clientId) throw new OAuthError('invalid_client', 'client_id is required.');
    const result = await this.database.query<{ id: string; name: string; redirect_uris: string[] }>(
      `SELECT id, name, redirect_uris FROM oauth_clients WHERE id = $1`,
      [clientId]
    );
    const row = result.rows[0];
    if (!row) throw new OAuthError('invalid_client', 'Unknown client. Ask your MCP client to connect again.', 401);
    return { id: row.id, name: row.name, redirectUris: row.redirect_uris };
  }

  /**
   * Checks an authorization request. Problems with the client or redirect URI are thrown
   * (they must not be redirected); the rest are returned as `error` so the caller can send
   * them back to the client's redirect URI.
   */
  async checkAuthorizeRequest(params: AuthorizeParams) {
    const client = await this.getClient(params.clientId);
    const redirectUri = text(params.redirectUri) ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : undefined);
    if (!redirectUri || !redirectUriMatches(client.redirectUris, redirectUri)) {
      throw new OAuthError('invalid_request', 'redirect_uri is not registered for this client.');
    }

    let error: OAuthError | null = null;
    if (params.responseType !== undefined && params.responseType !== 'code') {
      error = new OAuthError('unsupported_response_type', 'Only response_type=code is supported.');
    } else if (!isValidCodeChallenge(params.codeChallenge) || (params.codeChallengeMethod ?? 'S256') !== 'S256') {
      error = new OAuthError('invalid_request', 'PKCE with code_challenge_method=S256 is required.');
    }

    return { client, redirectUri, error };
  }

  /** The user approved on the consent page: create a one-time code and return where to send them. */
  async approve(userId: string, params: AuthorizeParams & { allowWrites?: unknown }) {
    const { client, redirectUri, error } = await this.checkAuthorizeRequest(params);
    const state = text(params.state);
    if (error) return { redirectUrl: withParams(redirectUri, { error: error.error, error_description: error.description, state }) };

    const scopes = grantableScopes(params.scope, params.allowWrites === true);
    const code = randomBytes(32).toString('base64url');
    await this.database.query(
      `
        INSERT INTO oauth_authorization_codes
          (code_hash, client_id, user_id, redirect_uri, code_challenge, scopes, resource, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, now() + make_interval(secs => $8))
      `,
      [hashSecret(code), client.id, userId, redirectUri, params.codeChallenge, scopes, text(params.resource) ?? null, AUTHORIZATION_CODE_TTL_SECONDS]
    );
    // Old codes are useless; clear them out as we go.
    await this.database.query(`DELETE FROM oauth_authorization_codes WHERE expires_at < now() - interval '1 day'`);

    return { redirectUrl: withParams(redirectUri, { code, state }), scopes };
  }

  /** The user said no: tell the client, at a redirect URI we know is theirs. */
  async deny(params: AuthorizeParams) {
    const { redirectUri } = await this.checkAuthorizeRequest(params);
    return {
      redirectUrl: withParams(redirectUri, {
        error: 'access_denied',
        error_description: 'The user did not allow access.',
        state: text(params.state)
      })
    };
  }

  /** authorization_code grant: one-time code + PKCE verifier -> access token. */
  async exchangeCode(body: Record<string, unknown>) {
    if (body.grant_type !== 'authorization_code') {
      throw new OAuthError('unsupported_grant_type', 'Only grant_type=authorization_code is supported.');
    }
    const code = text(body.code);
    if (!code) throw new OAuthError('invalid_request', 'code is required.');
    const client = await this.getClient(body.client_id);

    // Claim the code atomically so it can only ever be used once.
    const result = await this.database.query<{
      user_id: string;
      redirect_uri: string;
      code_challenge: string;
      scopes: string[];
    }>(
      `
        UPDATE oauth_authorization_codes
        SET used_at = now()
        WHERE code_hash = $1 AND client_id = $2 AND used_at IS NULL AND expires_at > now()
        RETURNING user_id, redirect_uri, code_challenge, scopes
      `,
      [hashSecret(code), client.id]
    );
    const grant = result.rows[0];
    if (!grant) throw new OAuthError('invalid_grant', 'The authorization code is invalid, expired or already used.');
    if (text(body.redirect_uri) && body.redirect_uri !== grant.redirect_uri) {
      throw new OAuthError('invalid_grant', 'redirect_uri does not match the authorization request.');
    }
    if (!verifyPkce(body.code_verifier, grant.code_challenge)) {
      throw new OAuthError('invalid_grant', 'code_verifier does not match the code challenge.');
    }

    const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString();
    const token = await this.tokens.issue(grant.user_id, {
      name: `${client.name} (connected app)`.slice(0, 80),
      scopes: grant.scopes,
      expiresAt,
      oauthClientId: client.id
    });

    return {
      access_token: token.token,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      scope: grant.scopes.join(' ')
    };
  }
}
