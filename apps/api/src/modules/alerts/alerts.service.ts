import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';
import { FilterCondition, buildFilterClause, sanitizeFilters } from '../../common/filters';
import { ALLOWED_MEASURES, TrendMeasure, buildMeasureExpr } from '../../common/measures';

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
  enabled: boolean;
  last_status: string;
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
    private readonly projects: ProjectsService
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.evaluateDueAlerts(), EVAL_TICK_MS);
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
      return { project: null, alerts: [], recentEvents: [] };
    }

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
        enabled: row.enabled,
        lastStatus: row.last_status,
        lastValue: row.last_value,
        lastEvaluatedAt: row.last_evaluated_at
      })),
      recentEvents: events.rows
    };
  }

  async create(user: DashboardUser, body: CreateAlertRequest) {
    const project = await this.projects.requireActiveProject(user, body.projectId);

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
    if (webhookUrl && !/^https?:\/\//i.test(webhookUrl)) {
      throw new BadRequestException('Webhook URL must start with http:// or https://');
    }

    const id = `alt_${randomUUID()}`;
    await this.database.query(
      `
        INSERT INTO alerts
          (id, project_id, name, event_name, measure, property, filters, window_hours, condition, threshold, webhook_url, created_by_user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12)
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
        user.id
      ]
    );

    return { id, name };
  }

  async setEnabled(user: DashboardUser, id: string, enabled: boolean, projectId?: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
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
        await this.database.query(
          `INSERT INTO alert_events (id, alert_id, project_id, value, previous_value, message) VALUES ($1, $2, $3, $4, $5, $6)`,
          [`ale_${randomUUID()}`, alert.id, alert.project_id, current, needsPrevious ? previous : null, message]
        );
        if (opts.notify && alert.webhook_url) {
          await this.notifyWebhook(alert, current, needsPrevious ? previous : null, message);
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
          SELECT * FROM alerts
          WHERE enabled = true
            AND (last_evaluated_at IS NULL OR last_evaluated_at < now() - ($1 || ' minutes')::interval)
          ORDER BY last_evaluated_at ASC NULLS FIRST
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

  private async notifyWebhook(alert: AlertRow, value: number, previous: number | null, message: string): Promise<void> {
    if (typeof fetch !== 'function' || !alert.webhook_url) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      await fetch(alert.webhook_url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
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
    } catch {
      // Delivery is best-effort; the firing is still recorded in-app.
    } finally {
      clearTimeout(timeout);
    }
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
