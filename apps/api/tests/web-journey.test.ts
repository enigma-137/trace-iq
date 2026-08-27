import { describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from '../src/modules/analytics/analytics.service';
import { mockDatabase, rows } from './helpers/mock-db';

const project = { id: 'proj_1', name: 'Site', slug: 'site', organizationId: 'org_1', organizationName: 'Org', role: 'owner' };
const user = { id: 'usr_1', authMethod: 'supabase' } as const;

describe('web session journey', () => {
  it('builds nodes and transitions from consecutive page events in each session', async () => {
    const db = mockDatabase((sql) => {
      if (sql.includes('JOIN ordered_pages b')) {
        return rows([{ fromStep: 1, fromPath: '/', toStep: 2, toPath: '/pricing', sessions: 7 }]);
      }
      if (sql.includes('popularity <= 6')) {
        return rows([
          { step: 1, path: '/', sessions: 10 },
          { step: 2, path: '/pricing', sessions: 7 }
        ]);
      }
      if (sql.includes('WITH ev AS')) {
        return rows([{ visitors: 10, pageviews: 17, sessions: 10, avg_duration: 30, bounce_rate: 0.3 }]);
      }
      if (sql.includes("properties->>'metric'") && sql.includes('GROUP BY 1, 2')) {
        return rows([{ path: '/', metric: 'LCP', p75: 2400, count: 10, poor: 1 }]);
      }
      if (sql.includes("properties->>'metric'")) {
        return rows([{ metric: 'LCP', p75: 2400, count: 10, good: 7, needsImprovement: 2, poor: 1 }]);
      }
      return rows([]);
    });
    const projects = { resolveActiveProject: vi.fn().mockResolvedValue(project) };
    const service = new AnalyticsService(db as never, projects as never);

    const result = await service.getWebAnalytics(user, { days: '7' });

    expect(result.journey.sessions).toBe(10);
    expect(result.journey.columns).toEqual([
      { step: 1, nodes: [{ path: '/', sessions: 10 }] },
      { step: 2, nodes: [{ path: '/pricing', sessions: 7 }] }
    ]);
    expect(result.journey.transitions[0]).toMatchObject({ fromPath: '/', toPath: '/pricing', sessions: 7 });
    const transitionSql = db.queryCalls('JOIN ordered_pages b')[0].text;
    expect(transitionSql).toContain('b.step = a.step + 1');
    expect(transitionSql).toContain("event_name = '$page'");
    expect(transitionSql).toContain('session_id IS NOT NULL');
    expect(result.webVitals.metrics[0]).toMatchObject({ metric: 'LCP', p75: 2400, count: 10, poor: 1 });
    expect(result.webVitals.pages[0]).toMatchObject({ path: '/', metric: 'LCP', p75: 2400 });
    const vitalSql = db.queryCalls("event_name = '$web_vital'")[0].text;
    expect(vitalSql).toContain('percentile_cont(0.75)');
  });
});
