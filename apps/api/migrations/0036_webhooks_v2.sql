-- Webhooks v2: Endpoint status, failure tracking, secret rotation, delivery attempt logs, and retry state.

-- 1. Extend webhooks table
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS failure_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS previous_secret TEXT;
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS secret_rotated_at TIMESTAMPTZ;
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Backfill status from legacy enabled column
UPDATE webhooks
SET status = CASE
  WHEN enabled = false THEN 'disabled'
  WHEN last_status = 'failed' AND last_delivered_at IS NOT NULL THEN 'failing'
  ELSE 'active'
END
WHERE status = 'active' AND enabled = false;

CREATE INDEX IF NOT EXISTS webhooks_project_status_idx
  ON webhooks(project_id, status)
  WHERE archived_at IS NULL;

-- 2. Extend webhook_deliveries table
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS delivery_id TEXT;
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS event_id TEXT;
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS payload JSONB;
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS request_headers JSONB;
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS response_headers JSONB;
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS response_body TEXT;
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS attempt INTEGER NOT NULL DEFAULT 1;
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 5;
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'success';
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS is_manual_retry BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Backfill delivery_id and status from existing rows
UPDATE webhook_deliveries
SET delivery_id = COALESCE(delivery_id, id),
    status = CASE WHEN ok = true THEN 'success' ELSE 'failed' END
WHERE delivery_id IS NULL;

CREATE INDEX IF NOT EXISTS webhook_deliveries_project_created_idx
  ON webhook_deliveries(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS webhook_deliveries_delivery_id_idx
  ON webhook_deliveries(delivery_id);

CREATE INDEX IF NOT EXISTS webhook_deliveries_pending_retry_idx
  ON webhook_deliveries(status, next_retry_at)
  WHERE status = 'retrying';

-- 3. Webhook Delivery Attempts Table (historical record of every attempt)
CREATE TABLE IF NOT EXISTS webhook_delivery_attempts (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL REFERENCES webhook_deliveries(id) ON DELETE CASCADE,
  webhook_id TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  status_code INTEGER,
  duration_ms INTEGER,
  ok BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  response_headers JSONB,
  response_body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_delivery_attempts_delivery_idx
  ON webhook_delivery_attempts(delivery_id, attempt_number ASC);

CREATE INDEX IF NOT EXISTS webhook_delivery_attempts_webhook_idx
  ON webhook_delivery_attempts(webhook_id, created_at DESC);
