import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from '../src/modules/analytics/analytics.service';
import { extractClientIp, resolveGeo } from '../src/common/geo';
import { mockDatabase, rows } from './helpers/mock-db';

const project = {
  id: 'proj_1', name: 'Site', slug: 'site',
  organizationId: 'org_1', organizationName: 'Org', role: 'owner'
};
const user = { id: 'usr_1', authMethod: 'supabase' } as const;

describe('Analytics Replay Count & Geography', () => {
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.TRUST_PROXY_HEADERS;
  });

  describe('getOverview - replay count semantics', () => {
    it('returns replaysAvailable as 0 when there are error sessions but no recorded session replays', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-03T12:00:00Z'));
      const db = mockDatabase((sql) => {
        if (sql.includes('AS total_events')) {
          return rows([{
            total_events: 100, events_24h: 50, events_1h: 10,
            total_users: 5, total_sessions: 10, last_event_at: '2026-09-03T11:00:00Z'
          }]);
        }
        if (sql.includes('AS error_sessions')) {
          return rows([{ rage_clicks: 2, dead_clicks: 1, error_sessions: 4 }]);
        }
        if (sql.includes('FROM session_replays')) {
          return rows([{ count: 0 }]);
        }
        if (sql.includes('WITH rev AS')) {
          return rows([{ current_revenue: 0, previous_revenue: 0, current_transactions: 0 }]);
        }
        return rows([]);
      });

      const projects = { resolveActiveProject: vi.fn().mockResolvedValue(project) };
      const service = new AnalyticsService(db as never, projects as never);

      const result = await service.getOverview(user);

      // Error sessions is 4, but replaysAvailable MUST be 0 (no recorded replays in session_replays)
      expect(result.uxFriction).toEqual({
        rageClicks: 2,
        deadClicks: 1,
        errorSessions: 4,
        replaysAvailable: 0
      });

      const replaySql = db.queryCalls('FROM session_replays')[0]?.text;
      expect(replaySql).toBeDefined();
      expect(replaySql).toContain('WHERE project_id = $1 AND deleted_at IS NULL AND expires_at > now()');
    });

    it('returns exact count of active session replays when replays exist', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-03T12:00:00Z'));
      const db = mockDatabase((sql) => {
        if (sql.includes('AS total_events')) {
          return rows([{
            total_events: 100, events_24h: 50, events_1h: 10,
            total_users: 5, total_sessions: 10, last_event_at: '2026-09-03T11:00:00Z'
          }]);
        }
        if (sql.includes('AS error_sessions')) {
          return rows([{ rage_clicks: 0, dead_clicks: 0, error_sessions: 0 }]);
        }
        if (sql.includes('FROM session_replays')) {
          return rows([{ count: 5 }]);
        }
        if (sql.includes('WITH rev AS')) {
          return rows([{ current_revenue: 0, previous_revenue: 0, current_transactions: 0 }]);
        }
        return rows([]);
      });

      const projects = { resolveActiveProject: vi.fn().mockResolvedValue(project) };
      const service = new AnalyticsService(db as never, projects as never);

      const result = await service.getOverview(user);

      expect(result.uxFriction?.replaysAvailable).toBe(5);
    });

    it('filters out null, empty, and unknown country entries in topCountries query', async () => {
      const db = mockDatabase((sql) => {
        if (sql.includes("network_info->>'country' AS name")) {
          return rows([
            { name: 'NG', total: 1150 },
            { name: 'US', total: 143 }
          ]);
        }
        if (sql.includes('WITH rev AS')) {
          return rows([{ current_revenue: 0, previous_revenue: 0, current_transactions: 0 }]);
        }
        return rows([]);
      });

      const projects = { resolveActiveProject: vi.fn().mockResolvedValue(project) };
      const service = new AnalyticsService(db as never, projects as never);

      const result = await service.getOverview(user);

      const countryQuery = db.queryCalls("network_info->>'country' AS name")[0]?.text;
      expect(countryQuery).toBeDefined();
      expect(countryQuery).toContain("NULLIF(network_info->>'country', '') IS NOT NULL");
      expect(countryQuery).toContain("network_info->>'country' != 'unknown'");
      expect(result.topCountries).toEqual([
        { name: 'NG', total: 1150 },
        { name: 'US', total: 143 }
      ]);
    });
  });

  describe('getWebAnalytics - geography queries and percentage denominators', () => {
    it('filters out unknown/empty country and city and computes accurate percentages based on resolved visitors', async () => {
      const db = mockDatabase((sql) => {
        if (sql.includes("SELECT network_info->>'country' AS name")) {
          return rows([
            { name: 'NG', total: 80 },
            { name: 'US', total: 20 }
          ]);
        }
        if (sql.includes("SELECT network_info->>'city' AS name")) {
          return rows([
            { name: 'Lagos', total: 80 },
            { name: 'New York', total: 20 }
          ]);
        }
        if (sql.includes('AS current_visitors')) {
          return rows([{ current_visitors: 100, current_pageviews: 200, current_sessions: 100, bounce_rate: 0, duration_seconds: 60 }]);
        }
        return rows([]);
      });

      const projects = { resolveActiveProject: vi.fn().mockResolvedValue(project) };
      const service = new AnalyticsService(db as never, projects as never);

      const result = await service.getWebAnalytics(user, { days: 30 });

      expect(result.countries).toEqual([
        { name: 'NG', total: 80, percentage: 80 },
        { name: 'US', total: 20, percentage: 20 }
      ]);
      expect(result.cities).toEqual([
        { name: 'Lagos', total: 80, percentage: 80 },
        { name: 'New York', total: 20, percentage: 20 }
      ]);
      expect(result.topCountry).toEqual({
        name: 'NG',
        total: 80,
        percentage: 80
      });
    });
  });

  describe('geo.ts - IP extraction and proxy handling', () => {
    it('ignores X-Forwarded-For and X-Real-IP when TRUST_PROXY_HEADERS is false (spoofing protection)', () => {
      delete process.env.TRUST_PROXY_HEADERS;

      const ip = extractClientIp('198.51.100.1, 10.0.0.1', '127.0.0.1', '198.51.100.2');
      expect(ip).toBe('127.0.0.1');
    });

    it('extracts real client IP from X-Forwarded-For when TRUST_PROXY_HEADERS=true', () => {
      process.env.TRUST_PROXY_HEADERS = 'true';

      const ip = extractClientIp('102.89.23.4, 127.0.0.1', '127.0.0.1');
      expect(ip).toBe('102.89.23.4');
    });

    it('extracts real client IP from X-Real-IP when forwardedFor is empty and TRUST_PROXY_HEADERS=true', () => {
      process.env.TRUST_PROXY_HEADERS = 'true';

      const ip = extractClientIp(undefined, '127.0.0.1', '102.89.23.4');
      expect(ip).toBe('102.89.23.4');
    });

    it('correctly uses CDN headers (CF-IPCountry) for geolocation', () => {
      const geo = resolveGeo('127.0.0.1', { 'cf-ipcountry': 'NG' });
      expect(geo.country).toBe('NG');
      expect(geo.ipAddress).toBe('127.0.0.1');
    });
  });
});
