import { BadGatewayException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BachsClient } from '../src/modules/billing/bachs.client';

const config = {
  environment: 'sandbox' as const,
  apiBaseUrl: 'https://sandbox-api.bachs.io' as const,
  apiKey: 'sk_sandbox_test',
  webhookSecret: 'whsec_test',
  products: { proMonthly: 'prod_monthly', proYearly: 'prod_yearly' }
};

afterEach(() => vi.unstubAllGlobals());

describe('BachsClient', () => {
  it('surfaces the flat Bachs error detail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      detail: 'The API key lacks the required scope.',
      error_code: 'FORBIDDEN'
    }), { status: 403, headers: { 'Content-Type': 'application/json' } })));

    await expect(new BachsClient(config).createCheckout({})).rejects.toEqual(
      expect.objectContaining<BadGatewayException>({ message: 'The API key lacks the required scope.' })
    );
  });

  it('changes an existing subscription product with immediate proration and idempotency', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      subscription_id: 'sub_1', customer: { customer_id: 'cust_1' },
      product_id: 'prod_yearly', status: 'active'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await new BachsClient(config).updateSubscription(
      'sub_1',
      { product_id: 'prod_yearly', proration_behavior: 'invoice_now' },
      'traceiq:sub_1:pro-yearly'
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://sandbox-api.bachs.io/v1/subscriptions/sub_1',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ 'Idempotency-Key': 'traceiq:sub_1:pro-yearly' }),
        body: JSON.stringify({ product_id: 'prod_yearly', proration_behavior: 'invoice_now' })
      })
    );
  });
});
