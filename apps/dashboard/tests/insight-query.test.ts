import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildInsightQuery } from '../src/app/dashboard/insights/insight-query';

const fields = {
  funnelId: 'fnl_1',
  event: 'signup',
  measure: 'count',
  property: '',
  breakdown: 'country',
  days: '14',
  interval: 'day'
};

describe('buildInsightQuery', () => {
  it('stores only the funnel and window for a funnel insight', () => {
    expect(buildInsightQuery('funnel', fields)).toEqual({ funnelId: 'fnl_1', days: '14' });
  });

  it('leaves the funnel id unset until one is chosen', () => {
    expect(buildInsightQuery('funnel', { ...fields, funnelId: '' }).funnelId).toBeUndefined();
  });

  it('keeps event fields for other insight types, without a funnel id', () => {
    expect(buildInsightQuery('trend', fields)).toEqual({
      event: 'signup',
      measure: 'count',
      property: undefined,
      breakdown: 'country',
      days: '14',
      interval: 'day'
    });
  });

  it('no longer ships event names from another product as default steps', () => {
    const builder = readFileSync('src/app/dashboard/insights/InsightBuilder.tsx', 'utf8');
    expect(builder).not.toContain('letter_published');
  });
});
