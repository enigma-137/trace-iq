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
    await service.createCheckout({ organizationId: 'org_1', projectId: 'proj_1', email: 'owner@example.com', billingPeriod: 'yearly' });

    expect(bachs.createCheckout).toHaveBeenCalledWith(expect.objectContaining({
      product_cart: [{ product_id: 'prod_yearly', quantity: 1 }],
      billing_currency: 'USD',
      customer: { email: 'owner@example.com', name: 'owner' },
      success_url: expect.stringContaining('/dashboard/settings/billing?billing=success&projectId=proj_1'),
      metadata: { organization_id: 'org_1', plan_key: 'pro', billing_period: 'yearly' }
    }));
  });

  it('uses the public API relay when the billing dashboard returns to localhost', async () => {
    const previousDashboard = process.env.BILLING_DASHBOARD_RETURN_URL;
    const previousPublicApi = process.env.BILLING_PUBLIC_API_URL;
    process.env.BILLING_DASHBOARD_RETURN_URL = 'http://localhost:3000';
    process.env.BILLING_PUBLIC_API_URL = 'https://billing-test.traceiq.run';
    try {
      const { service, bachs } = makeService();
      await service.createCheckout({ organizationId: 'org_1', projectId: 'proj_1', email: 'owner@example.com', billingPeriod: 'monthly' });
      expect(bachs.createCheckout).toHaveBeenCalledWith(expect.objectContaining({
        success_url: 'https://billing-test.traceiq.run/v1/billing/return?status=success&projectId=proj_1',
        cancel_url: 'https://billing-test.traceiq.run/v1/billing/return?status=cancelled&projectId=proj_1'
      }));
      expect(service.checkoutReturnRedirect('success', 'proj_1')).toBe(
        'http://localhost:3000/dashboard/settings/billing?billing=success&projectId=proj_1'
      );
    } finally {
      if (previousDashboard === undefined) delete process.env.BILLING_DASHBOARD_RETURN_URL;
      else process.env.BILLING_DASHBOARD_RETURN_URL = previousDashboard;
      if (previousPublicApi === undefined) delete process.env.BILLING_PUBLIC_API_URL;
      else process.env.BILLING_PUBLIC_API_URL = previousPublicApi;
    }
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

  it('maps checkout.completed metadata to the organization and provisions its subscription', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('INSERT INTO billing_webhook_events')) return queryResult(1);
      if (sql.includes('SELECT organization_id FROM billing_checkout_sessions')) return queryResult(1, [{ organization_id: 'org_1' }]);
      if (sql.includes('UPDATE billing_checkout_sessions')) return queryResult(1, [{ organization_id: 'org_1' }]);
      return queryResult();
    });
    const database = {
      query,
      transaction: vi.fn(async (callback: (client: { query: typeof query }) => unknown) => callback({ query }))
    };
    const bachs = {
      createCheckout: vi.fn(), createPortalSession: vi.fn(),
      getSubscription: vi.fn().mockResolvedValue({ ...subscriptionEvent.data, metadata: {} })
    };
    const service = new BillingService(database as never, bachs as never, cloudConfig);
    const event: BachsEvent = {
      id: 'evt_checkout_1', type: 'checkout.completed', created_at: '2026-08-30T08:00:00Z',
      data: {
        checkout_id: 'chk_1', status: 'completed', payment_status: 'paid',
        customer: { customer_id: 'cust_1', email: 'owner@example.com' },
        subscription: { subscription_id: 'sub_bachs_1' },
        metadata: { organization_id: 'org_1', plan_key: 'pro' }
      }
    };

    expect(await service.processWebhook(event)).toEqual({ processed: true, duplicate: false });
    expect(bachs.getSubscription).toHaveBeenCalledWith('sub_bachs_1');
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO subscriptions'))).toBe(true);
  });
});
