// Shared segmentation filter engine. A filter set is a list of conditions ANDed
// together, used both for ad-hoc segmentation on analytics views and as the stored
// definition of a saved cohort.

export type FilterOperator = 'is' | 'is_not' | 'contains' | 'is_set' | 'is_not_set';

export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value?: string;
}

// Well-known dimensions map to device_info / network_info JSONB paths (trusted, fixed
// whitelist). Any other field is treated as an event property key (bound as a param).
export const DIMENSION_SOURCES: Record<string, string> = {
  os: "device_info->>'os'",
  $os: "device_info->>'os'",
  device: "device_info->>'deviceType'",
  $device: "device_info->>'deviceType'",
  device_type: "device_info->>'deviceType'",
  $device_type: "device_info->>'deviceType'",
  browser: "device_info->>'browser'",
  $browser: "device_info->>'browser'",
  platform: "device_info->>'platform'",
  $platform: "device_info->>'platform'",
  country: "network_info->>'country'",
  $country: "network_info->>'country'",
  region: "network_info->>'region'",
  $region: "network_info->>'region'",
  city: "network_info->>'city'",
  $city: "network_info->>'city'",
  path: "context->'page'->>'path'",
  $path: "context->'page'->>'path'",
  referrer: "context->'page'->>'referrer'",
  $referrer: "context->'page'->>'referrer'",
  event_name: 'event_name',
  $event_name: 'event_name',
  $event: 'event_name',
  utm_source: "context->'page'->'utm'->>'source'",
  utm_medium: "context->'page'->'utm'->>'medium'",
  utm_campaign: "context->'page'->'utm'->>'campaign'",
  utm_term: "context->'page'->'utm'->>'term'",
  utm_content: "context->'page'->'utm'->>'content'"
};

const ALLOWED_OPERATORS: FilterOperator[] = ['is', 'is_not', 'contains', 'is_set', 'is_not_set'];
const MAX_FILTERS = 20;

export function sanitizeFilters(input: unknown): FilterCondition[] {
  if (!Array.isArray(input)) return [];
  const out: FilterCondition[] = [];
  for (const item of input.slice(0, MAX_FILTERS)) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const field = typeof rec.field === 'string' ? rec.field.trim() : '';
    const operator = rec.operator;
    if (!field) continue;
    if (typeof operator !== 'string' || !ALLOWED_OPERATORS.includes(operator as FilterOperator)) continue;
    const value = typeof rec.value === 'string' ? rec.value : undefined;
    out.push({ field, operator: operator as FilterOperator, value });
  }
  return out;
}

// Parses a JSON-encoded filter param (from a query string). Returns [] on anything invalid.
export function parseFiltersParam(raw?: string): FilterCondition[] {
  if (!raw) return [];
  try {
    return sanitizeFilters(JSON.parse(raw));
  } catch {
    return [];
  }
}

function resolveField(field: string, params: unknown[]): string {
  const dimension = DIMENSION_SOURCES[field.toLowerCase()];
  if (dimension) return dimension;
  params.push(field);
  return `properties->>$${params.length}`;
}

// Builds a leading-` AND (...)` SQL fragment for the given filters, appending any needed
// values to `params` (so placeholder indices stay correct within the caller's query).
// Returns '' when there are no filters.
export function buildFilterClause(filters: FilterCondition[], params: unknown[]): string {
  const clauses: string[] = [];
  for (const filter of filters) {
    if (!filter.field) continue;
    const expr = resolveField(filter.field, params);
    switch (filter.operator) {
      case 'is':
        params.push(filter.value ?? '');
        clauses.push(`${expr} = $${params.length}`);
        break;
      case 'is_not':
        params.push(filter.value ?? '');
        clauses.push(`${expr} IS DISTINCT FROM $${params.length}`);
        break;
      case 'contains':
        params.push(filter.value ?? '');
        clauses.push(`${expr} ILIKE '%' || $${params.length} || '%'`);
        break;
      case 'is_set':
        clauses.push(`(${expr} IS NOT NULL AND ${expr} <> '')`);
        break;
      case 'is_not_set':
        clauses.push(`(${expr} IS NULL OR ${expr} = '')`);
        break;
    }
  }
  return clauses.length ? ` AND ${clauses.join(' AND ')}` : '';
}
