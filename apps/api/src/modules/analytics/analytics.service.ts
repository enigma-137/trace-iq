import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService, ResolvedProject } from '../projects/projects.service';
import { DIMENSION_SOURCES, FilterCondition, buildFilterClause, parseFiltersParam } from '../../common/filters';
import { ALLOWED_MEASURES, NUMERIC_GUARD, TrendMeasure, buildMeasureExpr } from '../../common/measures';

type TrendInterval = 'hour' | 'day' | 'week';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const ALLOWED_INTERVALS: TrendInterval[] = ['hour', 'day', 'week'];
const BUCKET_FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS"Z"';

export interface TrendPoint {
  bucket: string;
  total: number;
  uniques: number;
  value: number;
}

type ApiGroupRow = {
  [column: string]: unknown;
  method: string;
  path: string;
  count: number;
  avg: number;
  p95: number;
  status: number;
  errors: number;
};

type ApiErrorRow = {
  [column: string]: unknown;
  method: string;
  path: string;
  status: number;
  count: number;
};

type ApiSummaryRow = {
  [column: string]: unknown;
  total: number;
  errors: number;
  avg: number;
  p95: number;
};

export interface TrendSeries {
  key: string;
  points: TrendPoint[];
}

export interface TrendsResponse {
  project: ResolvedProject;
  event: string;
  interval: TrendInterval;
  measure: TrendMeasure;
  property: string | null;
  from: string;
  to: string;
  breakdown: string | null;
  buckets: string[];
  series: TrendSeries[];
  // Accurate whole-window totals for the headline stat + period-over-period comparison.
  // (Unique/avg can't be derived by summing buckets, so they're computed separately.)
  summary: {
    current: number;
    previous: number;
    days: number;
  };
}

export interface OverviewResponse {
  project: ResolvedProject | null;
  totals: {
    events: number;
    events24h: number;
    events1h: number;
    users: number;
    sessions: number;
  };
  // When the last event was received — drives the availability/freshness readout.
  lastEventAt: string | null;
  // GTV = sum of the numeric `amount` property across events (last 30d vs the 30d before).
  revenue: {
    total: number;
    previous: number;
    transactions: number;
  };
  topEvents: Array<{ eventName: string; total: number }>;
  topDevices: Array<{ name: string; total: number }>;
  topCountries: Array<{ name: string; total: number }>;
  topReferrers: Array<{ domain: string; visitors: number; views: number }>;
  sparkline: TrendPoint[];
}

export interface RetentionCohort {
  cohort: string; // ISO date of the cohort's week start (UTC Monday)
  size: number; // actors whose first-ever event fell in this week
  periods: Array<number | null>; // returning-actor count per week offset; null = week not elapsed yet
}

export interface RetentionResponse {
  project: ResolvedProject | null;
  weeks: number;
  cohorts: RetentionCohort[];
  averages: number[]; // size-weighted retention % per period (period 0 = 100)
  summary: { week1: number; week4: number };
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
  browsers: Array<{ name: string; total: number }>;
  operatingSystems: Array<{ name: string; total: number }>;
  countries: Array<{ name: string; total: number }>;
  sources: Array<{ channel: string; visitors: number }>;
  referrers: Array<{ domain: string; visitors: number; views: number }>;
  campaigns: Array<{ campaign: string; source: string; medium: string; visitors: number; views: number }>;
  goals: Array<{ id: string; name: string; type: 'page' | 'event'; target: string; conversions: number; occurrences: number; conversionRate: number }>;
  filters: FilterCondition[];
  journey: {
    sessions: number;
    columns: Array<{ step: number; nodes: Array<{ path: string; sessions: number }> }>;
    transitions: Array<{ fromStep: number; fromPath: string; toStep: number; toPath: string; sessions: number }>;
  };
  webVitals: {
    metrics: Array<{ metric: string; p75: number; count: number; good: number; needsImprovement: number; poor: number }>;
    pages: Array<{ path: string; metric: string; p75: number; count: number; poor: number }>;
  };
  activeHours: number[][];
  frustratingPages: Array<{ path: string; errors: number; rageClicks: number; users: number }>;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService
  ) {}

  async getOverview(
    user: DashboardUser,
    projectId?: string,
    organizationId?: string
  ): Promise<OverviewResponse> {
    const project = await this.projects.resolveActiveProject(user, projectId, organizationId);

    if (!project) {
      return {
        project: null,
        totals: { events: 0, events24h: 0, events1h: 0, users: 0, sessions: 0 },
        lastEventAt: null,
        revenue: { total: 0, previous: 0, transactions: 0 },
        topEvents: [],
        topDevices: [],
        topCountries: [],
        topReferrers: [],
        sparkline: []
      };
    }

    const totalsResult = await this.database.query<{
      total_events: number;
      events_24h: number;
      events_1h: number;
      total_users: number;
      total_sessions: number;
      last_event_at: string | null;
    }>(
      `
        SELECT
          (SELECT count(*) FROM events WHERE project_id = $1)::int AS total_events,
          (SELECT count(*) FROM events WHERE project_id = $1 AND occurred_at >= now() - interval '24 hours')::int AS events_24h,
          (SELECT count(*) FROM events WHERE project_id = $1 AND occurred_at >= now() - interval '1 hour')::int AS events_1h,
          (SELECT count(*) FROM users WHERE project_id = $1)::int AS total_users,
          (SELECT count(*) FROM sessions WHERE project_id = $1)::int AS total_sessions,
          (SELECT max(occurred_at) FROM events WHERE project_id = $1) AS last_event_at
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

    const topReferrers = await this.database.query<{ domain: string; visitors: number; views: number }>(
      `SELECT
        CASE WHEN ref IS NULL OR ref = '' THEN 'Direct'
          ELSE COALESCE(NULLIF(regexp_replace(split_part(split_part(regexp_replace(ref, '^[a-z][a-z0-9+.-]*://', '', 'i'), '/', 1), ':', 1), '^www\\.', '', 'i'), ''), 'Direct')
        END AS domain,
        count(DISTINCT actor)::int AS visitors,
        count(*)::int AS views
       FROM (
         SELECT context->'page'->>'referrer' AS ref, COALESCE(user_id::text, anonymous_id) AS actor
         FROM events WHERE project_id = $1 AND event_name = '$page'
           AND occurred_at >= now() - interval '30 days'
       ) pageviews
       GROUP BY 1 ORDER BY views DESC LIMIT 6`,
      [project.id]
    );

    const revenueResult = await this.database.query<{
      current_revenue: number;
      previous_revenue: number;
      current_transactions: number;
    }>(
      `
        WITH rev AS (
          SELECT
            occurred_at,
            CASE WHEN properties->>'amount' ~ ${NUMERIC_GUARD} THEN (properties->>'amount')::numeric END AS amount
          FROM events
          WHERE project_id = $1 AND occurred_at >= now() - interval '60 days'
        )
        SELECT
          COALESCE(sum(amount) FILTER (WHERE occurred_at >= now() - interval '30 days'), 0)::float AS current_revenue,
          COALESCE(sum(amount) FILTER (WHERE occurred_at < now() - interval '30 days'), 0)::float AS previous_revenue,
          count(amount) FILTER (WHERE occurred_at >= now() - interval '30 days')::int AS current_transactions
        FROM rev
      `,
      [project.id]
    );

    const to = new Date();
    const from = new Date(to.getTime() - 14 * DAY_MS);
    const sparkline = this.zeroFill(this.generateBuckets(from, to, 'day'), sparklineRows.rows);

    const totals = totalsResult.rows[0];
    const revenue = revenueResult.rows[0];

    return {
      project,
      totals: {
        events: totals?.total_events ?? 0,
        events24h: totals?.events_24h ?? 0,
        events1h: totals?.events_1h ?? 0,
        users: totals?.total_users ?? 0,
        sessions: totals?.total_sessions ?? 0
      },
      lastEventAt: totals?.last_event_at ?? null,
      revenue: {
        total: revenue?.current_revenue ?? 0,
        previous: revenue?.previous_revenue ?? 0,
        transactions: revenue?.current_transactions ?? 0
      },
      topEvents: topEventsResult.rows,
      topDevices: topDevices.rows,
      topCountries: topCountries.rows,
      topReferrers: topReferrers.rows,
      sparkline
    };
  }

  async listEventNames(user: DashboardUser, projectId?: string) {
    const project = await this.projects.resolveActiveProject(user, projectId);

    if (!project) {
      return { project: null, eventNames: [] as Array<{ eventName: string; total: number; actors: number }> };
    }

    const result = await this.database.query<{ eventName: string; total: number; actors: number }>(
      `
        SELECT
          event_name AS "eventName",
          count(*)::int AS total,
          count(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS actors
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
    params: {
      event?: string;
      interval?: string;
      days?: string;
      from?: string;
      to?: string;
      breakdown?: string;
      measure?: string;
      property?: string;
      filters?: string;
      projectId?: string;
    }
  ): Promise<TrendsResponse> {
    const event = this.requiredString(params.event, 'event');
    const interval = this.parseInterval(params.interval);
    const measure = this.parseMeasure(params.measure);
    const filters = parseFiltersParam(params.filters);
    // A property is only meaningful (and required) for sum/avg aggregations.
    const property =
      measure === 'sum' || measure === 'avg'
        ? this.requiredString(params.property, 'property')
        : this.optionalString(params.property) ?? null;
    const presetDays = this.clampDays(params.days, interval);
    const breakdown = this.optionalString(params.breakdown) ?? null;
    const project = await this.projects.requireActiveProject(user, params.projectId);

    // Prefer an explicit free-form range; otherwise fall back to the preset window.
    const range = this.resolveRange(params.from, params.to, presetDays);
    const to = range.to;
    const from = range.from;
    const buckets = this.generateBuckets(from, to, interval);

    let series: TrendSeries[];

    if (breakdown) {
      const dimensionSource = DIMENSION_SOURCES[breakdown.toLowerCase()];
      const queryParams: unknown[] = [project.id, event, interval, from.toISOString(), to.toISOString()];

      let breakdownExpr: string;
      if (dimensionSource) {
        breakdownExpr = `COALESCE(NULLIF(${dimensionSource}, ''), '(none)')`;
      } else {
        queryParams.push(breakdown);
        breakdownExpr = `COALESCE(NULLIF(properties->>$${queryParams.length}, ''), '(none)')`;
      }

      const valueExpr = buildMeasureExpr(measure, property, queryParams);
      const filterClause = buildFilterClause(filters, queryParams);

      const rows = await this.database.query<{ bucket: string; breakdown_key: string; total: number; value: number }>(
        `
          SELECT
            to_char(date_trunc($3, occurred_at AT TIME ZONE 'UTC'), '${BUCKET_FORMAT}') AS bucket,
            ${breakdownExpr} AS breakdown_key,
            count(*)::int AS total,
            ${valueExpr} AS value
          FROM events
          WHERE project_id = $1 AND event_name = $2
            AND occurred_at >= $4 AND occurred_at < $5${filterClause}
          GROUP BY 1, 2
          ORDER BY 1 ASC
        `,
        queryParams
      );

      const byKey = new Map<string, Map<string, { total: number; value: number }>>();
      for (const row of rows.rows) {
        const keyMap = byKey.get(row.breakdown_key) ?? new Map<string, { total: number; value: number }>();
        keyMap.set(row.bucket, { total: row.total, value: row.value });
        byKey.set(row.breakdown_key, keyMap);
      }

      series = [...byKey.entries()].map(([key, keyMap]) => ({
        key,
        points: buckets.map((bucket) => {
          const entry = keyMap.get(bucket);
          return { bucket, total: entry?.total ?? 0, uniques: 0, value: entry?.value ?? 0 };
        })
      }));
    } else {
      const queryParams: unknown[] = [project.id, event, interval, from.toISOString(), to.toISOString()];
      const valueExpr = buildMeasureExpr(measure, property, queryParams);
      const filterClause = buildFilterClause(filters, queryParams);

      const rows = await this.database.query<{ bucket: string; total: number; uniques: number; value: number }>(
        `
          SELECT
            to_char(date_trunc($3, occurred_at AT TIME ZONE 'UTC'), '${BUCKET_FORMAT}') AS bucket,
            count(*)::int AS total,
            count(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS uniques,
            ${valueExpr} AS value
          FROM events
          WHERE project_id = $1 AND event_name = $2
            AND occurred_at >= $4 AND occurred_at < $5${filterClause}
          GROUP BY 1
          ORDER BY 1 ASC
        `,
        queryParams
      );

      series = [{ key: event, points: this.zeroFill(buckets, rows.rows) }];
    }

    const previousFrom = new Date(from.getTime() - range.rangeMs);
    const [current, previous] = await Promise.all([
      this.computeMeasureTotal(project.id, event, from, to, measure, property, filters),
      this.computeMeasureTotal(project.id, event, previousFrom, from, measure, property, filters)
    ]);

    const days = Math.max(1, Math.round(range.rangeMs / DAY_MS));

    return {
      project,
      event,
      interval,
      measure,
      property,
      from: from.toISOString(),
      to: to.toISOString(),
      breakdown,
      buckets,
      series,
      summary: { current, previous, days }
    };
  }

  // Single-number aggregate over the whole window — used for the headline stat and the
  // previous-period comparison. Correct for unique/avg where per-bucket sums would not be.
  private async computeMeasureTotal(
    projectId: string,
    event: string,
    from: Date,
    to: Date,
    measure: TrendMeasure,
    property: string | null,
    filters: FilterCondition[] = []
  ): Promise<number> {
    const queryParams: unknown[] = [projectId, event, from.toISOString(), to.toISOString()];
    const valueExpr = buildMeasureExpr(measure, property, queryParams);
    const filterClause = buildFilterClause(filters, queryParams);
    const result = await this.database.query<{ value: number }>(
      `
        SELECT ${valueExpr} AS value
        FROM events
        WHERE project_id = $1 AND event_name = $2
          AND occurred_at >= $3 AND occurred_at < $4${filterClause}
      `,
      queryParams
    );
    return result.rows[0]?.value ?? 0;
  }

  // Weekly retention: group actors by the week of their first-ever event, then count how
  // many returned in each later week. Actor = COALESCE(user_id, anonymous_id).
  async getRetention(
    user: DashboardUser,
    params: { weeks?: string; filters?: string; projectId?: string }
  ): Promise<RetentionResponse> {
    const weeks = this.clampWeeks(params.weeks);
    const project = await this.projects.resolveActiveProject(user, params.projectId);
    if (!project) {
      return { project: null, weeks, cohorts: [], averages: [], summary: { week1: 0, week4: 0 } };
    }

    const now = new Date();
    const currentWeek = this.truncateUtc(now, 'week');
    const windowStart = new Date(currentWeek.getTime() - (weeks - 1) * WEEK_MS);
    const maxPeriod = weeks - 1;

    const queryParams: unknown[] = [project.id, windowStart.toISOString(), maxPeriod];
    const filters = parseFiltersParam(params.filters);
    const filterClause = buildFilterClause(filters, queryParams);

    const rows = await this.database.query<{ cohort: string; period: number; actors: number }>(
      `
        WITH base AS (
          SELECT COALESCE(user_id::text, anonymous_id) AS actor, occurred_at
          FROM events
          WHERE project_id = $1 AND COALESCE(user_id::text, anonymous_id) IS NOT NULL${filterClause}
        ),
        first_seen AS (
          SELECT actor, MIN(occurred_at) AS first_at FROM base GROUP BY actor
        ),
        cohorts AS (
          SELECT actor, date_trunc('week', first_at AT TIME ZONE 'UTC') AS cohort_week
          FROM first_seen
          WHERE first_at >= $2
        ),
        activity AS (
          SELECT
            c.cohort_week,
            c.actor,
            floor(
              EXTRACT(EPOCH FROM (date_trunc('week', b.occurred_at AT TIME ZONE 'UTC') - c.cohort_week)) / 604800
            )::int AS period
          FROM base b
          JOIN cohorts c ON c.actor = b.actor
        )
        SELECT to_char(cohort_week, 'YYYY-MM-DD') AS cohort, period, count(DISTINCT actor)::int AS actors
        FROM activity
        WHERE period >= 0 AND period <= $3
        GROUP BY cohort_week, period
        ORDER BY cohort_week DESC, period ASC
      `,
      queryParams
    );

    const byCohort = new Map<string, Map<number, number>>();
    for (const row of rows.rows) {
      const periodMap = byCohort.get(row.cohort) ?? new Map<number, number>();
      periodMap.set(row.period, row.actors);
      byCohort.set(row.cohort, periodMap);
    }

    const cohorts: RetentionCohort[] = [];
    const periodSums = Array.from({ length: weeks }, () => ({ returned: 0, base: 0 }));

    // Walk newest → oldest week. A cohort formed i weeks ago has i periods elapsed.
    for (let i = 0; i < weeks; i += 1) {
      const cohortDate = new Date(currentWeek.getTime() - i * WEEK_MS);
      const key = cohortDate.toISOString().slice(0, 10);
      const periodMap = byCohort.get(key);
      const size = periodMap?.get(0) ?? 0;
      const periods: Array<number | null> = [];

      for (let p = 0; p < weeks; p += 1) {
        if (p > i) {
          periods.push(null); // this week hasn't happened for this cohort yet
          continue;
        }
        const count = periodMap?.get(p) ?? 0;
        periods.push(count);
        if (size > 0) {
          periodSums[p].returned += count;
          periodSums[p].base += size;
        }
      }

      cohorts.push({ cohort: key, size, periods });
    }

    const averages = periodSums.map((sum) => (sum.base > 0 ? Math.round((sum.returned / sum.base) * 100) : 0));

    return {
      project,
      weeks,
      cohorts,
      averages,
      summary: { week1: averages[1] ?? 0, week4: averages[4] ?? 0 }
    };
  }

  private clampWeeks(value?: string): number {
    const parsed = value ? Number(value) : undefined;
    if (parsed === undefined || !Number.isFinite(parsed)) {
      return 8;
    }
    return Math.min(Math.max(Math.trunc(parsed), 2), 26);
  }

  async getWebAnalytics(
    user: DashboardUser,
    params: { days?: string; filters?: string; projectId?: string } = {}
  ): Promise<WebAnalyticsResponse> {
    const project = await this.projects.resolveActiveProject(user, params.projectId);
    const days = this.clampWebDays(params.days);
    const filters = parseFiltersParam(params.filters);
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
        browsers: [],
        operatingSystems: [],
        countries: [],
        sources: [],
        referrers: [],
        campaigns: [],
        goals: [],
        filters,
        journey: { sessions: 0, columns: [], transitions: [] },
        webVitals: { metrics: [], pages: [] },
        activeHours: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)),
        frustratingPages: []
      };
    }

    const to = new Date();
    const from = new Date(to.getTime() - days * DAY_MS);
    const prevTo = from;
    const prevFrom = new Date(from.getTime() - days * DAY_MS);

    const [current, previous] = await Promise.all([
      this.computeWebTotals(project.id, from, to, filters),
      this.computeWebTotals(project.id, prevFrom, prevTo, filters)
    ]);

    const trendQuery = this.webFilterQuery(project.id, from, to, filters);
    const trendRows = await this.database.query<{ bucket: string; total: number }>(
      `
        SELECT to_char(date_trunc('day', occurred_at AT TIME ZONE 'UTC'), '${BUCKET_FORMAT}') AS bucket,
          count(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS total
        FROM events
        WHERE project_id = $1 AND occurred_at >= $2 AND occurred_at < $3${trendQuery.clause}
        GROUP BY 1 ORDER BY 1 ASC
      `,
      trendQuery.values
    );
    const visitorsTrend = this.zeroFill(this.generateBuckets(from, to, 'day'), trendRows.rows);

    const pathsQuery = this.webFilterQuery(project.id, from, to, filters);
    const topPaths = await this.database.query<{ path: string; visitors: number; views: number }>(
      `
        SELECT COALESCE(NULLIF(context->'page'->>'path', ''), '(unknown)') AS path,
          count(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS visitors,
          count(*)::int AS views
        FROM events
        WHERE project_id = $1 AND event_name = '$page' AND occurred_at >= $2 AND occurred_at < $3${pathsQuery.clause}
        GROUP BY 1 ORDER BY views DESC LIMIT 10
      `,
      pathsQuery.values
    );

    const devicesQuery = this.webFilterQuery(project.id, from, to, filters);
    const devices = await this.database.query<{ name: string; total: number }>(
      `
        SELECT COALESCE(NULLIF(device_info->>'deviceType', ''), 'unknown') AS name,
          count(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS total
        FROM events WHERE project_id = $1 AND event_name = '$page' AND occurred_at >= $2 AND occurred_at < $3${devicesQuery.clause}
        GROUP BY 1 ORDER BY total DESC LIMIT 6
      `,
      devicesQuery.values
    );

    const browserQuery = this.webFilterQuery(project.id, from, to, filters);
    const browsers = await this.database.query<{ name: string; total: number }>(
      `SELECT COALESCE(NULLIF(device_info->>'browser', ''), 'unknown') AS name,
        count(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS total
       FROM events WHERE project_id = $1 AND event_name = '$page' AND occurred_at >= $2 AND occurred_at < $3${browserQuery.clause}
       GROUP BY 1 ORDER BY total DESC LIMIT 8`, browserQuery.values
    );

    const osQuery = this.webFilterQuery(project.id, from, to, filters);
    const operatingSystems = await this.database.query<{ name: string; total: number }>(
      `SELECT COALESCE(NULLIF(device_info->>'os', ''), 'unknown') AS name,
        count(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS total
       FROM events WHERE project_id = $1 AND event_name = '$page' AND occurred_at >= $2 AND occurred_at < $3${osQuery.clause}
       GROUP BY 1 ORDER BY total DESC LIMIT 8`, osQuery.values
    );

    const countriesQuery = this.webFilterQuery(project.id, from, to, filters);
    const countries = await this.database.query<{ name: string; total: number }>(
      `
        SELECT COALESCE(NULLIF(network_info->>'country', ''), 'unknown') AS name,
          count(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS total
        FROM events WHERE project_id = $1 AND event_name = '$page' AND occurred_at >= $2 AND occurred_at < $3${countriesQuery.clause}
        GROUP BY 1 ORDER BY total DESC LIMIT 8
      `,
      countriesQuery.values
    );

    const sourcesQuery = this.webFilterQuery(project.id, from, to, filters);
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
          FROM events WHERE project_id = $1 AND event_name = '$page' AND occurred_at >= $2 AND occurred_at < $3${sourcesQuery.clause}
        ) s
        GROUP BY 1 ORDER BY visitors DESC
      `,
      sourcesQuery.values
    );

    const referrersQuery = this.webFilterQuery(project.id, from, to, filters);
    const referrers = await this.database.query<{ domain: string; visitors: number; views: number }>(
      `
        SELECT
          CASE
            WHEN ref IS NULL OR ref = '' THEN 'Direct'
            ELSE COALESCE(
              NULLIF(
                regexp_replace(
                  split_part(split_part(regexp_replace(ref, '^[a-z][a-z0-9+.-]*://', '', 'i'), '/', 1), ':', 1),
                  '^www\\.',
                  '',
                  'i'
                ),
                ''
              ),
              'Direct'
            )
          END AS domain,
          count(DISTINCT actor)::int AS visitors,
          count(*)::int AS views
        FROM (
          SELECT context->'page'->>'referrer' AS ref, COALESCE(user_id::text, anonymous_id) AS actor
          FROM events
          WHERE project_id = $1 AND event_name = '$page' AND occurred_at >= $2 AND occurred_at < $3${referrersQuery.clause}
        ) s
        GROUP BY 1
        ORDER BY views DESC
        LIMIT 10
      `,
      referrersQuery.values
    );

    const hoursQuery = this.webFilterQuery(project.id, from, to, filters);
    const hourRows = await this.database.query<{ dow: number; hour: number; total: number }>(
      `
        SELECT EXTRACT(DOW FROM occurred_at AT TIME ZONE 'UTC')::int AS dow,
          EXTRACT(HOUR FROM occurred_at AT TIME ZONE 'UTC')::int AS hour,
          count(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS total
        FROM events WHERE project_id = $1 AND occurred_at >= $2 AND occurred_at < $3${hoursQuery.clause}
        GROUP BY 1, 2
      `,
      hoursQuery.values
    );
    const activeHours = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
    for (const row of hourRows.rows) {
      if (row.dow >= 0 && row.dow < 7 && row.hour >= 0 && row.hour < 24) {
        activeHours[row.dow][row.hour] = row.total;
      }
    }

    const frustrationQuery = this.webFilterQuery(project.id, from, to, filters);
    const frustratingPages = await this.database.query<{ path: string; errors: number; rageClicks: number; users: number }>(
      `
        SELECT
          path,
          count(*) FILTER (WHERE event_name = '$exception')::int AS errors,
          count(*) FILTER (WHERE event_name = '$rageclick')::int AS "rageClicks",
          count(DISTINCT actor)::int AS users
        FROM (
          SELECT
            COALESCE(NULLIF(context->'page'->>'path', ''), '(unknown)') AS path,
            event_name,
            COALESCE(user_id::text, anonymous_id) AS actor
          FROM events
          WHERE project_id = $1 AND occurred_at >= $2 AND occurred_at < $3
            AND event_name IN ('$exception', '$rageclick')${frustrationQuery.clause}
        ) s
        GROUP BY path
        ORDER BY (
          count(*) FILTER (WHERE event_name = '$exception') + count(*) FILTER (WHERE event_name = '$rageclick')
        ) DESC
        LIMIT 10
      `,
      frustrationQuery.values
    );

    const campaignQuery = this.webFilterQuery(project.id, from, to, filters);
    const campaigns = await this.database.query<{ campaign: string; source: string; medium: string; visitors: number; views: number }>(
      `SELECT context->'page'->'utm'->>'campaign' AS campaign,
        COALESCE(NULLIF(context->'page'->'utm'->>'source', ''), '(not set)') AS source,
        COALESCE(NULLIF(context->'page'->'utm'->>'medium', ''), '(not set)') AS medium,
        count(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS visitors,
        count(*)::int AS views
       FROM events
       WHERE project_id = $1 AND event_name = '$page' AND occurred_at >= $2 AND occurred_at < $3
         AND NULLIF(context->'page'->'utm'->>'campaign', '') IS NOT NULL${campaignQuery.clause}
       GROUP BY 1, 2, 3 ORDER BY visitors DESC LIMIT 20`,
      campaignQuery.values
    );

    const goalRows = await this.database.query<{ id: string; name: string; type: 'page' | 'event'; target: string }>(
      `SELECT id, name, goal_type AS type, target_value AS target FROM analytics_goals
       WHERE project_id = $1 ORDER BY created_at DESC`, [project.id]
    );
    const goals = await Promise.all(goalRows.rows.map(async (goal) => {
      const query = this.webFilterQuery(project.id, from, to, filters);
      query.values.push(goal.target);
      const targetParam = query.values.length;
      const match = goal.type === 'page'
        ? `event_name = '$page' AND context->'page'->>'path' = $${targetParam}`
        : `event_name = $${targetParam}`;
      const result = await this.database.query<{ conversions: number; occurrences: number }>(
        `SELECT count(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS conversions,
          count(*)::int AS occurrences FROM events
         WHERE project_id = $1 AND occurred_at >= $2 AND occurred_at < $3 AND ${match}${query.clause}`,
        query.values
      );
      const conversion = result.rows[0] ?? { conversions: 0, occurrences: 0 };
      return { ...goal, ...conversion, conversionRate: current.visitors > 0 ? conversion.conversions / current.visitors : 0 };
    }));

    const journeyQuery = this.webFilterQuery(project.id, from, to, filters);
    const journeyRows = await this.database.query<{ step: number; path: string; sessions: number }>(
      `WITH ordered_pages AS (
         SELECT session_id,
           COALESCE(NULLIF(context->'page'->>'path', ''), '(unknown)') AS path,
           row_number() OVER (PARTITION BY session_id ORDER BY occurred_at, id) AS step
         FROM events
         WHERE project_id = $1 AND event_name = '$page' AND session_id IS NOT NULL
           AND occurred_at >= $2 AND occurred_at < $3${journeyQuery.clause}
       ), ranked AS (
         SELECT step::int, path, count(DISTINCT session_id)::int AS sessions,
           row_number() OVER (PARTITION BY step ORDER BY count(DISTINCT session_id) DESC, path) AS popularity
         FROM ordered_pages WHERE step <= 4 GROUP BY step, path
       )
       SELECT step, path, sessions FROM ranked WHERE popularity <= 6 ORDER BY step, sessions DESC`,
      journeyQuery.values
    );
    const transitionQuery = this.webFilterQuery(project.id, from, to, filters);
    const transitionRows = await this.database.query<{ fromStep: number; fromPath: string; toStep: number; toPath: string; sessions: number }>(
      `WITH ordered_pages AS (
         SELECT session_id,
           COALESCE(NULLIF(context->'page'->>'path', ''), '(unknown)') AS path,
           row_number() OVER (PARTITION BY session_id ORDER BY occurred_at, id) AS step
         FROM events
         WHERE project_id = $1 AND event_name = '$page' AND session_id IS NOT NULL
           AND occurred_at >= $2 AND occurred_at < $3${transitionQuery.clause}
       )
       SELECT a.step::int AS "fromStep", a.path AS "fromPath",
         b.step::int AS "toStep", b.path AS "toPath", count(DISTINCT a.session_id)::int AS sessions
       FROM ordered_pages a JOIN ordered_pages b ON b.session_id = a.session_id AND b.step = a.step + 1
       WHERE a.step < 4
       GROUP BY a.step, a.path, b.step, b.path
       ORDER BY sessions DESC LIMIT 60`,
      transitionQuery.values
    );
    const journeySessions = journeyRows.rows
      .filter((row) => row.step === 1)
      .reduce((sum, row) => sum + row.sessions, 0);
    const journey = {
      sessions: journeySessions,
      columns: [1, 2, 3, 4]
        .map((step) => ({ step, nodes: journeyRows.rows.filter((row) => row.step === step).map(({ path, sessions }) => ({ path, sessions })) }))
        .filter((column) => column.nodes.length > 0),
      transitions: transitionRows.rows
    };

    const vitalsQuery = this.webFilterQuery(project.id, from, to, filters);
    const vitalMetrics = await this.database.query<{ metric: string; p75: number; count: number; good: number; needsImprovement: number; poor: number }>(
      `SELECT properties->>'metric' AS metric,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY (properties->>'value')::double precision)::float AS p75,
        count(*)::int AS count,
        count(*) FILTER (WHERE properties->>'rating' = 'good')::int AS good,
        count(*) FILTER (WHERE properties->>'rating' = 'needs-improvement')::int AS "needsImprovement",
        count(*) FILTER (WHERE properties->>'rating' = 'poor')::int AS poor
       FROM events
       WHERE project_id = $1 AND event_name = '$web_vital' AND occurred_at >= $2 AND occurred_at < $3
         AND properties->>'metric' IN ('CLS', 'INP', 'LCP', 'FCP', 'TTFB')
         AND properties->>'value' ~ '^-?[0-9]+(?:\\.[0-9]+)?$'${vitalsQuery.clause}
       GROUP BY 1 ORDER BY 1`, vitalsQuery.values
    );
    const vitalPagesQuery = this.webFilterQuery(project.id, from, to, filters);
    const vitalPages = await this.database.query<{ path: string; metric: string; p75: number; count: number; poor: number }>(
      `SELECT COALESCE(NULLIF(context->'page'->>'path', ''), '(unknown)') AS path,
        properties->>'metric' AS metric,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY (properties->>'value')::double precision)::float AS p75,
        count(*)::int AS count,
        count(*) FILTER (WHERE properties->>'rating' = 'poor')::int AS poor
       FROM events
       WHERE project_id = $1 AND event_name = '$web_vital' AND occurred_at >= $2 AND occurred_at < $3
         AND properties->>'metric' IN ('CLS', 'INP', 'LCP', 'FCP', 'TTFB')
         AND properties->>'value' ~ '^-?[0-9]+(?:\\.[0-9]+)?$'${vitalPagesQuery.clause}
       GROUP BY 1, 2 HAVING count(*) >= 1
       ORDER BY poor DESC, p75 DESC LIMIT 20`, vitalPagesQuery.values
    );

    return {
      project,
      days,
      current,
      previous,
      visitorsTrend,
      topPaths: topPaths.rows,
      devices: devices.rows,
      browsers: browsers.rows,
      operatingSystems: operatingSystems.rows,
      countries: countries.rows,
      sources: sources.rows,
      referrers: referrers.rows,
      campaigns: campaigns.rows,
      goals,
      filters,
      journey,
      webVitals: { metrics: vitalMetrics.rows, pages: vitalPages.rows },
      activeHours,
      frustratingPages: frustratingPages.rows
    };
  }

  async getWebRealtime(user: DashboardUser, params: { filters?: string; projectId?: string } = {}) {
    const project = await this.projects.resolveActiveProject(user, params.projectId);
    if (!project) return { project: null, windowMinutes: 5, visitors: 0, pageviews: 0, topPaths: [] };
    const to = new Date();
    const from = new Date(to.getTime() - 5 * 60 * 1000);
    const query = this.webFilterQuery(project.id, from, to, parseFiltersParam(params.filters));
    const totals = await this.database.query<{ visitors: number; pageviews: number }>(
      `SELECT count(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS visitors,
        count(*) FILTER (WHERE event_name = '$page')::int AS pageviews
       FROM events WHERE project_id = $1 AND occurred_at >= $2 AND occurred_at < $3${query.clause}`,
      query.values
    );
    const pathsQuery = this.webFilterQuery(project.id, from, to, parseFiltersParam(params.filters));
    const paths = await this.database.query<{ path: string; visitors: number }>(
      `SELECT COALESCE(NULLIF(context->'page'->>'path', ''), '(unknown)') AS path,
        count(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS visitors
       FROM events WHERE project_id = $1 AND event_name = '$page' AND occurred_at >= $2 AND occurred_at < $3${pathsQuery.clause}
       GROUP BY 1 ORDER BY visitors DESC LIMIT 5`, pathsQuery.values
    );
    return { project, windowMinutes: 5, visitors: totals.rows[0]?.visitors ?? 0, pageviews: totals.rows[0]?.pageviews ?? 0, topPaths: paths.rows };
  }

  private async computeWebTotals(projectId: string, from: Date, to: Date, filters: FilterCondition[]): Promise<WebTotals> {
    const query = this.webFilterQuery(projectId, from, to, filters);
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
          FROM events WHERE project_id = $1 AND occurred_at >= $2 AND occurred_at < $3${query.clause}
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
      query.values
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

  private webFilterQuery(projectId: string, from: Date, to: Date, filters: FilterCondition[]) {
    const values: unknown[] = [projectId, from.toISOString(), to.toISOString()];
    return { values, clause: buildFilterClause(filters, values) };
  }

  private clampWebDays(value?: string): number {
    const parsed = value ? Number(value) : undefined;
    if (parsed === undefined || !Number.isFinite(parsed)) {
      return 7;
    }
    return Math.min(Math.max(Math.trunc(parsed), 1), 365);
  }

  private zeroFill(
    buckets: string[],
    rows: Array<{ bucket: string; total: number; uniques?: number; value?: number }>
  ): TrendPoint[] {
    const byBucket = new Map(rows.map((row) => [row.bucket, row]));
    return buckets.map((bucket) => {
      const row = byBucket.get(bucket);
      // `value` defaults to `total` for callers (web analytics) that only track a single count.
      return { bucket, total: row?.total ?? 0, uniques: row?.uniques ?? 0, value: row?.value ?? row?.total ?? 0 };
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

  private parseMeasure(value?: string): TrendMeasure {
    const candidate = (value ?? 'count').toLowerCase();
    if (!ALLOWED_MEASURES.includes(candidate as TrendMeasure)) {
      throw new BadRequestException(`measure must be one of: ${ALLOWED_MEASURES.join(', ')}.`);
    }
    return candidate as TrendMeasure;
  }

  private clampDays(value: string | undefined, interval: TrendInterval): number {
    const parsed = value ? Number(value) : undefined;
    const fallback = interval === 'hour' ? 2 : interval === 'week' ? 84 : 30;
    if (parsed === undefined || !Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(Math.max(Math.trunc(parsed), 1), 365);
  }

  // Resolves the trend window. Accepts an explicit free-form range ("from"/"to", either
  // an ISO timestamp or a YYYY-MM-DD date) and otherwise derives the window from `days`.
  private resolveRange(fromParam: string | undefined, toParam: string | undefined, days: number): { from: Date; to: Date; rangeMs: number } {
    const to = new Date();
    let from = new Date(to.getTime() - days * DAY_MS);

    const customFromMs = this.parseWindowEdge(fromParam, 'start');
    const customToMs = this.parseWindowEdge(toParam, 'end');

    if (customFromMs !== null) {
      from = new Date(customFromMs);
    }
    if (customToMs !== null) {
      const customTo = new Date(customToMs);
      to.setTime(customTo.getTime());
      if (!customFromMs) {
        from = new Date(customTo.getTime() - days * DAY_MS);
      }
    }
    if (customFromMs !== null && customToMs !== null && customToMs <= customFromMs) {
      throw new BadRequestException('"to" must be after "from".');
    }

    return { from, to, rangeMs: Math.max(to.getTime() - from.getTime(), DAY_MS) };
  }

  // Parses a window edge into epoch ms. "YYYY-MM-DD" is treated as a whole UTC day
  // (start = 00:00, end = next 00:00); anything else is parsed as an ISO timestamp.
  private parseWindowEdge(value: string | undefined, edge: 'start' | 'end'): number | null {
    if (!value) return null;
    const trimmed = value.trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (match) {
      const [, year, month, day] = match;
      const start = Date.UTC(Number(year), Number(month) - 1, Number(day));
      if (Number.isNaN(start)) return null;
      return edge === 'start' ? start : start + DAY_MS;
    }
    const parsed = new Date(trimmed).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }

  // API performance: aggregates `$api_request` events (emitted by the SDK middleware /
  // browser fetch autocapture) into the endpoints that are slowest, erroring, and
  // busiest. Latency is ranked by p95, which reflects real pain better than an average.
  async getApiPerformance(user: DashboardUser, daysParam?: string, projectId?: string) {
    const project = await this.projects.resolveActiveProject(user, projectId);
    const days = this.clampApiDays(daysParam);

    const emptySummary = { totalRequests: 0, errorCount: 0, errorRate: 0, p95: 0, avg: 0 };
    if (!project) {
      return {
        project: null,
        days,
        summary: emptySummary,
        highestLatency: [],
        highestError: [],
        mostRequests: [],
        leastRequests: []
      };
    }

    // Guard the numeric casts so a malformed event can't blow up the whole query.
    const base = `
      WITH base AS (
        SELECT
          properties->>'method' AS method,
          properties->>'path' AS path,
          (properties->>'durationMs')::numeric AS duration,
          (properties->>'status')::int AS status
        FROM events
        WHERE project_id = $1 AND event_name = '$api_request'
          AND occurred_at >= now() - make_interval(days => $2::int)
          AND properties->>'path' IS NOT NULL
          AND properties->>'durationMs' ~ '^[0-9]+(\\.[0-9]+)?$'
          AND properties->>'status' ~ '^[0-9]+$'
      )
    `;

    const [grouped, errors, summary] = await Promise.all([
      this.database.query<ApiGroupRow>(
        `${base}
         SELECT method, path,
           count(*)::int AS count,
           round(avg(duration), 1)::float AS avg,
           round((percentile_cont(0.95) WITHIN GROUP (ORDER BY duration))::numeric, 1)::float AS p95,
           mode() WITHIN GROUP (ORDER BY status) AS status,
           count(*) FILTER (WHERE status >= 400)::int AS errors
         FROM base GROUP BY method, path
         ORDER BY count DESC LIMIT 500`,
        [project.id, days]
      ),
      this.database.query<ApiErrorRow>(
        `${base}
         SELECT method, path, status, count(*)::int AS count
         FROM base WHERE status >= 400
         GROUP BY method, path, status
         ORDER BY count DESC LIMIT 8`,
        [project.id, days]
      ),
      this.database.query<ApiSummaryRow>(
        `${base}
         SELECT count(*)::int AS total,
           count(*) FILTER (WHERE status >= 400)::int AS errors,
           round(avg(duration), 1)::float AS avg,
           round((percentile_cont(0.95) WITHIN GROUP (ORDER BY duration))::numeric, 1)::float AS p95
         FROM base`,
        [project.id, days]
      )
    ]);

    const rows = grouped.rows;
    const s = summary.rows[0];
    const total = s?.total ?? 0;
    const errorCount = s?.errors ?? 0;

    return {
      project,
      days,
      summary: {
        totalRequests: total,
        errorCount,
        errorRate: total > 0 ? Math.round((errorCount / total) * 1000) / 10 : 0,
        p95: s?.p95 ?? 0,
        avg: s?.avg ?? 0
      },
      highestLatency: [...rows].sort((a, b) => b.p95 - a.p95).slice(0, 8),
      highestError: errors.rows,
      mostRequests: [...rows].sort((a, b) => b.count - a.count).slice(0, 8),
      leastRequests: [...rows].sort((a, b) => a.count - b.count).slice(0, 8)
    };
  }

  private clampApiDays(value?: string): number {
    const parsed = value ? Number(value) : undefined;
    if (parsed === undefined || !Number.isFinite(parsed)) {
      return 7;
    }
    return Math.min(Math.max(Math.trunc(parsed), 1), 90);
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
