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
  /** The last request that got no response. Older API versions omit it. */
  lastNetworkErrorAt?: string | null;
  /**
   * The first request the backend answered (any status) after `lastNetworkErrorAt`: the
   * backend is reachable again. Null while it is still unreachable or never was.
   */
  recoveredAt?: string | null;
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
    lastAt: null,
    lastNetworkErrorAt: null,
    recoveredAt: null
  };
}

export function hasFailures(f: FailureFacts): boolean {
  return f.exceptions + f.failedRequests + f.failedActions > 0;
}

/**
 * The backend stopped answering at some point in the window but has answered since.
 * The story then reports the outage as history instead of leading with it.
 */
export function hasRecovered(f: FailureFacts): boolean {
  return f.networkErrors > 0 && !!f.recoveredAt;
}

/**
 * How loudly the story should talk about failures. A busy app always has a few: expired
 * sessions answering 401, a phone going offline mid-request, a validation error. Those are
 * normal, so they get a calm line at the end instead of opening the story.
 * - serious: the backend looks unreachable right now, or requests are mostly failing; leads;
 * - notable: worth a factual sentence after the activity (5xx, a recovered outage, a high
 *   failure rate, many exceptions or failed actions);
 * - minor: the background noise of a working product; one short line at the end;
 * - none: nothing failed.
 */
export type StoryFailureSeverity = 'none' | 'minor' | 'notable' | 'serious';

export function storyFailureSeverity(f: FailureFacts): StoryFailureSeverity {
  if (!hasFailures(f)) return 'none';
  const recovered = hasRecovered(f);
  const rate = f.totalRequests > 0 ? f.failedRequests / f.totalRequests : 0;
  const serverRate = f.totalRequests > 0 ? f.serverErrors / f.totalRequests : 0;
  if (f.networkErrors >= 3 && !recovered) return 'serious';
  if ((f.failedRequests >= 5 && rate >= 0.25) || (f.serverErrors >= 5 && serverRate >= 0.05)) return 'serious';
  if (
    f.networkErrors > 0 ||
    f.serverErrors > 0 ||
    (f.failedRequests >= 3 && rate >= 0.1) ||
    f.exceptions >= 5 ||
    (f.exceptions > 0 && f.topError !== null && f.topError.users >= 3) ||
    f.failedActions >= 10
  ) {
    return 'notable';
  }
  return 'minor';
}

/** "2.9%" under 10%, "14%" above; one decimal is enough to tell 0.4% from 4%. */
function percent(part: number, whole: number): string {
  const value = (part / whole) * 100;
  return `${value < 10 ? Number(value.toFixed(1)) : Math.round(value)}%`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function clock(date: Date): string {
  return `${date.toISOString().slice(11, 16)} UTC`;
}

function dayClock(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${clock(date)}`;
}

/** " between 18:38 UTC and 19:34 UTC", with dates when the span crosses midnight UTC. */
function span(firstAt: string | null, lastAt: string | null): string {
  const first = parse(firstAt);
  const last = parse(lastAt);
  if (!first || !last) return '';
  const sameDay = first.toISOString().slice(0, 10) === last.toISOString().slice(0, 10);
  const from = sameDay ? clock(first) : dayClock(first);
  const to = sameDay ? clock(last) : dayClock(last);
  return from === to ? ` at ${from}` : ` between ${from} and ${to}`;
}

/**
 * The failure sentences for the story, or null when nothing failed. While the backend is
 * unreachable they open the story; once it answers again they read as resolved history.
 */
export function failureNarrative(f: FailureFacts, window = 'the last 24 hours'): string | null {
  const severity = storyFailureSeverity(f);
  if (severity === 'none') return null;
  if (severity === 'minor') return minorFailureLine(f);
  const sentences: string[] = [];
  const when = span(f.firstAt, f.lastAt);
  const affecting = f.affectedUsers > 0 ? `, affecting ${plural(f.affectedUsers, 'user')}` : '';
  const recovered = hasRecovered(f);

  if (f.networkErrors > 0) {
    const top = f.topFailedRequest;
    const where = top && top.status === 0 ? ` (${top.method} ${top.path})` : '';
    if (recovered) {
      const lastDown = parse(f.lastNetworkErrorAt);
      const back = parse(f.recoveredAt);
      const until = lastDown ? `, the last at ${clock(lastDown)}` : '';
      const since = back ? ` since ${clock(back)}` : '';
      sentences.push(
        `Earlier, ${plural(f.networkErrors, 'request')} got no response from your backend${where}${until}${affecting}. It has been responding again${since}.`
      );
    } else if (severity === 'serious') {
      sentences.push(
        `Heads up: ${plural(f.networkErrors, 'request')} got no response from your backend${where}${when}${affecting}. Your API may be down or unreachable.`
      );
    } else {
      // One or two unanswered requests: often a device that went offline, not an outage.
      sentences.push(`${plural(f.networkErrors, 'request')} got no response from your backend${where}${when}${affecting}.`);
    }
  } else if (f.failedRequests > 0) {
    const top = f.topFailedRequest;
    const where = top ? `, most often ${top.method} ${top.path} (${top.status})` : '';
    const share = f.totalRequests > 0 ? ` (${percent(f.failedRequests, f.totalRequests)} of ${f.totalRequests.toLocaleString()})` : '';
    sentences.push(`${plural(f.failedRequests, 'request')}${share} failed in ${window}${where}${when}${affecting}.`);
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

/**
 * Background noise in one calm sentence: "Minor hiccups: 12 of 419 requests (2.9%) returned
 * an error, mostly 401 on GET /api/user/profile/; water_log_failed happened 2 times."
 */
function minorFailureLine(f: FailureFacts): string {
  const parts: string[] = [];
  if (f.failedRequests > 0) {
    const top = f.topFailedRequest;
    const mostly = top && f.failedRequests > 1 ? `, mostly ${top.status} on ${top.method} ${top.path}` : top ? ` (${top.status} on ${top.method} ${top.path})` : '';
    parts.push(
      f.totalRequests > 0
        ? `${f.failedRequests.toLocaleString()} of ${plural(f.totalRequests, 'request')} (${percent(f.failedRequests, f.totalRequests)}) returned an error${mostly}`
        : `${plural(f.failedRequests, 'request')} returned an error${mostly}`
    );
  }
  if (f.topFailedAction) parts.push(`${f.topFailedAction.name} happened ${plural(f.topFailedAction.count, 'time')}`);
  if (f.exceptions > 0) parts.push(`${plural(f.exceptions, 'error')} ${f.exceptions === 1 ? 'was' : 'were'} captured`);
  return `Minor hiccups: ${parts.join('; ')}.`;
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
