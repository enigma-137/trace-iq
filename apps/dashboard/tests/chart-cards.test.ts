import { describe, expect, it } from 'vitest';
import { comparisonRanges, snapshotLabels } from '../src/components/charts/ComparisonHoverCard';
import { pointChange } from '../src/components/charts/ChartPointCard';
import { buildOverview, buildSeries } from '../src/lib/demo-data';

describe('comparison cards', () => {
  it('labels the current window and the one before it', () => {
    const end = new Date('2026-10-29T12:00:00Z');
    expect(comparisonRanges(end, 30)).toEqual({ previousLabel: 'Aug 30 – Sep 29', currentLabel: 'Sep 29 – Oct 29' });
    expect(comparisonRanges(end, 1).currentLabel).toBe('Oct 28, 12 PM – Oct 29, 12 PM');
  });

  it('labels an all-time count against its value when the window started', () => {
    const end = new Date('2026-10-29T12:00:00Z');
    expect(snapshotLabels(end, 7)).toEqual({ previousLabel: 'As of Oct 22', currentLabel: 'Now' });
    expect(snapshotLabels(end, 1).previousLabel).toBe('As of Oct 28, 12 PM');
  });

  it('computes point-to-point change and skips a zero base', () => {
    expect(pointChange(150, 100)).toBe(50);
    expect(pointChange(50, 100)).toBe(-50);
    expect(pointChange(10, 0)).toBeNull();
    expect(pointChange(10, undefined)).toBeNull();
  });
});

describe('demo previous period', () => {
  const now = new Date('2026-10-29T12:00:00Z');
  const company = { name: 'Northwind', category: 'saas' as const };

  it('ends where the current window starts and differs from it', () => {
    const current = buildSeries(company, '7d', now);
    const previous = buildSeries(company, '7d', now, 'previous');
    expect(previous).toHaveLength(7);
    expect(new Date(previous[6].bucket).getTime() + 86_400_000).toBe(new Date(current[0].bucket).getTime());
    expect(previous.map((p) => p.visitors)).not.toEqual(current.map((p) => p.visitors));
  });

  it('reports previous totals without changing the current ones', () => {
    const overview = buildOverview(company, '30d', now);
    expect(overview.previous.visitors).toBe(buildSeries(company, '30d', now, 'previous').reduce((sum, p) => sum + p.visitors, 0));
    expect(overview.totals.visitors).toBe(buildSeries(company, '30d', now).reduce((sum, p) => sum + p.visitors, 0));
    expect(overview.previous.p95).toBeGreaterThan(0);
  });
});
