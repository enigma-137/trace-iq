import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ALLOWED_SCOPE_SET, MCP_READ_SCOPES, MCP_WRITE_SCOPES } from '../src/modules/auth/scopes';
import { grantableScopes, OAuthError, redirectUriMatches, validateRedirectUri, verifyPkce } from '../src/modules/oauth/oauth.logic';
import { OAuthService } from '../src/modules/oauth/oauth.service';

/** Just enough of Postgres for the OAuth tables. */
function fakeDatabase() {
  const clients = new Map<string, { id: string; name: string; redirect_uris: string[] }>();
  const codes = new Map<string, Record<string, unknown>>();
  return {
    codes,
    async query(sql: string, values: unknown[] = []) {
      if (sql.includes('INSERT INTO oauth_clients')) {
        const [id, name, redirect_uris] = values as [string, string, string[]];
        clients.set(id, { id, name, redirect_uris });
        return { rows: [{ created_at: new Date() }], rowCount: 1 };
      }
      if (sql.includes('FROM oauth_clients')) return { rows: clients.has(values[0] as string) ? [clients.get(values[0] as string)] : [], rowCount: 1 };
      if (sql.includes('INSERT INTO oauth_authorization_codes')) {
        const [code_hash, client_id, user_id, redirect_uri, code_challenge, scopes] = values;
        codes.set(code_hash as string, { client_id, user_id, redirect_uri, code_challenge, scopes, used: false, expired: false });
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('DELETE FROM oauth_authorization_codes')) return { rows: [], rowCount: 0 };
      if (sql.includes('UPDATE oauth_authorization_codes')) {
        const code = codes.get(values[0] as string);
        if (!code || code.used || code.expired || code.client_id !== values[1]) return { rows: [], rowCount: 0 };
        code.used = true;
        return { rows: [code], rowCount: 1 };
      }
      throw new Error(`unexpected query: ${sql}`);
    }
  };
}

function setup() {
  const db = fakeDatabase();
  const issued: { userId: string; options: Record<string, unknown> }[] = [];
  const tokens = {
    issue: async (userId: string, options: Record<string, unknown>) => {
      issued.push({ userId, options });
      return { token: 'tiq_pat_issued' };
    }
  };
  return { db, issued, oauth: new OAuthService(db as never, tokens as never) };
}

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

async function registered(oauth: OAuthService, redirect = 'https://claude.ai/api/mcp/auth_callback') {
  return oauth.register({ client_name: 'Claude', redirect_uris: [redirect] });
}

describe('scopes', () => {
  it('lets tokens carry every scope the MCP tools need', () => {
    for (const scope of [...MCP_READ_SCOPES, ...MCP_WRITE_SCOPES]) expect(ALLOWED_SCOPE_SET.has(scope), scope).toBe(true);
    for (const scope of ['experiments:read', 'surveys:write', 'replays:read']) expect(ALLOWED_SCOPE_SET.has(scope)).toBe(true);
  });

  it('grants reads by default and writes only when allowed', () => {
    expect(grantableScopes(undefined, false)).toEqual(MCP_READ_SCOPES);
    expect(grantableScopes(undefined, true)).toEqual([...MCP_READ_SCOPES, ...MCP_WRITE_SCOPES]);
    expect(grantableScopes('funnels:read funnels:write bogus', false)).toEqual(['funnels:read']);
    expect(grantableScopes('funnels:read funnels:write', true)).toEqual(['funnels:read', 'funnels:write']);
    expect(grantableScopes('sourcemaps:write', true)).toEqual([...MCP_READ_SCOPES, ...MCP_WRITE_SCOPES]);
  });
});

describe('redirect URIs', () => {
  it('accepts https, loopback http and app schemes, and rejects the rest', () => {
    for (const uri of ['https://claude.ai/api/mcp/auth_callback', 'http://127.0.0.1:33418/callback', 'cursor://anysphere.cursor-mcp/oauth/callback']) {
      expect(validateRedirectUri(uri)).toBe(uri);
    }
    for (const uri of ['http://evil.example/cb', 'javascript:alert(1)', 'https://a.example/cb#x', 'not a url']) {
      expect(() => validateRedirectUri(uri), uri).toThrow(OAuthError);
    }
  });

  it('matches exactly, except loopback ports', () => {
    expect(redirectUriMatches(['https://a.example/cb'], 'https://a.example/cb')).toBe(true);
    expect(redirectUriMatches(['https://a.example/cb'], 'https://a.example/cb2')).toBe(false);
    expect(redirectUriMatches(['http://127.0.0.1:1000/cb'], 'http://127.0.0.1:5555/cb')).toBe(true);
    expect(redirectUriMatches(['http://127.0.0.1:1000/cb'], 'http://127.0.0.1:5555/other')).toBe(false);
  });
});

describe('PKCE', () => {
  it('verifies S256', () => {
    const { verifier, challenge } = pkce();
    expect(verifyPkce(verifier, challenge)).toBe(true);
    expect(verifyPkce(pkce().verifier, challenge)).toBe(false);
    expect(verifyPkce('short', challenge)).toBe(false);
  });
});

describe('OAuthService', () => {
  it('runs the authorization code flow end to end', async () => {
    const { oauth, issued } = setup();
    const client = await registered(oauth);
    expect(client).toMatchObject({ client_name: 'Claude', token_endpoint_auth_method: 'none' });

    const { verifier, challenge } = pkce();
    const approved = await oauth.approve('user_1', {
      clientId: client.client_id,
      redirectUri: 'https://claude.ai/api/mcp/auth_callback',
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      state: 'xyz',
      allowWrites: false
    });
    const redirect = new URL(approved.redirectUrl);
    expect(redirect.origin + redirect.pathname).toBe('https://claude.ai/api/mcp/auth_callback');
    expect(redirect.searchParams.get('state')).toBe('xyz');
    const code = redirect.searchParams.get('code')!;

    const token = await oauth.exchangeCode({
      grant_type: 'authorization_code',
      code,
      client_id: client.client_id,
      redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      code_verifier: verifier
    });
    expect(token).toMatchObject({ access_token: 'tiq_pat_issued', token_type: 'Bearer' });
    expect(token.scope.split(' ')).toEqual(MCP_READ_SCOPES);
    expect(issued[0]).toMatchObject({ userId: 'user_1', options: { name: 'Claude (connected app)', oauthClientId: client.client_id } });

    // A code works once.
    await expect(
      oauth.exchangeCode({ grant_type: 'authorization_code', code, client_id: client.client_id, code_verifier: verifier })
    ).rejects.toMatchObject({ error: 'invalid_grant' });
  });

  it('rejects a wrong verifier', async () => {
    const { oauth } = setup();
    const client = await registered(oauth);
    const { challenge } = pkce();
    const { redirectUrl } = await oauth.approve('user_1', { clientId: client.client_id, codeChallenge: challenge });
    const code = new URL(redirectUrl).searchParams.get('code');
    await expect(
      oauth.exchangeCode({ grant_type: 'authorization_code', code, client_id: client.client_id, code_verifier: pkce().verifier })
    ).rejects.toMatchObject({ error: 'invalid_grant' });
  });

  it('never redirects to an unregistered URI, and sends other errors back to the client', async () => {
    const { oauth } = setup();
    const client = await registered(oauth);
    await expect(
      oauth.checkAuthorizeRequest({ clientId: client.client_id, redirectUri: 'https://evil.example/cb', codeChallenge: pkce().challenge })
    ).rejects.toThrow('not registered');
    await expect(oauth.checkAuthorizeRequest({ clientId: 'nope' })).rejects.toMatchObject({ error: 'invalid_client' });

    const noPkce = await oauth.approve('user_1', { clientId: client.client_id, state: 's' });
    expect(new URL(noPkce.redirectUrl).searchParams.get('error')).toBe('invalid_request');

    const denied = await oauth.deny({ clientId: client.client_id, state: 's' });
    expect(new URL(denied.redirectUrl).searchParams.get('error')).toBe('access_denied');
  });

  it('validates registrations', async () => {
    const { oauth } = setup();
    await expect(oauth.register({ redirect_uris: [] })).rejects.toMatchObject({ error: 'invalid_redirect_uri' });
    await expect(oauth.register({ redirect_uris: ['http://evil.example/cb'] })).rejects.toMatchObject({ error: 'invalid_redirect_uri' });
  });
});
