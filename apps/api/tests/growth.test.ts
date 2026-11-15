import { describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../src/database/database.service';
import { AdminController } from '../src/modules/admin/admin.controller';
import { AdminService } from '../src/modules/admin/admin.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { decodeSignInClaims, UserActivityRecorder } from '../src/modules/auth/user-activity.recorder';
import { GrowthService } from '../src/modules/growth/growth.service';
import { dayRange, deviceFromUserAgent, isBot, parsePageview, referrerHost, visitorHash } from '../src/modules/growth/growth.util';
import { empty, mockDatabase, rows } from './helpers/mock-db';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';

function token(claims: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256' })}.${encode(claims)}.sig`;
}

describe('pageview beacon parsing', () => {
  it('keeps public paths without query strings or trailing slashes', () => {
    expect(parsePageview({ path: '/pricing/?plan=pro#faq', referrer: 'https://news.ycombinator.com/item?id=1' })).toEqual({
      path: '/pricing',
      referrerHost: 'news.ycombinator.com',
      utmSource: null
    });
    expect(parsePageview({ path: '/' })?.path).toBe('/');
  });

  it('drops product routes and malformed paths', () => {
    for (const path of ['/dashboard', '/dashboard/events', '/admin', '/auth/login', '//evil.com', 'pricing', 42, `/${'a'.repeat(400)}`]) {
      expect(parsePageview({ path })).toBeNull();
    }
    expect(parsePageview(undefined)).toBeNull();
  });

  it('ignores the site referring to itself and cleans UTM sources', () => {
    expect(referrerHost('https://www.traceiq.run/blog')).toBeNull();
    expect(referrerHost('not a url')).toBeNull();
    expect(referrerHost('https://www.google.com/')).toBe('google.com');
    expect(parsePageview({ path: '/', utmSource: '  Twitter<script>' })?.utmSource).toBe('twitterscript');
  });

  it('spots bots and device types', () => {
    expect(isBot(undefined)).toBe(true);
    expect(isBot('Googlebot/2.1')).toBe(true);
    expect(isBot('Mozilla/5.0 HeadlessChrome/120')).toBe(true);
    expect(isBot(CHROME)).toBe(false);
    expect(deviceFromUserAgent(CHROME)).toBe('desktop');
    expect(deviceFromUserAgent(IPHONE)).toBe('mobile');
    expect(deviceFromUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0)')).toBe('tablet');
  });

  it('gives a visitor a different ID under a different daily salt', () => {
    expect(visitorHash('a', '1.2.3.4', CHROME)).toBe(visitorHash('a', '1.2.3.4', CHROME));
    expect(visitorHash('a', '1.2.3.4', CHROME)).not.toBe(visitorHash('b', '1.2.3.4', CHROME));
  });

  it('lists every day of the range, oldest first', () => {
    expect(dayRange(3, new Date('2026-11-15T12:00:00Z'))).toEqual(['2026-11-13', '2026-11-14', '2026-11-15']);
  });
});

describe('recording pageviews', () => {
  it('stores a hashed visitor, never the IP, and skips bots', async () => {
    const db = mockDatabase((text) => (text.includes('site_visitor_salts (day, salt)') ? rows([{ salt: 'salt-1' }]) : empty()));
    const service = new GrowthService(db as unknown as DatabaseService, {} as AuthService);

    expect(await service.recordPageview({ path: '/', referrerHost: null, utmSource: null }, '9.9.9.9', 'Googlebot')).toBe(false);
    expect(await service.recordPageview({ path: '/', referrerHost: null, utmSource: null }, '9.9.9.9', CHROME)).toBe(true);
    await service.recordPageview({ path: '/blog', referrerHost: null, utmSource: null }, '9.9.9.9', CHROME);

    const inserts = db.queryCalls('INSERT INTO site_pageviews');
    expect(inserts).toHaveLength(2);
    expect(inserts[0].values).toEqual(['/', null, null, 'desktop', visitorHash('salt-1', '9.9.9.9', CHROME)]);
    expect(JSON.stringify(inserts)).not.toContain('9.9.9.9');
    // The day's salt is read once and cached.
    expect(db.queryCalls('site_visitor_salts (day, salt)')).toHaveLength(1);
  });
});

describe('sign-in and activity recording', () => {
  it('reads the session and the primary sign-in method from a Supabase token', () => {
    const claims = decodeSignInClaims(
      token({ session_id: 's1', iat: 2000, amr: [{ method: 'totp', timestamp: 1500 }, { method: 'oauth', timestamp: 1000 }] })
    );
    expect(claims).toEqual({ sessionId: 's1', method: 'oauth', signedInAt: 1_000_000 });
    expect(decodeSignInClaims(token({ iat: 1 }))).toBeNull();
    expect(decodeSignInClaims('garbage')).toBeNull();
  });

  it('writes one sign-in per session and activity at most every ten minutes', async () => {
    const db = mockDatabase();
    const recorder = new UserActivityRecorder(db as unknown as DatabaseService);
    const signIn = { sessionId: 's1', method: 'password', signedInAt: 1_000 };
    const t0 = Date.parse('2026-11-15T10:00:00Z');

    recorder.record({ id: 'u1', email: 'a@example.com' }, signIn, t0);
    recorder.record({ id: 'u1', email: 'a@example.com' }, signIn, t0 + 60_000);
    recorder.record({ id: 'u1', email: 'a@example.com' }, signIn, t0 + 11 * 60_000);
    await Promise.resolve();

    expect(db.queryCalls('INSERT INTO dashboard_sign_ins')).toHaveLength(1);
    expect(db.queryCalls('INSERT INTO dashboard_user_activity')).toHaveLength(2);
  });

  it('writes activity again right after midnight UTC', async () => {
    const db = mockDatabase();
    const recorder = new UserActivityRecorder(db as unknown as DatabaseService);
    recorder.record({ id: 'u1' }, null, Date.parse('2026-11-15T23:59:00Z'));
    recorder.record({ id: 'u1' }, null, Date.parse('2026-11-16T00:01:00Z'));
    expect(db.queryCalls('INSERT INTO dashboard_user_activity')).toHaveLength(2);
  });

  it('never fails the request when the write fails', async () => {
    const db = mockDatabase(() => Promise.reject(new Error('db down')));
    const recorder = new UserActivityRecorder(db as unknown as DatabaseService);
    expect(() => recorder.record({ id: 'u1' }, { sessionId: 's', method: null, signedInAt: 1 })).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

describe('admin growth', () => {
  const now = new Date('2026-11-15T12:00:00Z');

  function growthDb() {
    return mockDatabase((text) => {
      if (text.includes('COUNT(DISTINCT visitor_hash)::int AS visitors')) {
        return rows([
          { day: '2026-11-14', visitors: 40, pageviews: 90 },
          { day: '2026-11-15', visitors: 60, pageviews: 100 }
        ]);
      }
      if (text.includes('SELECT path AS label')) return rows([{ label: '/', total: 150 }]);
      if (text.includes("COALESCE(utm_source, referrer_host, 'Direct')")) return rows([{ label: 'Direct', total: 70 }]);
      if (text.includes('FROM dashboard_sign_ins') && text.includes('GROUP BY 1') && text.includes('AS day')) {
        return rows([{ day: '2026-11-15', total: 3 }]);
      }
      if (text.includes('AS dau')) return rows([{ dau: 2, wau: 5, mau: 9 }]);
      return empty();
    });
  }

  it('combines visitors, Supabase sign-ups, sign-ins and active users per day', async () => {
    const auth = {
      listSupabaseAccounts: vi.fn().mockResolvedValue([
        { id: 'a', email: 'old@example.com', createdAt: '2026-01-01T00:00:00Z', lastSignInAt: null, provider: 'email', confirmed: true },
        { id: 'b', email: 'new@example.com', createdAt: '2026-11-15T09:00:00Z', lastSignInAt: null, provider: 'github', confirmed: true },
        { id: 'c', email: 'new2@example.com', createdAt: '2026-11-14T09:00:00Z', lastSignInAt: null, provider: 'google', confirmed: false }
      ])
    } as unknown as AuthService;
    const service = new GrowthService(growthDb() as unknown as DatabaseService, auth);

    const result = await service.growth(7, now);

    expect(result.daily).toHaveLength(7);
    expect(result.daily.at(-1)).toEqual({ day: '2026-11-15', visitors: 60, pageviews: 100, signUps: 1, signIns: 3, activeUsers: 0 });
    expect(result.totals).toEqual({ visitors: 100, pageviews: 190, signUps: 2, signIns: 3, conversionRate: 2 });
    expect(result.active).toEqual({ dau: 2, wau: 5, mau: 9 });
    expect(result.accounts).toEqual({ total: 3, confirmed: 2 });
    expect(result.recentSignUps[0].email).toBe('new@example.com');
    expect(result.signUpMethods.map((m) => m.label).sort()).toEqual(['github', 'google']);
  });

  it('still answers when Supabase accounts are unavailable', async () => {
    const auth = { listSupabaseAccounts: vi.fn().mockRejectedValue(new Error('HTTP 500')) } as unknown as AuthService;
    const result = await new GrowthService(growthDb() as unknown as DatabaseService, auth).growth(30, now);
    expect(result.accounts).toBeNull();
    expect(result.totals.signUps).toBe(0);
    expect(result.totals.visitors).toBe(100);
  });

  it('is admin-only and clamps the range', async () => {
    const auth = {
      getDashboardUser: vi.fn().mockResolvedValue({ id: 'u' }),
      requirePlatformAdmin: vi.fn().mockResolvedValue(undefined)
    } as unknown as AuthService;
    const growth = { growth: vi.fn().mockResolvedValue({}) } as unknown as GrowthService;
    const controller = new AdminController(auth, {} as AdminService, growth);

    await controller.growth('Bearer x', '90');
    await controller.growth('Bearer x', '9999');

    expect(auth.requirePlatformAdmin).toHaveBeenCalledTimes(2);
    expect(growth.growth).toHaveBeenNthCalledWith(1, 90);
    expect(growth.growth).toHaveBeenNthCalledWith(2, 30);
  });
});
