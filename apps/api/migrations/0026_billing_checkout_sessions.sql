CREATE TABLE IF NOT EXISTS billing_checkout_sessions (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_checkout_id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider_product_id TEXT NOT NULL,
  billing_period TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_checkout_id),
  CONSTRAINT billing_checkout_period_check CHECK (billing_period IN ('monthly', 'yearly'))
);

CREATE INDEX IF NOT EXISTS billing_checkout_sessions_organization_idx
  ON billing_checkout_sessions(organization_id, created_at DESC);
