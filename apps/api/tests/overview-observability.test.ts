import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from '../src/modules/analytics/analytics.service';
import { NON_REVENUE_EVENT } from '../src/common/measures';
import { mockDatabase, rows } from './helpers/mock-db';

const project = {
  id: 'proj_1', name: 'Site', slug: 'site',
  organizationId: 'org_1', organizationName: 'Org', role: 'owner'
};
const user = { id: 'usr_1', authMethod: 'supabase' } as const;

afterEach(() => vi.useRealTimers());

describe('overview observability series', () => {
  it('returns zero-filled real daily event, API-request, and exception counts', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T12:00:00Z'));
    const db = mockDatabase((sql) => {
      if (sql.includes('AS total_events')) {
        return rows([{
          total_events: 12, events_24h: 4, events_1h: 1,
          total_users: 2, total_sessions: 3, last_event_at: '2026-09-03T10:00:00Z'
        }]);
      }
      if (sql.includes('AS api_calls') && sql.includes("date_trunc('day'")) {
        return rows([{
          bucket: '2026-09-01T00:00:00Z', total: 12, api_calls: 4, failed_requests: 1, errors: 2
        }]);
      }
      if (sql.includes('WITH rev AS')) {
        return rows([{ current_revenue: 0, previous_revenue: 0, current_transactions: 0 }]);
      }
      return rows([]);
    });
    const projects = { resolveActiveProject: vi.fn().mockResolvedValue(project) };
    const service = new AnalyticsService(db as never, projects as never);

    const result = await service.getOverview(user);

    expect(result.observabilitySeries.find((point) => point.bucket === '2026-09-01T00:00:00Z'))
      .toEqual({ bucket: '2026-09-01T00:00:00Z', events: 12, apiCalls: 4, failedRequests: 1, errors: 2 });
    expect(result.observabilitySeries.find((point) => point.bucket === '2026-09-02T00:00:00Z'))
      .toEqual({ bucket: '2026-09-02T00:00:00Z', events: 0, apiCalls: 0, failedRequests: 0, errors: 0 });

    const seriesSql = db.queryCalls('AS api_calls')[0].text;
    expect(seriesSql).toContain("FILTER (WHERE event_name = '$api_request')::int AS api_calls");
    expect(seriesSql).toContain('AS failed_requests');
    expect(seriesSql).not.toContain("properties->>'durationMs' IS NOT NULL");
    expect(seriesSql).toContain("event_name = '$exception' OR event_name = '$error'");
  });

  it('uses validated API-request rows for summary, daily latency, and recent traces', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T12:00:00Z'));
    const db = mockDatabase((sql) => {
      if (sql.includes('AS total_events')) {
        return rows([{
          total_events: 60, events_24h: 55, events_1h: 10,
          total_users: 2, total_sessions: 3, last_event_at: '2026-09-03T11:00:00Z'
        }]);
      }
      if (sql.includes('AS api_calls') && sql.includes("date_trunc('day'")) {
        return rows([{ bucket: '2026-09-03T00:00:00Z', total: 55, api_calls: 55, errors: 0 }]);
      }
      if (sql.includes('AS total_requests')) {
        return rows([{
          total_requests: 55,
          http_errors: 4,
          avg_duration: 2444.6,
          p50: 300,
          p90: 4000,
          p95: 6843.9,
          p99: 8160.8,
          ok_200: 51,
          rate_limit_429: 0,
          error_500: 0,
          other_status: 4
        }]);
      }
      if (sql.includes('AS p50') && sql.includes('GROUP BY 1')) {
        return rows([{ bucket: '2026-09-03T00:00:00Z', p50: 300, p90: 4000, p99: 8160.8 }]);
      }
      if (sql.includes('AS duration_ms')) {
        return rows([{
          id: 'evt_api_1', method: 'POST', path: '/dashboard', status: 200,
          duration_ms: 5609, occurred_at: '2026-09-03T11:00:00Z', actor: 'anon_1'
        }]);
      }
      if (sql.includes('WITH rev AS')) {
        return rows([{ current_revenue: 0, previous_revenue: 0, current_transactions: 0 }]);
      }
      return rows([]);
    });
    const projects = { resolveActiveProject: vi.fn().mockResolvedValue(project) };
    const service = new AnalyticsService(db as never, projects as never);

    const result = await service.getOverview(user);

    expect(result.apiTelemetry).toMatchObject({
      totalRequests: 55,
      p50: 300,
      p90: 4000,
      p95: 6843.9,
      p99: 8160.8,
      errorRate: 7.27,
      statusBreakdown: { ok200: 51, rateLimit429: 0, error500: 0, other: 4 }
    });
    expect(result.apiTelemetry?.latencySeries).toEqual([
      { bucket: '2026-09-03T00:00:00Z', p50: 300, p90: 4000, p99: 8160.8 }
    ]);
    expect(result.recentTraces).toEqual([
      {
        id: 'evt_api_1', method: 'POST', path: '/dashboard', status: 200,
        durationMs: 5609, occurredAt: '2026-09-03T11:00:00Z', actor: 'anon_1'
      }
    ]);

    const summarySql = db.queryCalls('AS total_requests')[0].text;
    expect(summarySql).toContain("event_name = '$api_request'");
    expect(summarySql).toContain("properties->>'status' ~ '^[0-9]+$'");
    const tracesSql = db.queryCalls('AS duration_ms')[0].text;
    expect(tracesSql).toContain("event_name = '$api_request'");
    expect(tracesSql).toContain('LIMIT 5');
    expect(tracesSql).not.toContain('random()');
  });
});

describe('overview revenue', () => {
  it('sums only completed-payment events, not checkout intent', async () => {
    const db = mockDatabase((sql) => {
      if (sql.includes('WITH rev AS')) {
        return rows([{ current_revenue: 3500, previous_revenue: 0, current_transactions: 1 }]);
      }
      return rows([]);
    });
    const projects = { resolveActiveProject: vi.fn().mockResolvedValue(project) };
    const service = new AnalyticsService(db as never, projects as never);

    const result = await service.getOverview(user);

    expect(result.revenue).toEqual({ total: 3500, previous: 0, transactions: 1 });
    expect(db.queryCalls('WITH rev AS')[0].text).toContain(`event_name !~* ${NON_REVENUE_EVENT}`);
  });

  it('classifies intent and failure events as non-revenue', () => {
    // The SQL literal minus its quotes; Postgres and JS agree on this subset of regex.
    const nonRevenue = new RegExp(NON_REVENUE_EVENT.slice(1, -1), 'i');
    for (const name of ['checkout_started', 'checkout_redirected_to_gateway', 'premium_plan_selected', 'payment_failed', 'payment_gateway_returned', 'add_to_cart_clicked', '$api_request']) {
      expect(nonRevenue.test(name), name).toBe(true);
    }
    for (const name of ['revenue', 'subscription_purchased', 'payout_succeeded', 'order_completed', 'payment_received', 'restarted_subscription']) {
      expect(nonRevenue.test(name), name).toBe(false);
    }
  });
});

describe('overview API telemetry', () => {
  it('drops calls over 10 minutes from latency and reports failed and 5xx counts', async () => {
    const db = mockDatabase((sql) => {
      if (sql.includes('AS http_errors')) {
        return rows([{ total_requests: 200, http_errors: 6, error_500: 2, avg_duration: 300, p50: 120, p90: 400, p95: 900, p99: 2000, ok_200: 194, rate_limit_429: 0, other_status: 4 }]);
      }
      return rows([]);
    });
    const projects = { resolveActiveProject: vi.fn().mockResolvedValue(project) };
    const service = new AnalyticsService(db as never, projects as never);

    const result = await service.getOverview(user);

    expect(result.apiTelemetry).toMatchObject({ totalRequests: 200, p50: 120, errorRate: 3, failedRequests: 6, serverErrors: 2 });
    // Both latency queries (totals and the per-bucket series) apply the cap.
    const latencyCalls = db.queryCalls('percentile_cont(0.99)');
    expect(latencyCalls).toHaveLength(2);
    for (const call of latencyCalls) {
      expect(call.text).toContain("THEN (properties->>'durationMs')::numeric END) <= 600000");
    }
  });
});
