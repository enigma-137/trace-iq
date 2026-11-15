-- Platform growth numbers for the operator console (/admin): visitors to the public
-- site, sign-ins and active dashboard users. None of this belongs to an organization
-- or project, so it never shows in a customer's dashboard. Sign-ups come straight
-- from Supabase Auth and need no table here.

-- One row per page load on the public site (landing, pricing, blog, docs...).
-- No cookies and no raw IPs: visitor_hash is sha256(daily salt + IP + user agent),
-- and the salt is replaced every UTC day, so a visitor is unique within a day but
-- cannot be followed across days.
CREATE TABLE IF NOT EXISTS site_pageviews (
  id BIGSERIAL PRIMARY KEY,
  path TEXT NOT NULL,
  referrer_host TEXT,
  utm_source TEXT,
  device TEXT,
  visitor_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_pageviews_created_at_idx ON site_pageviews (created_at);

-- The random salt for each UTC day. Old salts are deleted, which is what makes the
-- hashes from earlier days impossible to link to a visitor.
CREATE TABLE IF NOT EXISTS site_visitor_salts (
  day DATE PRIMARY KEY,
  salt TEXT NOT NULL
);

-- One row per Supabase session the API has seen, i.e. per sign-in. signed_in_at is
-- the session's primary authentication time from the token, not when the API saw it.
CREATE TABLE IF NOT EXISTS dashboard_sign_ins (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT,
  method TEXT,
  signed_in_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS dashboard_sign_ins_signed_in_at_idx ON dashboard_sign_ins (signed_in_at);
CREATE INDEX IF NOT EXISTS dashboard_sign_ins_user_idx ON dashboard_sign_ins (user_id);

-- One row per user per UTC day they used the dashboard or API: daily, weekly and
-- monthly active users.
CREATE TABLE IF NOT EXISTS dashboard_user_activity (
  user_id TEXT NOT NULL,
  day DATE NOT NULL,
  PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS dashboard_user_activity_day_idx ON dashboard_user_activity (day);

-- When each user was last seen, for the "recently active" list.
CREATE TABLE IF NOT EXISTS dashboard_user_last_seen (
  user_id TEXT PRIMARY KEY,
  email TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL
);
