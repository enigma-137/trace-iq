import { API_REQUEST_EVENT } from '../modules/requests/request-capture';

/**
 * Events an SDK sends on its own, with no action from the person: background
 * request capture (an idle tab polling an endpoint), web vitals and uncaught
 * errors. They are stored like any event, but they never count as a person being
 * active: they don't move users.last_seen_at and they don't make anyone "come
 * back" in retention.
 */
export const PASSIVE_EVENTS: readonly string[] = [API_REQUEST_EVENT, '$web_vital', '$exception'];

const PASSIVE_SET: ReadonlySet<string> = new Set(PASSIVE_EVENTS);

export function isPassiveEvent(eventName: string): boolean {
  return PASSIVE_SET.has(eventName);
}

/** SQL literal list for `event_name NOT IN (...)`. Built from constants, never input. */
export const PASSIVE_EVENTS_SQL = PASSIVE_EVENTS.map((name) => `'${name.replace(/'/g, "''")}'`).join(', ');
