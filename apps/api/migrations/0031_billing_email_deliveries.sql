SET lock_timeout = '5s';
SET statement_timeout = '5min';

-- Durable, retryable lifecycle email outbox. A provider subscription can
-- receive each billing email kind at most once, even when webhooks are retried.
CREATE TABLE IF NOT EXISTS billing_email_deliveries (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_subscription_id TEXT NOT NULL,
  email_kind TEXT NOT NULL,
  recipient TEXT NOT NULL,
  billing_period TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  attempted_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT billing_email_delivery_subscription_fk
    FOREIGN KEY (provider, provider_subscription_id)
    REFERENCES subscriptions(provider, provider_subscription_id)
    ON DELETE CASCADE,
  CONSTRAINT billing_email_delivery_kind_check
    CHECK (email_kind IN ('pro_welcome')),
  CONSTRAINT billing_email_delivery_period_check
    CHECK (billing_period IS NULL OR billing_period IN ('monthly', 'yearly')),
  CONSTRAINT billing_email_delivery_status_check
    CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  UNIQUE (provider, provider_subscription_id, email_kind)
);

CREATE INDEX IF NOT EXISTS billing_email_deliveries_retry_idx
  ON billing_email_deliveries(next_attempt_at, created_at)
  WHERE status IN ('pending', 'failed', 'sending');

-- Data-preserving rollback: deploy code that no longer writes this outbox,
-- then leave the table in place. Destructive cleanup, if separately approved:
--   DROP TABLE billing_email_deliveries;
