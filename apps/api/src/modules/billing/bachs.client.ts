import { BadGatewayException, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { appConfig, BachsConfig } from '../../config/app.config';

@Injectable()
export class BachsClient {
  constructor(@Optional() private readonly config: BachsConfig | null = appConfig.bachs) {}

  createCheckout(body: Record<string, unknown>) {
    return this.request<BachsCheckoutSession>(
      'POST', '/v1/checkout-sessions', body, randomUUID()
    );
  }

  createPortalSession(customerId: string) {
    return this.request<{ id: string; url: string }>('POST', `/v1/customers/${encodeURIComponent(customerId)}/portal-sessions`);
  }

  getSubscription(subscriptionId: string) {
    return this.request<BachsSubscription>('GET', `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
  }

  updateSubscription(
    subscriptionId: string,
    body: { product_id: string; proration_behavior: 'invoice_now' },
    idempotencyKey: string
  ) {
    // A 2xx response acknowledges the change request; Bachs may still be
    // processing its proration payment, so this payload is not subscription truth.
    return this.request<unknown>(
      'PATCH', `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, body, idempotencyKey
    );
  }

  private async request<T>(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    if (!this.config) throw new BadGatewayException('Bachs billing is unavailable in self-hosted mode.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`${this.config.apiBaseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      const payload = await response.json().catch(() => null) as T | BachsError | null;
      if (!response.ok) {
        const errorPayload = payload as BachsError | null;
        const message = errorPayload?.detail ?? errorPayload?.error?.message;
        throw new BadGatewayException(message || `Bachs returned HTTP ${response.status}.`);
      }
      return payload as T;
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException(error instanceof Error ? `Bachs request failed: ${error.message}` : 'Bachs request failed.');
    } finally {
      clearTimeout(timeout);
    }
  }
}

export interface BachsCheckoutSession {
  checkout_id: string;
  checkout_url: string;
  status: string;
  expires_at: string;
}

interface BachsError {
  detail?: string;
  error_code?: string;
  error?: { message?: string };
}

export interface BachsSubscription {
  id?: string;
  subscription_id?: string;
  customer: { customer_id: string; email?: string };
  product?: { id: string };
  product_id?: string;
  billing_cycle?: { interval?: string; frequency?: number };
  status: 'trialing' | 'active' | 'past_due' | 'unpaid' | 'canceled' | 'paused';
  currency?: string;
  amount?: string;
  current_period_start?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  canceled_at?: string | null;
  metadata?: Record<string, unknown>;
}
