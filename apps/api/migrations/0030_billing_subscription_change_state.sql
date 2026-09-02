SET lock_timeout = '5s';
SET statement_timeout = '5min';

-- Additive state for asynchronous Bachs subscription product changes. Migration
-- 0029 is already deployed and must remain unchanged.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS subscription_change_status TEXT,
  ADD COLUMN IF NOT EXISTS subscription_change_target_product_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_change_target_billing_period TEXT,
  ADD COLUMN IF NOT EXISTS subscription_change_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_change_failure_code TEXT,
  ADD COLUMN IF NOT EXISTS subscription_change_failure_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_change_status_check'
      AND conrelid = 'subscriptions'::regclass
  ) THEN
    ALTER TABLE subscriptions
      ADD CONSTRAINT subscriptions_change_status_check
      CHECK (subscription_change_status IS NULL OR subscription_change_status IN ('pending', 'failed')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_change_target_period_check'
      AND conrelid = 'subscriptions'::regclass
  ) THEN
    ALTER TABLE subscriptions
      ADD CONSTRAINT subscriptions_change_target_period_check
      CHECK (
        subscription_change_target_billing_period IS NULL
        OR subscription_change_target_billing_period IN ('monthly', 'yearly')
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_change_state_consistency_check'
      AND conrelid = 'subscriptions'::regclass
  ) THEN
    ALTER TABLE subscriptions
      ADD CONSTRAINT subscriptions_change_state_consistency_check
      CHECK (
        (
          subscription_change_status IS NULL
          AND subscription_change_target_product_id IS NULL
          AND subscription_change_target_billing_period IS NULL
          AND subscription_change_requested_at IS NULL
          AND subscription_change_failure_code IS NULL
          AND subscription_change_failure_at IS NULL
        )
        OR (
          subscription_change_status = 'pending'
          AND subscription_change_target_product_id IS NOT NULL
          AND subscription_change_target_billing_period IS NOT NULL
          AND subscription_change_requested_at IS NOT NULL
          AND subscription_change_failure_code IS NULL
          AND subscription_change_failure_at IS NULL
        )
        OR (
          subscription_change_status = 'failed'
          AND subscription_change_target_product_id IS NOT NULL
          AND subscription_change_target_billing_period IS NOT NULL
          AND subscription_change_requested_at IS NOT NULL
          AND subscription_change_failure_code IS NOT NULL
          AND subscription_change_failure_at IS NOT NULL
        )
      ) NOT VALID;
  END IF;
END $$;

ALTER TABLE subscriptions
  VALIDATE CONSTRAINT subscriptions_change_status_check,
  VALIDATE CONSTRAINT subscriptions_change_target_period_check,
  VALIDATE CONSTRAINT subscriptions_change_state_consistency_check;

CREATE INDEX IF NOT EXISTS subscriptions_pending_change_idx
  ON subscriptions(subscription_change_requested_at)
  WHERE subscription_change_status = 'pending';

-- Data-preserving rollback: deploy code that ignores these columns first, then
-- leave the columns in place. If destructive schema cleanup is later approved:
--   DROP INDEX subscriptions_pending_change_idx;
--   ALTER TABLE subscriptions DROP CONSTRAINT subscriptions_change_state_consistency_check;
--   ALTER TABLE subscriptions DROP CONSTRAINT subscriptions_change_target_period_check;
--   ALTER TABLE subscriptions DROP CONSTRAINT subscriptions_change_status_check;
--   ALTER TABLE subscriptions DROP COLUMN subscription_change_failure_at;
--   ALTER TABLE subscriptions DROP COLUMN subscription_change_failure_code;
--   ALTER TABLE subscriptions DROP COLUMN subscription_change_requested_at;
--   ALTER TABLE subscriptions DROP COLUMN subscription_change_target_billing_period;
--   ALTER TABLE subscriptions DROP COLUMN subscription_change_target_product_id;
--   ALTER TABLE subscriptions DROP COLUMN subscription_change_status;
