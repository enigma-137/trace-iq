import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnApplicationShutdown, Optional } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { QueryResultRow } from 'pg';
import { appConfig } from '../../config/app.config';
import { DatabaseService, QueryExecutor } from '../../database/database.service';
import { CLOUD_BILLING_POLICY } from './plan-catalog';
import { BachsClient, BachsSubscription } from './bachs.client';
import { EmailService, isValidEmail } from '../emails/email.service';

export interface BachsEvent {
  id: string;
  type: string;
  created_at: string;
  data: BachsSubscription | BachsCheckoutCompleted | BachsInvoiceEvent;
}

interface BachsCheckoutCompleted {
  checkout_id: string;
  status: string;
  payment_status: string;
  customer: { customer_id: string; email?: string } | null;
  subscription: { subscription_id: string } | null;
  metadata?: Record<string, unknown>;
}

interface BachsInvoiceEvent {
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
  current_period_end: string | null;
  subscription_change_status: 'pending' | 'failed' | null;
}

interface WelcomeDeliveryRow extends QueryResultRow {
  id: string;
  organization_name: string;
  provider_subscription_id: string;
  recipient: string;
  billing_period: BillingPeriod | null;
}

@Injectable()
export class BillingService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BillingService.name);
  private reconciliationTimer?: NodeJS.Timeout;
  constructor(
    private readonly database: DatabaseService,
    private readonly bachs: BachsClient,
    @Optional() private readonly config: Pick<typeof appConfig, 'deploymentMode' | 'bachs'> = appConfig,
    @Optional() private readonly email?: EmailService
  ) {}

  onApplicationBootstrap() {
    if (this.config.deploymentMode !== 'cloud') return;
    void this.retryPendingWelcomeEmails().catch((error) => {
      this.logger.error('Billing welcome email retry failed.', error instanceof Error ? error.stack : error);
    });
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
        SELECT id,provider_subscription_id,provider_product_id,billing_period,status,current_period_end,subscription_change_status
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
          changeStatus: null, effectiveAt: null, subscriptionStatus: current.status
        };
      }
      if (currentPeriod !== 'monthly') throw new ConflictException('The active subscription product is not a recognized monthly Pro product.');
      if (current.subscription_change_status === 'pending') {
        throw new ConflictException('Yearly billing is already scheduled for this organization.');
      }
      if (current.status !== 'active' && current.status !== 'trialing') {
        throw new ConflictException('Resolve the current subscription status before changing its billing period.');
      }
      const requestedAt = new Date().toISOString();
      await this.bachs.updateSubscription(
        current.provider_subscription_id,
        { product_id: this.config.bachs!.products.proYearly },
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
        changeStatus: 'scheduled' as const, effectiveAt: current.current_period_end,
        subscriptionStatus: current.status
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
      let welcomeDeliveryId: string | null = null;
      await this.database.transaction(async (client) => {
        if (event.type === 'checkout.completed') {
          welcomeDeliveryId = await this.applyCompletedCheckout(client, event, checkoutSubscription);
        } else if (event.type.startsWith('customer.subscription.')) {
          welcomeDeliveryId = await this.upsertSubscription(client, event);
        }
        await client.query(`UPDATE billing_webhook_events SET processing_status = 'processed', processed_at = now() WHERE provider = 'bachs' AND provider_event_id = $1`, [event.id]);
      });
      if (welcomeDeliveryId) {
        await this.deliverWelcomeEmail(welcomeDeliveryId).catch((error) => {
          this.logger.error('Could not deliver the Pro welcome email.', error instanceof Error ? error.stack : error);
        });
      }
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
    await this.retryPendingWelcomeEmails();
    return { reconciled };
  }

  private async upsertSubscription(executor: QueryExecutor, event: BachsEvent, reconciliation = false): Promise<string | null> {
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
        return this.upsertSubscription(executor, event, true);
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
    const upserted = await executor.query(`
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
          WHEN $16::boolean AND (
            EXCLUDED.provider_product_id = subscriptions.subscription_change_target_product_id
            OR EXCLUDED.cancel_at_period_end
            OR EXCLUDED.status IN ('canceled', 'unpaid')
          )
            THEN NULL
          ELSE subscriptions.subscription_change_status
        END,
        subscription_change_target_product_id = CASE
          WHEN $16::boolean AND (
            EXCLUDED.provider_product_id = subscriptions.subscription_change_target_product_id
            OR EXCLUDED.cancel_at_period_end
            OR EXCLUDED.status IN ('canceled', 'unpaid')
          )
            THEN NULL
          ELSE subscriptions.subscription_change_target_product_id
        END,
        subscription_change_target_billing_period = CASE
          WHEN $16::boolean AND (
            EXCLUDED.provider_product_id = subscriptions.subscription_change_target_product_id
            OR EXCLUDED.cancel_at_period_end
            OR EXCLUDED.status IN ('canceled', 'unpaid')
          )
            THEN NULL
          ELSE subscriptions.subscription_change_target_billing_period
        END,
        subscription_change_requested_at = CASE
          WHEN $16::boolean AND (
            EXCLUDED.provider_product_id = subscriptions.subscription_change_target_product_id
            OR EXCLUDED.cancel_at_period_end
            OR EXCLUDED.status IN ('canceled', 'unpaid')
          )
            THEN NULL
          ELSE subscriptions.subscription_change_requested_at
        END,
        subscription_change_failure_code = CASE
          WHEN $16::boolean AND (
            EXCLUDED.provider_product_id = subscriptions.subscription_change_target_product_id
            OR EXCLUDED.cancel_at_period_end
            OR EXCLUDED.status IN ('canceled', 'unpaid')
          )
            THEN NULL
          ELSE subscriptions.subscription_change_failure_code
        END,
        subscription_change_failure_at = CASE
          WHEN $16::boolean AND (
            EXCLUDED.provider_product_id = subscriptions.subscription_change_target_product_id
            OR EXCLUDED.cancel_at_period_end
            OR EXCLUDED.status IN ('canceled', 'unpaid')
          )
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
      RETURNING provider_subscription_id
    `, [
      `sub_${randomUUID()}`, organizationId, subscriptionId, productId, billingPeriod, data.status,
      data.currency ?? null, data.amount ?? null, data.current_period_start ?? null, data.current_period_end ?? null,
      data.cancel_at_period_end ?? false, data.canceled_at ?? null, graceEnd, event.created_at,
      JSON.stringify(metadata),
      ['customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type) && !reconciliation,
      reconciliation
    ]);
    if (!this.email || reconciliation || event.type !== 'customer.subscription.created'
      || !['active', 'trialing'].includes(data.status) || upserted.rowCount === 0) {
      return null;
    }
    return this.enqueueWelcomeEmail(executor, {
      organizationId,
      subscriptionId,
      billingPeriod,
      providerEmail: data.customer.email
    });
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

  private async applyCompletedCheckout(executor: QueryExecutor, event: BachsEvent, subscription: BachsSubscription | null): Promise<string | null> {
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
      return this.upsertSubscription(executor, {
        id: event.id, type: 'customer.subscription.created', created_at: event.created_at, data: subscription
      });
    }
    return null;
  }

  private async enqueueWelcomeEmail(executor: QueryExecutor, input: {
    organizationId: string;
    subscriptionId: string;
    billingPeriod: BillingPeriod | null;
    providerEmail?: string;
  }): Promise<string | null> {
    let recipient = input.providerEmail?.trim().toLowerCase() ?? '';
    if (!isValidEmail(recipient)) {
      const owner = await executor.query<{ email: string | null }>(`
        SELECT email FROM organization_members
        WHERE organization_id = $1 AND role = 'owner' AND email IS NOT NULL
        ORDER BY created_at ASC LIMIT 1
      `, [input.organizationId]);
      recipient = owner.rows[0]?.email?.trim().toLowerCase() ?? '';
    }
    if (!isValidEmail(recipient)) return null;
    const delivery = await executor.query<{ id: string }>(`
      INSERT INTO billing_email_deliveries (
        id, organization_id, provider, provider_subscription_id,
        email_kind, recipient, billing_period
      ) VALUES ($1, $2, 'bachs', $3, 'pro_welcome', $4, $5)
      ON CONFLICT (provider, provider_subscription_id, email_kind) DO NOTHING
      RETURNING id
    `, [`bem_${randomUUID()}`, input.organizationId, input.subscriptionId, recipient, input.billingPeriod]);
    return delivery.rows[0]?.id ?? null;
  }

  private async retryPendingWelcomeEmails(limit = 25) {
    if (!this.email) return;
    const pending = await this.database.query<{ id: string }>(`
      SELECT id FROM billing_email_deliveries
      WHERE (status IN ('pending', 'failed') AND next_attempt_at <= now())
        OR (status = 'sending' AND attempted_at < now() - interval '15 minutes')
      ORDER BY created_at ASC LIMIT $1
    `, [limit]);
    for (const row of pending.rows) {
      await this.deliverWelcomeEmail(row.id).catch((error) => {
        this.logger.error(`Billing welcome email ${row.id} failed.`, error instanceof Error ? error.stack : error);
      });
    }
  }

  private async deliverWelcomeEmail(deliveryId: string) {
    if (!this.email) return;
    const claimed = await this.database.query<WelcomeDeliveryRow>(`
      UPDATE billing_email_deliveries d SET
        status = 'sending', attempt_count = attempt_count + 1,
        attempted_at = now(), updated_at = now(), error = NULL
      FROM organizations o
      WHERE d.id = $1 AND d.organization_id = o.id
        AND ((d.status IN ('pending', 'failed') AND d.next_attempt_at <= now())
          OR (d.status = 'sending' AND d.attempted_at < now() - interval '15 minutes'))
      RETURNING d.id, o.name AS organization_name, d.provider_subscription_id,
        d.recipient, d.billing_period
    `, [deliveryId]);
    const delivery = claimed.rows[0];
    if (!delivery) return;
    const dashboardUrl = `${this.dashboardReturnBaseUrl()}/dashboard/settings/billing`;
    const result = await this.email.send({
      to: [delivery.recipient],
      subject: 'Welcome to TraceIQ Pro',
      html: buildProWelcomeEmail({
        organizationName: delivery.organization_name,
        billingPeriod: delivery.billing_period,
        dashboardUrl
      }),
      idempotencyKey: `traceiq-pro-welcome-${delivery.provider_subscription_id}`
    });
    if (result.ok) {
      await this.database.query(`
        UPDATE billing_email_deliveries SET status = 'sent', sent_at = now(),
          updated_at = now(), error = NULL WHERE id = $1
      `, [deliveryId]);
      return;
    }
    await this.database.query(`
      UPDATE billing_email_deliveries SET status = 'failed', error = $2,
        next_attempt_at = now() + interval '15 minutes', updated_at = now()
      WHERE id = $1
    `, [deliveryId, (result.failure ?? 'Unknown email delivery failure').slice(0, 500)]);
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

export function buildProWelcomeEmail(input: {
  organizationName: string;
  billingPeriod: BillingPeriod | null;
  dashboardUrl: string;
}) {
  const organization = escapeHtml(input.organizationName || 'Your organization');
  const interval = input.billingPeriod === 'yearly'
    ? '$190/year'
    : input.billingPeriod === 'monthly' ? '$19/month' : 'your selected billing interval';
  const dashboardUrl = escapeHtml(input.dashboardUrl);
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f5f7fb;color:#111827;font-family:Arial,sans-serif">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;background:#f5f7fb">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
          <tr><td style="padding:32px">
            <p style="margin:0 0 10px;color:#2563eb;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">TraceIQ Pro</p>
            <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2">Welcome to Pro.</h1>
            <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.65">Your Pro subscription for <strong>${organization}</strong> is active at <strong>${interval}</strong>.</p>
            <p style="margin:0 0 24px;color:#4b5563;font-size:16px;line-height:1.65">You now have higher limits for events, projects, team members, retention, and Ask TraceIQ investigations.</p>
            <a href="${dashboardUrl}" style="display:inline-block;border-radius:8px;background:#2563eb;color:#ffffff;padding:12px 18px;text-decoration:none;font-size:14px;font-weight:700">Open TraceIQ</a>
            <p style="margin:28px 0 0;color:#6b7280;font-size:13px;line-height:1.6">Thanks for supporting TraceIQ. We are glad to have you with us.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character] ?? character);
}
