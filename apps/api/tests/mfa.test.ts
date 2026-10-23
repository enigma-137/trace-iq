import { afterEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { AuthService, DashboardUser } from '../src/modules/auth/auth.service';
import { MfaService } from '../src/modules/mfa/mfa.service';
import { mockDatabase } from './helpers/mock-db';

function encodeBase64Url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

function makeJwt(amr?: Array<{ method: string; timestamp: number }>): string {
  const header = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = encodeBase64Url(JSON.stringify({ sub: 'user_1', amr }));
  return `${header}.${payload}.signature`;
}

function makeAuthService(fetchedUser: { id: string; email?: string; factors?: unknown[] }) {
  const db = mockDatabase();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(fetchedUser) })
  );
  return new AuthService(db as never);
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.AUTH_MODE;
  delete process.env.LOCAL_PROJECT_WRITE_KEY;
});

describe('AuthService.getDashboardUser (local mode)', () => {
  it('creates an idempotent local workspace and does not require a bearer token', async () => {
    process.env.AUTH_MODE = 'local';
    process.env.LOCAL_PROJECT_WRITE_KEY = 'trq_local_test';
    const db = mockDatabase();
    const service = new AuthService(db as never);

    const first = await service.getDashboardUser();
    const second = await service.getDashboardUser();

    expect(first).toMatchObject({
      id: 'traceiq-local-owner',
      email: 'local@traceiq.invalid',
      authMethod: 'local'
    });
    expect(second).toEqual(first);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.queryCalls(/INSERT INTO organizations/)).toHaveLength(1);
    expect(db.queryCalls(/INSERT INTO organization_members/)).toHaveLength(1);
    expect(db.queryCalls(/INSERT INTO projects/)).toHaveLength(1);
    expect(db.queryCalls(/INSERT INTO project_write_keys/)).toHaveLength(1);
  });
});

describe('AuthService.getDashboardUser (Supabase session)', () => {
  it('decodes the amr claim into the dashboard user', async () => {
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon';
    const service = makeAuthService({ id: 'user_1', email: 'a@b.co' });
    const amr = [
      { method: 'password', timestamp: 1700000000 },
      { method: 'totp', timestamp: Math.floor(Date.now() / 1000) }
    ];

    const user = await service.getDashboardUser(`Bearer ${makeJwt(amr)}`);

    expect(user.id).toBe('user_1');
    expect(user.authMethod).toBe('supabase');
    expect(user.amr).toEqual(amr);
  });

  it('passes the enrolled factors through from the Supabase user', async () => {
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon';
    const factors = [{ id: 'fac_1', factor_type: 'totp', status: 'verified' }];
    const service = makeAuthService({ id: 'user_1', factors });

    const user = await service.getDashboardUser(`Bearer ${makeJwt([])}`);

    expect(user.factors).toEqual(factors);
  });

  it('tolerates a token with no amr claim', async () => {
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon';
    const service = makeAuthService({ id: 'user_1' });

    const user = await service.getDashboardUser(`Bearer ${makeJwt(undefined)}`);

    expect(user.amr).toEqual([]);
  });

  it('tolerates a malformed token payload', async () => {
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon';
    const service = makeAuthService({ id: 'user_1' });

    const user = await service.getDashboardUser('Bearer not.a.jwt');

    expect(user.amr).toEqual([]);
  });
});

describe('AuthService.requireStepUp', () => {
  const now = Math.floor(Date.now() / 1000);
  const service = new AuthService(mockDatabase() as never);

  const makeUser = (amr: DashboardUser['amr']): DashboardUser =>
    ({ id: 'user_1', authMethod: 'supabase', amr });

  it('rejects personal access tokens outright', () => {
    expect(() => service.requireStepUp({ id: 'user_1', authMethod: 'pat', scopes: [] })).toThrow(
      ForbiddenException
    );
  });

  it('requires step-up when no MFA method is present in amr', () => {
    const user = makeUser([{ method: 'password', timestamp: now - 5 }]);

    try {
      service.requireStepUp(user);
      throw new Error('expected throw');
    } catch (error) {
      const response = (error as ForbiddenException).getResponse() as { error?: string };
      expect(response.error).toBe('STEP_UP_REQUIRED');
    }
  });

  it('accepts a fresh TOTP verification', () => {
    const user = makeUser([{ method: 'password', timestamp: now - 60 }, { method: 'totp', timestamp: now - 10 }]);

    expect(() => service.requireStepUp(user)).not.toThrow();
  });

  it('rejects a stale TOTP verification outside the age window', () => {
    const user = makeUser([{ method: 'password', timestamp: now - 3600 }, { method: 'totp', timestamp: now - 1200 }]);

    try {
      service.requireStepUp(user, 15);
      throw new Error('expected throw');
    } catch (error) {
      const response = (error as ForbiddenException).getResponse() as { error?: string };
      expect(response.error).toBe('STEP_UP_EXPIRED');
    }
  });
});

describe('MfaService.status', () => {
  const now = Math.floor(Date.now() / 1000);
  const service = new MfaService();

  it('reports enrolled factors and a verified session', () => {
    const user: DashboardUser = {
      id: 'user_1',
      authMethod: 'supabase',
      amr: [
        { method: 'password', timestamp: now - 60 },
        { method: 'webauthn', timestamp: now - 5 }
      ],
      factors: [{ id: 'fac_1', factor_type: 'webauthn', status: 'verified', created_at: '2025-01-01T00:00:00Z' }]
    };

    const status = service.status(user);

    expect(status.mfaEnabled).toBe(true);
    expect(status.sessionMfaVerified).toBe(true);
    expect(status.sessionMfaMethod).toBe('webauthn');
    expect(status.registeredFactors).toHaveLength(1);
  });

  it('reports disabled MFA for a user without factors', () => {
    const status = service.status({ id: 'user_1', authMethod: 'supabase', amr: [] });

    expect(status.mfaEnabled).toBe(false);
    expect(status.sessionMfaVerified).toBe(false);
    expect(status.registeredFactors).toEqual([]);
  });

  it('flags a session verified but with an expired step-up window', () => {
    const user: DashboardUser = {
      id: 'user_1',
      authMethod: 'supabase',
      amr: [{ method: 'totp', timestamp: now - 3600 }],
      factors: [{ id: 'fac_1', factor_type: 'totp', status: 'verified' }]
    };

    const status = service.status(user);

    expect(status.mfaEnabled).toBe(true);
    expect(status.sessionMfaVerified).toBe(false);
    expect(status.sessionMfaMethod).toBeUndefined();
  });
});

describe('AuthService.getDashboardUser (Supabase user cache)', () => {
  function stubSupabase(responses: Array<{ ok: boolean; body: unknown }>) {
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon';
    const fetchMock = vi.fn();
    for (const response of responses) {
      fetchMock.mockResolvedValueOnce({ ok: response.ok, json: () => Promise.resolve(response.body) });
    }
    vi.stubGlobal('fetch', fetchMock);
    return { fetchMock, service: new AuthService(mockDatabase() as never) };
  }

  function jwtWithExp(expSeconds: number): string {
    const header = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = encodeBase64Url(JSON.stringify({ sub: 'user_1', exp: expSeconds }));
    return `${header}.${payload}.signature`;
  }

  it('reuses one Supabase lookup for repeat and concurrent requests with the same token', async () => {
    const { fetchMock, service } = stubSupabase([{ ok: true, body: { id: 'user_1' } }]);
    const token = `Bearer ${jwtWithExp(Math.floor(Date.now() / 1000) + 3600)}`;

    const [first, second] = await Promise.all([service.getDashboardUser(token), service.getDashboardUser(token)]);
    const third = await service.getDashboardUser(token);

    expect([first.id, second.id, third.id]).toEqual(['user_1', 'user_1', 'user_1']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('bypasses the cache when a fresh lookup is requested', async () => {
    const factors = [{ id: 'fac_1', factor_type: 'totp', status: 'unverified' }];
    const { fetchMock, service } = stubSupabase([
      { ok: true, body: { id: 'user_1', factors: [] } },
      { ok: true, body: { id: 'user_1', factors } }
    ]);
    const token = `Bearer ${jwtWithExp(Math.floor(Date.now() / 1000) + 3600)}`;

    await service.getDashboardUser(token);
    const fresh = await service.getDashboardUser(token, { fresh: true });

    expect(fresh.factors).toEqual(factors);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache rejected or expired tokens', async () => {
    const { fetchMock, service } = stubSupabase([
      { ok: false, body: {} },
      { ok: true, body: { id: 'user_1' } },
      { ok: true, body: { id: 'user_1' } },
      { ok: true, body: { id: 'user_1' } }
    ]);
    const rejected = `Bearer ${jwtWithExp(Math.floor(Date.now() / 1000) + 3600)}`;
    const expired = `Bearer ${jwtWithExp(Math.floor(Date.now() / 1000) - 10)}`;

    await expect(service.getDashboardUser(rejected)).rejects.toThrow('Invalid or expired dashboard session.');
    await service.getDashboardUser(rejected);
    await service.getDashboardUser(expired);
    await service.getDashboardUser(expired);

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
