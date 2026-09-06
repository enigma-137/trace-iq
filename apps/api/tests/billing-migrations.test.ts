import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function migration(name: string) {
  return readFileSync(resolve(__dirname, '..', 'migrations', name), 'utf8').replace(/\r\n/g, '\n');
}

describe('billing migration boundaries', () => {
  it('keeps applied migration 0029 limited to billing period and subscription uniqueness', () => {
    const sql = migration('0029_billing_subscription_period.sql');

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS billing_period TEXT;');
    expect(sql).toContain('subscriptions_billing_period_check');
    expect(sql).toContain('subscriptions_one_nonterminal_bachs_per_org_idx');
    expect(sql).not.toContain('subscription_change_');
  });

  it('adds asynchronous subscription-change state only in migration 0030', () => {
    const sql = migration('0030_billing_subscription_change_state.sql');
    const columns = [
      'subscription_change_status',
      'subscription_change_target_product_id',
      'subscription_change_target_billing_period',
      'subscription_change_requested_at',
      'subscription_change_failure_code',
      'subscription_change_failure_at'
    ];

    for (const column of columns) expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${column}`);
    expect(sql).toContain('subscriptions_change_state_consistency_check');
    expect(sql).toContain('subscriptions_pending_change_idx');
    expect(sql).not.toContain('ADD COLUMN IF NOT EXISTS billing_period');
  });

  it('adds an idempotent, retryable billing email outbox in migration 0031', () => {
    const sql = migration('0031_billing_email_deliveries.sql');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS billing_email_deliveries');
    expect(sql).toContain("CHECK (email_kind IN ('pro_welcome'))");
    expect(sql).toContain('UNIQUE (provider, provider_subscription_id, email_kind)');
    expect(sql).toContain('billing_email_deliveries_retry_idx');
    expect(sql).not.toContain('ALTER TABLE subscriptions');
  });
});
