import { describe, expect, it, vi } from 'vitest';
import { BillingService, buildProWelcomeEmail, type BachsEvent } from '../src/modules/billing/billing.service';

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

function result(rowCount = 1, rows: Record<string, unknown>[] = []) {
  return { rowCount, rows, command: '', oid: 0, fields: [] };
}

const subscriptionEvent: BachsEvent = {
  id: 'evt_new_pro',
  type: 'customer.subscription.created',
  created_at: '2026-09-06T12:00:00Z',
  data: {
    subscription_id: 'sub_pro_1',
    customer: { customer_id: 'cust_1', email: 'owner@example.com' },
    product_id: 'prod_yearly',
    status: 'active',
    currency: 'USD',
    amount: '190.00',
    metadata: { organization_id: 'org_1' }
  }
};

describe('Pro welcome email', () => {
  it('renders the confirmed billing interval and escapes organization content', () => {
    const html = buildProWelcomeEmail({
      organizationName: '<Acme & Co>',
      billingPeriod: 'yearly',
      dashboardUrl: 'https://traceiq.run/dashboard/settings/billing'
    });
    expect(html).toContain('&lt;Acme &amp; Co&gt;');
    expect(html).toContain('$190/year');
    expect(html).not.toContain('<Acme & Co>');
  });

  it('queues and sends one welcome email after a confirmed Pro subscription event', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('INSERT INTO billing_webhook_events')) return result(1, [{ id: 'bwe_1' }]);
      if (sql.includes('INSERT INTO subscriptions')) return result(1, [{ provider_subscription_id: 'sub_pro_1' }]);
      if (sql.includes('INSERT INTO billing_email_deliveries')) return result(1, [{ id: 'bem_1' }]);
      if (sql.includes('UPDATE billing_email_deliveries d')) return result(1, [{
        id: 'bem_1', organization_name: 'Acme', provider_subscription_id: 'sub_pro_1',
        recipient: 'owner@example.com', billing_period: 'yearly'
      }]);
      return result();
    });
    const database = {
      query,
      transaction: vi.fn(async (callback: (client: { query: typeof query }) => unknown) => callback({ query }))
    };
    const bachs = {
      createCheckout: vi.fn(), createPortalSession: vi.fn(), getSubscription: vi.fn(), updateSubscription: vi.fn()
    };
    const email = { send: vi.fn().mockResolvedValue({ ok: true }) };
    const service = new BillingService(database as never, bachs as never, cloudConfig, email as never);

    await expect(service.processWebhook(subscriptionEvent)).resolves.toEqual({ processed: true, duplicate: false });
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({
      to: ['owner@example.com'],
      subject: 'Welcome to TraceIQ Pro',
      idempotencyKey: 'traceiq-pro-welcome-sub_pro_1'
    }));
    expect(query.mock.calls.some(([sql]) => String(sql).includes("status = 'sent'"))).toBe(true);
  });
});
