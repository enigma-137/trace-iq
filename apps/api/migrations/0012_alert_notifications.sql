-- Alert delivery: channels, recipient groups, and per-delivery tracking.
-- v1 scope: email only (via Resend). Slack/Discord remain a future webhook-shaped channel.

-- Saved recipient groups so an alert can target a team without re-entering addresses.
CREATE TABLE IF NOT EXISTS notification_groups (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  member_emails TEXT[] NOT NULL DEFAULT '{}',
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_groups_project_idx ON notification_groups(project_id, name);

-- An alert can email explicit recipients and/or the members of saved groups.
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS email_recipients TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS notification_group_ids TEXT[] NOT NULL DEFAULT '{}';

-- Per-channel delivery history for every firing, so we can show who was notified (and
-- whether it worked) instead of just "the alert fired".
CREATE TABLE IF NOT EXISTS alert_deliveries (
  id TEXT PRIMARY KEY,
  alert_id TEXT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  alert_event_id TEXT REFERENCES alert_events(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  recipient TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alert_deliveries_alert_idx ON alert_deliveries(alert_id, sent_at DESC);