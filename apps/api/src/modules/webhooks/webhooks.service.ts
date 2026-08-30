import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHmac, randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';
import { assertSafeFetchUrl } from '../../common/url';

type WebhookRow = {
  [column: string]: unknown;
  id: string;
  project_id: string;
  name: string;
  url: string;
  secret: string | null;
  event_names: string[] | null;
  enabled: boolean;
  last_status: string | null;
  last_delivered_at: string | null;
};

export interface CreateWebhookRequest {
  name?: string;
  url?: string;
  secret?: string;
  eventNames?: unknown;
  enabled?: boolean;
  projectId?: string;
}

export interface UpdateWebhookRequest {
  name?: string;
  url?: string;
  secret?: string;
  eventNames?: unknown;
  enabled?: boolean;
  projectId?: string;
}

// The compact event shape forwarded to subscribers.
export interface DeliverableEvent {
  id: string;
  eventName: string;
  userId: string | null;
  anonymousId: string | null;
  sessionId: string | null;
  properties: Record<string, unknown>;
  occurredAt: string;
}

const DELIVERY_TIMEOUT_MS = 8000;
// How long the per-project webhook list is cached on the ingestion hot path, so we
// don't hit the DB for every event. Changes propagate within this window (and
// immediately for the project whose webhooks were just edited).
const CACHE_TTL_MS = 10 * 1000;
// Keep the delivery log small — only the most recent attempts per webhook.
const DELIVERY_LOG_KEEP = 20;

@Injectable()
export class WebhooksService {
  // projectId -> { hooks, expiresAt }
  private cache = new Map<string, { hooks: WebhookRow[]; expiresAt: number }>();

  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService
  ) {}

  // -- Dashboard CRUD -----------------------------------------------------

  async list(user: DashboardUser, projectId?: string) {
    const project = await this.projects.resolveActiveProject(user, projectId);
    if (!project) return { project: null, webhooks: [], recentDeliveries: [] };

    const webhooks = await this.database.query<WebhookRow>(
      `SELECT * FROM webhooks WHERE project_id = $1 ORDER BY created_at DESC`,
      [project.id]
    );

    const deliveries = await this.database.query<{
      id: string;
      webhookId: string;
      webhookName: string;
      eventName: string | null;
      statusCode: number | null;
      ok: boolean;
      error: string | null;
      createdAt: string;
    }>(
      `
        SELECT wd.id, wd.webhook_id AS "webhookId", w.name AS "webhookName",
               wd.event_name AS "eventName", wd.status_code AS "statusCode",
               wd.ok, wd.error, wd.created_at AS "createdAt"
        FROM webhook_deliveries wd
        JOIN webhooks w ON w.id = wd.webhook_id
        WHERE wd.project_id = $1
        ORDER BY wd.created_at DESC
        LIMIT 30
      `,
      [project.id]
    );

    return {
      project,
      webhooks: webhooks.rows.map((row) => this.toDto(row)),
      recentDeliveries: deliveries.rows
    };
  }

  async create(user: DashboardUser, body: CreateWebhookRequest) {
    const project = await this.projects.requireWritableProject(user, body.projectId);

    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Webhook';
    const url = normalizeUrl(body.url);
    const secret = typeof body.secret === 'string' && body.secret.trim() ? body.secret.trim() : null;
    const eventNames = sanitizeEventNames(body.eventNames);

    const id = `whk_${randomUUID()}`;
    await this.database.query(
      `
        INSERT INTO webhooks (id, project_id, name, url, secret, event_names, enabled, created_by_user_id)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
      `,
      [id, project.id, name, url, secret, JSON.stringify(eventNames), body.enabled !== false, user.id]
    );
    this.cache.delete(project.id);
    return { id };
  }

  async update(user: DashboardUser, id: string, body: UpdateWebhookRequest) {
    const project = await this.projects.requireWritableProject(user, body.projectId);
    const current = await this.database.query<WebhookRow>(`SELECT * FROM webhooks WHERE id = $1 AND project_id = $2`, [
      id,
      project.id
    ]);
    const hook = current.rows[0];
    if (!hook) throw new NotFoundException('Webhook not found.');

    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : hook.name;
    const url = body.url === undefined ? hook.url : normalizeUrl(body.url);
    // undefined = keep, '' = clear, value = replace.
    const secret =
      body.secret === undefined ? hook.secret : body.secret.trim() ? body.secret.trim() : null;
    const eventNames = body.eventNames === undefined ? hook.event_names ?? [] : sanitizeEventNames(body.eventNames);
    const enabled = typeof body.enabled === 'boolean' ? body.enabled : hook.enabled;

    await this.database.query(
      `
        UPDATE webhooks
        SET name = $3, url = $4, secret = $5, event_names = $6::jsonb, enabled = $7, updated_at = now()
        WHERE id = $1 AND project_id = $2
      `,
      [id, project.id, name, url, secret, JSON.stringify(eventNames), enabled]
    );
    this.cache.delete(project.id);
    return { id };
  }

  async remove(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.projects.requireWritableProject(user, projectId);
    const result = await this.database.query(`DELETE FROM webhooks WHERE id = $1 AND project_id = $2`, [id, project.id]);
    if (result.rowCount === 0) throw new NotFoundException('Webhook not found.');
    this.cache.delete(project.id);
    return { deleted: true };
  }

  // Send a sample payload now so the user can confirm the endpoint + signature work.
  async test(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const result = await this.database.query<WebhookRow>(`SELECT * FROM webhooks WHERE id = $1 AND project_id = $2`, [
      id,
      project.id
    ]);
    const hook = result.rows[0];
    if (!hook) throw new NotFoundException('Webhook not found.');

    const sample: DeliverableEvent = {
      id: `evt_test_${randomUUID()}`,
      eventName: 'traceiq.webhook.test',
      userId: 'user_sample',
      anonymousId: null,
      sessionId: null,
      properties: { sample: true },
      occurredAt: new Date().toISOString()
    };
    const outcome = await this.deliver(hook, sample);
    return { ok: outcome.ok, statusCode: outcome.statusCode, error: outcome.error };
  }

  // -- Delivery (called from the ingestion path, fire-and-forget) ----------

  async deliverForEvent(projectId: string, event: DeliverableEvent): Promise<void> {
    let hooks: WebhookRow[];
    try {
      hooks = await this.getEnabledWebhooks(projectId);
    } catch {
      return; // never let webhook lookup interfere with ingestion
    }
    if (hooks.length === 0) return;

    const matching = hooks.filter(
      (h) => !Array.isArray(h.event_names) || h.event_names.length === 0 || h.event_names.includes(event.eventName)
    );
    await Promise.all(matching.map((h) => this.deliver(h, event).catch(() => undefined)));
  }

  private async getEnabledWebhooks(projectId: string): Promise<WebhookRow[]> {
    const cached = this.cache.get(projectId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.hooks;
    }
    const result = await this.database.query<WebhookRow>(
      `SELECT * FROM webhooks WHERE project_id = $1 AND enabled = true`,
      [projectId]
    );
    this.cache.set(projectId, { hooks: result.rows, expiresAt: Date.now() + CACHE_TTL_MS });
    return result.rows;
  }

  private async deliver(
    hook: WebhookRow,
    event: DeliverableEvent
  ): Promise<{ ok: boolean; statusCode: number | null; error: string | null }> {
    let ok = false;
    let statusCode: number | null = null;
    let error: string | null = null;

    if (typeof fetch !== 'function') {
      error = 'fetch is unavailable in this runtime';
    } else {
      const body = JSON.stringify({
        webhookId: hook.id,
        event: event.eventName,
        eventId: event.id,
        userId: event.userId,
        anonymousId: event.anonymousId,
        sessionId: event.sessionId,
        properties: event.properties,
        occurredAt: event.occurredAt,
        deliveredAt: new Date().toISOString()
      });
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (hook.secret) {
        headers['x-traceiq-signature'] = `sha256=${createHmac('sha256', hook.secret).update(body).digest('hex')}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
      try {
        const response = await fetch(hook.url, { method: 'POST', headers, body, signal: controller.signal });
        statusCode = response.status;
        ok = response.ok;
        if (!ok) error = `Endpoint responded ${response.status}`;
      } catch (err) {
        error = err instanceof Error ? err.message : 'delivery failed';
      } finally {
        clearTimeout(timeout);
      }
    }

    await this.recordDelivery(hook, event.eventName, ok, statusCode, error);
    return { ok, statusCode, error };
  }

  private async recordDelivery(
    hook: WebhookRow,
    eventName: string,
    ok: boolean,
    statusCode: number | null,
    error: string | null
  ): Promise<void> {
    try {
      await this.database.query(
        `
          INSERT INTO webhook_deliveries (id, webhook_id, project_id, event_name, status_code, ok, error)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [`whd_${randomUUID()}`, hook.id, hook.project_id, eventName, statusCode, ok, error]
      );
      await this.database.query(
        `UPDATE webhooks SET last_status = $2, last_delivered_at = now(), updated_at = now() WHERE id = $1`,
        [hook.id, ok ? 'success' : 'failed']
      );
      // Prune the log to the most recent N attempts for this webhook.
      await this.database.query(
        `
          DELETE FROM webhook_deliveries
          WHERE webhook_id = $1
            AND id NOT IN (
              SELECT id FROM webhook_deliveries WHERE webhook_id = $1 ORDER BY created_at DESC LIMIT $2
            )
        `,
        [hook.id, DELIVERY_LOG_KEEP]
      );
    } catch {
      // Logging is best-effort; never let it surface to the caller.
    }
  }

  private toDto(row: WebhookRow & { updated_at?: string }) {
    return {
      id: row.id,
      name: row.name,
      url: row.url,
      // Never send the secret back to the browser; just say whether one is set.
      hasSecret: Boolean(row.secret),
      eventNames: Array.isArray(row.event_names) ? row.event_names : [],
      enabled: row.enabled,
      lastStatus: row.last_status,
      lastDeliveredAt: row.last_delivered_at
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
    if (out.length >= 50) break;
  }
  return out;
}
