CREATE TABLE IF NOT EXISTS billing_customers (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_customer_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, provider),
  UNIQUE (provider, provider_customer_id)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_subscription_id TEXT NOT NULL,
  provider_product_id TEXT,
  plan_key TEXT NOT NULL,
  status TEXT NOT NULL,
  currency TEXT,
  amount NUMERIC(20, 6),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  canceled_at TIMESTAMPTZ,
  grace_period_ends_at TIMESTAMPTZ,
  last_provider_sync_at TIMESTAMPTZ,
  provider_event_created_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_subscription_id),
  CONSTRAINT subscriptions_plan_key_check CHECK (plan_key IN ('free', 'pro')),
  CONSTRAINT subscriptions_status_check CHECK (status IN ('trialing', 'active', 'past_due', 'unpaid', 'canceled', 'paused'))
);

CREATE INDEX IF NOT EXISTS subscriptions_organization_status_idx
  ON subscriptions(organization_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS billing_webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  UNIQUE (provider, provider_event_id),
  CONSTRAINT billing_webhook_processing_status_check CHECK (processing_status IN ('pending', 'processing', 'processed', 'failed'))
);

CREATE INDEX IF NOT EXISTS billing_webhook_events_processing_idx
  ON billing_webhook_events(processing_status, received_at);

CREATE TABLE IF NOT EXISTS organization_usage_monthly (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  period_start DATE NOT NULL,
  quantity BIGINT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, metric, period_start)
);

CREATE TABLE IF NOT EXISTS entitlement_overrides (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entitlement_key TEXT NOT NULL,
  value JSONB NOT NULL,
  reason TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entitlement_overrides_active_idx
  ON entitlement_overrides(organization_id, entitlement_key, expires_at DESC);
