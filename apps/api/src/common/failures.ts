/**
 * One definition of "this failed" for every view that counts failures (Requests,
 * API performance, Overview, Logs, the story), so they can't disagree about an outage.
 *
 * A request fails when the server answered 4xx/5xx, or when the browser never got an
 * answer at all. The SDKs record that last case (CORS block, DNS failure, connection
 * refused, abort) as status 0. Those are the worst failures there are, since the
 * backend is unreachable, so they must never be counted as anything but errors.
 */

/** The status the SDKs record when no HTTP response arrived. */
export const NETWORK_FAILURE_STATUS = 0;

export function isNetworkFailureStatus(status: number | null | undefined): boolean {
  return status === NETWORK_FAILURE_STATUS;
}

export function isFailedStatus(status: number | null | undefined): boolean {
  if (status === null || status === undefined || !Number.isFinite(status)) return false;
  return status === NETWORK_FAILURE_STATUS || status >= 400;
}

/**
 * SQL predicate for an integer status expression. The expression must already be an
 * int (or NULL). NULL means "no status recorded" and is not a failure.
 */
export function failedStatusSql(statusExpr: string): string {
  return `(${statusExpr} >= 400 OR ${statusExpr} = ${NETWORK_FAILURE_STATUS})`;
}

/** Trace/span status for a request: no response and 5xx are errors, 4xx a warning. */
export function requestTraceStatus(statusCode: number | null | undefined): 'error' | 'warning' | 'success' {
  if (statusCode === null || statusCode === undefined) return 'success';
  if (statusCode === NETWORK_FAILURE_STATUS || statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warning';
  return 'success';
}

/**
 * Messages browsers and HTTP clients use when a request got no response. A caught
 * exception with one of these means a user's action failed because the backend was
 * unreachable, which is an error however politely the app handled it.
 */
const NETWORK_FAILURE_PATTERNS: readonly RegExp[] = [
  /failed to fetch/i, // Chrome, Edge
  /networkerror when attempting to fetch/i, // Firefox
  /^load failed$/i, // Safari
  /network request failed/i, // React Native, whatwg-fetch
  /^network error$/i, // axios
  /\bnet::err_/i,
  /\bERR_NETWORK\b/,
  /\bECONNREFUSED\b|\bECONNRESET\b|\bENOTFOUND\b|\bETIMEDOUT\b|\bEAI_AGAIN\b/,
  /fetch failed/i // Node undici
];

/** SQL regex (Postgres `~*`) matching the same messages, for backfills. */
export const NETWORK_FAILURE_SQL_REGEX =
  'failed to fetch|networkerror when attempting to fetch|^load failed$|network request failed|^network error$|net::err_|err_network|econnrefused|econnreset|enotfound|etimedout|eai_again|fetch failed';

export function isNetworkFailureMessage(...texts: Array<string | null | undefined>): boolean {
  return texts.some((text) => typeof text === 'string' && NETWORK_FAILURE_PATTERNS.some((pattern) => pattern.test(text.trim())));
}

/**
 * Tracked events that mean a user's action failed (`login_failed`, `checkout_error`,
 * `payment_declined`). They're product events, not exceptions, but they belong in
 * failure views, not mixed in with page views at info.
 */
export function isFailureEventName(name: string | null | undefined): boolean {
  if (!name || name.startsWith('$')) return false;
  return /(^|[_.\-\s:])(failed|failure|error|errored|declined|rejected|denied)$/i.test(name) || /[a-z](Failed|Error|Declined|Rejected)$/.test(name);
}

/** SQL predicate on an event-name column matching `isFailureEventName`. */
export function failureEventNameSql(nameExpr: string): string {
  return `(${nameExpr} !~ '^\\$' AND (${nameExpr} ~* '(^|[_.\\- :])(failed|failure|error|errored|declined|rejected|denied)$' OR ${nameExpr} ~ '[a-z](Failed|Error|Declined|Rejected)$'))`;
}
