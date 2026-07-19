-- Alerts / anomaly detection: watch a metric on a rolling window and fire when a
-- threshold is crossed or a period-over-period change is large enough.
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  event_name TEXT NOT NULL,
  measure TEXT NOT NULL DEFAULT 'count',
  property TEXT,
  filters JSONB NOT NULL DEFAULT '[]'::jsonb,
  window_hours INTEGER NOT NULL DEFAULT 24,
  condition TEXT NOT NULL,
  threshold DOUBLE PRECISION NOT NULL DEFAULT 0,
  webhook_url TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_evaluated_at TIMESTAMPTZ,
  last_value DOUBLE PRECISION,
  last_status TEXT NOT NULL DEFAULT 'pending',
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alerts_project_created_idx ON alerts(project_id, created_at DESC);
-- Drives the background evaluator's "which alerts are due" query.
CREATE INDEX IF NOT EXISTS alerts_due_idx ON alerts(enabled, last_evaluated_at);

-- One row per time an alert transitions into the triggered state (incident history).
CREATE TABLE IF NOT EXISTS alert_events (
  id TEXT PRIMARY KEY,
  alert_id TEXT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  value DOUBLE PRECISION,
  previous_value DOUBLE PRECISION,
  message TEXT NOT NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alert_events_alert_idx ON alert_events(alert_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS alert_events_project_idx ON alert_events(project_id, triggered_at DESC);
