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
    products: {
      proMonthly: 'prod_monthly', proYearly: 'prod_yearly',
      legacyProMonthly: ['prod_legacy_monthly'], legacyProYearly: ['prod_legacy_yearly']
    }
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
    getSubscription: vi.fn(),
    updateSubscription: vi.fn()
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
    amount: '9.00',
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
      success_url: expect.stringContaining('/billing/success?projectId=proj_1'),
      metadata: { organization_id: 'org_1', plan_key: 'pro', billing_period: 'yearly' }
    }));
  });

  it('rejects a second checkout while an organization has a nonterminal subscription', async () => {
    const query = vi.fn(async (sql: string) => sql.includes('SELECT 1 FROM subscriptions')
      ? queryResult(1, [{ exists: 1 }]) : queryResult());
    const database = {
      query,
      transaction: vi.fn(async (callback: (client: { query: typeof query }) => unknown) => callback({ query }))
    };
    const bachs = { createCheckout: vi.fn(), createPortalSession: vi.fn(), getSubscription: vi.fn(), updateSubscription: vi.fn() };
    const service = new BillingService(database as never, bachs as never, cloudConfig);

    await expect(service.createCheckout({
      organizationId: 'org_1', projectId: 'proj_1', email: 'owner@example.com', billingPeriod: 'yearly'
    })).rejects.toThrow(/already has a Bachs subscription/);
    expect(bachs.createCheckout).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtext($1))', ['org_1:billingSubscriptionChange']);
  });

  it('schedules monthly to yearly for renewal and finalizes only after invoice.paid then subscription.updated', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT id,provider_subscription_id')) return queryResult(1, [{
        id: 'sub_local', provider_subscription_id: 'sub_bachs_1', provider_product_id: 'prod_monthly',
        billing_period: 'monthly', status: 'active', current_period_end: '2026-09-30T08:00:00Z'
      }]);
      return queryResult();
    });
    const database = {
      query,
      transaction: vi.fn(async (callback: (client: { query: typeof query }) => unknown) => callback({ query }))
    };
    const bachs = {
      createCheckout: vi.fn(), createPortalSession: vi.fn(), getSubscription: vi.fn(),
      updateSubscription: vi.fn().mockResolvedValue({
        subscription_id: 'sub_bachs_1', status: 'active', product_id: 'prod_monthly'
      })
    };
    const service = new BillingService(database as never, bachs as never, cloudConfig);

    await expect(service.upgradeToYearly('org_1')).resolves.toMatchObject({
      changed: true, billingPeriod: 'monthly', changeStatus: 'scheduled',
      effectiveAt: '2026-09-30T08:00:00Z', subscriptionStatus: 'active'
    });
    expect(bachs.updateSubscription).toHaveBeenCalledWith(
      'sub_bachs_1',
      { product_id: 'prod_yearly' },
      'traceiq:sub_bachs_1:pro-yearly'
    );
    expect(bachs.createCheckout).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO subscriptions'))).toBe(false);
    const pendingUpdate = query.mock.calls.find(([sql]) => String(sql).includes("subscription_change_status = 'pending'"));
    expect(pendingUpdate?.[1]).toEqual(['sub_local', 'prod_yearly', expect.any(String)]);

    await service.processWebhook({
      id: 'evt_renewal_invoice_paid',
      type: 'invoice.paid',
      created_at: '2026-09-30T08:00:00Z',
      data: {
        subscription_id: 'sub_bachs_1', status: 'Paid',
        billing_reason: 'Subscription Cycle'
      }
    });
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO subscriptions'))).toBe(false);

    await service.processWebhook({
      ...subscriptionEvent,
      id: 'evt_yearly_renewal_confirmed',
      type: 'customer.subscription.updated',
      created_at: '2026-09-30T08:00:01Z',
      data: {
        ...subscriptionEvent.data,
        product_id: 'prod_yearly', amount: '90.00',
        current_period_start: '2026-09-30T08:00:00Z',
        current_period_end: '2027-09-30T08:00:00Z'
      }
    });
    const confirmedUpsert = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO subscriptions'));
    expect(confirmedUpsert?.[1]).toEqual(expect.arrayContaining(['sub_bachs_1', 'prod_yearly', 'yearly', '90.00', true]));
    expect(String(confirmedUpsert?.[0])).toContain('EXCLUDED.provider_product_id = subscriptions.subscription_change_target_product_id');
  });

  it('rejects a duplicate yearly-upgrade click while the first request is pending', async () => {
    const query = vi.fn(async (sql: string) => sql.includes('SELECT id,provider_subscription_id')
      ? queryResult(1, [{
        id: 'sub_local', provider_subscription_id: 'sub_bachs_1', provider_product_id: 'prod_monthly',
        billing_period: 'monthly', status: 'active', subscription_change_status: 'pending'
      }]) : queryResult());
    const database = {
      query,
      transaction: vi.fn(async (callback: (client: { query: typeof query }) => unknown) => callback({ query }))
    };
    const bachs = { createCheckout: vi.fn(), createPortalSession: vi.fn(), getSubscription: vi.fn(), updateSubscription: vi.fn() };
    const service = new BillingService(database as never, bachs as never, cloudConfig);

    await expect(service.upgradeToYearly('org_1')).rejects.toThrow(/already scheduled/);
    expect(bachs.updateSubscription).not.toHaveBeenCalled();
  });

  it('treats an already-yearly upgrade as idempotent without calling Bachs', async () => {
    const query = vi.fn(async (sql: string) => sql.includes('SELECT id,provider_subscription_id')
      ? queryResult(1, [{
        id: 'sub_local', provider_subscription_id: 'sub_bachs_1', provider_product_id: 'prod_yearly',
        billing_period: 'yearly', status: 'active'
      }]) : queryResult());
    const database = {
      query,
      transaction: vi.fn(async (callback: (client: { query: typeof query }) => unknown) => callback({ query }))
    };
    const bachs = { createCheckout: vi.fn(), createPortalSession: vi.fn(), getSubscription: vi.fn(), updateSubscription: vi.fn() };
    const service = new BillingService(database as never, bachs as never, cloudConfig);

    await expect(service.upgradeToYearly('org_1')).resolves.toEqual({
      changed: false, billingPeriod: 'yearly', changeStatus: null,
      effectiveAt: null, subscriptionStatus: 'active'
    });
    expect(bachs.updateSubscription).not.toHaveBeenCalled();
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
        'http://localhost:3000/billing/success?projectId=proj_1'
      );
    } finally {
      if (previousDashboard === undefined) delete process.env.BILLING_DASHBOARD_RETURN_URL;
      else process.env.BILLING_DASHBOARD_RETURN_URL = previousDashboard;
      if (previousPublicApi === undefined) delete process.env.BILLING_PUBLIC_API_URL;
      else process.env.BILLING_PUBLIC_API_URL = previousPublicApi;
    }
  });

  it('returns successful production checkouts to the configured dashboard success page', async () => {
    const previousDashboard = process.env.BILLING_DASHBOARD_RETURN_URL;
    process.env.BILLING_DASHBOARD_RETURN_URL = 'https://cloud.example.com';
    try {
      const { service, bachs } = makeService();
      await service.createCheckout({ organizationId: 'org_1', projectId: 'proj_1', email: 'owner@example.com', billingPeriod: 'monthly' });
      expect(bachs.createCheckout).toHaveBeenCalledWith(expect.objectContaining({
        success_url: 'https://cloud.example.com/billing/success?projectId=proj_1'
      }));
      expect(service.checkoutReturnRedirect('success', 'proj_1')).toBe(
        'https://cloud.example.com/billing/success?projectId=proj_1'
      );
    } finally {
      if (previousDashboard === undefined) delete process.env.BILLING_DASHBOARD_RETURN_URL;
      else process.env.BILLING_DASHBOARD_RETURN_URL = previousDashboard;
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
    expect(subscriptionCall?.[1]).toEqual(expect.arrayContaining(['monthly']));
    expect(String(subscriptionCall?.[0])).toContain('COALESCE(subscriptions.grace_period_ends_at');
    expect(String(subscriptionCall?.[0])).toContain('subscriptions.provider_event_created_at <= EXCLUDED.provider_event_created_at');
  });

  it('persists yearly interval from the provider product rather than plan_key', async () => {
    const { service, query } = makeService();
    await service.processWebhook({
      ...subscriptionEvent,
      id: 'evt_yearly',
      data: { ...subscriptionEvent.data, product_id: 'prod_yearly', amount: '90.00' }
    });
    const subscriptionCall = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO subscriptions'));
    expect(subscriptionCall?.[1]).toEqual(expect.arrayContaining(['prod_yearly', 'yearly', '90.00']));
  });

  it('keeps renewing existing subscribers on legacy Pro products with their original interval and amount', async () => {
    const { service, query } = makeService();
    await service.processWebhook({
      ...subscriptionEvent,
      id: 'evt_legacy_renewal',
      type: 'customer.subscription.updated',
      data: { ...subscriptionEvent.data, product_id: 'prod_legacy_monthly', amount: '19.00' }
    });
    const subscriptionCall = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO subscriptions'));
    expect(subscriptionCall?.[1]).toEqual(expect.arrayContaining(['prod_legacy_monthly', 'monthly', 'active', '19.00']));

    await service.processWebhook({
      ...subscriptionEvent,
      id: 'evt_legacy_yearly',
      type: 'customer.subscription.updated',
      data: { ...subscriptionEvent.data, product_id: 'prod_legacy_yearly', amount: '190.00' }
    });
    const yearlyCall = query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO subscriptions')).at(-1);
    expect(yearlyCall?.[1]).toEqual(expect.arrayContaining(['prod_legacy_yearly', 'yearly', '190.00']));
  });

  it('rejects subscription events for products that are neither current nor legacy Pro products', async () => {
    const { service } = makeService();
    await expect(service.processWebhook({
      ...subscriptionEvent,
      id: 'evt_unknown_product',
      data: { ...subscriptionEvent.data, product_id: 'prod_someone_else' }
    })).rejects.toThrow('Unknown Bachs subscription product.');
  });

  it('moves a legacy monthly subscriber to the current yearly product at renewal', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT id,provider_subscription_id')) return queryResult(1, [{
        id: 'sub_local', provider_subscription_id: 'sub_bachs_legacy', provider_product_id: 'prod_legacy_monthly',
        billing_period: 'monthly', status: 'active', current_period_end: '2026-09-30T08:00:00Z'
      }]);
      return queryResult();
    });
    const database = {
      query,
      transaction: vi.fn(async (callback: (client: { query: typeof query }) => unknown) => callback({ query }))
    };
    const bachs = { createCheckout: vi.fn(), createPortalSession: vi.fn(), getSubscription: vi.fn(), updateSubscription: vi.fn().mockResolvedValue({}) };
    const service = new BillingService(database as never, bachs as never, cloudConfig);
    await expect(service.upgradeToYearly('org_1')).resolves.toMatchObject({ changed: true, changeStatus: 'scheduled' });
    expect(bachs.updateSubscription).toHaveBeenCalledWith('sub_bachs_legacy', { product_id: 'prod_yearly' }, expect.any(String));
  });

  it('creates monthly checkout from the current monthly product, never a legacy one', async () => {
    const { service, bachs } = makeService();
    await service.createCheckout({ organizationId: 'org_1', projectId: 'proj_1', email: 'owner@example.com', billingPeriod: 'monthly' });
    expect(bachs.createCheckout).toHaveBeenCalledWith(expect.objectContaining({
      product_cart: [{ product_id: 'prod_monthly', quantity: 1 }],
      metadata: { organization_id: 'org_1', plan_key: 'pro', billing_period: 'monthly' }
    }));
  });

  it('keeps the scheduled change pending and applies normal grace state when renewal payment fails', async () => {
    const { service, query } = makeService();

    await expect(service.processWebhook({
      id: 'evt_renewal_payment_failed',
      type: 'invoice.payment_failed',
      created_at: '2026-09-30T08:00:00Z',
      data: {
        subscription_id: 'sub_bachs_1', status: 'Failed',
        billing_reason: 'Subscription Cycle'
      }
    })).resolves.toEqual({ processed: true, duplicate: false });
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO subscriptions'))).toBe(false);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("subscription_change_status = 'failed'"))).toBe(false);

    await service.processWebhook({
      ...subscriptionEvent,
      id: 'evt_renewal_past_due',
      type: 'customer.subscription.updated',
      created_at: '2026-09-30T08:00:01Z',
      data: { ...subscriptionEvent.data, status: 'past_due', product_id: 'prod_monthly' }
    });

    const subscriptionUpdate = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO subscriptions'));
    expect(subscriptionUpdate?.[1]).toEqual(expect.arrayContaining(['prod_monthly', 'monthly', 'past_due']));
    expect(subscriptionUpdate?.[1]?.[12]).toBe('2026-10-07T08:00:01.000Z');
    expect(String(subscriptionUpdate?.[0])).toContain('ELSE subscriptions.subscription_change_status');
  });

  it('does not let invoice.paid independently invent yearly subscription state', async () => {
    const { service, query } = makeService();
    await expect(service.processWebhook({
      id: 'evt_upgrade_invoice_paid',
      type: 'invoice.paid',
      created_at: '2026-09-02T12:01:00Z',
      data: {
        subscription_id: 'sub_bachs_1', status: 'Paid',
        billing_reason: 'Subscription Cycle'
      }
    })).resolves.toEqual({ processed: true, duplicate: false });

    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO subscriptions'))).toBe(false);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('UPDATE subscriptions'))).toBe(false);
  });

  it('does not let reconciliation finalize a pending upgrade or advance signed-event chronology', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT provider_subscription_id FROM subscriptions')) {
        return queryResult(1, [{ provider_subscription_id: 'sub_bachs_1' }]);
      }
      if (sql.includes('SELECT organization_id FROM subscriptions')) {
        return queryResult(1, [{ organization_id: 'org_1' }]);
      }
      return queryResult();
    });
    const database = {
      query,
      transaction: vi.fn(async (callback: (client: { query: typeof query }) => unknown) => callback({ query }))
    };
    const bachs = {
      createCheckout: vi.fn(), createPortalSession: vi.fn(), updateSubscription: vi.fn(),
      getSubscription: vi.fn().mockResolvedValue({
        ...subscriptionEvent.data, product_id: 'prod_yearly', amount: '90.00', metadata: {}
      })
    };
    const service = new BillingService(database as never, bachs as never, cloudConfig);

    await expect(service.reconcile()).resolves.toEqual({ reconciled: 1 });
    const upsert = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO subscriptions'));
    expect(upsert?.[1]?.slice(-2)).toEqual([false, true]);
    expect(String(upsert?.[0])).toContain('THEN subscriptions.provider_product_id');
    expect(String(upsert?.[0])).toContain('THEN subscriptions.provider_event_created_at');
  });

  it('preserves a seven-day payment-failure grace deadline and clears it on recovery', async () => {
    const { service, query } = makeService();
    await service.processWebhook({
      ...subscriptionEvent,
      id: 'evt_payment_failed',
      created_at: '2026-09-01T08:00:00Z',
      data: { ...subscriptionEvent.data, status: 'past_due' }
    });
    await service.processWebhook({
      ...subscriptionEvent,
      id: 'evt_payment_recovered',
      created_at: '2026-09-03T08:00:00Z',
      data: { ...subscriptionEvent.data, status: 'active' }
    });

    const upserts = query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO subscriptions'));
    expect(upserts[0][1]?.[12]).toBe('2026-09-08T08:00:00.000Z');
    expect(upserts[1][1]?.[12]).toBeNull();
    expect(String(upserts[0][0])).toContain('COALESCE(subscriptions.grace_period_ends_at');
    expect(String(upserts[1][0])).toContain('ELSE NULL');
  });

  it('keeps period-end cancellations active until Bachs sends the terminal canceled state', async () => {
    const { service, query } = makeService();
    await service.processWebhook({
      ...subscriptionEvent,
      id: 'evt_cancel_scheduled',
      data: { ...subscriptionEvent.data, status: 'active', cancel_at_period_end: true }
    });
    await service.processWebhook({
      ...subscriptionEvent,
      id: 'evt_cancel_effective',
      created_at: '2026-09-30T08:00:00Z',
      data: {
        ...subscriptionEvent.data, status: 'canceled', cancel_at_period_end: true,
        canceled_at: '2026-09-30T08:00:00Z'
      }
    });

    const upserts = query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO subscriptions'));
    expect(upserts[0][1]).toEqual(expect.arrayContaining(['active', true]));
    expect(upserts[1][1]).toEqual(expect.arrayContaining(['canceled', '2026-09-30T08:00:00Z']));
  });

  it('clears a scheduled interval change when a signed provider update cancels renewal', async () => {
    const { service, query } = makeService();
    await service.processWebhook({
      ...subscriptionEvent,
      id: 'evt_cancel_with_scheduled_change',
      type: 'customer.subscription.updated',
      created_at: '2026-09-03T08:00:00Z',
      data: { ...subscriptionEvent.data, cancel_at_period_end: true }
    });

    const upsert = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO subscriptions'));
    expect(upsert?.[1]).toEqual(expect.arrayContaining(['prod_monthly', 'monthly', true]));
    expect(String(upsert?.[0])).toContain('OR EXCLUDED.cancel_at_period_end');
    expect(String(upsert?.[0])).toContain("OR EXCLUDED.status IN ('canceled', 'unpaid')");
  });

  it('acknowledges duplicate provider events without applying them twice', async () => {
    const { service, query } = makeService(false);
    expect(await service.processWebhook(subscriptionEvent)).toEqual({ processed: false, duplicate: true });
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO subscriptions'))).toBe(false);
  });

  it('does not let out-of-order subscription or checkout events replace newer subscription state', async () => {
    let stored = { createdAt: '', productId: '' };
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes('INSERT INTO billing_webhook_events')) return queryResult(1);
      if (sql.includes('SELECT organization_id FROM billing_checkout_sessions')) {
        return queryResult(1, [{ organization_id: 'org_1' }]);
      }
      if (sql.includes('UPDATE billing_checkout_sessions')) return queryResult(1, [{ organization_id: 'org_1' }]);
      if (sql.includes('INSERT INTO subscriptions')) {
        expect(sql).toContain('subscriptions.provider_event_created_at <= EXCLUDED.provider_event_created_at');
        const createdAt = String(values?.[13]);
        if (!stored.createdAt || stored.createdAt <= createdAt) {
          stored = { createdAt, productId: String(values?.[3]) };
        }
      }
      return queryResult();
    });
    const database = {
      query,
      transaction: vi.fn(async (callback: (client: { query: typeof query }) => unknown) => callback({ query }))
    };
    const bachs = {
      createCheckout: vi.fn(), createPortalSession: vi.fn(), updateSubscription: vi.fn(),
      getSubscription: vi.fn().mockResolvedValue({
        ...subscriptionEvent.data, product_id: 'prod_monthly', metadata: { organization_id: 'org_1' }
      })
    };
    const service = new BillingService(database as never, bachs as never, cloudConfig);

    await service.processWebhook({
      ...subscriptionEvent,
      id: 'evt_newer_yearly',
      created_at: '2026-09-02T12:00:00Z',
      data: { ...subscriptionEvent.data, product_id: 'prod_yearly', amount: '90.00' }
    });
    await service.processWebhook({
      ...subscriptionEvent,
      id: 'evt_older_monthly',
      type: 'customer.subscription.updated',
      created_at: '2026-09-02T11:30:00Z',
      data: { ...subscriptionEvent.data, product_id: 'prod_monthly', amount: '9.00' }
    });
    await service.processWebhook({
      id: 'evt_older_checkout', type: 'checkout.completed', created_at: '2026-09-02T11:00:00Z',
      data: {
        checkout_id: 'chk_old', status: 'completed', payment_status: 'paid',
        customer: { customer_id: 'cust_1', email: 'owner@example.com' },
        subscription: { subscription_id: 'sub_bachs_1' },
        metadata: { organization_id: 'org_1', plan_key: 'pro', billing_period: 'monthly' }
      }
    });

    expect(stored).toEqual({ createdAt: '2026-09-02T12:00:00Z', productId: 'prod_yearly' });
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
