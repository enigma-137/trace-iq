-- Platform admins: the TraceIQ operator console gate.
--
-- Only emails listed here can access /admin and the /v1/admin/* API. Emails are
-- normalized to lowercase. The owner is seeded here; additional admins can be
-- inserted by any existing admin at runtime. Supabase auth is the credential
-- source (login/password/OAuth), this table only decides *who* is an operator.

CREATE TABLE IF NOT EXISTS platform_admins (
  email TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO platform_admins (email)
VALUES ('emmanuelonoja291@gmail.com')
ON CONFLICT (email) DO NOTHING;
