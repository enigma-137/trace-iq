import { Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';
import { assertDnsSafeUrl, assertSafeFetchUrl } from '../../common/url';

export type WebhookStatus = 'active' | 'paused' | 'failing' | 'disabled';

export type WebhookRow = {
  [column: string]: unknown;
  id: string;
  project_id: string;
  name: string;
  url: string;
  secret: string | null;
  previous_secret: string | null;
  secret_rotated_at: string | null;
  event_names: string[] | null;
  enabled: boolean;
  status: WebhookStatus;
  failure_count: number;
  description: string | null;
  last_status: string | null;
  last_delivered_at: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export interface CreateWebhookRequest {
  name?: string;
  url?: string;
  secret?: string;
  eventNames?: unknown;
  enabled?: boolean;
  status?: WebhookStatus;
  description?: string;
  projectId?: string;
}

export interface UpdateWebhookRequest {
  name?: string;
  url?: string;
  secret?: string;
  eventNames?: unknown;
  enabled?: boolean;
  status?: WebhookStatus;
  description?: string;
  projectId?: string;
}

export interface DeliverableEvent {
  id: string;
  eventName: string;
  userId: string | null;
  anonymousId: string | null;
  sessionId: string | null;
  properties: Record<string, unknown>;
  occurredAt: string;
}

export interface WebhookDeliveryAttemptRow {
  [column: string]: unknown;
  id: string;
  delivery_id: string;
  webhook_id: string;
  project_id: string;
  attempt_number: number;
  status_code: number | null;
  duration_ms: number | null;
  ok: boolean;
  error: string | null;
  response_headers: Record<string, string> | null;
  response_body: string | null;
  created_at: string;
}

export interface WebhookDeliveryRow {
  [column: string]: unknown;
  id: string;
  delivery_id: string;
  webhook_id: string;
  project_id: string;
  event_id: string | null;
  event_name: string | null;
  payload: Record<string, unknown> | null;
  request_headers: Record<string, string> | null;
  response_headers: Record<string, string> | null;
  response_body: string | null;
  status_code: number | null;
  duration_ms: number | null;
  ok: boolean;
  error: string | null;
  attempt: number;
  max_attempts: number;
  next_retry_at: string | null;
  status: 'success' | 'failed' | 'retrying' | 'pending';
  is_test: boolean;
  is_manual_retry: boolean;
  created_at: string;
  completed_at: string | null;
}

const DELIVERY_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BODY_CHARS = 4096;
const CACHE_TTL_MS = 10 * 1000;
const MAX_ATTEMPTS = 5;
const RETRY_SWEEP_INTERVAL_MS = 15_000;

// Retryable status codes
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

@Injectable()
export class WebhooksService implements OnModuleDestroy {
  // projectId -> { hooks, expiresAt }
  private cache = new Map<string, { hooks: WebhookRow[]; expiresAt: number }>();
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService
  ) {
    this.startRetrySweep();
  }

  onModuleDestroy() {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  private startRetrySweep() {
    this.sweepTimer = setInterval(() => {
      this.retryPendingDeliveries().catch(() => undefined);
    }, RETRY_SWEEP_INTERVAL_MS);
  }

  // -- Dashboard CRUD -----------------------------------------------------

  async list(user: DashboardUser, projectId?: string) {
    const project = await this.projects.resolveActiveProject(user, projectId);
    if (!project) {
      return {
        project: null,
        metrics: { activeEndpoints: 0, deliveriesToday: 0, failedDeliveries: 0, successRate: 100 },
        webhooks: [],
        recentDeliveries: []
      };
    }

    const webhooks = await this.database.query<WebhookRow>(
      `SELECT * FROM webhooks WHERE project_id = $1 AND archived_at IS NULL ORDER BY created_at DESC`,
      [project.id]
    );

    const metricsResult = await this.database.query<{
      active_count: string;
      total_24h: string;
      failed_24h: string;
      success_24h: string;
    }>(
      `
        SELECT
          (SELECT COUNT(*) FROM webhooks WHERE project_id = $1 AND status = 'active' AND archived_at IS NULL) AS active_count,
          (SELECT COUNT(*) FROM webhook_deliveries WHERE project_id = $1 AND created_at >= now() - interval '24 hours') AS total_24h,
          (SELECT COUNT(*) FROM webhook_deliveries WHERE project_id = $1 AND ok = false AND created_at >= now() - interval '24 hours') AS failed_24h,
          (SELECT COUNT(*) FROM webhook_deliveries WHERE project_id = $1 AND ok = true AND created_at >= now() - interval '24 hours') AS success_24h
      `,
      [project.id]
    );

    const metricsRow = metricsResult.rows[0];
    const total24h = Number(metricsRow?.total_24h ?? 0);
    const failed24h = Number(metricsRow?.failed_24h ?? 0);
    const success24h = Number(metricsRow?.success_24h ?? 0);
    const successRate = total24h > 0 ? Math.round((success24h / total24h) * 100) : 100;

    const deliveries = await this.database.query<{
      id: string;
      deliveryId: string;
      webhookId: string;
      webhookName: string;
      eventName: string | null;
      statusCode: number | null;
      durationMs: number | null;
      ok: boolean;
      status: string;
      error: string | null;
      attempt: number;
      createdAt: string;
    }>(
      `
        SELECT wd.id,
               COALESCE(wd.delivery_id, wd.id) AS "deliveryId",
               wd.webhook_id AS "webhookId",
               w.name AS "webhookName",
               wd.event_name AS "eventName",
               wd.status_code AS "statusCode",
               wd.duration_ms AS "durationMs",
               wd.ok,
               wd.status,
               wd.error,
               wd.attempt,
               wd.created_at AS "createdAt"
        FROM webhook_deliveries wd
        JOIN webhooks w ON w.id = wd.webhook_id
        WHERE wd.project_id = $1
        ORDER BY wd.created_at DESC
        LIMIT 50
      `,
      [project.id]
    );

    return {
      project,
      metrics: {
        activeEndpoints: Number(metricsRow?.active_count ?? 0),
        deliveriesToday: total24h,
        failedDeliveries: failed24h,
        successRate
      },
      webhooks: webhooks.rows.map((row) => this.toDto(row)),
      recentDeliveries: deliveries.rows
    };
  }

  async getWebhook(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const result = await this.database.query<WebhookRow>(
      `SELECT * FROM webhooks WHERE id = $1 AND project_id = $2 AND archived_at IS NULL`,
      [id, project.id]
    );
    const hook = result.rows[0];
    if (!hook) throw new NotFoundException('Webhook not found.');

    const metricsResult = await this.database.query<{
      total_24h: string;
      failed_24h: string;
      success_24h: string;
      avg_duration_ms: string | null;
    }>(
      `
        SELECT
          COUNT(*) AS total_24h,
          COUNT(*) FILTER (WHERE ok = false) AS failed_24h,
          COUNT(*) FILTER (WHERE ok = true) AS success_24h,
          AVG(duration_ms) FILTER (WHERE ok = true) AS avg_duration_ms
        FROM webhook_deliveries
        WHERE webhook_id = $1 AND created_at >= now() - interval '24 hours'
      `,
      [hook.id]
    );

    const m = metricsResult.rows[0];
    const total24h = Number(m?.total_24h ?? 0);
    const success24h = Number(m?.success_24h ?? 0);
    const successRate = total24h > 0 ? Math.round((success24h / total24h) * 100) : 100;

    return {
      webhook: this.toDto(hook),
      metrics: {
        deliveriesToday: total24h,
        failedDeliveries: Number(m?.failed_24h ?? 0),
        successRate,
        avgDurationMs: m?.avg_duration_ms ? Math.round(Number(m.avg_duration_ms)) : null
      }
    };
  }

  async create(user: DashboardUser, body: CreateWebhookRequest) {
    const project = await this.projects.requireWritableProject(user, body.projectId);

    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Webhook';
    const url = normalizeUrl(body.url);
    
    // Auto-generate signing secret if omitted or explicitly requested
    const generatedSecret = this.generateSigningSecret();
    const secret =
      typeof body.secret === 'string' && body.secret.trim() && body.secret.trim() !== 'auto'
        ? body.secret.trim()
        : generatedSecret;

    const eventNames = sanitizeEventNames(body.eventNames);
    const enabled = body.enabled !== false && body.status !== 'disabled' && body.status !== 'paused';
    const status: WebhookStatus = body.status ?? (enabled ? 'active' : 'disabled');
    const description = typeof body.description === 'string' ? body.description.trim() : null;

    const id = `whk_${randomUUID()}`;
    await this.database.query(
      `
        INSERT INTO webhooks (
          id, project_id, name, url, secret, event_names, enabled, status, description, created_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
      `,
      [id, project.id, name, url, secret, JSON.stringify(eventNames), enabled, status, description, user.id]
    );
    this.cache.delete(project.id);

    // Return the secret only on creation so user can copy it
    return { id, secret };
  }

  async update(user: DashboardUser, id: string, body: UpdateWebhookRequest) {
    const project = await this.projects.requireWritableProject(user, body.projectId);
    const current = await this.database.query<WebhookRow>(
      `SELECT * FROM webhooks WHERE id = $1 AND project_id = $2 AND archived_at IS NULL`,
      [id, project.id]
    );
    const hook = current.rows[0];
    if (!hook) throw new NotFoundException('Webhook not found.');

    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : hook.name;
    const url = body.url === undefined ? hook.url : normalizeUrl(body.url);
    const eventNames = body.eventNames === undefined ? hook.event_names ?? [] : sanitizeEventNames(body.eventNames);
    const description = body.description === undefined ? hook.description : body.description?.trim() || null;

    let status: WebhookStatus = hook.status;
    let enabled: boolean = hook.enabled;

    if (body.status !== undefined) {
      status = body.status;
      enabled = status === 'active' || status === 'failing';
    } else if (body.enabled !== undefined) {
      enabled = body.enabled;
      status = enabled ? (hook.failure_count >= 5 ? 'failing' : 'active') : 'disabled';
    }

    // Preserve secret unless explicitly provided
    let secret = hook.secret;
    if (body.secret !== undefined) {
      secret = body.secret.trim() ? body.secret.trim() : null;
    }

    await this.database.query(
      `
        UPDATE webhooks
        SET name = $3, url = $4, secret = $5, event_names = $6::jsonb, enabled = $7, status = $8, description = $9, updated_at = now()
        WHERE id = $1 AND project_id = $2
      `,
      [id, project.id, name, url, secret, JSON.stringify(eventNames), enabled, status, description]
    );
    this.cache.delete(project.id);
    return { id };
  }

  async rotateSecret(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.projects.requireWritableProject(user, projectId);
    const current = await this.database.query<WebhookRow>(
      `SELECT * FROM webhooks WHERE id = $1 AND project_id = $2 AND archived_at IS NULL`,
      [id, project.id]
    );
    const hook = current.rows[0];
    if (!hook) throw new NotFoundException('Webhook not found.');

    const newSecret = this.generateSigningSecret();
    const previousSecret = hook.secret;

    await this.database.query(
      `
        UPDATE webhooks
        SET secret = $3, previous_secret = $4, secret_rotated_at = now(), updated_at = now()
        WHERE id = $1 AND project_id = $2
      `,
      [id, project.id, newSecret, previousSecret]
    );
    this.cache.delete(project.id);

    return { id, secret: newSecret };
  }

  async remove(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.projects.requireWritableProject(user, projectId);
    const result = await this.database.query(
      `UPDATE webhooks SET archived_at = now(), enabled = false, status = 'disabled', updated_at = now() WHERE id = $1 AND project_id = $2`,
      [id, project.id]
    );
    if (result.rowCount === 0) throw new NotFoundException('Webhook not found.');
    this.cache.delete(project.id);
    return { deleted: true };
  }

  // -- Test Webhook -------------------------------------------------------

  async test(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const result = await this.database.query<WebhookRow>(
      `SELECT * FROM webhooks WHERE id = $1 AND project_id = $2 AND archived_at IS NULL`,
      [id, project.id]
    );
    const hook = result.rows[0];
    if (!hook) throw new NotFoundException('Webhook not found.');

    const sampleEvent: DeliverableEvent = {
      id: `evt_test_${randomUUID()}`,
      eventName: '$webhook_test',
      userId: user.id,
      anonymousId: null,
      sessionId: null,
      properties: {
        message: 'Test delivery from TraceIQ',
        test: true,
        webhookId: hook.id,
        webhookName: hook.name
      },
      occurredAt: new Date().toISOString()
    };

    const deliveryId = `whd_test_${randomUUID()}`;
    const outcome = await this.executeDelivery(hook, sampleEvent, deliveryId, 1, true, false);

    return {
      deliveryId,
      ok: outcome.ok,
      statusCode: outcome.statusCode,
      durationMs: outcome.durationMs,
      error: outcome.error,
      request: {
        headers: outcome.requestHeaders,
        payload: outcome.payload
      },
      response: {
        headers: outcome.responseHeaders,
        body: outcome.responseBody
      }
    };
  }

  // -- Delivery History & Inspection --------------------------------------

  async listDeliveries(
    user: DashboardUser,
    webhookId: string,
    query: { status?: string; event?: string; limit?: string; offset?: string; projectId?: string }
  ) {
    const project = await this.projects.requireActiveProject(user, query.projectId);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const offset = Math.max(Number(query.offset) || 0, 0);

    const conditions: string[] = ['wd.webhook_id = $1', 'wd.project_id = $2'];
    const values: unknown[] = [webhookId, project.id];

    if (query.status === 'success') {
      conditions.push('wd.ok = true');
    } else if (query.status === 'failed') {
      conditions.push('wd.ok = false AND wd.status = \'failed\'');
    } else if (query.status === 'retrying') {
      conditions.push('wd.status = \'retrying\'');
    }

    if (query.event && query.event.trim()) {
      values.push(query.event.trim());
      conditions.push(`wd.event_name = $${values.length}`);
    }

    values.push(limit);
    const limitParam = `$${values.length}`;
    values.push(offset);
    const offsetParam = `$${values.length}`;

    const rowsResult = await this.database.query<WebhookDeliveryRow>(
      `
        SELECT wd.id,
               COALESCE(wd.delivery_id, wd.id) AS delivery_id,
               wd.webhook_id,
               wd.project_id,
               wd.event_id,
               wd.event_name,
               wd.status_code,
               wd.duration_ms,
               wd.ok,
               wd.error,
               wd.attempt,
               wd.max_attempts,
               wd.next_retry_at,
               wd.status,
               wd.is_test,
               wd.is_manual_retry,
               wd.created_at,
               wd.completed_at
        FROM webhook_deliveries wd
        WHERE ${conditions.join(' AND ')}
        ORDER BY wd.created_at DESC
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `,
      values
    );

    const countResult = await this.database.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM webhook_deliveries wd WHERE ${conditions.slice(0, -2).join(' AND ')}`,
      values.slice(0, -2)
    );

    return {
      deliveries: rowsResult.rows.map((row) => ({
        id: row.id,
        deliveryId: row.delivery_id,
        webhookId: row.webhook_id,
        eventName: row.event_name,
        statusCode: row.status_code,
        durationMs: row.duration_ms,
        ok: row.ok,
        status: row.status,
        error: row.error,
        attempt: row.attempt,
        maxAttempts: row.max_attempts,
        nextRetryAt: row.next_retry_at,
        isTest: row.is_test,
        isManualRetry: row.is_manual_retry,
        createdAt: row.created_at,
        completedAt: row.completed_at
      })),
      total: Number(countResult.rows[0]?.total ?? 0),
      limit,
      offset
    };
  }

  async getDeliveryDetails(user: DashboardUser, deliveryId: string, projectId?: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const deliveryResult = await this.database.query<WebhookDeliveryRow>(
      `
        SELECT wd.*, w.name AS webhook_name, w.url AS webhook_url
        FROM webhook_deliveries wd
        JOIN webhooks w ON w.id = wd.webhook_id
        WHERE (wd.id = $1 OR wd.delivery_id = $1) AND wd.project_id = $2
        LIMIT 1
      `,
      [deliveryId, project.id]
    );
    const delivery = deliveryResult.rows[0];
    if (!delivery) throw new NotFoundException('Delivery not found.');

    const attemptsResult = await this.database.query<WebhookDeliveryAttemptRow>(
      `
        SELECT *
        FROM webhook_delivery_attempts
        WHERE delivery_id = $1
        ORDER BY attempt_number ASC
      `,
      [delivery.id]
    );

    return {
      delivery: {
        id: delivery.id,
        deliveryId: delivery.delivery_id ?? delivery.id,
        webhookId: delivery.webhook_id,
        webhookName: (delivery as unknown as { webhook_name: string }).webhook_name,
        webhookUrl: (delivery as unknown as { webhook_url: string }).webhook_url,
        eventId: delivery.event_id,
        eventName: delivery.event_name,
        statusCode: delivery.status_code,
        durationMs: delivery.duration_ms,
        ok: delivery.ok,
        status: delivery.status,
        error: delivery.error,
        attempt: delivery.attempt,
        maxAttempts: delivery.max_attempts,
        nextRetryAt: delivery.next_retry_at,
        isTest: delivery.is_test,
        isManualRetry: delivery.is_manual_retry,
        payload: delivery.payload,
        requestHeaders: delivery.request_headers,
        responseHeaders: delivery.response_headers,
        responseBody: delivery.response_body,
        createdAt: delivery.created_at,
        completedAt: delivery.completed_at
      },
      attempts: attemptsResult.rows.map((att) => ({
        id: att.id,
        attemptNumber: att.attempt_number,
        statusCode: att.status_code,
        durationMs: att.duration_ms,
        ok: att.ok,
        error: att.error,
        responseHeaders: att.response_headers,
        responseBody: att.response_body,
        createdAt: att.created_at
      }))
    };
  }

  async retryDelivery(user: DashboardUser, deliveryId: string, projectId?: string) {
    const project = await this.projects.requireWritableProject(user, projectId);
    const deliveryResult = await this.database.query<WebhookDeliveryRow>(
      `
        SELECT * FROM webhook_deliveries
        WHERE (id = $1 OR delivery_id = $1) AND project_id = $2
        LIMIT 1
      `,
      [deliveryId, project.id]
    );
    const delivery = deliveryResult.rows[0];
    if (!delivery) throw new NotFoundException('Delivery not found.');

    const hookResult = await this.database.query<WebhookRow>(
      `SELECT * FROM webhooks WHERE id = $1 AND project_id = $2 AND archived_at IS NULL`,
      [delivery.webhook_id, project.id]
    );
    const hook = hookResult.rows[0];
    if (!hook) throw new NotFoundException('Target webhook no longer exists.');

    const event: DeliverableEvent = {
      id: delivery.event_id ?? `evt_${randomUUID()}`,
      eventName: delivery.event_name ?? 'unknown_event',
      userId: null,
      anonymousId: null,
      sessionId: null,
      properties: (delivery.payload?.properties as Record<string, unknown>) ?? {},
      occurredAt: (delivery.payload?.occurredAt as string) ?? delivery.created_at
    };

    const nextAttemptNumber = delivery.attempt + 1;
    const outcome = await this.executeDelivery(
      hook,
      event,
      delivery.delivery_id ?? delivery.id,
      nextAttemptNumber,
      delivery.is_test,
      true,
      delivery.id
    );

    return {
      deliveryId: delivery.delivery_id ?? delivery.id,
      ok: outcome.ok,
      statusCode: outcome.statusCode,
      durationMs: outcome.durationMs,
      error: outcome.error,
      attempt: nextAttemptNumber
    };
  }

  // -- Event Ingestion Dispatching (Asynchronous & Non-blocking) ----------

  async deliverForEvent(projectId: string, event: DeliverableEvent): Promise<void> {
    let hooks: WebhookRow[];
    try {
      hooks = await this.getActiveWebhooks(projectId);
    } catch {
      return; // Never let webhook lookup interfere with ingestion
    }
    if (hooks.length === 0) return;

    const matching = hooks.filter(
      (h) => !Array.isArray(h.event_names) || h.event_names.length === 0 || h.event_names.includes(event.eventName)
    );
    if (matching.length === 0) return;

    // Dispatch deliveries asynchronously in the background
    for (const hook of matching) {
      const deliveryId = `whd_${randomUUID()}`;
      void this.executeDelivery(hook, event, deliveryId, 1, false, false).catch(() => undefined);
    }
  }

  private async getActiveWebhooks(projectId: string): Promise<WebhookRow[]> {
    const cached = this.cache.get(projectId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.hooks;
    }
    const result = await this.database.query<WebhookRow>(
      `SELECT * FROM webhooks WHERE project_id = $1 AND (status = 'active' OR status = 'failing') AND enabled = true AND archived_at IS NULL`,
      [projectId]
    );
    this.cache.set(projectId, { hooks: result.rows, expiresAt: Date.now() + CACHE_TTL_MS });
    return result.rows;
  }

  // -- Core Delivery Execution -------------------------------------------

  private async executeDelivery(
    hook: WebhookRow,
    event: DeliverableEvent,
    deliveryId: string,
    attemptNumber = 1,
    isTest = false,
    isManualRetry = false,
    existingRowId?: string
  ): Promise<{
    ok: boolean;
    statusCode: number | null;
    durationMs: number;
    error: string | null;
    requestHeaders: Record<string, string>;
    responseHeaders: Record<string, string>;
    responseBody: string | null;
    payload: Record<string, unknown>;
  }> {
    const startTime = Date.now();
    let ok = false;
    let statusCode: number | null = null;
    let error: string | null = null;
    const responseHeaders: Record<string, string> = {};
    let responseBody: string | null = null;

    const timestampIso = new Date().toISOString();
    const payload = {
      id: event.id,
      event: event.eventName,
      timestamp: event.occurredAt,
      project_id: hook.project_id,
      user_id: event.userId,
      anonymous_id: event.anonymousId,
      session_id: event.sessionId,
      properties: event.properties,
      context: {
        delivery_id: deliveryId,
        attempt: attemptNumber,
        webhook_id: hook.id
      }
    };
    const rawBody = JSON.stringify(payload);

    const requestHeaders: Record<string, string> = {
      'content-type': 'application/json',
      'user-agent': 'TraceIQ-Webhooks/1.0',
      'x-traceiq-event': event.eventName,
      'x-traceiq-delivery-id': deliveryId,
      'x-traceiq-timestamp': timestampIso
    };

    if (hook.secret) {
      // Modern signature: HMAC(secret, timestamp + "." + rawBody)
      const modernSignature = createHmac('sha256', hook.secret)
        .update(`${timestampIso}.${rawBody}`)
        .digest('hex');
      requestHeaders['x-traceiq-signature'] = `sha256=${modernSignature}`;

      // Legacy signature for backward compatibility: HMAC(secret, rawBody)
      const legacySignature = createHmac('sha256', hook.secret).update(rawBody).digest('hex');
      requestHeaders['x-traceiq-signature-legacy'] = `sha256=${legacySignature}`;
    }

    try {
      // Verify DNS safety before fetch (SSRF & DNS rebinding protection)
      await assertDnsSafeUrl(hook.url);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

      try {
        const response = await fetch(hook.url, {
          method: 'POST',
          headers: requestHeaders,
          body: rawBody,
          signal: controller.signal,
          redirect: 'follow'
        });

        statusCode = response.status;
        ok = response.ok;

        response.headers.forEach((val, key) => {
          if (!key.toLowerCase().includes('cookie') && !key.toLowerCase().includes('auth')) {
            responseHeaders[key] = val;
          }
        });

        try {
          const text = await response.text();
          responseBody = text.length > MAX_RESPONSE_BODY_CHARS
            ? text.slice(0, MAX_RESPONSE_BODY_CHARS) + '\n... [Response body truncated]'
            : text;
        } catch {
          responseBody = null;
        }

        if (!ok) {
          error = `Endpoint responded with HTTP ${statusCode}`;
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      if (err instanceof Error) {
        error = err.name === 'AbortError' ? 'Delivery timed out after 10s' : err.message;
      } else {
        error = 'Delivery failed';
      }
    }

    const durationMs = Date.now() - startTime;

    // Retry determination
    const isRetryable =
      !ok &&
      !isTest &&
      attemptNumber < MAX_ATTEMPTS &&
      (statusCode === null || RETRYABLE_STATUS_CODES.has(statusCode));

    let nextRetryAt: string | null = null;
    let finalStatus: 'success' | 'failed' | 'retrying' = ok ? 'success' : 'failed';

    if (isRetryable) {
      finalStatus = 'retrying';
      // Exponential backoff with jitter
      const backoffSec = this.calculateBackoff(attemptNumber);
      nextRetryAt = new Date(Date.now() + backoffSec * 1000).toISOString();
    }

    await this.persistDeliveryAndAttempt({
      hook,
      deliveryId,
      existingRowId,
      event,
      payload,
      requestHeaders,
      responseHeaders,
      responseBody,
      statusCode,
      durationMs,
      ok,
      error,
      attemptNumber,
      finalStatus,
      nextRetryAt,
      isTest,
      isManualRetry
    });

    return {
      ok,
      statusCode,
      durationMs,
      error,
      requestHeaders,
      responseHeaders,
      responseBody,
      payload
    };
  }

  private calculateBackoff(attemptNumber: number): number {
    // Attempt 1 -> 2: 60s + (0-15s)
    // Attempt 2 -> 3: 300s (5m)
    // Attempt 3 -> 4: 1800s (30m)
    // Attempt 4 -> 5: 7200s (2h)
    const jitter = Math.floor(Math.random() * 15);
    switch (attemptNumber) {
      case 1:
        return 60 + jitter;
      case 2:
        return 300 + jitter;
      case 3:
        return 1800 + jitter;
      case 4:
        return 7200 + jitter;
      default:
        return 14400;
    }
  }

  private async persistDeliveryAndAttempt(data: {
    hook: WebhookRow;
    deliveryId: string;
    existingRowId?: string;
    event: DeliverableEvent;
    payload: Record<string, unknown>;
    requestHeaders: Record<string, string>;
    responseHeaders: Record<string, string>;
    responseBody: string | null;
    statusCode: number | null;
    durationMs: number;
    ok: boolean;
    error: string | null;
    attemptNumber: number;
    finalStatus: 'success' | 'failed' | 'retrying';
    nextRetryAt: string | null;
    isTest: boolean;
    isManualRetry: boolean;
  }): Promise<void> {
    try {
      const rowId = data.existingRowId ?? `whd_${randomUUID()}`;
      const attemptId = `wha_${randomUUID()}`;

      if (data.existingRowId) {
        await this.database.query(
          `
            UPDATE webhook_deliveries
            SET status_code = $2,
                duration_ms = $3,
                ok = $4,
                error = $5,
                attempt = $6,
                next_retry_at = $7,
                status = $8,
                response_headers = $9::jsonb,
                response_body = $10,
                completed_at = CASE WHEN $4 = true OR $8 = 'failed' THEN now() ELSE completed_at END
            WHERE id = $1
          `,
          [
            rowId,
            data.statusCode,
            data.durationMs,
            data.ok,
            data.error,
            data.attemptNumber,
            data.nextRetryAt,
            data.finalStatus,
            JSON.stringify(data.responseHeaders),
            data.responseBody
          ]
        );
      } else {
        await this.database.query(
          `
            INSERT INTO webhook_deliveries (
              id, delivery_id, webhook_id, project_id, event_id, event_name,
              payload, request_headers, response_headers, response_body,
              status_code, duration_ms, ok, error, attempt, max_attempts,
              next_retry_at, status, is_test, is_manual_retry, completed_at
            )
            VALUES (
              $1, $2, $3, $4, $5, $6,
              $7::jsonb, $8::jsonb, $9::jsonb, $10,
              $11, $12, $13, $14, $15, $16,
              $17, $18, $19, $20,
              CASE WHEN $13 = true OR $18 = 'failed' THEN now() ELSE NULL END
            )
          `,
          [
            rowId,
            data.deliveryId,
            data.hook.id,
            data.hook.project_id,
            data.event.id,
            data.event.eventName,
            JSON.stringify(data.payload),
            JSON.stringify(data.requestHeaders),
            JSON.stringify(data.responseHeaders),
            data.responseBody,
            data.statusCode,
            data.durationMs,
            data.ok,
            data.error,
            data.attemptNumber,
            MAX_ATTEMPTS,
            data.nextRetryAt,
            data.finalStatus,
            data.isTest,
            data.isManualRetry
          ]
        );
      }

      // Record detailed attempt log
      await this.database.query(
        `
          INSERT INTO webhook_delivery_attempts (
            id, delivery_id, webhook_id, project_id, attempt_number,
            status_code, duration_ms, ok, error, response_headers, response_body
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
        `,
        [
          attemptId,
          rowId,
          data.hook.id,
          data.hook.project_id,
          data.attemptNumber,
          data.statusCode,
          data.durationMs,
          data.ok,
          data.error,
          JSON.stringify(data.responseHeaders),
          data.responseBody
        ]
      );

      // Update Webhook failure_count and health status
      if (data.ok) {
        await this.database.query(
          `
            UPDATE webhooks
            SET last_status = 'success',
                last_delivered_at = now(),
                failure_count = 0,
                status = CASE WHEN status = 'failing' THEN 'active' ELSE status END,
                updated_at = now()
            WHERE id = $1
          `,
          [data.hook.id]
        );
      } else if (!data.isTest) {
        await this.database.query(
          `
            UPDATE webhooks
            SET last_status = 'failed',
                last_delivered_at = now(),
                failure_count = failure_count + 1,
                status = CASE WHEN failure_count + 1 >= 5 AND status = 'active' THEN 'failing' ELSE status END,
                updated_at = now()
            WHERE id = $1
          `,
          [data.hook.id]
        );
      }
    } catch {
      // Database recording is best effort; don't throw to caller
    }
  }

  // -- Retry Sweeper ------------------------------------------------------

  async retryPendingDeliveries(limit = 20): Promise<void> {
    try {
      const pendingResult = await this.database.query<WebhookDeliveryRow & { hook_url: string; hook_secret: string; hook_status: string }>(
        `
          SELECT wd.*, w.url AS hook_url, w.secret AS hook_secret, w.status AS hook_status
          FROM webhook_deliveries wd
          JOIN webhooks w ON w.id = wd.webhook_id
          WHERE wd.status = 'retrying'
            AND wd.next_retry_at <= now()
            AND w.archived_at IS NULL
            AND w.status != 'paused'
            AND w.status != 'disabled'
          ORDER BY wd.next_retry_at ASC
          LIMIT $1
        `,
        [limit]
      );

      for (const row of pendingResult.rows) {
        const hook: WebhookRow = {
          id: row.webhook_id,
          project_id: row.project_id,
          name: '',
          url: row.hook_url,
          secret: row.hook_secret,
          previous_secret: null,
          secret_rotated_at: null,
          event_names: null,
          enabled: true,
          status: row.hook_status as WebhookStatus,
          failure_count: 0,
          description: null,
          last_status: null,
          last_delivered_at: null,
          created_at: '',
          updated_at: '',
          archived_at: null
        };

        const event: DeliverableEvent = {
          id: row.event_id ?? `evt_${randomUUID()}`,
          eventName: row.event_name ?? 'event',
          userId: null,
          anonymousId: null,
          sessionId: null,
          properties: (row.payload?.properties as Record<string, unknown>) ?? {},
          occurredAt: (row.payload?.occurredAt as string) ?? row.created_at
        };

        const nextAttempt = row.attempt + 1;
        await this.executeDelivery(hook, event, row.delivery_id ?? row.id, nextAttempt, row.is_test, false, row.id);
      }
    } catch {
      // Best effort background sweep
    }
  }

  // -- Helpers ------------------------------------------------------------

  private generateSigningSecret(): string {
    return `whsec_${randomBytes(24).toString('hex')}`;
  }

  private toDto(row: WebhookRow) {
    return {
      id: row.id,
      name: row.name,
      url: row.url,
      hasSecret: Boolean(row.secret),
      secretRotatedAt: row.secret_rotated_at,
      hasPreviousSecret: Boolean(row.previous_secret),
      eventNames: Array.isArray(row.event_names) ? row.event_names : [],
      enabled: row.enabled,
      status: row.status ?? (row.enabled ? 'active' : 'disabled'),
      failureCount: Number(row.failure_count ?? 0),
      description: row.description,
      lastStatus: row.last_status,
      lastDeliveredAt: row.last_delivered_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

function normalizeUrl(input: unknown): string {
  return assertSafeFetchUrl(input);
}

function sanitizeEventNames(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const value of input) {
    if (typeof value !== 'string') continue;
    const name = value.trim();
    if (name && !out.includes(name)) out.push(name);
    if (out.length >= 100) break;
  }
  return out;
}
