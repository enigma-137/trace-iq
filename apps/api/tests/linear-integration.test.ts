import { ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InvalidStateError,
  deriveStateKey,
  signIntegrationState,
  verifyIntegrationState
} from '../src/modules/integrations/common/signed-state';
import { TokenCipher } from '../src/modules/integrations/common/token-cipher';
import { LinearAuthError, LinearClient, LinearConnectionRecord } from '../src/modules/integrations/linear/linear.client';
import { LinearService } from '../src/modules/integrations/linear/linear.service';
import { mockDatabase, rows, empty, MockDb } from './helpers/mock-db';

const owner = { id: 'usr_owner', email: 'o@b.co', authMethod: 'supabase' as const };
const member = { id: 'usr_member', email: 'm@b.co', authMethod: 'supabase' as const };
const pat = { id: 'usr_owner', authMethod: 'pat' as const, scopes: ['projects:read'] };

const SECRET = 'linear-client-secret';
const STATE_KEY = deriveStateKey(SECRET, 'linear-connect');

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function stateFor(userId: string, organizationId = 'org_1', projectId?: string) {
  return signIntegrationState(STATE_KEY, { purpose: 'linear-connect', organizationId, userId, projectId });
}

function returned(url: string) {
  const parsed = new URL(url);
  return { path: parsed.pathname, linear: parsed.searchParams.get('linear'), reason: parsed.searchParams.get('reason'), projectId: parsed.searchParams.get('projectId') };
}

describe('integration state signing', () => {
  const claims = { purpose: 'linear-connect', organizationId: 'org_1', userId: 'usr_1', projectId: 'proj_1' };

  it('round-trips the organization, user and project', () => {
    const verified = verifyIntegrationState(STATE_KEY, signIntegrationState(STATE_KEY, claims), 'linear-connect');
    expect(verified).toMatchObject(claims);
    expect(verified.nonce).toBeTruthy();
    expect(verified.expiresAt - verified.issuedAt).toBe(600);
  });

  it('rejects a tampered payload or signature', () => {
    const state = signIntegrationState(STATE_KEY, claims);
    const [payload, signature] = state.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), organizationId: 'org_evil' })).toString('base64url');
    expect(() => verifyIntegrationState(STATE_KEY, `${forged}.${signature}`, 'linear-connect')).toThrow(InvalidStateError);
    expect(() => verifyIntegrationState(STATE_KEY, `${payload}.AAAA`, 'linear-connect')).toThrow(/signature/);
    expect(() => verifyIntegrationState('another-key', state, 'linear-connect')).toThrow(/signature/);
  });

  it('rejects expired, future-dated, malformed and wrong-purpose states', () => {
    const now = Date.now();
    const old = signIntegrationState(STATE_KEY, claims, 600, now - 601_000);
    expect(() => verifyIntegrationState(STATE_KEY, old, 'linear-connect', now)).toThrow(/expired/);
    const future = signIntegrationState(STATE_KEY, claims, 600, now + 120_000);
    expect(() => verifyIntegrationState(STATE_KEY, future, 'linear-connect', now)).toThrow(/expired/);
    expect(() => verifyIntegrationState(STATE_KEY, 'not-a-state', 'linear-connect')).toThrow(/malformed/);
    expect(() => verifyIntegrationState(STATE_KEY, '', 'linear-connect')).toThrow(/malformed/);
    const github = signIntegrationState(STATE_KEY, { ...claims, purpose: 'github-install' });
    expect(() => verifyIntegrationState(STATE_KEY, github, 'linear-connect')).toThrow(/purpose/);
  });

  it('derives different keys per purpose', () => {
    expect(deriveStateKey(SECRET, 'linear-connect')).not.toBe(deriveStateKey(SECRET, 'github-install'));
    expect(deriveStateKey(SECRET, 'linear-connect')).not.toContain(SECRET);
  });
});

describe('TokenCipher', () => {
  afterEach(() => {
    delete process.env.TRACEIQ_DEPLOYMENT_MODE;
    delete process.env.TRACEIQ_SECRET_ENCRYPTION_KEY;
  });

  it('round-trips a token and never stores the plaintext', () => {
    const cipher = new TokenCipher();
    const packed = cipher.encrypt('lin_oauth_secret_token');
    expect(packed).toMatch(/^v1\.[0-9a-f]+\.[0-9a-f]+\.[0-9a-f]+$/);
    expect(packed).not.toContain('lin_oauth_secret_token');
    expect(cipher.decrypt(packed)).toBe('lin_oauth_secret_token');
    // Fresh IV each time.
    expect(cipher.encrypt('lin_oauth_secret_token')).not.toBe(packed);
  });

  it('refuses tampered or unknown ciphertext', () => {
    const cipher = new TokenCipher();
    const [v, iv, tag, value] = cipher.encrypt('token').split('.');
    const flipped = value.slice(0, -1) + (value.endsWith('0') ? '1' : '0');
    expect(() => cipher.decrypt([v, iv, tag, flipped].join('.'))).toThrow();
    expect(() => cipher.decrypt('plain-token')).toThrow(/unknown format/);
  });

  it('requires a real encryption key on TraceIQ Cloud', () => {
    const cipher = new TokenCipher();
    expect(() => cipher.assertConfigured()).not.toThrow();
    process.env.TRACEIQ_DEPLOYMENT_MODE = 'cloud';
    expect(() => cipher.assertConfigured()).toThrow(ServiceUnavailableException);
    process.env.TRACEIQ_SECRET_ENCRYPTION_KEY = 'a'.repeat(64);
    expect(() => cipher.assertConfigured()).not.toThrow();
  });
});

describe('Linear integration', () => {
  const fetchMock = vi.fn();
  const cipher = new TokenCipher();
  let db: MockDb;
  let connection: (LinearConnectionRecord & Record<string, unknown>) | null;
  let roles: Record<string, string>;
  let client: LinearClient;
  let service: LinearService;
  const projects = {
    requireActiveProject: vi.fn(),
    requireWritableProject: vi.fn(),
    resolveActiveProject: vi.fn()
  };

  function makeConnection(overrides: Partial<LinearConnectionRecord> = {}) {
    return {
      id: 'lin_1',
      organizationId: 'org_1',
      accessTokenEncrypted: cipher.encrypt('access-1'),
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
      status: 'active' as const,
      workspaceId: 'ws_1',
      workspaceName: 'Acme',
      workspaceUrlKey: 'acme',
      scopes: ['read', 'write', 'issues:create'],
      connectedByUserId: 'usr_owner',
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
      ...overrides
    };
  }

  beforeEach(() => {
    process.env.LINEAR_CLIENT_ID = 'linear-client-id';
    process.env.LINEAR_CLIENT_SECRET = SECRET;
    process.env.DASHBOARD_URL = 'https://app.test';
    process.env.TRACEIQ_PUBLIC_API_URL = 'https://api.test';
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    connection = null;
    roles = { usr_owner: 'owner', usr_member: 'member' };
    db = mockDatabase((text, values) => {
      if (text.includes('FROM organization_members om') && text.includes('om.organization_id = $1 AND om.user_id = $2')) {
        const role = roles[values[1] as string];
        return role ? rows([{ role }]) : empty();
      }
      if (text.includes('FROM organization_members om')) {
        const role = roles[values[0] as string];
        return role ? rows([{ organizationId: 'org_1', role }]) : empty();
      }
      if (text.includes('FROM linear_connections WHERE organization_id')) return connection ? rows([connection]) : empty();
      if (text.includes('INSERT INTO linear_project_settings')) {
        return rows([{ projectId: values[0], workspaceId: values[1], teamId: values[2], teamName: values[3], teamKey: values[4], labelId: values[5], labelName: values[6] }]);
      }
      return empty();
    });
    projects.requireActiveProject.mockReset();
    projects.requireWritableProject.mockReset();
    projects.resolveActiveProject.mockReset().mockResolvedValue({ id: 'proj_1', name: 'Web', organizationId: 'org_1', role: 'owner' });
    client = new LinearClient(db as never, cipher);
    service = new LinearService(db as never, projects as never, client, cipher);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of ['LINEAR_CLIENT_ID', 'LINEAR_CLIENT_SECRET', 'LINEAR_REDIRECT_URL', 'DASHBOARD_URL', 'TRACEIQ_PUBLIC_API_URL']) delete process.env[key];
  });

  describe('connect', () => {
    it('returns an app-actor authorize URL with minimal scopes and a signed state', async () => {
      const { url } = await service.createConnectUrl(owner, {});
      const parsed = new URL(url);
      expect(parsed.origin + parsed.pathname).toBe('https://linear.app/oauth/authorize');
      expect(parsed.searchParams.get('actor')).toBe('app');
      expect(parsed.searchParams.get('scope')).toBe('read,write,issues:create');
      expect(parsed.searchParams.get('scope')).not.toContain('admin');
      expect(parsed.searchParams.get('redirect_uri')).toBe('https://api.test/v1/integrations/linear/callback');
      const claims = verifyIntegrationState(STATE_KEY, parsed.searchParams.get('state')!, 'linear-connect');
      expect(claims).toMatchObject({ organizationId: 'org_1', userId: 'usr_owner' });
    });

    it('carries the project through when started from one', async () => {
      projects.requireActiveProject.mockResolvedValue({ id: 'proj_1', organizationId: 'org_1', role: 'admin' });
      const { url } = await service.createConnectUrl(owner, { projectId: 'proj_1' });
      const claims = verifyIntegrationState(STATE_KEY, new URL(url).searchParams.get('state')!, 'linear-connect');
      expect(claims.projectId).toBe('proj_1');
    });

    it('is limited to owners and admins, and never personal access tokens', async () => {
      await expect(service.createConnectUrl(member, {})).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.createConnectUrl(pat, {})).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.createConnectUrl({ id: 'usr_stranger', authMethod: 'supabase' }, {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reports when Linear is not configured on the server', async () => {
      delete process.env.LINEAR_CLIENT_SECRET;
      await expect(service.createConnectUrl(owner, {})).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('callback', () => {
    it('only forwards the code to dashboard settings; it never exchanges or stores it', () => {
      const state = stateFor('usr_owner', 'org_1', 'proj_1');
      const url = new URL(service.forwardCallback({ code: 'code-1', state }));
      expect(url.origin + url.pathname).toBe('https://app.test/dashboard/settings/integrations');
      expect(url.searchParams.get('linear')).toBe('complete');
      expect(url.searchParams.get('linear_code')).toBe('code-1');
      expect(url.searchParams.get('linear_state')).toBe(state);
      expect(url.searchParams.get('projectId')).toBe('proj_1');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(db.query).not.toHaveBeenCalled();
    });

    it('turns forged, expired, missing states and cancellations into error flags', () => {
      const forged = signIntegrationState('wrong-key', { purpose: 'linear-connect', organizationId: 'org_1', userId: 'usr_owner' });
      expect(returned(service.forwardCallback({ code: 'c', state: forged }))).toMatchObject({ linear: 'error', reason: 'invalid_state' });
      const expired = signIntegrationState(STATE_KEY, { purpose: 'linear-connect', organizationId: 'org_1', userId: 'usr_owner' }, 600, Date.now() - 700_000);
      expect(returned(service.forwardCallback({ code: 'c', state: expired }))).toMatchObject({ linear: 'error', reason: 'expired' });
      expect(returned(service.forwardCallback({ code: 'c' }))).toMatchObject({ linear: 'error', reason: 'invalid_state' });
      expect(returned(service.forwardCallback({ error: 'access_denied', state: stateFor('usr_owner') }))).toMatchObject({ linear: 'error', reason: 'cancelled' });
      expect(returned(service.forwardCallback({ state: stateFor('usr_owner') }))).toMatchObject({ linear: 'error', reason: 'missing_code' });
      delete process.env.LINEAR_CLIENT_SECRET;
      expect(returned(service.forwardCallback({ code: 'c', state: 'x.y' }))).toMatchObject({ linear: 'error', reason: 'not_configured' });
    });
  });

  describe('complete', () => {
    function linearAccepts() {
      fetchMock.mockImplementation(async (url: string) => {
        if (url === 'https://api.linear.app/oauth/token') {
          return json({ access_token: 'access-new', refresh_token: 'refresh-new', expires_in: 86_399, scope: 'read write issues:create', token_type: 'Bearer' });
        }
        if (url === 'https://api.linear.app/graphql') return json({ data: { organization: { id: 'ws_1', name: 'Acme', urlKey: 'acme' } } });
        throw new Error(`unexpected ${url}`);
      });
    }

    it('exchanges the code for the signed-in starter and stores only encrypted tokens', async () => {
      linearAccepts();
      const result = await service.completeConnect(owner, { code: 'code-1', state: stateFor('usr_owner', 'org_1', 'proj_1') });
      expect(result).toEqual({ connected: true, organizationId: 'org_1', projectId: 'proj_1', workspace: { id: 'ws_1', name: 'Acme', urlKey: 'acme' } });

      const tokenCall = fetchMock.mock.calls.find(([u]) => u === 'https://api.linear.app/oauth/token')!;
      const form = new URLSearchParams(tokenCall[1].body as URLSearchParams);
      expect(form.get('grant_type')).toBe('authorization_code');
      expect(form.get('code')).toBe('code-1');
      expect(form.get('redirect_uri')).toBe('https://api.test/v1/integrations/linear/callback');

      const insert = db.queryCalls('INSERT INTO linear_connections')[0];
      expect(insert.values[1]).toBe('org_1');
      expect(insert.values).not.toContain('access-new');
      expect(insert.values).not.toContain('refresh-new');
      expect(cipher.decrypt(insert.values[2] as string)).toBe('access-new');
      expect(cipher.decrypt(insert.values[3] as string)).toBe('refresh-new');
      expect(insert.values[5]).toEqual(['read', 'write', 'issues:create']);
      expect(insert.values[6]).toBe('ws_1');
      expect(insert.values[9]).toBe('usr_owner');
    });

    it('refuses a connect link finished by a different person (login CSRF)', async () => {
      linearAccepts();
      roles.usr_attacker = 'owner';
      // The attacker starts a connection for their own org and sends the link to a victim.
      const attackerState = stateFor('usr_attacker', 'org_attacker');
      await expect(service.completeConnect(member, { code: 'victim-code', state: attackerState })).rejects.toMatchObject({
        response: { code: 'LINEAR_STATE_USER_MISMATCH' }
      });
      await expect(service.completeConnect(owner, { code: 'victim-code', state: attackerState })).rejects.toBeInstanceOf(ForbiddenException);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(db.queryCalls('INSERT INTO linear_connections')).toHaveLength(0);
    });

    it('clears project defaults when a different workspace is connected', async () => {
      linearAccepts();
      const original = db.query.getMockImplementation()!;
      db.query.mockImplementation(async (text: string, values: unknown[]) => {
        if (text.includes('FOR UPDATE')) return rows([{ workspaceId: 'ws_old' }]);
        return original(text, values);
      });
      await service.completeConnect(owner, { code: 'code-1', state: stateFor('usr_owner') });
      expect(db.query.mock.calls.some(([text]) => String(text).includes('DELETE FROM linear_project_settings'))).toBe(true);
    });

    it('rejects forged, expired or missing states without calling Linear', async () => {
      const forged = signIntegrationState('wrong-key', { purpose: 'linear-connect', organizationId: 'org_1', userId: 'usr_owner' });
      await expect(service.completeConnect(owner, { code: 'c', state: forged })).rejects.toMatchObject({ response: { code: 'LINEAR_STATE_INVALID' } });
      const expired = signIntegrationState(STATE_KEY, { purpose: 'linear-connect', organizationId: 'org_1', userId: 'usr_owner' }, 600, Date.now() - 700_000);
      await expect(service.completeConnect(owner, { code: 'c', state: expired })).rejects.toMatchObject({ response: { code: 'LINEAR_STATE_EXPIRED' } });
      await expect(service.completeConnect(owner, { code: 'c' })).rejects.toThrow(/code and state are required/);
      await expect(service.completeConnect(pat, { code: 'c', state: stateFor('usr_owner') })).rejects.toBeInstanceOf(ForbiddenException);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(db.queryCalls('INSERT INTO linear_connections')).toHaveLength(0);
    });

    it('refuses when the person is no longer an owner or admin', async () => {
      linearAccepts();
      roles.usr_owner = 'member';
      await expect(service.completeConnect(owner, { code: 'c', state: stateFor('usr_owner') })).rejects.toBeInstanceOf(ForbiddenException);
      delete roles.usr_owner;
      await expect(service.completeConnect(owner, { code: 'c', state: stateFor('usr_owner') })).rejects.toBeInstanceOf(NotFoundException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reports a failed code exchange without storing anything or logging secrets', async () => {
      const warn = vi.spyOn((service as unknown as { logger: { warn: (m: string) => void } }).logger, 'warn').mockImplementation(() => undefined);
      fetchMock.mockResolvedValue(json({ error: 'invalid_grant' }, 400));
      await expect(service.completeConnect(owner, { code: 'secret-code', state: stateFor('usr_owner') })).rejects.toMatchObject({
        response: { code: 'LINEAR_CODE_INVALID' }
      });
      expect(db.queryCalls('INSERT INTO linear_connections')).toHaveLength(0);
      expect(warn.mock.calls.flat().join(' ')).not.toContain('secret-code');
    });
  });

  describe('status', () => {
    it('reports not connected', async () => {
      await expect(service.getStatus(member, {})).resolves.toMatchObject({
        connected: false, status: 'not_connected', configured: true, canManage: false, project: { id: 'proj_1', name: 'Web' }
      });
      expect(projects.resolveActiveProject).toHaveBeenCalledWith(member, undefined, 'org_1');
    });

    it('lists teams and project defaults for a working connection', async () => {
      connection = makeConnection();
      fetchMock.mockResolvedValue(json({ data: { teams: { nodes: [{ id: 'team_1', name: 'Engineering', key: 'ENG' }] } } }));
      const status = await service.getStatus(owner, {});
      expect(status).toMatchObject({ connected: true, status: 'active', workspace: { id: 'ws_1', name: 'Acme' }, teams: [{ id: 'team_1', key: 'ENG' }], canManage: true });
      expect(JSON.stringify(status)).not.toContain(connection.accessTokenEncrypted);
      expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer access-1');
    });

    it('marks the connection as needing reconnect when Linear returns 401', async () => {
      connection = makeConnection();
      fetchMock.mockResolvedValue(json({ errors: [{ message: 'Authentication required', extensions: { code: 'AUTHENTICATION_ERROR' } }] }, 401));
      const status = await service.getStatus(owner, {});
      expect(status).toMatchObject({ connected: true, status: 'needs_reconnect', teams: [] });
      expect(db.queryCalls("SET status = 'needs_reconnect'")[0].values).toEqual(['lin_1']);
    });
  });

  describe('disconnect', () => {
    it('revokes the token with Linear and removes the connection', async () => {
      connection = makeConnection();
      fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
      await expect(service.disconnect(owner, {})).resolves.toEqual({ disconnected: true, revoked: true });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.linear.app/oauth/revoke');
      expect(init.headers.authorization).toBe('Bearer access-1');
      expect(db.queryCalls('DELETE FROM linear_connections WHERE organization_id = $1')[0].values).toEqual(['org_1']);
      expect(db.queryCalls('DELETE FROM linear_project_settings')).toHaveLength(1);
    });

    it('still forgets the connection when Linear cannot be reached', async () => {
      connection = makeConnection();
      fetchMock.mockRejectedValue(new Error('network down'));
      await expect(service.disconnect(owner, {})).resolves.toEqual({ disconnected: true, revoked: false });
      expect(db.queryCalls('DELETE FROM linear_connections')).toHaveLength(1);
    });

    it('is limited to owners and admins', async () => {
      connection = makeConnection();
      await expect(service.disconnect(member, {})).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.disconnect(pat, {})).rejects.toBeInstanceOf(ForbiddenException);
      expect(db.queryCalls('DELETE FROM linear_connections')).toHaveLength(0);
    });
  });

  describe('project settings', () => {
    beforeEach(() => {
      projects.requireWritableProject.mockResolvedValue({ id: 'proj_1', organizationId: 'org_1', role: 'owner' });
    });

    function linearHas() {
      fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
        const { query } = JSON.parse(init.body) as { query: string };
        if (query.includes('TraceIQTeams')) return json({ data: { teams: { nodes: [{ id: 'team_1', name: 'Engineering', key: 'ENG' }] } } });
        if (query.includes('TraceIQLabels')) return json({ data: { issueLabels: { nodes: [{ id: 'lbl_1', name: 'Bug', color: '#f00', team: null }] } } });
        throw new Error('unexpected query');
      });
    }

    it('saves a team and label that exist in the connected workspace', async () => {
      connection = makeConnection();
      linearHas();
      const { settings } = await service.saveProjectSettings(owner, 'proj_1', { teamId: 'team_1', labelId: 'lbl_1' });
      expect(settings).toMatchObject({ projectId: 'proj_1', workspaceId: 'ws_1', teamId: 'team_1', teamName: 'Engineering', teamKey: 'ENG', labelId: 'lbl_1', labelName: 'Bug' });
    });

    it('rejects unknown teams and labels', async () => {
      connection = makeConnection();
      linearHas();
      await expect(service.saveProjectSettings(owner, 'proj_1', { teamId: 'team_other' })).rejects.toThrow(/not in the connected Linear workspace/);
      await expect(service.saveProjectSettings(owner, 'proj_1', { teamId: 'team_1', labelId: 'lbl_other' })).rejects.toThrow(/not available/);
      await expect(service.saveProjectSettings(owner, 'proj_1', {})).rejects.toThrow(/teamId is required/);
      expect(db.queryCalls('INSERT INTO linear_project_settings')).toHaveLength(0);
    });

    it('needs a working connection and a manager', async () => {
      await expect(service.saveProjectSettings(owner, 'proj_1', { teamId: 'team_1' })).rejects.toBeInstanceOf(NotFoundException);
      connection = makeConnection({ status: 'needs_reconnect' });
      await expect(service.saveProjectSettings(owner, 'proj_1', { teamId: 'team_1' })).rejects.toBeInstanceOf(ConflictException);
      projects.requireWritableProject.mockResolvedValue({ id: 'proj_1', organizationId: 'org_1', role: 'member' });
      await expect(service.saveProjectSettings(member, 'proj_1', { teamId: 'team_1' })).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('LinearClient', () => {
    it('refreshes an expiring token before use and stores the new one encrypted', async () => {
      const conn = makeConnection({ refreshTokenEncrypted: cipher.encrypt('refresh-1'), tokenExpiresAt: new Date(Date.now() + 10_000).toISOString() });
      fetchMock.mockImplementation(async (url: string) => {
        if (url === 'https://api.linear.app/oauth/token') return json({ access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 86_399 });
        return json({ data: { teams: { nodes: [] } } });
      });
      await client.listTeams(conn);
      const form = new URLSearchParams(fetchMock.mock.calls[0][1].body as URLSearchParams);
      expect(form.get('grant_type')).toBe('refresh_token');
      expect(form.get('refresh_token')).toBe('refresh-1');
      expect(fetchMock.mock.calls[1][1].headers.authorization).toBe('Bearer access-2');
      const update = db.queryCalls('SET access_token_encrypted')[0];
      expect(cipher.decrypt(update.values[1] as string)).toBe('access-2');
      expect(cipher.decrypt(update.values[2] as string)).toBe('refresh-2');
    });

    it('marks needs reconnect when the refresh token is rejected', async () => {
      const conn = makeConnection({ refreshTokenEncrypted: cipher.encrypt('refresh-1'), tokenExpiresAt: new Date(Date.now() - 1000).toISOString() });
      fetchMock.mockResolvedValue(json({ error: 'invalid_grant' }, 400));
      await expect(client.listTeams(conn)).rejects.toBeInstanceOf(LinearAuthError);
      expect(conn.status).toBe('needs_reconnect');
      expect(db.queryCalls("SET status = 'needs_reconnect'")).toHaveLength(1);
    });

    it('does not call Linear for a connection that already needs reconnecting', async () => {
      await expect(client.listTeams(makeConnection({ status: 'needs_reconnect' }))).rejects.toBeInstanceOf(LinearAuthError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('creates issues and returns the identifier and URL', async () => {
      fetchMock.mockResolvedValue(json({ data: { issueCreate: { success: true, issue: { id: 'iss_1', identifier: 'ENG-123', url: 'https://linear.app/acme/issue/ENG-123' } } } }));
      const issue = await client.createIssue(makeConnection(), { teamId: 'team_1', title: 'TypeError: x', description: 'stack', labelIds: ['lbl_1'] });
      expect(issue).toEqual({ id: 'iss_1', identifier: 'ENG-123', url: 'https://linear.app/acme/issue/ENG-123' });
      const { variables } = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(variables.input).toEqual({ teamId: 'team_1', title: 'TypeError: x', description: 'stack', labelIds: ['lbl_1'] });
    });

    it('surfaces Linear validation errors as safe messages', async () => {
      fetchMock.mockResolvedValue(json({ errors: [{ message: 'Argument Validation Error', extensions: { code: 'INVALID_INPUT', userPresentableMessage: 'Team not found' } }] }, 400));
      await expect(client.createIssue(makeConnection(), { teamId: 'x', title: 't' })).rejects.toThrow('Team not found');
      expect(db.queryCalls("SET status = 'needs_reconnect'")).toHaveLength(0);
    });
  });
});

describe('LinearController authorization', () => {
  it('authenticates every dashboard route and checks PAT scopes on reads', async () => {
    const { LinearController } = await import('../src/modules/integrations/linear/linear.controller');
    const { UnauthorizedException } = await import('@nestjs/common');
    const authService = {
      getDashboardUser: vi.fn(async (header?: string) => {
        if (!header) throw new UnauthorizedException();
        return { id: 'usr_1', authMethod: 'pat', scopes: [] };
      }),
      requireScope: vi.fn(() => {
        throw new ForbiddenException('Personal access token requires "projects:read" scope.');
      })
    };
    const linear = { getStatus: vi.fn(), listLabels: vi.fn(), createConnectUrl: vi.fn(), disconnect: vi.fn(), saveProjectSettings: vi.fn(), completeConnect: vi.fn() };
    const controller = new LinearController(authService as never, linear as never);

    await expect(controller.connect(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.complete({ code: 'c', state: 's' }, undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.disconnect(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.saveProject('proj_1', { teamId: 't' }, undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.status('Bearer tiq_pat_x')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.labels('team_1', 'Bearer tiq_pat_x')).rejects.toBeInstanceOf(ForbiddenException);
    expect(authService.requireScope).toHaveBeenCalledWith(expect.anything(), 'projects:read');
    expect(linear.getStatus).not.toHaveBeenCalled();
    expect(linear.createConnectUrl).not.toHaveBeenCalled();
    expect(linear.completeConnect).not.toHaveBeenCalled();
  });
});
