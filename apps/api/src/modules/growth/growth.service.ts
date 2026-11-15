import { randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AuthService, SupabaseAccount } from '../auth/auth.service';
import { dayRange, deviceFromUserAgent, isBot, Pageview, utcDay, visitorHash } from './growth.util';

export const GROWTH_RANGES = [7, 30, 90] as const;
export type GrowthRange = (typeof GROWTH_RANGES)[number];

const ACCOUNTS_CACHE_TTL_MS = 5 * 60_000;
const RECENT_LIMIT = 10;
const TOP_LIMIT = 8;

export interface GrowthDayPoint {
  day: string;
  visitors: number;
  pageviews: number;
  signUps: number;
  signIns: number;
  activeUsers: number;
}

export interface GrowthLabelCount {
  [column: string]: unknown;
  label: string;
  total: number;
}

export interface AdminGrowth {
  rangeDays: number;
  daily: GrowthDayPoint[];
  totals: {
    /** Sum of daily unique visitors over the range (a visitor ID only lasts one day). */
    visitors: number;
    pageviews: number;
    signUps: number;
    signIns: number;
    /** Sign-ups per 100 visitors over the range, or null with no visitors. */
    conversionRate: number | null;
  };
  active: { dau: number; wau: number; mau: number };
  /** Null when sign-ups could not be read from Supabase (no service-role key, local auth). */
  accounts: { total: number; confirmed: number } | null;
  topPages: GrowthLabelCount[];
  topSources: GrowthLabelCount[];
  devices: GrowthLabelCount[];
  signUpMethods: GrowthLabelCount[];
  signInMethods: GrowthLabelCount[];
  recentSignUps: Array<{ email: string | null; provider: string | null; createdAt: string; confirmed: boolean }>;
  recentSignIns: Array<{ email: string | null; method: string | null; signedInAt: string }>;
  recentlyActive: Array<{ email: string | null; lastSeenAt: string }>;
}

@Injectable()
export class GrowthService {
  private readonly logger = new Logger(GrowthService.name);
  private salt?: { day: string; value: Promise<string> };
  private accountsCache?: { expiresAt: number; value: Promise<SupabaseAccount[] | null> };

  constructor(
    private readonly database: DatabaseService,
    private readonly auth: AuthService
  ) {}

  /** Counts one page load on the public site. Bots and invalid beacons are dropped. */
  async recordPageview(pageview: Pageview, ip: string, userAgent: string | undefined): Promise<boolean> {
    if (isBot(userAgent)) return false;
    const ua = userAgent!.slice(0, 400);
    const salt = await this.dailySalt();
    await this.database.query(
      `
        INSERT INTO site_pageviews (path, referrer_host, utm_source, device, visitor_hash)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [pageview.path, pageview.referrerHost, pageview.utmSource, deviceFromUserAgent(ua), visitorHash(salt, ip, ua)]
    );
    return true;
  }

  async growth(rangeDays: GrowthRange, now = new Date()): Promise<AdminGrowth> {
    const days = dayRange(rangeDays, now);
    const start = days[0];
    const today = days[days.length - 1];

    const [visits, pages, sources, devices, signIns, signInMethods, recentSignIns, active, activeDaily, recentlyActive, accounts] =
      await Promise.all([
        this.database.query<{ day: string; visitors: number; pageviews: number }>(
          `
            SELECT to_char((created_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day,
                   COUNT(DISTINCT visitor_hash)::int AS visitors,
                   COUNT(*)::int AS pageviews
            FROM site_pageviews
            WHERE created_at >= $1::date
            GROUP BY 1
          `,
          [start]
        ),
        this.database.query<GrowthLabelCount>(
          `
            SELECT path AS label, COUNT(*)::int AS total
            FROM site_pageviews
            WHERE created_at >= $1::date
            GROUP BY path
            ORDER BY total DESC, path ASC
            LIMIT ${TOP_LIMIT}
          `,
          [start]
        ),
        this.database.query<GrowthLabelCount>(
          `
            SELECT COALESCE(utm_source, referrer_host, 'Direct') AS label,
                   COUNT(DISTINCT visitor_hash)::int AS total
            FROM site_pageviews
            WHERE created_at >= $1::date
            GROUP BY 1
            ORDER BY total DESC, label ASC
            LIMIT ${TOP_LIMIT}
          `,
          [start]
        ),
        this.database.query<GrowthLabelCount>(
          `
            SELECT COALESCE(device, 'unknown') AS label, COUNT(DISTINCT visitor_hash)::int AS total
            FROM site_pageviews
            WHERE created_at >= $1::date
            GROUP BY 1
            ORDER BY total DESC
          `,
          [start]
        ),
        this.database.query<{ day: string; total: number }>(
          `
            SELECT to_char((signed_in_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day, COUNT(*)::int AS total
            FROM dashboard_sign_ins
            WHERE signed_in_at >= $1::date
            GROUP BY 1
          `,
          [start]
        ),
        this.database.query<GrowthLabelCount>(
          `
            SELECT COALESCE(method, 'unknown') AS label, COUNT(*)::int AS total
            FROM dashboard_sign_ins
            WHERE signed_in_at >= $1::date
            GROUP BY 1
            ORDER BY total DESC
          `,
          [start]
        ),
        this.database.query<{ email: string | null; method: string | null; signedInAt: string }>(
          `
            SELECT email, method, signed_in_at AS "signedInAt"
            FROM dashboard_sign_ins
            ORDER BY signed_in_at DESC
            LIMIT ${RECENT_LIMIT}
          `
        ),
        this.database.query<{ dau: number; wau: number; mau: number }>(
          `
            SELECT
              COUNT(DISTINCT user_id) FILTER (WHERE day = $1::date)::int AS dau,
              COUNT(DISTINCT user_id) FILTER (WHERE day > $1::date - 7)::int AS wau,
              COUNT(DISTINCT user_id)::int AS mau
            FROM dashboard_user_activity
            WHERE day > $1::date - 30
          `,
          [today]
        ),
        this.database.query<{ day: string; total: number }>(
          `
            SELECT to_char(day, 'YYYY-MM-DD') AS day, COUNT(*)::int AS total
            FROM dashboard_user_activity
            WHERE day >= $1::date
            GROUP BY day
          `,
          [start]
        ),
        this.database.query<{ email: string | null; lastSeenAt: string }>(
          `
            SELECT email, last_seen_at AS "lastSeenAt"
            FROM dashboard_user_last_seen
            ORDER BY last_seen_at DESC
            LIMIT ${RECENT_LIMIT}
          `
        ),
        this.supabaseAccounts()
      ]);

    const visitsByDay = new Map(visits.rows.map((row) => [row.day, row]));
    const signInsByDay = new Map(signIns.rows.map((row) => [row.day, row.total]));
    const activeByDay = new Map(activeDaily.rows.map((row) => [row.day, row.total]));
    const signUpsByDay = new Map<string, number>();
    const signUpMethods = new Map<string, number>();
    const inRange = (accounts ?? []).filter((account) => utcDay(new Date(account.createdAt)) >= start);
    for (const account of inRange) {
      const day = utcDay(new Date(account.createdAt));
      signUpsByDay.set(day, (signUpsByDay.get(day) ?? 0) + 1);
      const method = account.provider ?? 'unknown';
      signUpMethods.set(method, (signUpMethods.get(method) ?? 0) + 1);
    }

    const daily = days.map((day) => ({
      day,
      visitors: visitsByDay.get(day)?.visitors ?? 0,
      pageviews: visitsByDay.get(day)?.pageviews ?? 0,
      signUps: signUpsByDay.get(day) ?? 0,
      signIns: signInsByDay.get(day) ?? 0,
      activeUsers: activeByDay.get(day) ?? 0
    }));
    const sum = (key: keyof Omit<GrowthDayPoint, 'day'>) => daily.reduce((total, point) => total + point[key], 0);
    const visitors = sum('visitors');
    const signUps = sum('signUps');

    return {
      rangeDays,
      daily,
      totals: {
        visitors,
        pageviews: sum('pageviews'),
        signUps,
        signIns: sum('signIns'),
        conversionRate: visitors > 0 ? Math.round((signUps / visitors) * 1000) / 10 : null
      },
      active: active.rows[0] ?? { dau: 0, wau: 0, mau: 0 },
      accounts: accounts
        ? { total: accounts.length, confirmed: accounts.filter((account) => account.confirmed).length }
        : null,
      topPages: pages.rows,
      topSources: sources.rows,
      devices: devices.rows,
      signUpMethods: [...signUpMethods.entries()]
        .map(([label, total]) => ({ label, total }))
        .sort((a, b) => b.total - a.total),
      signInMethods: signInMethods.rows,
      recentSignUps: [...(accounts ?? [])]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, RECENT_LIMIT)
        .map(({ email, provider, createdAt, confirmed }) => ({ email, provider, createdAt, confirmed })),
      recentSignIns: recentSignIns.rows,
      recentlyActive: recentlyActive.rows
    };
  }

  /** Supabase holds every account; listing it is slow-ish, so it's cached for a few minutes. */
  private supabaseAccounts(): Promise<SupabaseAccount[] | null> {
    const now = Date.now();
    if (this.accountsCache && this.accountsCache.expiresAt > now) return this.accountsCache.value;
    const value = this.auth.listSupabaseAccounts().catch((error: unknown) => {
      this.logger.warn(`Could not list Supabase accounts: ${error instanceof Error ? error.message : String(error)}`);
      this.accountsCache = undefined;
      return null;
    });
    this.accountsCache = { expiresAt: now + ACCOUNTS_CACHE_TTL_MS, value };
    return value;
  }

  /** Today's random salt, shared by every API instance; earlier days' salts are deleted. */
  private dailySalt(): Promise<string> {
    const day = utcDay();
    if (this.salt?.day === day) return this.salt.value;
    const value = (async () => {
      const result = await this.database.query<{ salt: string }>(
        `
          WITH inserted AS (
            INSERT INTO site_visitor_salts (day, salt) VALUES ($1::date, $2)
            ON CONFLICT (day) DO NOTHING
            RETURNING salt
          )
          SELECT salt FROM inserted
          UNION ALL
          SELECT salt FROM site_visitor_salts WHERE day = $1::date
          LIMIT 1
        `,
        [day, randomBytes(32).toString('hex')]
      );
      await this.database.query('DELETE FROM site_visitor_salts WHERE day < $1::date', [day]);
      const salt = result.rows[0]?.salt;
      if (!salt) throw new Error('No visitor salt for today.');
      return salt;
    })();
    value.catch(() => {
      if (this.salt?.value === value) this.salt = undefined;
    });
    this.salt = { day, value };
    return value;
  }
}
