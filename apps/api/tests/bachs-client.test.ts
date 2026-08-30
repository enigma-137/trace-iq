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
});
