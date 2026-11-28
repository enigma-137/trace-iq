import { IngestEventRequest } from '../events/events.service';

type JsonObject = Record<string, unknown>;

/**
 * Normalizes an event in TraceIQ's own shapes:
 * - a row from the dashboard's JSON export (`occurredAt`, flat `country`/`os`/...),
 * - an ingestion event as the SDKs and /v1/events/batch send it (`timestamp`,
 *   `deviceInfo`, `networkInfo`, `context`).
 * Lets an export from one project (or a self-hosted instance) be imported into another.
 */
export function normalizeTraceIQEvent(raw: unknown): { event: IngestEventRequest } | { skipped: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { skipped: '(not an object)' };
  const row = raw as JsonObject;

  const eventName = str(row.eventName) ?? str(row.event_name);
  if (!eventName) return { skipped: '(missing eventName)' };

  const timestamp = str(row.timestamp) ?? str(row.occurredAt) ?? str(row.occurred_at);
  if (!timestamp || Number.isNaN(new Date(timestamp).getTime())) return { skipped: '(missing or invalid timestamp)' };

  const userId = str(row.userId);
  let anonymousId = str(row.anonymousId);
  if (!userId && !anonymousId) anonymousId = str(row.distinctId);

  const deviceInfo = obj(row.deviceInfo) ?? compact({ os: str(row.os), deviceType: str(row.deviceType), browser: str(row.browser) });
  const networkInfo = obj(row.networkInfo) ?? compact({ country: str(row.country), region: str(row.region), city: str(row.city) });

  return {
    event: {
      eventName,
      timestamp: new Date(timestamp).toISOString(),
      userId,
      anonymousId,
      sessionId: str(row.sessionId),
      properties: obj(row.properties) ?? parseJsonObject(row.properties) ?? {},
      deviceInfo: Object.keys(deviceInfo).length ? deviceInfo : undefined,
      networkInfo: Object.keys(networkInfo).length ? networkInfo : undefined,
      // Keeps an existing import marker (e.g. events the CLI already mapped from PostHog).
      context: { import: { source: 'traceiq', ...(str(row.id) ? { id: str(row.id) } : {}) }, ...(obj(row.context) ?? {}) }
    } as IngestEventRequest
  };
}

function str(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function obj(value: unknown): JsonObject | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : undefined;
}

function parseJsonObject(value: unknown): JsonObject | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    return obj(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function compact(value: JsonObject): JsonObject {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
}
