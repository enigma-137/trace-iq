import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnApplicationShutdown, Optional } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { appConfig } from '../../config/app.config';
import { DatabaseService, QueryExecutor } from '../../database/database.service';
import { CLOUD_BILLING_POLICY } from './plan-catalog';
import { BachsClient, BachsSubscription } from './bachs.client';

export interface BachsEvent {
  id: string;
  type: string;
  created_at: string;
  data: BachsSubscription;
}

@Injectable()
export class BillingService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BillingService.name);
  private reconciliationTimer?: NodeJS.Timeout;
  constructor(
    private readonly database: DatabaseService,
    private readonly bachs: BachsClient,
    @Optional() private readonly config: Pick<typeof appConfig, 'deploymentMode' | 'bachs'> = appConfig
  ) {}

  onApplicationBootstrap() {
    if (this.config.deploymentMode !== 'cloud') return;
    const configured = Number(process.env.BILLING_RECONCILIATION_INTERVAL_MS ?? 21_600_000);
    const interval = Number.isFinite(configured) ? Math.max(configured, 60_000) : 21_600_000;
    this.reconciliationTimer = setInterval(() => void this.reconcile().catch((error) => {
      this.logger.error('Bachs reconciliation failed.', error instanceof Error ? error.stack : error);
    }), interval);
    this.reconciliationTimer.unref();
  }

  onApplicationShutdown() {
    if (this.reconciliationTimer) clearInterval(this.reconciliationTimer);
  }

  async createCheckout(input: { organizationId: string; email: string; billingPeriod: 'monthly' | 'yearly' }) {
    this.requireCloud();
    const productId = input.billingPeriod === 'yearly'
      ? this.config.bachs!.products.proYearly : this.config.bachs!.products.proMonthly;
    const dashboard = (process.env.DASHBOARD_URL ?? 'https://traceiq.run').replace(/\/+$/, '');
    return this.bachs.createCheckout({
      product_cart: [{ product_id: productId, quantity: 1 }],
      billing_currency: 'USD',
      // Bachs requires both fields when checkout creates a new customer. TraceIQ
      // currently stores only the authenticated email, so use its local part as
      // a stable, non-sensitive display name until profile names are available.
      customer: { email: input.email, name: input.email.split('@')[0] || 'TraceIQ customer' },
      success_url: `${dashboard}/dashboard/settings?billing=success`,
      cancel_url: `${dashboard}/pricing?billing=cancelled`,
      metadata: { organization_id: input.organizationId, plan_key: 'pro', billing_period: input.billingPeriod }
    });
  }

  async createPortal(organizationId: string) {
    this.requireCloud();
    const result = await this.database.query<{ provider_customer_id: string }>(
      `SELECT provider_customer_id FROM billing_customers WHERE organization_id = $1 AND provider = 'bachs'`,
      [organizationId]
    );
    const customerId = result.rows[0]?.provider_customer_id;
    if (!customerId) throw new NotFoundException('No Bachs billing customer exists for this organization.');
    return this.bachs.createPortalSession(customerId);
  }

  verifySignature(rawBody: Buffer, timestampHeader?: string, signatureHeader?: string) {
    this.requireCloud();
    if (!timestampHeader || !signatureHeader || !/^\d+$/.test(timestampHeader)) {
      throw new ForbiddenException('Missing or invalid Bachs webhook signature headers.');
    }
    const timestamp = Number(timestampHeader);
    if (Math.abs(Date.now() / 1000 - timestamp) > 300) throw new ForbiddenException('Stale Bachs webhook delivery.');
    const expected = createHmac('sha256', this.config.bachs!.webhookSecret)
      .update(`${timestampHeader}.`).update(rawBody).digest('hex');
    const supplied = Buffer.from(signatureHeader, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (supplied.length !== expectedBuffer.length || !timingSafeEqual(supplied, expectedBuffer)) {
      throw new ForbiddenException('Invalid Bachs webhook signature.');
    }
  }

  async processWebhook(event: BachsEvent) {
    if (!event.id?.startsWith('evt_') || !event.type || !event.created_at || !event.data) {
      throw new BadRequestException('Invalid Bachs webhook payload.');
    }
    const claimed = await this.database.query(`
        INSERT INTO billing_webhook_events (id, provider, provider_event_id, event_type, payload, processing_status, attempt_count)
        VALUES ($1, 'bachs', $2, $3, $4::jsonb, 'processing', 1)
        ON CONFLICT (provider, provider_event_id) DO UPDATE SET
          processing_status = 'processing', attempt_count = billing_webhook_events.attempt_count + 1,
          error = NULL
        WHERE billing_webhook_events.processing_status = 'failed'
        RETURNING id
      `, [`bwe_${randomUUID()}`, event.id, event.type, JSON.stringify(event)]);
    if (claimed.rowCount === 0) return { processed: false, duplicate: true };

    try {
      await this.database.transaction(async (client) => {
        if (event.type.startsWith('customer.subscription.')) await this.upsertSubscription(client, event);
        await client.query(`UPDATE billing_webhook_events SET processing_status = 'processed', processed_at = now() WHERE provider = 'bachs' AND provider_event_id = $1`, [event.id]);
      });
      return { processed: true, duplicate: false };
    } catch (error) {
      await this.database.query(`UPDATE billing_webhook_events SET processing_status = 'failed', error = $2 WHERE provider = 'bachs' AND provider_event_id = $1`, [event.id, error instanceof Error ? error.message : 'Unknown error']);
      throw error;
    }
  }

  async reconcile() {
    this.requireCloud();
    const local = await this.database.query<{ provider_subscription_id: string }>(`
      SELECT provider_subscription_id FROM subscriptions
      WHERE provider = 'bachs' AND status <> 'canceled'
    `);
    let reconciled = 0;
    for (const row of local.rows) {
      const subscription = await this.bachs.getSubscription(row.provider_subscription_id);
      await this.database.transaction((client) => this.upsertSubscription(client, {
        id: `evt_reconcile_${randomUUID()}`,
        type: 'customer.subscription.updated', created_at: new Date().toISOString(), data: subscription
      }, true));
      reconciled += 1;
    }
    return { reconciled };
  }

  private async upsertSubscription(executor: QueryExecutor, event: BachsEvent, reconciliation = false): Promise<void> {
    const data = event.data;
    const subscriptionId = data.subscription_id ?? data.id;
    const organizationId = typeof data.metadata?.organization_id === 'string' ? data.metadata.organization_id : null;
    if (!subscriptionId || !organizationId || !data.customer?.customer_id) {
      if (reconciliation && subscriptionId) {
        const existing = await executor.query<{ organization_id: string }>(`SELECT organization_id FROM subscriptions WHERE provider = 'bachs' AND provider_subscription_id = $1`, [subscriptionId]);
        if (!existing.rows[0]) throw new BadRequestException('Cannot reconcile an unmapped Bachs subscription.');
        data.metadata = { ...data.metadata, organization_id: existing.rows[0].organization_id };
        await this.upsertSubscription(executor, event, false);
        return;
      }
      throw new BadRequestException('Bachs subscription is missing TraceIQ organization metadata.');
    }
    const productId = data.product_id ?? data.product?.id ?? null;
    const knownProducts = [this.config.bachs!.products.proMonthly, this.config.bachs!.products.proYearly];
    if (!productId || !knownProducts.includes(productId)) throw new BadRequestException('Unknown Bachs subscription product.');
    const graceEnd = data.status === 'past_due'
      ? new Date(new Date(event.created_at).getTime() + CLOUD_BILLING_POLICY.failedPaymentGraceDays * 86_400_000).toISOString()
      : null;
    await executor.query(`
      INSERT INTO billing_customers (organization_id, provider, provider_customer_id)
      VALUES ($1, 'bachs', $2)
      ON CONFLICT (organization_id, provider) DO UPDATE SET provider_customer_id = EXCLUDED.provider_customer_id, updated_at = now()
    `, [organizationId, data.customer.customer_id]);
    await executor.query(`
      INSERT INTO subscriptions (
        id, organization_id, provider, provider_subscription_id, provider_product_id, plan_key, status,
        currency, amount, current_period_start, current_period_end, cancel_at_period_end, canceled_at,
        grace_period_ends_at, last_provider_sync_at, provider_event_created_at, metadata
      ) VALUES ($1, $2, 'bachs', $3, $4, 'pro', $5, $6, $7, $8, $9, $10, $11, $12, now(), $13, $14::jsonb)
      ON CONFLICT (provider, provider_subscription_id) DO UPDATE SET
        provider_product_id = EXCLUDED.provider_product_id, status = EXCLUDED.status,
        currency = EXCLUDED.currency, amount = EXCLUDED.amount,
        current_period_start = EXCLUDED.current_period_start, current_period_end = EXCLUDED.current_period_end,
        cancel_at_period_end = EXCLUDED.cancel_at_period_end, canceled_at = EXCLUDED.canceled_at,
        grace_period_ends_at = EXCLUDED.grace_period_ends_at, last_provider_sync_at = now(),
        provider_event_created_at = EXCLUDED.provider_event_created_at, metadata = EXCLUDED.metadata, updated_at = now()
      WHERE subscriptions.provider_event_created_at IS NULL OR subscriptions.provider_event_created_at <= EXCLUDED.provider_event_created_at
    `, [
      `sub_${randomUUID()}`, organizationId, subscriptionId, productId, data.status,
      data.currency ?? null, data.amount ?? null, data.current_period_start ?? null, data.current_period_end ?? null,
      data.cancel_at_period_end ?? false, data.canceled_at ?? null, graceEnd, event.created_at,
      JSON.stringify(data.metadata ?? {})
    ]);
  }

  private requireCloud() {
    if (this.config.deploymentMode !== 'cloud' || !this.config.bachs) {
      throw new NotFoundException('Cloud billing is not available in this deployment.');
    }
  }
}
