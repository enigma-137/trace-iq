import type { InsightType } from '@/types/analytics';

export interface InsightQueryFields {
  funnelId: string;
  event: string;
  measure: string;
  property: string;
  breakdown: string;
  days: string;
  interval: string;
}

/**
 * The saved query for an insight. A funnel's steps live on the saved funnel, so a
 * funnel insight only stores which funnel to run and over what window.
 */
export function buildInsightQuery(type: InsightType, fields: InsightQueryFields): Record<string, unknown> {
  if (type === 'funnel') {
    return { funnelId: fields.funnelId || undefined, days: fields.days };
  }

  return {
    event: fields.event,
    measure: fields.measure,
    property: fields.property || undefined,
    breakdown: fields.breakdown || undefined,
    days: fields.days,
    interval: fields.interval
  };
}
