// Shared metric aggregation helpers used by analytics (trends) and alerts.

export type TrendMeasure = 'count' | 'unique' | 'sum' | 'avg';

export const ALLOWED_MEASURES: TrendMeasure[] = ['count', 'unique', 'sum', 'avg'];

// Matches a plain integer or decimal so a JSONB text value can be safely cast to numeric.
export const NUMERIC_GUARD = "'^-?[0-9]+(\\.[0-9]+)?$'";

// Event names that describe intent or an outcome other than a completed payment
// (checkout_started, plan_selected, payment_failed, …). Their `amount` is a quoted
// price, not money received, so revenue metrics skip them. System ($-prefixed)
// events never carry revenue either.
export const NON_REVENUE_EVENT =
  "'^\\$|(^|_)(start|started|initiated|redirected|viewed|opened|clicked|selected|shown|added|attempted|failed|abandoned|cancelled|canceled|declined|pending|returned)($|_)'";

// Builds the SQL aggregate expression for the selected measure, appending any needed
// property param to `params` (so placeholder indices stay correct within the query).
export function buildMeasureExpr(measure: TrendMeasure, property: string | null, params: unknown[]): string {
  if ((measure === 'sum' || measure === 'avg') && property) {
    params.push(property);
    const propExpr = `properties->>$${params.length}`;
    const agg = measure === 'sum' ? 'sum' : 'avg';
    return `COALESCE(${agg}(CASE WHEN ${propExpr} ~ ${NUMERIC_GUARD} THEN (${propExpr})::numeric END), 0)::float`;
  }
  if (measure === 'unique') {
    return "count(DISTINCT COALESCE(user_id::text, anonymous_id))::float";
  }
  return 'count(*)::float';
}
