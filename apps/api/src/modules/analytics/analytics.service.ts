import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService, ResolvedProject } from '../projects/projects.service';

type TrendInterval = 'hour' | 'day' | 'week';

const DAY_MS = 24 * 60 * 60 * 1000;
const ALLOWED_INTERVALS: TrendInterval[] = ['hour', 'day', 'week'];
const BUCKET_FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS"Z"';

// Well-known breakdown dimensions map to device_info / network_info JSONB columns.
// Values are trusted SQL fragments (fixed whitelist), never user input.
const DIMENSION_SOURCES: Record<string, string> = {
  os: "device_info->>'os'",
  device_type: "device_info->>'deviceType'",
  browser: "device_info->>'browser'",
  platform: "device_info->>'platform'",
  country: "network_info->>'country'",
  region: "network_info->>'region'",
  city: "network_info->>'city'"
};

export interface TrendPoint {
  bucket: string;
  total: number;
  uniques: number;
}

export interface TrendSeries {
  key: string;
  points: TrendPoint[];
}

export interface TrendsResponse {
  project: ResolvedProject;
  event: string;
  interval: TrendInterval;
  from: string;
  to: string;
  breakdown: string | null;
  buckets: string[];
  series: TrendSeries[];
}

export interface OverviewResponse {
  project: ResolvedProject | null;
  totals: {
    events: number;
    events24h: number;
    users: number;
    sessions: number;
  };
  topEvents: Array<{ eventName: string; total: number }>;
  topDevices: Array<{ name: string; total: number }>;
  topCountries: Array<{ name: string; total: number }>;
  sparkline: TrendPoint[];
}

export interface WebTotals {
  visitors: number;
  pageviews: number;
  sessions: number;
  avgSessionDuration: number;
  bounceRate: number;
}

export interface WebAnalyticsResponse {
  project: ResolvedProject | null;
  days: number;
  current: WebTotals;
  previous: WebTotals;
  visitorsTrend: TrendPoint[];
  topPaths: Array<{ path: string; visitors: number; views: number }>;
  devices: Array<{ name: string; total: number }>;
  countries: Array<{ name: string; total: number }>;
  sources: Array<{ channel: string; visitors: number }>;
  activeHours: number[][];
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService
  ) {}

  async getOverview(user: DashboardUser, projectId?: string): Promise<OverviewResponse> {
    const project = await this.projects.resolveActiveProject(user, projectId);

    if (!project) {
      return {
        project: null,
        totals: { events: 0, events24h: 0, users: 0, sessions: 0 },
        topEvents: [],
        topDevices: [],
        topCountries: [],
        sparkline: []
      };
    }

    const totalsResult = await this.database.query<{
      total_events: number;
      events_24h: number;
      total_users: number;
      total_sessions: number;
    }>(
      `
        SELECT
          (SELECT count(*) FROM events WHERE project_id = $1)::int AS total_events,
          (SELECT count(*) FROM events WHERE project_id = $1 AND occurred_at >= now() - interval '24 hours')::int AS events_24h,
          (SELECT count(*) FROM users WHERE project_id = $1)::int AS total_users,
          (SELECT count(*) FROM sessions WHERE project_id = $1)::int AS total_sessions
      `,
      [project.id]
    );

    const topEventsResult = await this.database.query<{ eventName: string; total: number }>(
      `
        SELECT event_name AS "eventName", count(*)::int AS total
        FROM events
        WHERE project_id = $1 AND occurred_at >= now() - interval '30 days'
        GROUP BY event_name
        ORDER BY total DESC
        LIMIT 10
      `,
      [project.id]
    );

    const sparklineRows = await this.database.query<{ bucket: string; total: number }>(
      `
        SELECT
          to_char(date_trunc('day', occurred_at AT TIME ZONE 'UTC'), '${BUCKET_FORMAT}') AS bucket,
          count(*)::int AS total
        FROM events
        WHERE project_id = $1 AND occurred_at >= now() - interval '14 days'
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      [project.id]
    );

    const topDevices = await this.database.query<{ name: string; total: number }>(
      `
        SELECT COALESCE(NULLIF(device_info->>'os', ''), 'unknown') AS name, count(*)::int AS total
        FROM events
        WHERE project_id = $1 AND occurred_at >= now() - interval '30 days'
        GROUP BY 1
        ORDER BY total DESC
        LIMIT 6
      `,
      [project.id]
    );

    const topCountries = await this.database.query<{ name: string; total: number }>(
      `
        SELECT COALESCE(NULLIF(network_info->>'country', ''), 'unknown') AS name, count(*)::int AS total
        FROM events
        WHERE project_id = $1 AND occurred_at >= now() - interval '30 days'
        GROUP BY 1
        ORDER BY total DESC
        LIMIT 6
      `,
      [project.id]
    );

    const to = new Date();
    const from = new Date(to.getTime() - 14 * DAY_MS);
    const sparkline = this.zeroFill(this.generateBuckets(from, to, 'day'), sparklineRows.rows);

    const totals = totalsResult.rows[0];

    return {
      project,
      totals: {
        events: totals?.total_events ?? 0,
        events24h: totals?.events_24h ?? 0,
        users: totals?.total_users ?? 0,
        sessions: totals?.total_sessions ?? 0
      },
      topEvents: topEventsResult.rows,
      topDevices: topDevices.rows,
      topCountries: topCountries.rows,
      sparkline
    };
  }

  async listEventNames(user: DashboardUser, projectId?: string) {
    const project = await this.projects.resolveActiveProject(user, projectId);

    if (!project) {
      return { project: null, eventNames: [] as Array<{ eventName: string; total: number }> };
    }

    const result = await this.database.query<{ eventName: string; total: number }>(
      `
        SELECT event_name AS "eventName", count(*)::int AS total
        FROM events
        WHERE project_id = $1 AND occurred_at >= now() - interval '30 days'
        GROUP BY event_name
        ORDER BY total DESC
        LIMIT 200
      `,
      [project.id]
    );

    return { project, eventNames: result.rows };
  }

  async getTrends(
    user: DashboardUser,
    params: { event?: string; interval?: string; days?: string; breakdown?: string; projectId?: string }
  ): Promise<TrendsResponse> {
    const event = this.requiredString(params.event, 'event');
    const interval = this.parseInterval(params.interval);
    const days = this.clampDays(params.days, interval);
    const breakdown = this.optionalString(params.breakdown) ?? null;
    const project = await this.projects.requireActiveProject(user, params.projectId);

    const to = new Date();
    const from = new Date(to.getTime() - days * DAY_MS);
    const buckets = this.generateBuckets(from, to, interval);

    let series: TrendSeries[];

    if (breakdown) {
      const dimensionSource = DIMENSION_SOURCES[breakdown.toLowerCase()];
      const breakdownExpr = dimensionSource
        ? `COALESCE(NULLIF(${dimensionSource}, ''), '(none)')`
        : `COALESCE(NULLIF(properties->>$6, ''), '(none)')`;
      const params = dimensionSource
        ? [project.id, event, interval, from.toISOString(), to.toISOString()]
        : [project.id, event, interval, from.toISOString(), to.toISOString(), breakdown];

      const rows = await this.database.query<{ bucket: string; breakdown_key: string; total: number }>(
        `
          SELECT
            to_char(date_trunc($3, occurred_at AT TIME ZONE 'UTC'), '${BUCKET_FORMAT}') AS bucket,
            ${breakdownExpr} AS breakdown_key,
            count(*)::int AS total
          FROM events
          WHERE project_id = $1 AND event_name = $2
            AND occurred_at >= $4 AND occurred_at < $5
          GROUP BY 1, 2
          ORDER BY 1 ASC
        `,
        params
      );

      const byKey = new Map<string, Map<string, number>>();
      for (const row of rows.rows) {
        const keyMap = byKey.get(row.breakdown_key) ?? new Map<string, number>();
        keyMap.set(row.bucket, row.total);
        byKey.set(row.breakdown_key, keyMap);
      }

      series = [...byKey.entries()].map(([key, keyMap]) => ({
        key,
        points: buckets.map((bucket) => ({ bucket, total: keyMap.get(bucket) ?? 0, uniques: 0 }))
      }));
    } else {
      const rows = await this.database.query<{ bucket: string; total: number; uniques: number }>(
        `
          SELECT
            to_char(date_trunc($3, occurred_at AT TIME ZONE 'UTC'), '${BUCKET_FORMAT}') AS bucket,
            count(*)::int AS total,
            count(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS uniques
          FROM events
          WHERE project_id = $1 AND event_name = $2
            AND occurred_at >= $4 AND occurred_at < $5
          GROUP BY 1
          ORDER BY 1 ASC
        `,
        [project.id, event, interval, from.toISOString(), to.toISOString()]
      );

      series = [{ key: event, points: this.zeroFill(buckets, rows.rows) }];
    }

    return {
      project,
      event,
      interval,
      from: from.toISOString(),
      to: to.toISOString(),
      breakdown,
      buckets,
      series
    };
  }

  async getWebAnalytics(user: DashboardUser, daysParam?: string, projectId?: string): Promise<WebAnalyticsResponse> {
    const project = await this.projects.resolveActiveProject(user, projectId);
    const days = this.clampWebDays(daysParam);
    const emptyTotals: WebTotals = { visitors: 0, pageviews: 0, sessions: 0, avgSessionDuration: 0, bounceRate: 0 };

    if (!project) {
      return {
        project: null,
        days,
        current: emptyTotals,
        previous: emptyTotals,
        visitorsTrend: [],
        topPaths: [],
        devices: [],
        countries: [],
        sources: [],
        activeHours: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
      };
    }

    const to = new Date();
    const from = new Date(to.getTime() - days * DAY_MS);
    const prevTo = from;
    const prevFrom = new Date(from.getTime() - days * DAY_MS);

    const [current, previous] = await Promise.all([
      this.computeWebTotals(project.id, from, to),
      this.computeWebTotals(project.id, prevFrom, prevTo)
    ]);

    const trendRows = await this.database.query<{ bucket: string; total: number }>(
      `
        SELECT to_char(date_trunc('day', occurred_at AT TIME ZONE 'UTC'), '${BUCKET_FORMAT}') AS bucket,
          count(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS total
        FROM events
        WHERE project_id = $1 AND occurred_at >= $2 AND occurred_at < $3
        GROUP BY 1 ORDER BY 1 ASC
      `,
      [project.id, from.toISOString(), to.toISOString()]
    );
    const visitorsTrend = this.zeroFill(this.generateBuckets(from, to, 'day'), trendRows.rows);

    const topPaths = await this.database.query<{ path: string; visitors: number; views: number }>(
      `
        SELECT COALESCE(NULLIF(context->'page'->>'path', ''), '(unknown)') AS path,
          count(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS visitors,
          count(*)::int AS views
        FROM events
        WHERE project_id = $1 AND event_name = '$page' AND occurred_at >= $2 AND occurred_at < $3
        GROUP BY 1 ORDER BY views DESC LIMIT 10
      `,
      [project.id, from.toISOString(), to.toISOString()]
    );

    const devices = await this.database.query<{ name: string; total: number }>(
      `
        SELECT COALESCE(NULLIF(device_info->>'deviceType', ''), 'unknown') AS name,
          count(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS total
        FROM events WHERE project_id = $1 AND occurred_at >= $2 AND occurred_at < $3
        GROUP BY 1 ORDER BY total DESC LIMIT 6
      `,
      [project.id, from.toISOString(), to.toISOString()]
    );

    const countries = await this.database.query<{ name: string; total: number }>(
      `
        SELECT COALESCE(NULLIF(network_info->>'country', ''), 'unknown') AS name,
          count(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS total
        FROM events WHERE project_id = $1 AND occurred_at >= $2 AND occurred_at < $3
        GROUP BY 1 ORDER BY total DESC LIMIT 8
      `,
      [project.id, from.toISOString(), to.toISOString()]
    );

    const sources = await this.database.query<{ channel: string; visitors: number }>(
      `
        SELECT CASE
            WHEN ref IS NULL OR ref = '' THEN 'Direct'
            WHEN ref ILIKE '%google.%' OR ref ILIKE '%bing.%' OR ref ILIKE '%duckduckgo.%' OR ref ILIKE '%yahoo.%' THEN 'Organic Search'
            WHEN ref ILIKE '%facebook.%' OR ref ILIKE '%twitter.%' OR ref ILIKE '%t.co%' OR ref ILIKE '%linkedin.%' OR ref ILIKE '%instagram.%' THEN 'Social'
            ELSE 'Referral'
          END AS channel,
          count(DISTINCT actor)::int AS visitors
        FROM (
          SELECT context->'page'->>'referrer' AS ref, COALESCE(user_id::text, anonymous_id) AS actor
          FROM events WHERE project_id = $1 AND occurred_at >= $2 AND occurred_at < $3
        ) s
        GROUP BY 1 ORDER BY visitors DESC
      `,
      [project.id, from.toISOString(), to.toISOString()]
    );

    const hourRows = await this.database.query<{ dow: number; hour: number; total: number }>(
      `
        SELECT EXTRACT(DOW FROM occurred_at AT TIME ZONE 'UTC')::int AS dow,
          EXTRACT(HOUR FROM occurred_at AT TIME ZONE 'UTC')::int AS hour,
          count(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS total
        FROM events WHERE project_id = $1 AND occurred_at >= $2 AND occurred_at < $3
        GROUP BY 1, 2
      `,
      [project.id, from.toISOString(), to.toISOString()]
    );
    const activeHours = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
    for (const row of hourRows.rows) {
      if (row.dow >= 0 && row.dow < 7 && row.hour >= 0 && row.hour < 24) {
        activeHours[row.dow][row.hour] = row.total;
      }
    }

    return {
      project,
      days,
      current,
      previous,
      visitorsTrend,
      topPaths: topPaths.rows,
      devices: devices.rows,
      countries: countries.rows,
      sources: sources.rows,
      activeHours
    };
  }

  private async computeWebTotals(projectId: string, from: Date, to: Date): Promise<WebTotals> {
    const result = await this.database.query<{
      visitors: number;
      pageviews: number;
      sessions: number;
      avg_duration: number;
      bounce_rate: number;
    }>(
      `
        WITH ev AS (
          SELECT COALESCE(user_id::text, anonymous_id) AS actor, session_id, event_name, occurred_at
          FROM events WHERE project_id = $1 AND occurred_at >= $2 AND occurred_at < $3
        ),
        sess AS (
          SELECT session_id,
            EXTRACT(EPOCH FROM (max(occurred_at) - min(occurred_at))) AS duration,
            count(*) FILTER (WHERE event_name = '$page') AS pageviews
          FROM ev WHERE session_id IS NOT NULL GROUP BY session_id
        )
        SELECT
          (SELECT count(DISTINCT actor) FROM ev WHERE actor IS NOT NULL)::int AS visitors,
          (SELECT count(*) FROM ev WHERE event_name = '$page')::int AS pageviews,
          (SELECT count(*) FROM sess)::int AS sessions,
          COALESCE((SELECT avg(duration) FROM sess), 0)::float AS avg_duration,
          COALESCE((SELECT (count(*) FILTER (WHERE pageviews <= 1))::float / NULLIF(count(*), 0) FROM sess), 0)::float AS bounce_rate
      `,
      [projectId, from.toISOString(), to.toISOString()]
    );

    const row = result.rows[0];
    return {
      visitors: row?.visitors ?? 0,
      pageviews: row?.pageviews ?? 0,
      sessions: row?.sessions ?? 0,
      avgSessionDuration: Math.round(row?.avg_duration ?? 0),
      bounceRate: row?.bounce_rate ?? 0
    };
  }

  private clampWebDays(value?: string): number {
    const parsed = value ? Number(value) : undefined;
    if (parsed === undefined || !Number.isFinite(parsed)) {
      return 7;
    }
    return Math.min(Math.max(Math.trunc(parsed), 1), 365);
  }

  private zeroFill(buckets: string[], rows: Array<{ bucket: string; total: number; uniques?: number }>): TrendPoint[] {
    const byBucket = new Map(rows.map((row) => [row.bucket, row]));
    return buckets.map((bucket) => {
      const row = byBucket.get(bucket);
      return { bucket, total: row?.total ?? 0, uniques: row?.uniques ?? 0 };
    });
  }

  private generateBuckets(from: Date, to: Date, interval: TrendInterval): string[] {
    const buckets: string[] = [];
    let cursor = this.truncateUtc(from, interval);
    const end = to.getTime();
    let guard = 0;

    while (cursor.getTime() < end && guard < 10000) {
      buckets.push(this.toIsoZ(cursor));
      cursor = new Date(cursor.getTime() + this.stepMs(interval));
      guard += 1;
    }

    return buckets;
  }

  private truncateUtc(date: Date, interval: TrendInterval): Date {
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth();
    const d = date.getUTCDate();
    const h = date.getUTCHours();

    if (interval === 'hour') {
      return new Date(Date.UTC(y, m, d, h));
    }

    if (interval === 'week') {
      const day = new Date(Date.UTC(y, m, d));
      // Postgres date_trunc('week') is Monday-based (ISO).
      const mondayOffset = (day.getUTCDay() + 6) % 7;
      return new Date(day.getTime() - mondayOffset * DAY_MS);
    }

    return new Date(Date.UTC(y, m, d));
  }

  private stepMs(interval: TrendInterval): number {
    if (interval === 'hour') return 60 * 60 * 1000;
    if (interval === 'week') return 7 * DAY_MS;
    return DAY_MS;
  }

  private toIsoZ(date: Date): string {
    // Matches the Postgres to_char output: second precision, trailing Z.
    return `${date.toISOString().slice(0, 19)}Z`;
  }

  private parseInterval(value?: string): TrendInterval {
    const candidate = (value ?? 'day').toLowerCase();
    if (!ALLOWED_INTERVALS.includes(candidate as TrendInterval)) {
      throw new BadRequestException(`interval must be one of: ${ALLOWED_INTERVALS.join(', ')}.`);
    }
    return candidate as TrendInterval;
  }

  private clampDays(value: string | undefined, interval: TrendInterval): number {
    const parsed = value ? Number(value) : undefined;
    const fallback = interval === 'hour' ? 2 : interval === 'week' ? 84 : 30;
    if (parsed === undefined || !Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(Math.max(Math.trunc(parsed), 1), 365);
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`${field} is required.`);
    }
    return value.trim();
  }

  private optionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
}
