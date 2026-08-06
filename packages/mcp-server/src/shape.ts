import { JsonObject, JsonValue } from './types.js';

export interface ShapeOptions {
  /** Maximum number of items kept in any array. Default 200. */
  maxItems?: number;
  /** Maximum characters kept for any string. Default 400. */
  maxStringLength?: number;
  /** Maximum object nesting depth before summarization. Default 8. */
  maxDepth?: number;
}

const DEFAULTS: Required<ShapeOptions> = {
  maxItems: 200,
  maxStringLength: 400,
  maxDepth: 8
};

/**
 * Shapes raw API responses for LLM consumption so we never dump tens of
 * thousands of events or deep nested payloads into model context:
 *  - arrays are truncated with a "__truncated" marker
 *  - long strings are clipped
 *  - deeply nested objects are collapsed
 */
export function shapeResponse(value: JsonValue, options: ShapeOptions = {}): JsonValue {
  const opts = { ...DEFAULTS, ...options };
  return shape(value, opts, 0);
}

function shape(value: JsonValue, opts: Required<ShapeOptions>, depth: number): JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return value.length > opts.maxStringLength ? `${value.slice(0, opts.maxStringLength)}…` : value;
  }

  if (Array.isArray(value)) {
    if (value.length > opts.maxItems) {
      const kept = value.slice(0, opts.maxItems);
      const shaped = kept.map((item) => shape(item, opts, depth + 1));
      return [...shaped, { __truncated: value.length - opts.maxItems }];
    }
    return value.map((item) => shape(item, opts, depth + 1));
  }

  if (typeof value === 'object') {
    if (depth >= opts.maxDepth) {
      return { '[collapsed]': true };
    }
    const out: JsonObject = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = shape(item, opts, depth + 1);
    }
    return out;
  }

  return value;
}

/**
 * Compacts a user timeline into a concise, chronological activity list —
 * the event name, timestamp, and up to `keyProps` small scalar properties —
 * instead of shipping every raw payload property into model context.
 */
export function compactTimeline(items: Array<Record<string, unknown>>, keyProps: string[] = [], limit = 50): JsonValue[] {
  return items.slice(0, limit).map((item) => {
    const entry: Record<string, JsonValue> = {
      event: typeof item.eventName === 'string' ? item.eventName : 'unknown'
    };
    if (typeof item.occurredAt === 'string') entry.at = item.occurredAt;

    const props = (item.properties as Record<string, unknown> | undefined) ?? {};
    const picked: Record<string, JsonValue> = {};
    for (const key of keyProps) {
      const val = props[key];
      if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
        picked[key] = val as JsonValue;
      }
    }
    if (Object.keys(picked).length > 0) entry.properties = picked;
    return entry;
  });
}

/**
 * Summarizes a large flat list (e.g. export rows) by keeping a preview and
 * reporting the true total rather than serializing everything.
 */
export function summarizeList<T extends Record<string, unknown>>(
  rows: T[],
  preview = 25
): JsonValue {
  const total = rows.length;
  const previewRows = rows.slice(0, preview).map((row) => row as unknown as JsonValue);
  if (total <= preview) {
    return { total, preview: previewRows };
  }
  return { total, preview: previewRows, __truncated: total - preview };
}