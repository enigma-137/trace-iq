import { createHash, timingSafeEqual } from 'node:crypto';
import { ALLOWED_SCOPE_SET, MCP_READ_SCOPES, MCP_WRITE_SCOPES } from '../auth/scopes';

/** Pure OAuth helpers, kept apart from Nest so they are easy to test. */

export const AUTHORIZATION_CODE_TTL_SECONDS = 600;
export const ACCESS_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;
export const MAX_REDIRECT_URIS = 10;

export class OAuthError extends Error {
  constructor(
    readonly error: string,
    readonly description: string,
    readonly status = 400
  ) {
    super(description);
  }
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const BLOCKED_SCHEMES = new Set(['javascript:', 'data:', 'file:', 'vbscript:', 'blob:']);

/**
 * Accepts https URLs, http on loopback (desktop apps such as VS Code listen there), and
 * private-use schemes such as cursor:// (RFC 8252). No fragments.
 */
export function validateRedirectUri(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2000) {
    throw new OAuthError('invalid_redirect_uri', 'Each redirect URI must be a string of at most 2000 characters.');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new OAuthError('invalid_redirect_uri', `"${value}" is not an absolute URL.`);
  }
  if (url.hash) throw new OAuthError('invalid_redirect_uri', 'Redirect URIs cannot contain a fragment.');
  if (BLOCKED_SCHEMES.has(url.protocol)) throw new OAuthError('invalid_redirect_uri', `The ${url.protocol} scheme is not allowed.`);
  if (url.protocol === 'http:' && !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new OAuthError('invalid_redirect_uri', 'http redirect URIs are only allowed on localhost; use https.');
  }
  return value;
}

/**
 * Exact match, except that a loopback redirect may use any port (RFC 8252 section 7.3):
 * desktop clients pick a free port at sign-in time.
 */
export function redirectUriMatches(registered: string[], candidate: string): boolean {
  if (registered.includes(candidate)) return true;
  let target: URL;
  try {
    target = new URL(candidate);
  } catch {
    return false;
  }
  if (target.protocol !== 'http:' || !LOOPBACK_HOSTS.has(target.hostname)) return false;
  return registered.some((uri) => {
    try {
      const known = new URL(uri);
      return known.protocol === 'http:' && known.hostname === target.hostname && known.pathname === target.pathname && known.search === target.search;
    } catch {
      return false;
    }
  });
}

export function cleanClientName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim().slice(0, 80) : '';
  return name || 'MCP client';
}

/**
 * The scopes a grant may carry: requested ones that are real MCP scopes, or the MCP read
 * scopes when nothing (or nothing valid) was asked for. Write scopes are dropped unless
 * the user allowed changes on the consent page.
 */
export function grantableScopes(requested: unknown, allowWrites: boolean): string[] {
  const asked =
    typeof requested === 'string'
      ? requested.split(/\s+/)
      : Array.isArray(requested)
        ? requested.filter((scope): scope is string => typeof scope === 'string')
        : [];
  const mcp = new Set([...MCP_READ_SCOPES, ...MCP_WRITE_SCOPES]);
  const valid = asked.filter((scope) => ALLOWED_SCOPE_SET.has(scope) && mcp.has(scope));
  const base = valid.length ? valid : [...MCP_READ_SCOPES, ...(allowWrites ? MCP_WRITE_SCOPES : [])];
  const scopes = allowWrites ? base : base.filter((scope) => !scope.endsWith(':write'));
  return [...new Set(scopes.length ? scopes : MCP_READ_SCOPES)];
}

/** PKCE S256: BASE64URL(SHA256(verifier)) must equal the stored challenge. */
export function verifyPkce(verifier: unknown, challenge: string): boolean {
  if (typeof verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const computed = Buffer.from(createHash('sha256').update(verifier).digest('base64url'));
  const expected = Buffer.from(challenge);
  return computed.length === expected.length && timingSafeEqual(computed, expected);
}

export function isValidCodeChallenge(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Appends OAuth response parameters to a redirect URI, keeping any query it already has. */
export function withParams(redirectUri: string, params: Record<string, string | undefined>): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') url.searchParams.set(key, value);
  return url.toString();
}

export function authorizationServerMetadata(issuer: string) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [...MCP_READ_SCOPES, ...MCP_WRITE_SCOPES],
    service_documentation: 'https://traceiq.run/docs'
  };
}
