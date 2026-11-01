-- Daily brief delivery to chat apps. A channel is one chat (a Telegram DM or group)
-- that receives a short plain-English summary of a project once a day.

CREATE TABLE IF NOT EXISTS brief_channels (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('telegram')),
  chat_id TEXT NOT NULL,
  chat_name TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  -- Hour of day (0-23) in `timezone` when the brief goes out.
  send_hour SMALLINT NOT NULL DEFAULT 8 CHECK (send_hour BETWEEN 0 AND 23),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  -- Local calendar date of the last brief, so a day is never sent twice.
  last_sent_on DATE,
  last_error TEXT,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, kind, chat_id)
);

CREATE INDEX IF NOT EXISTS brief_channels_due_idx ON brief_channels(kind) WHERE enabled;
CREATE INDEX IF NOT EXISTS brief_channels_chat_idx ON brief_channels(kind, chat_id);

-- One-time codes that tie a chat to a project: the dashboard hands out a link like
-- t.me/<bot>?start=<code>, and the bot redeems it. Only a hash of the code is stored.
CREATE TABLE IF NOT EXISTS brief_link_codes (
  code_hash TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('telegram')),
  -- The browser's timezone when the link was made, used for the new channel.
  timezone TEXT NOT NULL DEFAULT 'UTC',
  expires_at TIMESTAMPTZ NOT NULL
);
