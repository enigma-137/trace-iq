import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';
import { FilterCondition, buildFilterClause, sanitizeFilters } from '../../common/filters';
import { ALLOWED_MEASURES, TrendMeasure, buildMeasureExpr } from '../../common/measures';
import { EmailService, toUniqueEmails } from '../emails/email.service';
import { NotificationGroupsService } from './notification-groups.service';
import { assertSafeFetchUrl } from '../../common/url';
import { EntitlementService } from '../billing/entitlement.service';

type AlertCondition = 'above' | 'below' | 'drops_by' | 'spikes_by';
const ALLOWED_CONDITIONS: AlertCondition[] = ['above', 'below', 'drops_by', 'spikes_by'];

// How often the background evaluator runs, and the minimum gap between evaluations of a
// single alert (so a rolling metric is re-checked regularly without hammering the DB).
const EVAL_TICK_MS = 5 * 60 * 1000;
const RE_EVAL_MINUTES = 10;

type AlertRow = {
  [column: string]: unknown;
  id: string;
  project_id: string;
  name: string;
  event_name: string;
  measure: string;
  property: string | null;
  filters: FilterCondition[] | null;
  window_hours: number;
  condition: string;
  threshold: number;
  webhook_url: string | null;
  email_recipients: string[] | null;
  notification_group_ids: string[] | null;
  enabled: boolean;
  last_status: string;
  last_value: number | null;
  last_evaluated_at: string | null;
  organization_id?: string;
};

export interface CreateAlertRequest {
  name?: string;
  eventName?: string;
  measure?: string;
  property?: string;
  filters?: unknown;
  windowHours?: number;
  condition?: string;
  threshold?: number;
  webhookUrl?: string;
  emailRecipients?: string[];
  notificationGroupIds?: string[];
  projectId?: string;
}

export interface EvaluationResult {
  value: number;
  previous: number | null;
  triggered: boolean;
  status: string;
  message: string;
}

@Injectable()
export class AlertsService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;
  private isEvaluating = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService,
    private readonly groups: NotificationGroupsService,
    private readonly email: EmailService,
    private readonly entitlements: EntitlementService
  ) {}

  onModuleInit(): void {
    // One replica evaluates per tick, so a firing alert notifies once, not once per replica.
    this.timer = setInterval(
      () => void this.database.runExclusive('alerts.evaluate', () => this.evaluateDueAlerts()).catch(() => undefined),
      EVAL_TICK_MS
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // -- CRUD ---------------------------------------------------------------

  async list(user: DashboardUser, projectId?: string) {
    const project = await this.projects.resolveActiveProject(user, projectId);
    if (!project) {
      return { project: null, alerts: [], recentEvents: [], notificationGroups: [], entitlement: null };
    }
    const entitlement = await this.entitlements.getSnapshot(project.organizationId);

    const alerts = await this.database.query<AlertRow & { last_value: number | null; last_evaluated_at: string | null }>(
      `SELECT * FROM alerts WHERE project_id = $1 ORDER BY created_at DESC`,
      [project.id]
    );

    const events = await this.database.query<{
      id: string;
      alertId: string;
      alertName: string;
      value: number | null;
      message: string;
      triggeredAt: string;
    }>(
      `
        SELECT ae.id, ae.alert_id AS "alertId", a.name AS "alertName",
               ae.value, ae.message, ae.triggered_at AS "triggeredAt"
        FROM alert_events ae
        JOIN alerts a ON a.id = ae.alert_id
        WHERE ae.project_id = $1
        ORDER BY ae.triggered_at DESC
        LIMIT 30
      `,
      [project.id]
    );

    const groups = await this.database.query<{ id: string; name: string; member_emails: string[] | null }>(
      `SELECT id, name, member_emails FROM notification_groups WHERE project_id = $1 ORDER BY name ASC`,
      [project.id]
    );

    const deliveries = await this.database.query<{
      alertId: string;
      channel: string;
      recipient: string | null;
      status: string;
      error: string | null;
      sentAt: string;
    }>(
      `
        SELECT d.alert_id AS "alertId", d.channel, d.recipient, d.status, d.error, d.sent_at AS "sentAt"
        FROM alert_deliveries d
        JOIN alerts a ON a.id = d.alert_id
        WHERE a.project_id = $1
        ORDER BY d.sent_at DESC
        LIMIT 150
      `,
      [project.id]
    );
    const deliveriesByAlert = new Map<string, typeof deliveries.rows>();
    for (const row of deliveries.rows) {
      const list = deliveriesByAlert.get(row.alertId) ?? [];
      list.push(row);
      deliveriesByAlert.set(row.alertId, list);
    }

    return {
      project,
      alerts: alerts.rows.map((row) => ({
        id: row.id,
        name: row.name,
        eventName: row.event_name,
        measure: row.measure,
        property: row.property,
        filters: sanitizeFilters(row.filters),
        windowHours: row.window_hours,
        condition: row.condition,
        threshold: row.threshold,
        webhookUrl: row.webhook_url,
        emailRecipients: row.email_recipients ?? [],
        notificationGroupIds: row.notification_group_ids ?? [],
        enabled: row.enabled,
        lastStatus: row.last_status,
        lastValue: row.last_value,
        lastEvaluatedAt: row.last_evaluated_at,
        deliveries: deliveriesByAlert.get(row.id) ?? []
      })),
      notificationGroups: groups.rows.map((row) => ({
        id: row.id,
        name: row.name,
        memberEmails: row.member_emails ?? []
      })),
      recentEvents: events.rows,
      entitlement: { available: entitlement.features.alerts, plan: entitlement.plan }
    };
  }

  async create(user: DashboardUser, body: CreateAlertRequest) {
    const project = await this.projects.requireWritableProject(user, body.projectId);
    await this.entitlements.assertAlertsAvailable(project.organizationId);

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) throw new BadRequestException('Alert name is required.');

    const eventName = typeof body.eventName === 'string' ? body.eventName.trim() : '';
    if (!eventName) throw new BadRequestException('Pick an event to watch.');

    const measure = (typeof body.measure === 'string' ? body.measure.toLowerCase() : 'count') as TrendMeasure;
    if (!ALLOWED_MEASURES.includes(measure)) {
      throw new BadRequestException(`measure must be one of: ${ALLOWED_MEASURES.join(', ')}.`);
    }

    const condition = (typeof body.condition === 'string' ? body.condition : '') as AlertCondition;
    if (!ALLOWED_CONDITIONS.includes(condition)) {
      throw new BadRequestException(`condition must be one of: ${ALLOWED_CONDITIONS.join(', ')}.`);
    }

    const property = measure === 'sum' || measure === 'avg' ? (body.property ?? '').trim() : null;
    if ((measure === 'sum' || measure === 'avg') && !property) {
      throw new BadRequestException('A numeric property is required for sum/avg alerts.');
    }

    const windowHours = clampInt(body.windowHours, 1, 720, 24);
    const threshold = Number.isFinite(body.threshold) ? Number(body.threshold) : 0;
    const filters = sanitizeFilters(body.filters);

    const webhookUrl = typeof body.webhookUrl === 'string' ? body.webhookUrl.trim() : '';
    if (webhookUrl) {
      assertSafeFetchUrl(webhookUrl, 'Webhook URL');
    }

    const emailRecipients = toUniqueEmails(Array.isArray(body.emailRecipients) ? body.emailRecipients : []);
    const notificationGroupIds = Array.isArray(body.notificationGroupIds)
      ? toUniqueGroupIds(body.notificationGroupIds)
      : [];

    if (!webhookUrl && emailRecipients.length === 0 && notificationGroupIds.length === 0) {
      throw new BadRequestException('Pick at least one notification channel (webhook and/or email recipients/groups).');
    }

    // Resolve the members of each chosen group now and persist the flat list so the alert
    // keeps working even if a group is later deleted. At firing time we re-resolve to honour edits.
    const groupEmails = await this.groups.resolveMembers(notificationGroupIds, project.id);
    const resolvedRecipients = toUniqueEmails([...emailRecipients, ...groupEmails]);

    const id = `alt_${randomUUID()}`;
    await this.database.query(
      `
        INSERT INTO alerts
          (id, project_id, name, event_name, measure, property, filters, window_hours, condition, threshold,
           webhook_url, email_recipients, notification_group_ids, created_by_user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14)
      `,
      [
        id,
        project.id,
        name,
        eventName,
        measure,
        property,
        JSON.stringify(filters),
        windowHours,
        condition,
        threshold,
        webhookUrl || null,
        resolvedRecipients,
        notificationGroupIds,
        user.id
      ]
    );

    return { id, name };
  }

  async setEnabled(user: DashboardUser, id: string, enabled: boolean, projectId?: string) {
    const project = await this.projects.requireWritableProject(user, projectId);
    if (enabled) await this.entitlements.assertAlertsAvailable(project.organizationId);
    const result = await this.database.query(
      `UPDATE alerts SET enabled = $3, last_status = 'pending', updated_at = now() WHERE id = $1 AND project_id = $2`,
      [id, project.id, enabled]
    );
    if (result.rowCount === 0) throw new NotFoundException('Alert not found.');
    return { id, enabled };
  }

  async remove(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const result = await this.database.query(`DELETE FROM alerts WHERE id = $1 AND project_id = $2`, [id, project.id]);
    if (result.rowCount === 0) throw new NotFoundException('Alert not found.');
    return { deleted: true };
  }

  // Manually evaluate one alert and return what it would report (no firing / webhook).
  async test(user: DashboardUser, id: string, projectId?: string): Promise<EvaluationResult> {
    const project = await this.projects.requireActiveProject(user, projectId);
    await this.entitlements.assertAlertsAvailable(project.organizationId);
    const result = await this.database.query<AlertRow>(`SELECT * FROM alerts WHERE id = $1 AND project_id = $2`, [
      id,
      project.id
    ]);
    const alert = result.rows[0];
    if (!alert) throw new NotFoundException('Alert not found.');
    return this.evaluateAlert(alert, { persist: false, notify: false });
  }

  // -- Evaluation ---------------------------------------------------------

  async evaluateAlert(alert: AlertRow, opts: { persist: boolean; notify: boolean }): Promise<EvaluationResult> {
    if (opts.persist || opts.notify) {
      await this.entitlements.assertAlertsAvailable(await this.alertOrganizationId(alert));
    }
    const now = new Date();
    const windowMs = alert.window_hours * 60 * 60 * 1000;
    const currentFrom = new Date(now.getTime() - windowMs);
    const needsPrevious = alert.condition === 'drops_by' || alert.condition === 'spikes_by';

    const current = await this.computeMetric(alert, currentFrom, now);
    const previous = needsPrevious
      ? await this.computeMetric(alert, new Date(currentFrom.getTime() - windowMs), currentFrom)
      : 0;

    const { triggered, message } = this.evaluateCondition(alert, current, previous);
    const status = triggered ? 'triggered' : 'ok';

    if (opts.persist) {
      await this.database.query(
        `UPDATE alerts SET last_evaluated_at = now(), last_value = $2, last_status = $3, updated_at = now() WHERE id = $1`,
        [alert.id, current, status]
      );

      // Edge-triggered: only record + notify on the transition into "triggered".
      if (triggered && alert.last_status !== 'triggered') {
        const eventId = `ale_${randomUUID()}`;
        await this.database.query(
          `INSERT INTO alert_events (id, alert_id, project_id, value, previous_value, message) VALUES ($1, $2, $3, $4, $5, $6)`,
          [eventId, alert.id, alert.project_id, current, needsPrevious ? previous : null, message]
        );
        if (opts.notify) {
          await this.deliver(alert, eventId, current, needsPrevious ? previous : null, message);
        }
      }
    }

    return { value: current, previous: needsPrevious ? previous : null, triggered, status, message };
  }

  private async evaluateDueAlerts(): Promise<void> {
    if (this.isEvaluating) return;
    this.isEvaluating = true;
    try {
      const due = await this.database.query<AlertRow>(
        `
          SELECT a.*,p.organization_id FROM alerts a
          JOIN projects p ON p.id=a.project_id
          WHERE a.enabled = true
            AND (a.last_evaluated_at IS NULL OR a.last_evaluated_at < now() - ($1 || ' minutes')::interval)
          ORDER BY a.last_evaluated_at ASC NULLS FIRST
          LIMIT 100
        `,
        [String(RE_EVAL_MINUTES)]
      );
      for (const alert of due.rows) {
        try {
          await this.evaluateAlert(alert, { persist: true, notify: true });
        } catch {
          // One bad alert shouldn't stop the rest.
        }
      }
    } catch {
      // Swallow scheduler errors; next tick retries.
    } finally {
      this.isEvaluating = false;
    }
  }

  private async computeMetric(alert: AlertRow, from: Date, to: Date): Promise<number> {
    const params: unknown[] = [alert.project_id, alert.event_name, from.toISOString(), to.toISOString()];
    const valueExpr = buildMeasureExpr(alert.measure as TrendMeasure, alert.property ?? null, params);
    const filterClause = buildFilterClause(sanitizeFilters(alert.filters), params);
    const result = await this.database.query<{ value: number }>(
      `
        SELECT ${valueExpr} AS value
        FROM events
        WHERE project_id = $1 AND event_name = $2 AND occurred_at >= $3 AND occurred_at < $4${filterClause}
      `,
      params
    );
    return result.rows[0]?.value ?? 0;
  }

  private evaluateCondition(alert: AlertRow, current: number, previous: number): { triggered: boolean; message: string } {
    const label = measureLabel(alert.measure, alert.property, alert.event_name);
    switch (alert.condition) {
      case 'above':
        return { triggered: current > alert.threshold, message: `${label} is ${fmt(current)} (alert when above ${fmt(alert.threshold)}).` };
      case 'below':
        return { triggered: current < alert.threshold, message: `${label} is ${fmt(current)} (alert when below ${fmt(alert.threshold)}).` };
      case 'drops_by': {
        const pct = previous > 0 ? ((previous - current) / previous) * 100 : 0;
        return {
          triggered: previous > 0 && pct >= alert.threshold,
          message: `${label} dropped ${Math.round(pct)}% (from ${fmt(previous)} to ${fmt(current)}).`
        };
      }
      case 'spikes_by': {
        const pct = previous > 0 ? ((current - previous) / previous) * 100 : 0;
        return {
          triggered: previous > 0 && pct >= alert.threshold,
          message: `${label} spiked ${Math.round(pct)}% (from ${fmt(previous)} to ${fmt(current)}).`
        };
      }
      default:
        return { triggered: false, message: `${label} is ${fmt(current)}.` };
    }
  }

  private async deliver(
    alert: AlertRow,
    eventId: string,
    value: number,
    previous: number | null,
    message: string
  ): Promise<void> {
    // Recheck immediately before outbound delivery so a downgrade racing an
    // evaluation cannot consume TraceIQ-managed email or webhook capacity.
    await this.entitlements.assertAlertsAvailable(await this.alertOrganizationId(alert));
    const subject = `TraceIQ alert fired: ${alert.name}`;
    const html = buildAlertEmail(alert, value, previous, message);
    const recipients = await this.resolveRecipients(alert);

    // One event row per (channel, recipient) so the UI can show intended + result.
    if (recipients.length > 0) {
      await this.entitlements.assertAlertsAvailable(await this.alertOrganizationId(alert));
      const sent = await this.email.send({ to: recipients, subject, html });
      for (const recipient of recipients) {
        if (sent.ok) {
          await this.recordDelivery(eventId, alert, 'email', recipient, 'sent', null);
        } else {
          // Whole send failed (e.g. missing API key / outbound error) — record per recipient.
          await this.recordDelivery(eventId, alert, 'email', recipient, 'failed', sent.failure ?? null);
        }
      }
    }

    if (alert.webhook_url) {
      await this.entitlements.assertAlertsAvailable(await this.alertOrganizationId(alert));
      await this.notifyWebhook(alert, eventId, value, previous, message);
    }
  }

  private async resolveRecipients(alert: AlertRow): Promise<string[]> {
    const fresh = await this.groups.resolveMembers(alert.notification_group_ids ?? [], alert.project_id);
    // Explicit recipients saved on the alert, unioned with the current group members.
    return toUniqueEmails([...(alert.email_recipients ?? []), ...fresh]);
  }

  private async alertOrganizationId(alert: AlertRow): Promise<string> {
    if (alert.organization_id) return alert.organization_id;
    const result = await this.database.query<{ organization_id: string }>(
      'SELECT organization_id FROM projects WHERE id=$1 LIMIT 1',
      [alert.project_id]
    );
    const organizationId = result.rows[0]?.organization_id;
    if (!organizationId) throw new NotFoundException('Alert project was not found.');
    alert.organization_id = organizationId;
    return organizationId;
  }

  private async recordDelivery(
    eventId: string,
    alert: AlertRow,
    channel: string,
    recipient: string,
    status: string,
    error: string | null
  ): Promise<void> {
    await this.database.query(
      `INSERT INTO alert_deliveries (id, alert_id, alert_event_id, channel, recipient, status, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [`ald_${randomUUID()}`, alert.id, eventId, channel, recipient, status, error]
    );
  }

  private async notifyWebhook(
    alert: AlertRow,
    eventId: string,
    value: number,
    previous: number | null,
    message: string
  ): Promise<void> {
    if (typeof fetch !== 'function' || !alert.webhook_url) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let status = 'sent';
    let error: string | null = null;
    try {
      const res = await fetch(alert.webhook_url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          // Chat apps read a single text field: Slack uses `text`, Discord `content`.
          text: `TraceIQ alert: ${message}`,
          content: `TraceIQ alert: ${message}`,
          alertId: alert.id,
          name: alert.name,
          event: alert.event_name,
          measure: alert.measure,
          condition: alert.condition,
          threshold: alert.threshold,
          value,
          previous,
          message,
          triggeredAt: new Date().toISOString()
        }),
        signal: controller.signal
      });
      if (!res.ok) {
        status = 'failed';
        error = `HTTP ${res.status}`;
      }
    } catch (err) {
      status = 'failed';
      error = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timeout);
    }
    await this.recordDelivery(eventId, alert, 'webhook', alert.webhook_url, status, error);
  }
}

function measureLabel(measure: string, property: string | null, event: string): string {
  if (measure === 'unique') return `Unique users of "${event}"`;
  if (measure === 'sum') return `Sum of ${property} for "${event}"`;
  if (measure === 'avg') return `Average ${property} for "${event}"`;
  return `"${event}" count`;
}

function fmt(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function toUniqueGroupIds(list: string[]): string[] {
  return Array.from(new Set(list.map((id) => String(id).trim()).filter(Boolean)));
}

function buildAlertEmail(alert: AlertRow, value: number, previous: number | null, message: string): string {
  const rows = [
    ['Event', alert.event_name],
    ['Condition', conditionLabel(alert.condition)],
    ['Threshold', alert.condition === 'above' || alert.condition === 'below' ? fmt(alert.threshold) : `${fmt(alert.threshold)}%`],
    ['Current value', fmt(value)],
    ...(previous != null ? [['Previous period', fmt(previous)]] : [])
  ]
    .map(([label, val]) => `<tr><td style="padding:6px 0;width:160px;color:#64748b;">${label}</td><td style="padding:6px 0;font-weight:600;">${val}</td></tr>`)
    .join('');

  return `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;color:#0f172a;">
      <div style="padding:20px 0;border-bottom:1px solid #e2e8f0;">
        <div style="font-size:13px;color:#94a3b8;">TraceIQ alert</div>
        <div style="font-size:20px;font-weight:700;margin-top:4px;">${escapeHtml(alert.name)}</div>
      </div>
      <p style="font-size:15px;line-height:1.5;color:#334155;">${escapeHtml(message)}</p>
      <table style="font-size:14px;border-collapse:collapse;">${rows}</table>
      <p style="font-size:13px;color:#94a3b8;margin-top:20px;">
        Fired at ${new Date().toLocaleString('en-US')}. Disable this alert from the TraceIQ dashboard.
      </p>
    </div>`;
}

function conditionLabel(condition: string): string {
  switch (condition) {
    case 'above':
      return 'Above';
    case 'below':
      return 'Below';
    case 'drops_by':
      return 'Drops by';
    case 'spikes_by':
      return 'Spikes by';
    default:
      return condition;
  }
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
