import { describe, expect, it } from 'vitest';
import { dashboardToUrl, dashboardSummary, RECOMMENDED_TEMPLATES, type TrendDefinition } from '../src/app/dashboard/dashboards/types';

describe('dashboards types & helpers', () => {
  it('provides recommended starter templates', () => {
    expect(RECOMMENDED_TEMPLATES.length).toBeGreaterThanOrEqual(4);
    const templateNames = RECOMMENDED_TEMPLATES.map((t) => t.name);
    expect(templateNames).toContain('Product Overview');
    expect(templateNames).toContain('Acquisition');
    expect(templateNames).toContain('Retention');
    expect(templateNames).toContain('Errors & Performance');
  });

  it('generates proper insights URLs from trend definitions', () => {
    const def: TrendDefinition = {
      source: 'trend',
      event: '$pageview',
      interval: 'day',
      days: '30',
      measure: 'unique',
      breakdown: '$browser'
    };
    const url = dashboardToUrl(def);
    expect(url).toContain('/dashboard/insights?');
    expect(url).toContain('event=%24pageview');
    expect(url).toContain('measure=unique');
    expect(url).toContain('days=30');
    expect(url).toContain('breakdown=%24browser');
  });

  it('generates readable summaries', () => {
    const def: TrendDefinition = {
      source: 'trend',
      event: '$pageview',
      days: '30',
      measure: 'unique'
    };
    const summary = dashboardSummary(def);
    expect(summary).toBe('unique users of $pageview · last 30d');
  });
});
