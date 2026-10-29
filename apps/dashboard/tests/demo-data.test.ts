import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEMO_REQUEST_FILTERS,
  DEMO_CATEGORY_OPTIONS,
  buildFunnel,
  buildOverview,
  buildRequests,
  buildSeries,
  companyDomain,
  demoFunnels,
  filterRequests,
  normalizeCompanyName,
  summarizeRequests
} from '../src/lib/demo-data';

const now = new Date('2026-10-29T12:00:00Z');
const company = { name: 'Northwind', category: 'ecommerce' as const };

describe('live demo data', () => {
  it('is deterministic for a company and changes with the company', () => {
    expect(buildOverview(company, '30d', now)).toEqual(buildOverview(company, '30d', now));
    expect(buildSeries({ ...company, name: 'Globex' }, '30d', now)).not.toEqual(buildSeries(company, '30d', now));
  });

  it('builds one bucket per hour or day of the range', () => {
    expect(buildSeries(company, '24h', now)).toHaveLength(24);
    expect(buildSeries(company, '7d', now)).toHaveLength(7);
    const days = buildSeries(company, '90d', now);
    expect(days).toHaveLength(90);
    expect(days[days.length - 1].bucket).toBe('2026-10-29T00:00:00.000Z');
  });

  it('keeps overview numbers consistent', () => {
    const overview = buildOverview(company, '30d', now);
    const { ok200, rateLimit429, error500, other } = overview.statusBreakdown;
    expect(ok200 + rateLimit429 + error500 + other).toBe(overview.totals.apiCalls);
    expect(overview.p50).toBeLessThan(overview.p95);
    expect(overview.p95).toBeLessThan(overview.p99);
    expect(overview.totals.visitors).toBeLessThan(overview.totals.pageviews);
  });

  it('builds funnels for every category with non-increasing steps', () => {
    for (const { value } of DEMO_CATEGORY_OPTIONS) {
      const demo = { name: 'Acme', category: value };
      for (const funnel of demoFunnels(demo)) {
        for (const source of ['All sources', 'Hacker News'] as const) {
          const result = buildFunnel(demo, funnel.id, '30d', source, now)!;
          expect(result.steps).toHaveLength(funnel.stepCount);
          result.steps.slice(1).forEach((step, i) => {
            expect(step.count).toBeLessThanOrEqual(result.steps[i].count);
            expect(step.droppedFromPrevious).toBe(result.steps[i].count - step.count);
          });
          expect(result.conversion).toBeGreaterThanOrEqual(0);
          expect(result.conversion).toBeLessThanOrEqual(1);
        }
      }
    }
    expect(buildFunnel(company, 'missing', '30d', 'All sources', now)).toBeNull();
  });

  it('samples requests newest first inside the window and filters them', () => {
    const requests = buildRequests(company, '24h', now);
    expect(requests).toHaveLength(240);
    const times = requests.map((request) => new Date(request.occurredAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(Math.min(...times)).toBeGreaterThan(now.getTime() - 25 * 3_600_000);
    expect(new Set(requests.map((request) => request.id)).size).toBe(requests.length);

    const serverErrors = filterRequests(requests, { ...DEFAULT_DEMO_REQUEST_FILTERS, status: '5xx' });
    expect(serverErrors.every((request) => request.statusCode >= 500)).toBe(true);
    expect(summarizeRequests(serverErrors).serverErrors).toBe(serverErrors.length);

    const slowest = filterRequests(requests, { ...DEFAULT_DEMO_REQUEST_FILTERS, sort: 'duration' });
    expect(slowest[0].durationMs).toBe(Math.max(...requests.map((request) => request.durationMs)));

    const target = requests[10];
    expect(filterRequests(requests, { ...DEFAULT_DEMO_REQUEST_FILTERS, search: target.requestId! })).toEqual([target]);
  });

  it('normalizes the typed company name', () => {
    expect(normalizeCompanyName('   ')).toBe('Acme Inc.');
    expect(normalizeCompanyName('  Big   Co  ')).toBe('Big Co');
    expect(normalizeCompanyName('x'.repeat(80))).toHaveLength(40);
    expect(companyDomain('Café Örn & Co')).toBe('cafeornco.com');
  });
});
