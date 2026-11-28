-- People who asked to be emailed when a status page posts an incident, a maintenance
-- window or an update. Subscriptions are double opt-in: a row starts unconfirmed and
-- only confirmed rows are emailed. Confirm and unsubscribe links are signed with the
-- deployment secret, so no token is stored. Unsubscribing deletes the row.
-- Safe to re-run.
CREATE TABLE IF NOT EXISTS status_page_subscribers (
  id TEXT PRIMARY KEY,
  status_page_id TEXT NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  confirmed_at TIMESTAMPTZ,
  -- When the last confirmation email went out, so repeated sign-ups can't flood an inbox.
  confirmation_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (status_page_id, email)
);

CREATE INDEX IF NOT EXISTS status_page_subscribers_confirmed_idx
  ON status_page_subscribers (status_page_id) WHERE confirmed_at IS NOT NULL;
