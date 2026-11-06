-- Caught exceptions used to be mirrored into Logs as warnings, so a backend outage
-- (every request failing with "Failed to fetch") showed up with zero errors. The
-- ingest path now logs a caught exception as an error when the request behind it got
-- no response, and a tracked failure event (login_failed, payment_declined) as a
-- warning. This brings the last 30 days of stored logs in line with that.
-- The regex matches NETWORK_FAILURE_SQL_REGEX in src/common/failures.ts.

UPDATE observability_logs
SET level = 'error', status = 'error'
WHERE source = 'event'
  AND level = 'warn'
  AND timestamp >= now() - interval '30 days'
  AND metadata->>'eventName' IN ('$exception', '$error')
  AND COALESCE(error_details->>'message', message) ~* 'failed to fetch|networkerror when attempting to fetch|^load failed$|network request failed|^network error$|net::err_|err_network|econnrefused|econnreset|enotfound|etimedout|eai_again|fetch failed';

UPDATE observability_logs
SET level = 'warn', status = 'warning'
WHERE source = 'event'
  AND level = 'info'
  AND timestamp >= now() - interval '30 days'
  AND metadata->>'eventName' !~ '^\$'
  AND (
    metadata->>'eventName' ~* '(^|[_.\- :])(failed|failure|error|errored|declined|rejected|denied)$'
    OR metadata->>'eventName' ~ '[a-z](Failed|Error|Declined|Rejected)$'
  );
