-- Product-update emails: the monthly changelog digest sent from the operator console
-- (/admin). Every account gets it unless they opt out, so this records who opted out
-- and which months were sent. Safe to re-run.

-- People who don't want a kind of email. Kept after an account is deleted, so a
-- returning address isn't emailed again without asking. `list` names the kind of email;
-- 'product_updates' is the only one today.
CREATE TABLE IF NOT EXISTS email_unsubscribes (
  email TEXT NOT NULL,
  list TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (email, list),
  CONSTRAINT email_unsubscribes_email_lowercase CHECK (email = lower(email))
);

-- One row per digest month. Inserting the row claims the month, so it can only be sent
-- once even if the button is pressed twice.
CREATE TABLE IF NOT EXISTS changelog_digest_sends (
  period TEXT PRIMARY KEY CHECK (period ~ '^\d{4}-\d{2}$'),
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed')),
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_by TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
