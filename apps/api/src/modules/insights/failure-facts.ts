import { failedStatusSql, failureEventNameSql } from '../../common/failures';

/**
 * Everything that failed in a window, counted the same way Requests, Logs and the
 * Overview count it (see common/failures.ts).
 */
export interface FailureFacts {
  /** `$exception` / `$error` events, caught or not. */
  exceptions: number;
  /** API requests that failed: 4xx, 5xx, or no response at all. */
  failedRequests: number;
  /** Requests that got no response (status 0): the backend was unreachable. */
  networkErrors: number;
  serverErrors: number;
  totalRequests: number;
  /** Tracked failure events such as `login_failed`. */
  failedActions: number;
  /** Distinct users or visitors who hit any of the above. */
  affectedUsers: number;
  topError: { type: string; message: string; count: number; users: number } | null;
  topFailedRequest: { method: string; path: string; status: number; count: number } | null;
  topFailedAction: { name: string; count: number; users: number } | null;
  firstAt: string | null;
  lastAt: string | null;
}

export type HealthStatus = 'operational' | 'degraded' | 'outage' | 'idle';

export interface ProjectHealthResponse {
  project: { id: string; name: string } | null;
  status: HealthStatus;
  /** One line for the header and the overview banner. */
  summary: string;
  windowMinutes: number;
  failures: FailureFacts;
  checkedAt: string;
}

/**
 * Health from the data rather than from alert rules, so a project with no alerts set
 * up can't read "All systems operational" in the middle of an outage.
 * - outage: several requests got no response at all, or requests are mostly failing;
 * - degraded: anything users would notice (an unreachable request, a 5xx, exceptions,
 *   a run of failed requests or failed actions);
 * - idle: no events at all, so there's nothing to judge.
 */
export function classifyHealth(f: FailureFacts, eventCount: number): HealthStatus {
  if (eventCount === 0) return 'idle';
  const failureRate = f.totalRequests > 0 ? f.failedRequests / f.totalRequests : 0;
  if (f.networkErrors >= 3 || (f.failedRequests >= 5 && failureRate >= 0.5) || f.serverErrors >= 10) return 'outage';
  if (
    f.networkErrors > 0 ||
    f.serverErrors > 0 ||
    f.exceptions > 0 ||
    (f.failedRequests >= 3 && failureRate >= 0.05) ||
    f.failedActions >= 3
  ) {
    return 'degraded';
  }
  return 'operational';
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** "3 requests got no response · 4 errors · 2 users affected", biggest problems first. */
export function describeFailures(f: FailureFacts): string {
  const parts: string[] = [];
  if (f.networkErrors > 0) parts.push(`${plural(f.networkErrors, 'request')} got no response`);
  const otherFailed = f.failedRequests - f.networkErrors;
  if (otherFailed > 0) parts.push(plural(otherFailed, 'failed request'));
  if (f.exceptions > 0) parts.push(plural(f.exceptions, 'error'));
  if (f.topFailedAction) parts.push(`${f.topFailedAction.name} × ${f.topFailedAction.count.toLocaleString()}`);
  if (f.affectedUsers > 0) parts.push(`${plural(f.affectedUsers, 'user')} affected`);
  return parts.join(' · ');
}

export function emptyFailureFacts(): FailureFacts {
  return {
    exceptions: 0,
    failedRequests: 0,
    networkErrors: 0,
    serverErrors: 0,
    totalRequests: 0,
    failedActions: 0,
    affectedUsers: 0,
    topError: null,
    topFailedRequest: null,
    topFailedAction: null,
    firstAt: null,
    lastAt: null
  };
}

export function hasFailures(f: FailureFacts): boolean {
  return f.exceptions + f.failedRequests + f.failedActions > 0;
}

function shortTime(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : `${date.toISOString().slice(11, 16)} UTC`;
}

/** The failure sentences that open the story, or null when nothing failed. */
export function failureNarrative(f: FailureFacts, window = 'the last 24 hours'): string | null {
  if (!hasFailures(f)) return null;
  const sentences: string[] = [];
  const from = shortTime(f.firstAt);
  const to = shortTime(f.lastAt);
  const when = from && to ? (from === to ? ` at ${from}` : ` between ${from} and ${to}`) : '';
  const affecting = f.affectedUsers > 0 ? `, affecting ${plural(f.affectedUsers, 'user')}` : '';

  if (f.networkErrors > 0) {
    const top = f.topFailedRequest;
    const where = top && top.status === 0 ? ` (${top.method} ${top.path})` : '';
    sentences.push(
      `Heads up: ${plural(f.networkErrors, 'request')} got no response from your backend${where}${when}${affecting}. Your API may have been down or unreachable.`
    );
  } else if (f.failedRequests > 0) {
    const top = f.topFailedRequest;
    const where = top ? `, most often ${top.method} ${top.path} (${top.status})` : '';
    sentences.push(`${plural(f.failedRequests, 'request')} failed in ${window}${where}${when}${affecting}.`);
  }
  if (f.topFailedAction) {
    const action = f.topFailedAction;
    sentences.push(`${action.name} happened ${plural(action.count, 'time')} for ${plural(action.users, 'user')}.`);
  }
  if (f.exceptions > 0) {
    const top = f.topError ? `, most often ${f.topError.type}: ${f.topError.message.slice(0, 120)}` : '';
    const lead = f.failedRequests === 0 ? `${when}${affecting}` : '';
    sentences.push(`${plural(f.exceptions, 'error')} ${f.exceptions === 1 ? 'was' : 'were'} captured${lead}${top}.`);
  }
  return sentences.join(' ');
}

// Numeric status or NULL, so a malformed value is "unknown", never a fake network error.
export const STATUS_INT = `(CASE WHEN properties->>'status' ~ '^[0-9]+$' THEN (properties->>'status')::int END)`;
export const FAILURE_KIND_SQL = `
  CASE
    WHEN event_name IN ('$exception', '$error') THEN 'exception'
    WHEN event_name = '$api_request' AND ${failedStatusSql(STATUS_INT)} THEN 'request'
    WHEN ${failureEventNameSql('event_name')} THEN 'action'
  END
`;
