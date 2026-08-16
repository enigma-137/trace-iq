-- Stitches previously-anonymous events onto the user of their session. This is a
-- one-time repair for events ingested before the same backfill ran at ingest time:
-- when an identify arrived without its original anonymousId, the pre-identify
-- events stayed anonymous and split the person into two funnel actors.
-- Safe to run repeatedly: it only touches rows that still await a user.

CREATE INDEX IF NOT EXISTS events_session_anonymous_unlinked_idx
  ON events(session_id, anonymous_id)
  WHERE user_id IS NULL AND anonymous_id IS NOT NULL;

UPDATE events e
SET user_id = s.user_id
FROM sessions s
WHERE e.session_id = s.id
  AND e.project_id = s.project_id
  AND e.user_id IS NULL
  AND e.anonymous_id IS NOT NULL
  AND s.user_id IS NOT NULL
  AND s.anonymous_id = e.anonymous_id;