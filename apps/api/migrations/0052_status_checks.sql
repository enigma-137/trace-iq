-- 0052_status_checks.sql
-- Minute-resolution health history behind the public status page.
--
-- The API's status monitor checks each component every 30 seconds and keeps the
-- worst result per minute, so a row exists for every minute the API was running.
-- Minutes with no row are treated as API downtime when uptime is calculated.
-- Rows older than 90 days are pruned by the monitor itself. The table holds no
-- error messages, hosts or tenant data.

CREATE TABLE IF NOT EXISTS status_checks (
  component TEXT NOT NULL CHECK (component IN ('api', 'database', 'ingestion')),
  minute TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('operational', 'degraded', 'down')),
  latency_ms INTEGER,
  PRIMARY KEY (component, minute)
);

CREATE INDEX IF NOT EXISTS status_checks_minute_idx ON status_checks (minute);
