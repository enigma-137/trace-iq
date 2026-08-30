import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { BillingService, type BachsEvent } from '../src/modules/billing/billing.service';

const cloudConfig = {
  deploymentMode: 'cloud' as const,
  bachs: {
    environment: 'sandbox' as const,
    apiBaseUrl: 'https://sandbox-api.bachs.io' as const,
    apiKey: 'sk_sandbox_test',
    webhookSecret: 'whsec_test',
    products: { proMonthly: 'prod_monthly', proYearly: 'prod_yearly' }
  }
};

function queryResult(rowCount = 1, rows: Record<string, unknown>[] = []) {
  return { rowCount, rows, command: '', oid: 0, fields: [] };
}

function makeService(inserted = true) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('INSERT INTO billing_webhook_events')) return queryResult(inserted ? 1 : 0);
    return queryResult();
  });
  const database = {
    query,
    transaction: vi.fn(async (callback: (client: { query: typeof query }) => unknown) => callback({ query }))
  };
  const bachs = {
    createCheckout: vi.fn().mockResolvedValue({ checkout_id: 'chk_1', checkout_url: 'https://checkout.bachs.io/c/test' }),
    createPortalSession: vi.fn(),
    getSubscription: vi.fn()
  };
  return { service: new BillingService(database as never, bachs as never, cloudConfig), database, bachs, query };
}

const subscriptionEvent: BachsEvent = {
  id: 'evt_123',
  type: 'customer.subscription.created',
  created_at: '2026-08-30T08:00:00Z',
  data: {
    subscription_id: 'sub_bachs_1',
    customer: { customer_id: 'cust_1', email: 'owner@example.com' },
    product_id: 'prod_monthly',
    status: 'active',
    currency: 'USD',
    amount: '19.00',
    current_period_start: '2026-08-30T08:00:00Z',
    current_period_end: '2026-09-30T08:00:00Z',
    cancel_at_period_end: false,
    metadata: { organization_id: 'org_1', plan_key: 'pro' }
  }
};

describe('Bachs billing integration', () => {
  it('creates checkout from allowlisted server-side product configuration', async () => {
    const { service, bachs } = makeService();
    await service.createCheckout({ organizationId: 'org_1', email: 'owner@example.com', billingPeriod: 'yearly' });

    expect(bachs.createCheckout).toHaveBeenCalledWith(expect.objectContaining({
      product_cart: [{ product_id: 'prod_yearly', quantity: 1 }],
      billing_currency: 'USD',
      customer: { email: 'owner@example.com', name: 'owner' },
      metadata: { organization_id: 'org_1', plan_key: 'pro', billing_period: 'yearly' }
    }));
  });

  it('verifies the timestamped raw-body HMAC and rejects tampering', () => {
    const { service } = makeService();
    const raw = Buffer.from(JSON.stringify(subscriptionEvent));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', cloudConfig.bachs.webhookSecret)
      .update(`${timestamp}.`).update(raw).digest('hex');

    expect(() => service.verifySignature(raw, timestamp, signature)).not.toThrow();
    expect(() => service.verifySignature(Buffer.from('tampered'), timestamp, signature)).toThrow(ForbiddenException);
  });

  it('stores a subscription event idempotently and maps it to the organization', async () => {
    const { service, query } = makeService();
    expect(await service.processWebhook(subscriptionEvent)).toEqual({ processed: true, duplicate: false });

    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO billing_customers'))).toBe(true);
    const subscriptionCall = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO subscriptions'));
    expect(subscriptionCall?.[1]).toEqual(expect.arrayContaining(['org_1', 'sub_bachs_1', 'prod_monthly', 'active']));
  });

  it('acknowledges duplicate provider events without applying them twice', async () => {
    const { service, query } = makeService(false);
    expect(await service.processWebhook(subscriptionEvent)).toEqual({ processed: false, duplicate: true });
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO subscriptions'))).toBe(false);
  });
});
