import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from '../src/modules/analytics/analytics.service';
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
          bucket: '2026-09-01T00:00:00Z', total: 12, api_calls: 4, errors: 2
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
      .toEqual({ bucket: '2026-09-01T00:00:00Z', events: 12, apiCalls: 4, errors: 2 });
    expect(result.observabilitySeries.find((point) => point.bucket === '2026-09-02T00:00:00Z'))
      .toEqual({ bucket: '2026-09-02T00:00:00Z', events: 0, apiCalls: 0, errors: 0 });

    const seriesSql = db.queryCalls('AS api_calls')[0].text;
    expect(seriesSql).toContain("event_name = '$api_request' OR properties->>'durationMs' IS NOT NULL");
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
