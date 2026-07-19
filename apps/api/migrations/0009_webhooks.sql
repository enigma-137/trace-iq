-- Outbound webhooks: forward matching events to an external URL as they arrive,
-- so other systems (ops tooling, data warehouse loaders, Slack relays) can react
-- to product events in real time.
CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  -- Optional HMAC-SHA256 secret; when set, each delivery carries an
  -- x-traceiq-signature: sha256=<hex> header the receiver can verify.
  secret TEXT,
  -- [] = deliver every event; otherwise only these event names.
  event_names JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_status TEXT,
  last_delivered_at TIMESTAMPTZ,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhooks_project_created_idx ON webhooks(project_id, created_at DESC);
-- Delivery hot path: find the enabled webhooks for a project quickly.
CREATE INDEX IF NOT EXISTS webhooks_project_enabled_idx ON webhooks(project_id, enabled);

-- Recent delivery attempts, for debugging in the dashboard. Pruned to the last
-- few per webhook so the table stays small.
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_name TEXT,
  status_code INTEGER,
  ok BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_deliveries_webhook_idx ON webhook_deliveries(webhook_id, created_at DESC);
