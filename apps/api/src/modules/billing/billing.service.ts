import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnApplicationShutdown, Optional } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { QueryResultRow } from 'pg';
import { appConfig } from '../../config/app.config';
import { DatabaseService, QueryExecutor } from '../../database/database.service';
import { CLOUD_BILLING_POLICY } from './plan-catalog';
import { BachsClient, BachsSubscription } from './bachs.client';

export interface BachsEvent {
  id: string;
  type: string;
  created_at: string;
  data: BachsSubscription | BachsCheckoutCompleted | BachsPaymentEvent;
}

interface BachsCheckoutCompleted {
  checkout_id: string;
  status: string;
  payment_status: string;
  customer: { customer_id: string; email?: string } | null;
  subscription: { subscription_id: string } | null;
  metadata?: Record<string, unknown>;
}

interface BachsPaymentEvent {
  subscription_id?: string | null;
  subscription?: { subscription_id?: string | null } | string | null;
  invoice?: { subscription_id?: string | null } | null;
  status?: string;
  payment_status?: string;
  billing_reason?: string;
  reason?: string;
  description?: string;
}

type BillingPeriod = 'monthly' | 'yearly';

interface SubscriptionRow extends QueryResultRow {
  id: string;
  provider_subscription_id: string;
  provider_product_id: string | null;
  billing_period: BillingPeriod | null;
  status: string;
  subscription_change_status: 'pending' | 'failed' | null;
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

  async createCheckout(input: { organizationId: string; projectId: string; email: string; billingPeriod: BillingPeriod }) {
    this.requireCloud();
    const productId = input.billingPeriod === 'yearly'
      ? this.config.bachs!.products.proYearly : this.config.bachs!.products.proMonthly;
    const { successUrl, cancelUrl } = this.checkoutReturnUrls(input.projectId);
    return this.database.transaction(async (client) => {
      await this.lockSubscriptionChange(client, input.organizationId);
      const existing = await client.query(`
        SELECT 1 FROM subscriptions
        WHERE organization_id=$1 AND provider='bachs'
          AND status IN ('trialing','active','past_due','paused')
        LIMIT 1 FOR UPDATE
      `, [input.organizationId]);
      if (existing.rows.length) {
        throw new ConflictException('This organization already has a Bachs subscription. Manage or change the existing plan instead of creating another checkout.');
      }
      const pending = await client.query(`
        SELECT 1 FROM billing_checkout_sessions
        WHERE organization_id=$1 AND provider='bachs' AND completed_at IS NULL
          AND (expires_at IS NULL OR expires_at>now())
        LIMIT 1 FOR UPDATE
      `, [input.organizationId]);
      if (pending.rows.length) throw new ConflictException('A billing checkout is already pending for this organization.');
      const checkout = await this.bachs.createCheckout({
        product_cart: [{ product_id: productId, quantity: 1 }],
        billing_currency: 'USD',
        // Bachs requires both fields when checkout creates a new customer. TraceIQ
        // currently stores only the authenticated email, so use its local part as
        // a stable, non-sensitive display name until profile names are available.
        customer: { email: input.email, name: input.email.split('@')[0] || 'TraceIQ customer' },
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { organization_id: input.organizationId, plan_key: 'pro', billing_period: input.billingPeriod }
      });
      await client.query(`
        INSERT INTO billing_checkout_sessions (
          id, provider, provider_checkout_id, organization_id, project_id,
          provider_product_id, billing_period, status, expires_at
        ) VALUES ($1, 'bachs', $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (provider, provider_checkout_id) DO NOTHING
      `, [
        `bcs_${randomUUID()}`, checkout.checkout_id, input.organizationId, input.projectId,
        productId, input.billingPeriod, checkout.status, checkout.expires_at
      ]);
      return checkout;
    });
  }

  async upgradeToYearly(organizationId: string) {
    this.requireCloud();
    return this.database.transaction(async (client) => {
      await this.lockSubscriptionChange(client, organizationId);
      const result = await client.query<SubscriptionRow>(`
        SELECT id,provider_subscription_id,provider_product_id,billing_period,status,subscription_change_status
        FROM subscriptions
        WHERE organization_id=$1 AND provider='bachs'
          AND status IN ('trialing','active','past_due','paused')
        ORDER BY provider_event_created_at DESC NULLS LAST,updated_at DESC
        LIMIT 1 FOR UPDATE
      `, [organizationId]);
      const current = result.rows[0];
      if (!current) throw new NotFoundException('No active Bachs subscription exists for this organization.');
      const currentPeriod = this.billingPeriod(current.provider_product_id, current.billing_period);
      if (currentPeriod === 'yearly') {
        return {
          changed: false, billingPeriod: 'yearly' as const,
          upgradeStatus: null, subscriptionStatus: current.status
        };
      }
      if (currentPeriod !== 'monthly') throw new ConflictException('The active subscription product is not a recognized monthly Pro product.');
      if (current.subscription_change_status === 'pending') {
        throw new ConflictException('A yearly billing upgrade is already pending for this organization.');
      }
      if (current.status !== 'active' && current.status !== 'trialing') {
        throw new ConflictException('Resolve the current subscription status before changing its billing period.');
      }
      const requestedAt = new Date().toISOString();
      await this.bachs.updateSubscription(
        current.provider_subscription_id,
        { product_id: this.config.bachs!.products.proYearly, proration_behavior: 'invoice_now' },
        `traceiq:${current.provider_subscription_id}:pro-yearly`
      );
      await client.query(`
        UPDATE subscriptions SET
          subscription_change_status = 'pending',
          subscription_change_target_product_id = $2,
          subscription_change_target_billing_period = 'yearly',
          subscription_change_requested_at = $3,
          subscription_change_failure_code = NULL,
          subscription_change_failure_at = NULL,
          updated_at = now()
        WHERE id = $1
      `, [current.id, this.config.bachs!.products.proYearly, requestedAt]);
      return {
        changed: true, billingPeriod: 'monthly' as const,
        upgradeStatus: 'pending' as const, subscriptionStatus: current.status
      };
    });
  }

  checkoutReturnRedirect(status: 'success' | 'cancelled', projectId?: string) {
    const dashboard = this.dashboardReturnBaseUrl();
    const query = new URLSearchParams();
    if (projectId) query.set('projectId', projectId);
    if (status === 'success') {
      return `${dashboard}/billing/success${query.size ? `?${query.toString()}` : ''}`;
    }
    query.set('billing', 'cancelled');
    return `${dashboard}/dashboard/settings/billing?${query.toString()}`;
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
      const checkoutSubscription = event.type === 'checkout.completed'
        ? await this.subscriptionForCompletedCheckout(event)
        : null;
      await this.database.transaction(async (client) => {
        if (event.type === 'checkout.completed') {
          await this.applyCompletedCheckout(client, event, checkoutSubscription);
        } else if (event.type.startsWith('customer.subscription.')) {
          await this.upsertSubscription(client, event);
        } else if (this.isSubscriptionChangePaymentFailure(event)) {
          await this.applySubscriptionChangePaymentFailure(client, event);
        }
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
    const data = event.data as BachsSubscription;
    const subscriptionId = data.subscription_id ?? data.id;
    let organizationId = typeof data.metadata?.organization_id === 'string' ? data.metadata.organization_id : null;
    if (!organizationId && data.customer?.customer_id) {
      const mapped = await executor.query<{ organization_id: string }>(
        `SELECT organization_id FROM billing_customers WHERE provider = 'bachs' AND provider_customer_id = $1`,
        [data.customer.customer_id]
      );
      organizationId = mapped.rows[0]?.organization_id ?? null;
      if (organizationId) data.metadata = { ...data.metadata, organization_id: organizationId };
    }
    if (!subscriptionId || !organizationId || !data.customer?.customer_id) {
      if (reconciliation && subscriptionId) {
        const existing = await executor.query<{ organization_id: string }>(`SELECT organization_id FROM subscriptions WHERE provider = 'bachs' AND provider_subscription_id = $1`, [subscriptionId]);
        if (!existing.rows[0]) throw new BadRequestException('Cannot reconcile an unmapped Bachs subscription.');
        data.metadata = { ...data.metadata, organization_id: existing.rows[0].organization_id };
        await this.upsertSubscription(executor, event, true);
        return;
      }
      throw new BadRequestException('Bachs subscription is missing TraceIQ organization metadata.');
    }
    const productId = this.subscriptionProductId(data);
    const knownProducts = [this.config.bachs!.products.proMonthly, this.config.bachs!.products.proYearly];
    if (!productId || !knownProducts.includes(productId)) throw new BadRequestException('Unknown Bachs subscription product.');
    const billingPeriod = this.billingPeriod(productId);
    const metadata = { ...(data.metadata ?? {}), billing_period: billingPeriod };
    const graceEnd = data.status === 'past_due'
      ? new Date(new Date(event.created_at).getTime() + CLOUD_BILLING_POLICY.failedPaymentGraceDays * 86_400_000).toISOString()
      : null;
    await this.lockSubscriptionChange(executor, organizationId);
    await executor.query(`
      INSERT INTO billing_customers (organization_id, provider, provider_customer_id)
      VALUES ($1, 'bachs', $2)
      ON CONFLICT (organization_id, provider) DO UPDATE SET provider_customer_id = EXCLUDED.provider_customer_id, updated_at = now()
    `, [organizationId, data.customer.customer_id]);
    await executor.query(`
      INSERT INTO subscriptions (
        id, organization_id, provider, provider_subscription_id, provider_product_id, billing_period, plan_key, status,
        currency, amount, current_period_start, current_period_end, cancel_at_period_end, canceled_at,
        grace_period_ends_at, last_provider_sync_at, provider_event_created_at, metadata
      ) VALUES ($1, $2, 'bachs', $3, $4, $5, 'pro', $6, $7, $8, $9, $10, $11, $12, $13, now(), $14, $15::jsonb)
      ON CONFLICT (provider, provider_subscription_id) DO UPDATE SET
        provider_product_id = CASE
          WHEN $17::boolean AND subscriptions.subscription_change_status IS NOT NULL
            THEN subscriptions.provider_product_id
          ELSE EXCLUDED.provider_product_id
        END,
        billing_period = CASE
          WHEN $17::boolean AND subscriptions.subscription_change_status IS NOT NULL
            THEN subscriptions.billing_period
          ELSE EXCLUDED.billing_period
        END,
        status = EXCLUDED.status,
        currency = EXCLUDED.currency,
        amount = CASE
          WHEN $17::boolean AND subscriptions.subscription_change_status IS NOT NULL
            THEN subscriptions.amount
          ELSE EXCLUDED.amount
        END,
        current_period_start = CASE
          WHEN $17::boolean AND subscriptions.subscription_change_status IS NOT NULL
            THEN subscriptions.current_period_start
          ELSE EXCLUDED.current_period_start
        END,
        current_period_end = CASE
          WHEN $17::boolean AND subscriptions.subscription_change_status IS NOT NULL
            THEN subscriptions.current_period_end
          ELSE EXCLUDED.current_period_end
        END,
        cancel_at_period_end = EXCLUDED.cancel_at_period_end, canceled_at = EXCLUDED.canceled_at,
        grace_period_ends_at = CASE
          WHEN EXCLUDED.status = 'past_due'
            THEN COALESCE(subscriptions.grace_period_ends_at, EXCLUDED.grace_period_ends_at)
          ELSE NULL
        END,
        subscription_change_status = CASE
          WHEN $16::boolean AND EXCLUDED.provider_product_id = subscriptions.subscription_change_target_product_id
            THEN NULL
          ELSE subscriptions.subscription_change_status
        END,
        subscription_change_target_product_id = CASE
          WHEN $16::boolean AND EXCLUDED.provider_product_id = subscriptions.subscription_change_target_product_id
            THEN NULL
          ELSE subscriptions.subscription_change_target_product_id
        END,
        subscription_change_target_billing_period = CASE
          WHEN $16::boolean AND EXCLUDED.provider_product_id = subscriptions.subscription_change_target_product_id
            THEN NULL
          ELSE subscriptions.subscription_change_target_billing_period
        END,
        subscription_change_requested_at = CASE
          WHEN $16::boolean AND EXCLUDED.provider_product_id = subscriptions.subscription_change_target_product_id
            THEN NULL
          ELSE subscriptions.subscription_change_requested_at
        END,
        subscription_change_failure_code = CASE
          WHEN $16::boolean AND EXCLUDED.provider_product_id = subscriptions.subscription_change_target_product_id
            THEN NULL
          ELSE subscriptions.subscription_change_failure_code
        END,
        subscription_change_failure_at = CASE
          WHEN $16::boolean AND EXCLUDED.provider_product_id = subscriptions.subscription_change_target_product_id
            THEN NULL
          ELSE subscriptions.subscription_change_failure_at
        END,
        last_provider_sync_at = now(),
        provider_event_created_at = CASE
          WHEN $17::boolean THEN subscriptions.provider_event_created_at
          ELSE EXCLUDED.provider_event_created_at
        END,
        metadata = CASE
          WHEN $17::boolean AND subscriptions.subscription_change_status IS NOT NULL
            THEN subscriptions.metadata
          ELSE EXCLUDED.metadata
        END,
        updated_at = now()
      WHERE $17::boolean
        OR subscriptions.provider_event_created_at IS NULL
        OR subscriptions.provider_event_created_at <= EXCLUDED.provider_event_created_at
    `, [
      `sub_${randomUUID()}`, organizationId, subscriptionId, productId, billingPeriod, data.status,
      data.currency ?? null, data.amount ?? null, data.current_period_start ?? null, data.current_period_end ?? null,
      data.cancel_at_period_end ?? false, data.canceled_at ?? null, graceEnd, event.created_at,
      JSON.stringify(metadata), event.type === 'customer.subscription.updated' && !reconciliation, reconciliation
    ]);
  }

  private isSubscriptionChangePaymentFailure(event: BachsEvent) {
    return ['invoice.payment_failed', 'invoice.failed', 'payment.failed'].includes(event.type);
  }

  private async applySubscriptionChangePaymentFailure(executor: QueryExecutor, event: BachsEvent) {
    const data = event.data as BachsPaymentEvent;
    const billingReason = data.billing_reason ?? data.reason ?? '';
    if (billingReason.replace(/[^a-z]/gi, '').toLowerCase() !== 'subscriptionupdate') return;
    const nestedSubscription = typeof data.subscription === 'object' ? data.subscription?.subscription_id : data.subscription;
    const subscriptionId = data.subscription_id ?? nestedSubscription ?? data.invoice?.subscription_id ?? null;
    if (!subscriptionId) return;
    const result = await executor.query<{ organization_id: string }>(`
      SELECT organization_id FROM subscriptions
      WHERE provider = 'bachs' AND provider_subscription_id = $1
      LIMIT 1
    `, [subscriptionId]);
    const organizationId = result.rows[0]?.organization_id;
    if (!organizationId) return;
    await this.lockSubscriptionChange(executor, organizationId);
    await executor.query(`
      UPDATE subscriptions SET
        subscription_change_status = 'failed',
        subscription_change_failure_code = 'payment_failed',
        subscription_change_failure_at = $2,
        updated_at = now()
      WHERE provider = 'bachs' AND provider_subscription_id = $1
        AND subscription_change_status = 'pending'
        AND subscription_change_target_billing_period = 'yearly'
        AND subscription_change_requested_at <= $2::timestamptz + interval '5 minutes'
    `, [subscriptionId, event.created_at]);
  }

  private async subscriptionForCompletedCheckout(event: BachsEvent) {
    const data = event.data as BachsCheckoutCompleted;
    const subscriptionId = data.subscription?.subscription_id;
    if (!subscriptionId) return null;
    const mapping = await this.database.query<{ organization_id: string }>(`
      SELECT organization_id FROM billing_checkout_sessions
      WHERE provider = 'bachs' AND provider_checkout_id = $1
    `, [data.checkout_id]);
    const organizationId = mapping.rows[0]?.organization_id;
    if (!organizationId) throw new BadRequestException('Unknown Bachs checkout session.');
    const subscription = await this.bachs.getSubscription(subscriptionId);
    subscription.metadata = { ...subscription.metadata, organization_id: organizationId };
    return subscription;
  }

  private async applyCompletedCheckout(executor: QueryExecutor, event: BachsEvent, subscription: BachsSubscription | null) {
    const data = event.data as BachsCheckoutCompleted;
    const mapping = await executor.query<{ organization_id: string }>(`
      SELECT organization_id FROM billing_checkout_sessions
      WHERE provider = 'bachs' AND provider_checkout_id = $1
    `, [data.checkout_id]);
    const organizationId = mapping.rows[0]?.organization_id;
    if (!organizationId) throw new BadRequestException('Unknown Bachs checkout session.');
    const metadataOrg = typeof data.metadata?.organization_id === 'string' ? data.metadata.organization_id : null;
    if (metadataOrg && metadataOrg !== organizationId) {
      throw new BadRequestException('Bachs checkout organization metadata does not match the stored checkout.');
    }
    await this.lockSubscriptionChange(executor, organizationId);
    await executor.query(`
      UPDATE billing_checkout_sessions SET
        status = $2, provider_customer_id = $3, provider_subscription_id = $4,
        completed_at = $5, updated_at = now()
      WHERE provider = 'bachs' AND provider_checkout_id = $1
    `, [
      data.checkout_id, data.status, data.customer?.customer_id ?? null,
      data.subscription?.subscription_id ?? null, event.created_at
    ]);
    if (data.customer?.customer_id) {
      await executor.query(`
        INSERT INTO billing_customers (organization_id, provider, provider_customer_id)
        VALUES ($1, 'bachs', $2)
        ON CONFLICT (organization_id, provider) DO UPDATE
        SET provider_customer_id = EXCLUDED.provider_customer_id, updated_at = now()
      `, [organizationId, data.customer.customer_id]);
    }
    if (subscription) {
      await this.upsertSubscription(executor, {
        id: event.id, type: 'customer.subscription.created', created_at: event.created_at, data: subscription
      });
    }
  }

  private requireCloud() {
    if (this.config.deploymentMode !== 'cloud' || !this.config.bachs) {
      throw new NotFoundException('Cloud billing is not available in this deployment.');
    }
  }

  private async lockSubscriptionChange(executor: QueryExecutor, organizationId: string) {
    await executor.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${organizationId}:billingSubscriptionChange`]);
  }

  private subscriptionProductId(subscription: BachsSubscription) {
    return subscription.product_id ?? subscription.product?.id ?? null;
  }

  private billingPeriod(productId: string | null, stored?: BillingPeriod | null): BillingPeriod | null {
    if (productId === this.config.bachs!.products.proMonthly) return 'monthly';
    if (productId === this.config.bachs!.products.proYearly) return 'yearly';
    return stored ?? null;
  }

  private checkoutReturnUrls(projectId: string) {
    const dashboard = this.dashboardReturnBaseUrl();
    const dashboardUrl = new URL(dashboard);
    const loopback = dashboardUrl.hostname === 'localhost' || dashboardUrl.hostname === '127.0.0.1';
    if (!loopback) {
      return {
        successUrl: `${dashboard}/billing/success?projectId=${encodeURIComponent(projectId)}`,
        cancelUrl: `${dashboard}/dashboard/settings/billing?billing=cancelled&projectId=${encodeURIComponent(projectId)}`
      };
    }

    // Bachs requires public redirect URLs. In local dashboard development the
    // public API relays the customer back to the fixed localhost dashboard URL.
    const publicApi = this.validBaseUrl(process.env.BILLING_PUBLIC_API_URL, 'BILLING_PUBLIC_API_URL');
    if (new URL(publicApi).protocol !== 'https:') {
      throw new BadRequestException('BILLING_PUBLIC_API_URL must use HTTPS.');
    }
    return {
      successUrl: `${publicApi}/v1/billing/return?status=success&projectId=${encodeURIComponent(projectId)}`,
      cancelUrl: `${publicApi}/v1/billing/return?status=cancelled&projectId=${encodeURIComponent(projectId)}`
    };
  }

  private dashboardReturnBaseUrl() {
    return this.validBaseUrl(
      process.env.BILLING_DASHBOARD_RETURN_URL?.trim() || process.env.DASHBOARD_URL?.trim() || 'https://traceiq.run',
      'BILLING_DASHBOARD_RETURN_URL'
    );
  }

  private validBaseUrl(value: string | undefined, name: string) {
    if (!value) throw new BadRequestException(`${name} is required for this billing flow.`);
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException(`${name} must be an absolute URL.`);
    }
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
      throw new BadRequestException(`${name} must use HTTPS, except for a localhost development dashboard.`);
    }
    return url.toString().replace(/\/+$/, '');
  }
}
