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
});
