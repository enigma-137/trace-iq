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

export interface ApiTelemetryOverview {
  totalRequests: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  avgDuration: number;
  errorRate: number;
  statusBreakdown: {
    ok200: number;
    rateLimit429: number;
    error500: number;
    other: number;
  };
  latencySeries: Array<{ bucket: string; p50: number; p90: number; p99: number }>;
}

export interface ErrorIssueOverview {
  type: string;
  message: string;
  occurrences: number;
  users: number;
  firstSeen: string;
  lastSeen: string;
  sparkline: number[];
}

export interface FunnelOverview {
  name: string;
  conversionRate: number;
  totalStarted: number;
  totalCompleted: number;
  avgDurationSec: number;
  steps: Array<{ name: string; count: number; dropOffRate: number }>;
}

export interface UxFrictionOverview {
  rageClicks: number;
  deadClicks: number;
  errorSessions: number;
  replaysAvailable: number;
}

export interface RecentTraceOverview {
  id: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  occurredAt: string;
  actor: string | null;
}

export interface AlertsSummaryOverview {
  total: number;
  firing: number;
  healthy: number;
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
  observabilitySeries: Array<{ bucket: string; events: number; apiCalls: number; errors: number }>;
  apiTelemetry?: ApiTelemetryOverview;
  topErrors?: ErrorIssueOverview[];
  funnelSummary?: FunnelOverview;
  uxFriction?: UxFrictionOverview;
  recentTraces?: RecentTraceOverview[];
  alertsSummary?: AlertsSummaryOverview;
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
}export interface WebTotals {
  visitors: number;
  pageviews: number;
  sessions: number;
  avgSessionDuration: number;
  bounceRate: number;
  bandwidthBytes: number;
  onlineNow?: number;
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
  countries: Array<{ name: string; total: number; percentage: number }>;
  cities: Array<{ name: string; total: number; percentage: number }>;
  topCountry: { name: string; total: number; percentage: number } | null;
  peakTime: { window: string; total: number } | null;
  trafficTiming: Array<{ rank: number; window: string; total: number; percentage: number }>;
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
        sparkline: [],
        observabilitySeries: []
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

    const sparklineRows = await this.database.query<{
      bucket: string;
      total: number;
      api_calls: number;
      errors: number;
    }>(
      `
        SELECT
          to_char(date_trunc('day', occurred_at AT TIME ZONE 'UTC'), '${BUCKET_FORMAT}') AS bucket,
          count(*)::int AS total,
          count(*) FILTER (
            WHERE event_name = '$api_request' OR properties->>'durationMs' IS NOT NULL
          )::int AS api_calls,
          count(*) FILTER (
            WHERE event_name = '$exception' OR event_name = '$error'
          )::int AS errors
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
        SELECT network_info->>'country' AS name, count(*)::int AS total
        FROM events
        WHERE project_id = $1 AND occurred_at >= now() - interval '30 days'
          AND NULLIF(network_info->>'country', '') IS NOT NULL
          AND network_info->>'country' != 'unknown'
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

    const [
      apiTelemetryResult,
      apiLatencyResult,
      topErrorsResult,
      alertsResult,
      tracesResult,
      frictionResult,
      eventDistResult,
      sessionMetricsResult,
      replaysCountResult
    ] = await Promise.all([
      this.database.query<{
        total_requests: number;
        http_errors: number;
        avg_duration: number;
        p50: number;
        p90: number;
        p95: number;
        p99: number;
        ok_200: number;
        rate_limit_429: number;
        error_500: number;
        other_status: number;
      }>(
        `
          WITH base AS (
            SELECT
              (properties->>'durationMs')::numeric AS duration,
              (properties->>'status')::int AS status
            FROM events
            WHERE project_id = $1 AND event_name = '$api_request'
              AND occurred_at >= now() - interval '14 days'
              AND properties->>'durationMs' ~ '^[0-9]+(\\.[0-9]+)?$'
              AND properties->>'status' ~ '^[0-9]+$'
          )
          SELECT
            count(*)::int AS total_requests,
            count(*) FILTER (WHERE status >= 400)::int AS http_errors,
            COALESCE(round(avg(duration), 1)::float, 0) AS avg_duration,
            COALESCE(round((percentile_cont(0.50) WITHIN GROUP (ORDER BY duration))::numeric, 1)::float, 0) AS p50,
            COALESCE(round((percentile_cont(0.90) WITHIN GROUP (ORDER BY duration))::numeric, 1)::float, 0) AS p90,
            COALESCE(round((percentile_cont(0.95) WITHIN GROUP (ORDER BY duration))::numeric, 1)::float, 0) AS p95,
            COALESCE(round((percentile_cont(0.99) WITHIN GROUP (ORDER BY duration))::numeric, 1)::float, 0) AS p99,
            count(*) FILTER (WHERE status IS NULL OR status = 200 OR (status >= 200 AND status < 300))::int AS ok_200,
            count(*) FILTER (WHERE status = 429)::int AS rate_limit_429,
            count(*) FILTER (WHERE status >= 500)::int AS error_500,
            count(*) FILTER (WHERE status IS NOT NULL AND (status < 200 OR status >= 300) AND status <> 429 AND status < 500)::int AS other_status
          FROM base
        `,
        [project.id]
      ).catch(() => ({ rows: [] })),

      this.database.query<{
        bucket: string;
        p50: number;
        p90: number;
        p99: number;
      }>(
        `
          WITH base AS (
            SELECT
              occurred_at,
              (properties->>'durationMs')::numeric AS duration
            FROM events
            WHERE project_id = $1 AND event_name = '$api_request'
              AND occurred_at >= now() - interval '14 days'
              AND properties->>'durationMs' ~ '^[0-9]+(\\.[0-9]+)?$'
              AND properties->>'status' ~ '^[0-9]+$'
          )
          SELECT
            to_char(date_trunc('day', occurred_at AT TIME ZONE 'UTC'), '${BUCKET_FORMAT}') AS bucket,
            round((percentile_cont(0.50) WITHIN GROUP (ORDER BY duration))::numeric, 1)::float AS p50,
            round((percentile_cont(0.90) WITHIN GROUP (ORDER BY duration))::numeric, 1)::float AS p90,
            round((percentile_cont(0.99) WITHIN GROUP (ORDER BY duration))::numeric, 1)::float AS p99
          FROM base
          GROUP BY 1
          ORDER BY 1 ASC
        `,
        [project.id]
      ).catch(() => ({ rows: [] })),

      this.database.query<{
        type: string;
        message: string;
        occurrences: number;
        users: number;
        first_seen: string;
        last_seen: string;
      }>(
        `
          SELECT
            COALESCE(NULLIF(properties->>'type', ''), 'Error') AS type,
            COALESCE(NULLIF(properties->>'message', ''), '(unhandled exception)') AS message,
            count(*)::int AS occurrences,
            count(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS users,
            min(occurred_at) AS first_seen,
            max(occurred_at) AS last_seen
          FROM events
          WHERE project_id = $1 AND (event_name = '$exception' OR event_name = '$error')
            AND occurred_at >= now() - interval '14 days'
          GROUP BY 1, 2
          ORDER BY occurrences DESC
          LIMIT 4
        `,
        [project.id]
      ).catch(() => ({ rows: [] })),

      this.database.query<{
        total: number;
        firing: number;
        healthy: number;
      }>(
        `
          SELECT
            count(*)::int AS total,
            count(*) FILTER (WHERE last_status = 'triggered' OR last_status = 'firing')::int AS firing,
            count(*) FILTER (WHERE last_status IS NULL OR last_status = 'ok' OR last_status = 'healthy' OR last_status = 'pending')::int AS healthy
          FROM alerts
          WHERE project_id = $1
        `,
        [project.id]
      ).catch(() => ({ rows: [{ total: 0, firing: 0, healthy: 0 }] })),

      this.database.query<{
        id: string;
        method: string;
        path: string;
        status: number;
        duration_ms: number;
        occurred_at: string;
        actor: string | null;
      }>(
        `
          SELECT
            id,
            COALESCE(NULLIF(properties->>'method', ''), 'POST') AS method,
            COALESCE(NULLIF(properties->>'path', ''), NULLIF(context->'page'->>'path', ''), event_name) AS path,
            (properties->>'status')::int AS status,
            (properties->>'durationMs')::float AS duration_ms,
            occurred_at AS occurred_at,
            COALESCE(user_id::text, anonymous_id) AS actor
          FROM events
          WHERE project_id = $1 AND event_name = '$api_request'
            AND occurred_at >= now() - interval '14 days'
            AND properties->>'durationMs' ~ '^[0-9]+(\\.[0-9]+)?$'
            AND properties->>'status' ~ '^[0-9]+$'
          ORDER BY occurred_at DESC
          LIMIT 5
        `,
        [project.id]
      ).catch(() => ({ rows: [] })),

      this.database.query<{
        rage_clicks: number;
        dead_clicks: number;
        error_sessions: number;
      }>(
        `
          SELECT
            count(*) FILTER (WHERE event_name = '$rageclick' OR properties->>'rage' = 'true')::int AS rage_clicks,
            count(*) FILTER (WHERE event_name = '$deadclick' OR properties->>'dead' = 'true')::int AS dead_clicks,
            count(DISTINCT session_id) FILTER (WHERE event_name = '$exception' OR event_name = '$error')::int AS error_sessions
          FROM events
          WHERE project_id = $1 AND occurred_at >= now() - interval '14 days'
        `,
        [project.id]
      ).catch(() => ({ rows: [{ rage_clicks: 0, dead_clicks: 0, error_sessions: 0 }] })),

      this.database.query<{
        autocapture_count: number;
        custom_count: number;
      }>(
        `
          SELECT
            count(*) FILTER (WHERE event_name = '$page' OR event_name = '$autocapture')::int AS autocapture_count,
            count(*) FILTER (WHERE event_name NOT IN ('$page', '$autocapture'))::int AS custom_count
          FROM events
          WHERE project_id = $1 AND occurred_at >= now() - interval '30 days'
        `,
        [project.id]
      ).catch(() => ({ rows: [{ autocapture_count: 0, custom_count: 0 }] })),

      this.database.query<{
        avg_duration_sec: number;
      }>(
        `
          SELECT
            COALESCE(round(avg(EXTRACT(EPOCH FROM (last_seen_at - started_at))))::int, 0) AS avg_duration_sec
          FROM sessions
          WHERE project_id = $1 AND started_at >= now() - interval '30 days'
        `,
        [project.id]
      ).catch(() => ({ rows: [{ avg_duration_sec: 0 }] })),

      this.database.query<{
        count: number;
      }>(
        `
          SELECT count(*)::int AS count
          FROM session_replays
          WHERE project_id = $1 AND deleted_at IS NULL AND expires_at > now()
        `,
        [project.id]
      ).catch(() => ({ rows: [{ count: 0 }] }))
    ]);

    const to = new Date();
    const from = new Date(to.getTime() - 14 * DAY_MS);
    const buckets14 = this.generateBuckets(from, to, 'day');
    const sparkline = this.zeroFill(buckets14, sparklineRows.rows);
    const observabilityRows = new Map(sparklineRows.rows.map((row) => [row.bucket, row]));
    const observabilitySeries = buckets14.map((bucket) => {
      const row = observabilityRows.get(bucket);
      return {
        bucket,
        events: Number(row?.total ?? 0),
        apiCalls: Number(row?.api_calls ?? 0),
        errors: Number(row?.errors ?? 0)
      };
    });

    const totals = totalsResult.rows[0];
    const revenue = revenueResult.rows[0];
    const apiTel = apiTelemetryResult.rows[0];
    const alertsRow = alertsResult.rows[0] ?? { total: 0, firing: 0, healthy: 0 };
    const frictionRow = frictionResult.rows[0] ?? { rage_clicks: 0, dead_clicks: 0, error_sessions: 0 };
    const distRow = eventDistResult.rows[0] ?? { autocapture_count: 0, custom_count: 0 };
    const sessionRow = sessionMetricsResult.rows[0] ?? { avg_duration_sec: 0 };
    const replaysRow = replaysCountResult.rows[0] ?? { count: 0 };

    const totalRequests = apiTel?.total_requests ?? 0;
    const errCount = apiTel?.http_errors ?? 0;
    const errorRate = totalRequests > 0 ? Number(((errCount / totalRequests) * 100).toFixed(2)) : 0;

    const latencyByBucket = new Map(apiLatencyResult.rows.map((row) => [row.bucket, row]));
    const latencySeries = buckets14.flatMap((bucket) => {
      const row = latencyByBucket.get(bucket);
      return row ? [{ bucket, p50: row.p50, p90: row.p90, p99: row.p99 }] : [];
    });

    const topErrors: ErrorIssueOverview[] = topErrorsResult.rows.map((row) => ({
      type: row.type,
      message: row.message,
      occurrences: row.occurrences,
      users: row.users,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      sparkline: sparkline.slice(-7).map((p) => p.total)
    }));

    const recentTraces: RecentTraceOverview[] = tracesResult.rows.map((r) => ({
      id: r.id,
      method: r.method,
      path: r.path,
      status: r.status,
      durationMs: r.duration_ms,
      occurredAt: r.occurred_at,
      actor: r.actor
    }));

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
      sparkline,
      observabilitySeries,
      apiTelemetry: {
        totalRequests,
        p50: apiTel?.p50 || 0,
        p90: apiTel?.p90 || 0,
        p95: apiTel?.p95 || 0,
        p99: apiTel?.p99 || 0,
        avgDuration: apiTel?.avg_duration || 0,
        errorRate,
        statusBreakdown: {
          ok200: apiTel?.ok_200 || 0,
          rateLimit429: apiTel?.rate_limit_429 || 0,
          error500: apiTel?.error_500 || 0,
          other: apiTel?.other_status || 0
        },
        latencySeries
      },
      topErrors,
      funnelSummary: {
        name: 'Autocapture vs Custom',
        conversionRate: totals?.total_events && totals.total_events > 0 ? Number(((distRow.custom_count / totals.total_events) * 100).toFixed(1)) : 0,
        totalStarted: distRow.autocapture_count,
        totalCompleted: distRow.custom_count,
        avgDurationSec: sessionRow.avg_duration_sec,
        steps: [
          { name: 'Autocapture ($page)', count: distRow.autocapture_count, dropOffRate: 0 },
          { name: 'Custom Events', count: distRow.custom_count, dropOffRate: 0 }
        ]
      },
      uxFriction: {
        rageClicks: frictionRow.rage_clicks,
        deadClicks: frictionRow.dead_clicks,
        errorSessions: frictionRow.error_sessions,
        replaysAvailable: Number(replaysRow?.count ?? 0)
      },
      recentTraces,
      alertsSummary: {
        total: alertsRow.total,
        firing: alertsRow.firing,
        healthy: alertsRow.healthy
      }
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
        WHERE project_id = $1
        GROUP BY event_name
        ORDER BY total DESC
        LIMIT 200
      `,
      [project.id]
    );

    return { project, eventNames: result.rows };
  }

  async listEventProperties(user: DashboardUser, eventName?: string, projectId?: string) {
    const project = await this.projects.resolveActiveProject(user, projectId);

    if (!project) {
      return { project: null, properties: [] as Array<{ key: string; sampleType: string; occurrences: number }> };
    }

    const params: unknown[] = [project.id];
    let eventFilter = '';
    if (eventName && eventName !== '*' && eventName !== '$all' && eventName !== 'all') {
      params.push(eventName);
      eventFilter = ` AND e.event_name = $2`;
    }

    // 1. Discover custom jsonb properties
    const customPropsResult = await this.database.query<{ key: string; sampleType: string; occurrences: number }>(
      `
        SELECT
          p.key AS key,
          jsonb_typeof(p.value) AS "sampleType",
          count(*)::int AS occurrences
        FROM events e,
        LATERAL jsonb_each(COALESCE(e.properties, '{}'::jsonb)) p
        WHERE e.project_id = $1 ${eventFilter}
        GROUP BY p.key, jsonb_typeof(p.value)
        ORDER BY occurrences DESC
        LIMIT 100
      `,
      params
    );

    // 2. Discover standard context dimensions that actually exist with values in the project telemetry
    const dimensionsResult = await this.database.query<{
      has_os: number;
      has_browser: number;
      has_device: number;
      has_country: number;
      has_city: number;
      has_region: number;
      has_path: number;
      has_referrer: number;
    }>(
      `
        SELECT
          count(*) FILTER (WHERE NULLIF(e.device_info->>'os', '') IS NOT NULL)::int AS has_os,
          count(*) FILTER (WHERE NULLIF(e.device_info->>'browser', '') IS NOT NULL)::int AS has_browser,
          count(*) FILTER (WHERE NULLIF(COALESCE(e.device_info->>'deviceType', e.device_info->>'device'), '') IS NOT NULL)::int AS has_device,
          count(*) FILTER (WHERE NULLIF(e.network_info->>'country', '') IS NOT NULL)::int AS has_country,
          count(*) FILTER (WHERE NULLIF(e.network_info->>'city', '') IS NOT NULL)::int AS has_city,
          count(*) FILTER (WHERE NULLIF(e.network_info->>'region', '') IS NOT NULL)::int AS has_region,
          count(*) FILTER (WHERE NULLIF(e.context->'page'->>'path', '') IS NOT NULL)::int AS has_path,
          count(*) FILTER (WHERE NULLIF(e.context->'page'->>'referrer', '') IS NOT NULL)::int AS has_referrer
        FROM events e
        WHERE e.project_id = $1 ${eventFilter}
      `,
      params
    );

    const dimRow = dimensionsResult.rows[0];
    const standardProps: Array<{ key: string; sampleType: string; occurrences: number }> = [];

    if (dimRow) {
      if (dimRow.has_browser > 0) standardProps.push({ key: 'browser', sampleType: 'string', occurrences: dimRow.has_browser });
      if (dimRow.has_os > 0) standardProps.push({ key: 'os', sampleType: 'string', occurrences: dimRow.has_os });
      if (dimRow.has_path > 0) standardProps.push({ key: 'path', sampleType: 'string', occurrences: dimRow.has_path });
      if (dimRow.has_country > 0) standardProps.push({ key: 'country', sampleType: 'string', occurrences: dimRow.has_country });
      if (dimRow.has_device > 0) standardProps.push({ key: 'device_type', sampleType: 'string', occurrences: dimRow.has_device });
      if (dimRow.has_city > 0) standardProps.push({ key: 'city', sampleType: 'string', occurrences: dimRow.has_city });
      if (dimRow.has_region > 0) standardProps.push({ key: 'region', sampleType: 'string', occurrences: dimRow.has_region });
      if (dimRow.has_referrer > 0) standardProps.push({ key: 'referrer', sampleType: 'string', occurrences: dimRow.has_referrer });
    }

    if (!eventName || eventName === '*' || eventName === '$all' || eventName === 'all') {
      standardProps.unshift({ key: '$event_name', sampleType: 'string', occurrences: 1 });
    }

    const seen = new Set<string>();
    const merged: Array<{ key: string; sampleType: string; occurrences: number }> = [];

    for (const p of [...standardProps, ...customPropsResult.rows]) {
      const lower = p.key.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        merged.push(p);
      }
    }

    return { project, properties: merged };
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
    const rawEvent = (params.event ?? '').trim();
    const isWildcard = !rawEvent || rawEvent === '*' || rawEvent === '$all' || rawEvent === 'all' || rawEvent === 'All Events';
    const event = isWildcard ? '*' : rawEvent;
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
      let queryParams: unknown[];
      let eventWhere = '';

      if (isWildcard) {
        queryParams = [project.id, interval, from.toISOString(), to.toISOString()];
        eventWhere = '';
      } else {
        queryParams = [project.id, event, interval, from.toISOString(), to.toISOString()];
        eventWhere = ' AND event_name = $2';
      }

      let breakdownExpr: string;
      if (dimensionSource) {
        breakdownExpr = `COALESCE(NULLIF(${dimensionSource}, ''), '(none)')`;
      } else {
        queryParams.push(breakdown);
        breakdownExpr = `COALESCE(NULLIF(properties->>$${queryParams.length}, ''), '(none)')`;
      }

      const valueExpr = buildMeasureExpr(measure, property, queryParams);
      const filterClause = buildFilterClause(filters, queryParams);
      const intervalParam = isWildcard ? '$2' : '$3';
      const fromParam = isWildcard ? '$3' : '$4';
      const toParam = isWildcard ? '$4' : '$5';

      const rows = await this.database.query<{ bucket: string; breakdown_key: string; total: number; value: number }>(
        `
          SELECT
            to_char(date_trunc(${intervalParam}, occurred_at AT TIME ZONE 'UTC'), '${BUCKET_FORMAT}') AS bucket,
            ${breakdownExpr} AS breakdown_key,
            count(*)::int AS total,
            ${valueExpr} AS value
          FROM events
          WHERE project_id = $1${eventWhere}
            AND occurred_at >= ${fromParam} AND occurred_at < ${toParam}${filterClause}
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
      const queryParams: unknown[] = isWildcard
        ? [project.id, interval, from.toISOString(), to.toISOString()]
        : [project.id, event, interval, from.toISOString(), to.toISOString()];
      const eventWhere = isWildcard ? '' : ' AND event_name = $2';
      const intervalParam = isWildcard ? '$2' : '$3';
      const fromParam = isWildcard ? '$3' : '$4';
      const toParam = isWildcard ? '$4' : '$5';

      const valueExpr = buildMeasureExpr(measure, property, queryParams);
      const filterClause = buildFilterClause(filters, queryParams);

      const rows = await this.database.query<{ bucket: string; total: number; uniques: number; value: number }>(
        `
          SELECT
            to_char(date_trunc(${intervalParam}, occurred_at AT TIME ZONE 'UTC'), '${BUCKET_FORMAT}') AS bucket,
            count(*)::int AS total,
            count(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS uniques,
            ${valueExpr} AS value
          FROM events
          WHERE project_id = $1${eventWhere}
            AND occurred_at >= ${fromParam} AND occurred_at < ${toParam}${filterClause}
          GROUP BY 1
          ORDER BY 1 ASC
        `,
        queryParams
      );

      series = [{ key: isWildcard ? 'All Events' : event, points: this.zeroFill(buckets, rows.rows) }];
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
    const isWildcard = !event || event === '*' || event === '$all' || event === 'all' || event === 'All Events';
    const queryParams: unknown[] = isWildcard
      ? [projectId, from.toISOString(), to.toISOString()]
      : [projectId, event, from.toISOString(), to.toISOString()];
    const valueExpr = buildMeasureExpr(measure, property, queryParams);
    const filterClause = buildFilterClause(filters, queryParams);
    const eventWhere = isWildcard ? '' : ' AND event_name = $2';
    const fromParam = isWildcard ? '$2' : '$3';
    const toParam = isWildcard ? '$3' : '$4';

    const result = await this.database.query<{ value: number }>(
      `
        SELECT ${valueExpr} AS value
        FROM events
        WHERE project_id = $1${eventWhere}
          AND occurred_at >= ${fromParam} AND occurred_at < ${toParam}${filterClause}
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
    const emptyTotals: WebTotals = { visitors: 0, pageviews: 0, sessions: 0, avgSessionDuration: 0, bounceRate: 0, bandwidthBytes: 0, onlineNow: 0 };

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
        cities: [],
        topCountry: null,
        peakTime: null,
        trafficTiming: [],
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

    const [current, previous, onlineNowQuery] = await Promise.all([
      this.computeWebTotals(project.id, from, to, filters),
      this.computeWebTotals(project.id, prevFrom, prevTo, filters),
      this.database.query<{ total: number }>(
        `SELECT count(DISTINCT session_id)::int AS total
         FROM events
         WHERE project_id = $1 AND occurred_at >= now() - interval '5 minutes' AND session_id IS NOT NULL`,
        [project.id]
      )
    ]);

    current.onlineNow = onlineNowQuery.rows[0]?.total ?? 0;

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
        SELECT network_info->>'country' AS name,
          count(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS total
        FROM events WHERE project_id = $1 AND event_name = '$page' AND occurred_at >= $2 AND occurred_at < $3${countriesQuery.clause}
          AND NULLIF(network_info->>'country', '') IS NOT NULL
          AND network_info->>'country' != 'unknown'
        GROUP BY 1 ORDER BY total DESC LIMIT 8
      `,
      countriesQuery.values
    );

    const citiesQuery = this.webFilterQuery(project.id, from, to, filters);
    const cities = await this.database.query<{ name: string; total: number }>(
      `
        SELECT network_info->>'city' AS name,
          count(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS total
        FROM events WHERE project_id = $1 AND event_name = '$page' AND occurred_at >= $2 AND occurred_at < $3${citiesQuery.clause}
          AND NULLIF(network_info->>'city', '') IS NOT NULL
          AND network_info->>'city' != 'unknown'
        GROUP BY 1 ORDER BY total DESC LIMIT 8
      `,
      citiesQuery.values
    );

    const totalCountryVisitors = countries.rows.reduce((sum, c) => sum + c.total, 0);
    const countriesWithPct = countries.rows.map((c) => ({
      name: c.name,
      total: c.total,
      percentage: totalCountryVisitors > 0 ? Math.round((c.total / totalCountryVisitors) * 1000) / 10 : 0
    }));

    const totalCityVisitors = cities.rows.reduce((sum, c) => sum + c.total, 0);
    const citiesWithPct = cities.rows.map((c) => ({
      name: c.name,
      total: c.total,
      percentage: totalCityVisitors > 0 ? Math.round((c.total / totalCityVisitors) * 1000) / 10 : 0
    }));

    const validCountry = countriesWithPct.find((c) => c.name.toLowerCase() !== 'unknown') ?? countriesWithPct[0];
    const topCountry = validCountry && validCountry.total > 0 ? {
      name: validCountry.name,
      total: validCountry.total,
      percentage: validCountry.percentage
    } : null;

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

    const hourTotals = Array.from({ length: 24 }, (_, hour) => {
      const matching = hourRows.rows.filter((r) => r.hour === hour);
      const total = matching.reduce((sum, r) => sum + r.total, 0);
      const nextHour = (hour + 1) % 24;
      const pad = (n: number) => n.toString().padStart(2, '0');
      return {
        hour,
        window: `${pad(hour)}:00—${pad(nextHour)}:00`,
        total
      };
    });

    const totalTrafficHours = hourTotals.reduce((sum, h) => sum + h.total, 0);
    const sortedHours = [...hourTotals].sort((a, b) => b.total - a.total);
    const trafficTiming = sortedHours.slice(0, 10).map((item, idx) => ({
      rank: idx + 1,
      window: item.window,
      total: item.total,
      percentage: totalTrafficHours > 0 ? Math.round((item.total / totalTrafficHours) * 1000) / 10 : 0
    }));

    const peakTime = sortedHours[0] && sortedHours[0].total > 0 ? {
      window: sortedHours[0].window,
      total: sortedHours[0].total
    } : null;

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
      countries: countriesWithPct,
      cities: citiesWithPct,
      topCountry,
      peakTime,
      trafficTiming,
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
      bandwidth_bytes: number;
    }>(
      `
        WITH ev AS (
          SELECT COALESCE(user_id::text, anonymous_id) AS actor, session_id, event_name, occurred_at, properties
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
          COALESCE((SELECT (count(*) FILTER (WHERE pageviews <= 1))::float / NULLIF(count(*), 0) FROM sess), 0)::float AS bounce_rate,
          COALESCE((SELECT sum(COALESCE(NULLIF(properties->>'bytes', '')::numeric, NULLIF(properties->>'response_size', '')::numeric, 142000)) FROM ev), 0)::bigint AS bandwidth_bytes
      `,
      query.values
    );

    const row = result.rows[0];
    return {
      visitors: row?.visitors ?? 0,
      pageviews: row?.pageviews ?? 0,
      sessions: row?.sessions ?? 0,
      avgSessionDuration: Math.round(row?.avg_duration ?? 0),
      bounceRate: row?.bounce_rate ?? 0,
      bandwidthBytes: Number(row?.bandwidth_bytes ?? 0)
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
