SET lock_timeout = '5s';
SET statement_timeout = '5min';

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS billing_period TEXT;

UPDATE subscriptions
SET billing_period = metadata->>'billing_period'
WHERE billing_period IS NULL
  AND metadata->>'billing_period' IN ('monthly', 'yearly');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_billing_period_check'
  ) THEN
    ALTER TABLE subscriptions
      ADD CONSTRAINT subscriptions_billing_period_check
      CHECK (billing_period IS NULL OR billing_period IN ('monthly', 'yearly')) NOT VALID;
  END IF;
END $$;

ALTER TABLE subscriptions
  VALIDATE CONSTRAINT subscriptions_billing_period_check;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM subscriptions
    WHERE provider = 'bachs'
      AND status IN ('trialing', 'active', 'past_due', 'paused')
    GROUP BY organization_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one active Bachs subscription per organization; reconcile duplicate nonterminal subscriptions first.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_nonterminal_bachs_per_org_idx
  ON subscriptions(organization_id)
  WHERE provider = 'bachs' AND status IN ('trialing', 'active', 'past_due', 'paused');

-- Data-preserving rollback:
--   DROP INDEX subscriptions_one_nonterminal_bachs_per_org_idx;
--   ALTER TABLE subscriptions DROP CONSTRAINT subscriptions_billing_period_check;
--   ALTER TABLE subscriptions DROP COLUMN billing_period;
-- Only remove the column after every deployed API version has stopped reading it.
