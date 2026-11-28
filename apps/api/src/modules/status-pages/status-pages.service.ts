import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { QueryResultRow } from 'pg';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService, ResolvedProject } from '../projects/projects.service';

export const STATUS_PAGE_HISTORY_DAYS = 90;
const PAST_INCIDENT_DAYS = 14;
const MAX_COMPONENTS = 30;
const PUBLIC_CACHE_MS = 30_000;
const DAY_MS = 86_400_000;

/** Slugs that would collide with routes or read as official TraceIQ pages. */
const RESERVED_SLUGS = new Set(['traceiq', 'admin', 'api', 'app', 'status', 'www', 'dashboard', 'docs', 'help', 'support', 'login', 'new', 'settings']);
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;

export type ComponentState = 'operational' | 'degraded' | 'down' | 'maintenance' | 'unknown';
export type DayLevel = 'operational' | 'degraded' | 'down' | 'none';
export type IncidentKind = 'incident' | 'maintenance';
export type Impact = 'none' | 'minor' | 'major' | 'critical';

const INCIDENT_STATUSES = ['investigating', 'identified', 'monitoring', 'resolved'] as const;
const MAINTENANCE_STATUSES = ['scheduled', 'in_progress', 'completed'] as const;
const IMPACTS: Impact[] = ['none', 'minor', 'major', 'critical'];

export interface StatusPageSettingsBody {
  projectId?: string;
  slug?: string;
  title?: string;
  description?: string | null;
  enabled?: boolean;
  components?: Array<{ monitorId?: string; displayName?: string; description?: string | null }>;
}

export interface CreateIncidentBody {
  projectId?: string;
  kind?: string;
  title?: string;
  status?: string;
  impact?: string;
  body?: string;
  componentIds?: string[];
  scheduledStart?: string;
  scheduledEnd?: string;
}

export interface IncidentUpdateBody {
  projectId?: string;
  status?: string;
  body?: string;
}

interface PageRow extends QueryResultRow {
  id: string;
  project_id: string;
  slug: string;
  title: string;
  description: string | null;
  enabled: boolean;
  updated_at: Date;
}

interface ComponentRow extends QueryResultRow {
  id: string;
  monitor_id: string;
  display_name: string;
  description: string | null;
  position: number;
  monitor_status: string;
}

interface IncidentRow extends QueryResultRow {
  id: string;
  kind: IncidentKind;
  title: string;
  status: string;
  impact: Impact;
  component_ids: string[];
  scheduled_start: Date | null;
  scheduled_end: Date | null;
  started_at: Date;
  resolved_at: Date | null;
  created_at: Date;
}

interface UpdateRow extends QueryResultRow {
  id: string;
  incident_id: string;
  status: string;
  body: string;
  created_at: Date;
}

export interface RunDayRow extends QueryResultRow {
  monitor_id: string;
  day: string;
  passed: string | number;
  failed: string | number;
}

export interface RecentRunRow extends QueryResultRow {
  monitor_id: string;
  status: string;
  rn: string | number;
}

@Injectable()
export class StatusPagesService {
  private readonly cache = new Map<string, { at: number; value: unknown }>();

  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService
  ) {}

  // ─── Dashboard ────────────────────────────────────────────────────────────

  private async requireEditor(user: DashboardUser, projectId?: string): Promise<ResolvedProject> {
    const project = await this.projects.requireWritableProject(user, projectId);
    if (!['owner', 'admin'].includes(project.role)) {
      throw new ForbiddenException('Only owners and admins can change the status page.');
    }
    return project;
  }

  private async pageForProject(projectId: string): Promise<PageRow | undefined> {
    const result = await this.database.query<PageRow>(`SELECT * FROM status_pages WHERE project_id = $1`, [projectId]);
    return result.rows[0];
  }

  async getSettings(user: DashboardUser, projectId?: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const page = await this.pageForProject(project.id);
    const monitors = await this.database.query<{ id: string; name: string; status: string; schedule: string; last_run_status: string | null }>(
      `SELECT id, name, status, schedule, last_run_status FROM synthetic_monitors WHERE project_id = $1 AND status <> 'archived' ORDER BY name`,
      [project.id]
    );
    const components = page ? await this.components(page.id) : [];
    const incidents = page ? await this.incidents(page.id, { sinceDays: 30, includeOpen: true }) : [];
    return {
      canEdit: ['owner', 'admin'].includes(project.role),
      page: page
        ? { id: page.id, slug: page.slug, title: page.title, description: page.description, enabled: page.enabled, updatedAt: iso(page.updated_at) }
        : null,
      suggestedSlug: suggestSlug(project.slug ?? project.name),
      suggestedTitle: project.name,
      components: components.map((c) => ({ id: c.id, monitorId: c.monitor_id, displayName: c.display_name, description: c.description })),
      monitors: monitors.rows.map((m) => ({ id: m.id, name: m.name, status: m.status, schedule: m.schedule, lastRunStatus: m.last_run_status })),
      incidents: incidents.map((incident) => serializeIncident(incident, new Date()))
    };
  }

  async saveSettings(user: DashboardUser, body: StatusPageSettingsBody) {
    const project = await this.requireEditor(user, body.projectId);
    const slug = normalizeSlug(body.slug);
    const title = text(body.title, 'Title', 80, true) as string;
    const description = text(body.description, 'Description', 300, false);
    const enabled = body.enabled === true;

    const requested = Array.isArray(body.components) ? body.components : [];
    if (requested.length > MAX_COMPONENTS) throw new BadRequestException(`A status page can show at most ${MAX_COMPONENTS} components.`);
    const monitorIds = requested.map((c) => (typeof c.monitorId === 'string' ? c.monitorId : ''));
    if (new Set(monitorIds).size !== monitorIds.length) throw new BadRequestException('Each monitor can appear only once.');
    if (monitorIds.length) {
      const owned = await this.database.query<{ id: string }>(
        `SELECT id FROM synthetic_monitors WHERE project_id = $1 AND status <> 'archived' AND id = ANY($2::text[])`,
        [project.id, monitorIds]
      );
      if (owned.rows.length !== monitorIds.length) throw new BadRequestException('Pick monitors from this project.');
    }
    const components = requested.map((c, position) => ({
      monitorId: monitorIds[position],
      displayName: text(c.displayName, 'Component name', 60, true) as string,
      description: text(c.description, 'Component description', 160, false),
      position
    }));
    if (enabled && components.length === 0) throw new BadRequestException('Add at least one monitor before publishing the page.');

    const existing = await this.pageForProject(project.id);
    const pageId = existing?.id ?? `stp_${randomUUID()}`;
    try {
      await this.database.transaction(async (client) => {
        if (existing) {
          await client.query(
            `UPDATE status_pages SET slug = $2, title = $3, description = $4, enabled = $5, updated_at = now() WHERE id = $1`,
            [pageId, slug, title, description, enabled]
          );
        } else {
          await client.query(
            `INSERT INTO status_pages (id, project_id, slug, title, description, enabled, created_by_user_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [pageId, project.id, slug, title, description, enabled, user.id]
          );
        }
        // Keep component ids for monitors that stay, so incidents still point at them.
        await client.query(`DELETE FROM status_page_components WHERE status_page_id = $1 AND NOT (monitor_id = ANY($2::text[]))`, [pageId, monitorIds]);
        for (const component of components) {
          await client.query(
            `
              INSERT INTO status_page_components (id, status_page_id, monitor_id, display_name, description, position)
              VALUES ($1, $2, $3, $4, $5, $6)
              ON CONFLICT (status_page_id, monitor_id) DO UPDATE SET
                display_name = EXCLUDED.display_name, description = EXCLUDED.description, position = EXCLUDED.position
            `,
            [`stc_${randomUUID()}`, pageId, component.monitorId, component.displayName, component.description, component.position]
          );
        }
      });
    } catch (error) {
      if ((error as { code?: string; constraint?: string }).code === '23505') {
        throw new ConflictException(`The address traceiq.run/status/${slug} is taken. Pick another.`);
      }
      throw error;
    }
    this.cache.clear();
    return this.getSettings(user, project.id);
  }

  async createIncident(user: DashboardUser, body: CreateIncidentBody) {
    const project = await this.requireEditor(user, body.projectId);
    const page = await this.pageForProject(project.id);
    if (!page) throw new BadRequestException('Set up the status page first.');

    const kind: IncidentKind = body.kind === 'maintenance' ? 'maintenance' : 'incident';
    const title = text(body.title, 'Title', 120, true) as string;
    const message = text(body.body, 'Message', 5000, true) as string;
    const allowed: readonly string[] = kind === 'incident' ? INCIDENT_STATUSES : MAINTENANCE_STATUSES;
    const status = body.status ?? (kind === 'incident' ? 'investigating' : 'scheduled');
    if (!allowed.includes(status)) throw new BadRequestException(`Status must be one of: ${allowed.join(', ')}.`);
    const impact: Impact = kind === 'maintenance' ? 'none' : IMPACTS.includes(body.impact as Impact) ? (body.impact as Impact) : 'minor';
    const componentIds = await this.validComponentIds(page.id, body.componentIds);

    let scheduledStart: Date | null = null;
    let scheduledEnd: Date | null = null;
    if (kind === 'maintenance') {
      scheduledStart = date(body.scheduledStart, 'Start');
      scheduledEnd = date(body.scheduledEnd, 'End');
      if (!scheduledStart || !scheduledEnd) throw new BadRequestException('Maintenance needs a start and an end.');
      if (scheduledEnd <= scheduledStart) throw new BadRequestException('Maintenance must end after it starts.');
    }
    const terminal = status === 'resolved' || status === 'completed';
    const id = `sti_${randomUUID()}`;
    await this.database.transaction(async (client) => {
      await client.query(
        `
          INSERT INTO status_incidents (id, status_page_id, kind, title, status, impact, component_ids, scheduled_start, scheduled_end, started_at, resolved_at, created_by_user_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9, COALESCE($8, now()), CASE WHEN $10 THEN now() END, $11)
        `,
        [id, page.id, kind, title, status, impact, componentIds, scheduledStart?.toISOString() ?? null, scheduledEnd?.toISOString() ?? null, terminal, user.id]
      );
      await client.query(
        `INSERT INTO status_incident_updates (id, incident_id, status, body, created_by_user_id) VALUES ($1, $2, $3, $4, $5)`,
        [`stu_${randomUUID()}`, id, status, message, user.id]
      );
    });
    this.cache.clear();
    return this.getSettings(user, project.id);
  }

  async addUpdate(user: DashboardUser, incidentId: string, body: IncidentUpdateBody) {
    const project = await this.requireEditor(user, body.projectId);
    const incident = await this.incidentForProject(incidentId, project.id);
    const allowed: readonly string[] = incident.kind === 'incident' ? INCIDENT_STATUSES : MAINTENANCE_STATUSES;
    const status = body.status ?? incident.status;
    if (!allowed.includes(status)) throw new BadRequestException(`Status must be one of: ${allowed.join(', ')}.`);
    const message = text(body.body, 'Message', 5000, true) as string;
    const terminal = status === 'resolved' || status === 'completed';
    await this.database.transaction(async (client) => {
      await client.query(
        `
          UPDATE status_incidents SET status = $2, updated_at = now(),
            resolved_at = CASE WHEN $3 THEN COALESCE(resolved_at, now()) ELSE NULL END,
            started_at = CASE WHEN kind = 'maintenance' AND $2 = 'in_progress' THEN LEAST(started_at, now()) ELSE started_at END
          WHERE id = $1
        `,
        [incident.id, status, terminal]
      );
      await client.query(
        `INSERT INTO status_incident_updates (id, incident_id, status, body, created_by_user_id) VALUES ($1, $2, $3, $4, $5)`,
        [`stu_${randomUUID()}`, incident.id, status, message, user.id]
      );
    });
    this.cache.clear();
    return this.getSettings(user, project.id);
  }

  async deleteIncident(user: DashboardUser, incidentId: string, projectId?: string) {
    const project = await this.requireEditor(user, projectId);
    const incident = await this.incidentForProject(incidentId, project.id);
    await this.database.query(`DELETE FROM status_incidents WHERE id = $1`, [incident.id]);
    this.cache.clear();
    return this.getSettings(user, project.id);
  }

  private async incidentForProject(incidentId: string, projectId: string): Promise<IncidentRow> {
    const result = await this.database.query<IncidentRow>(
      `SELECT i.* FROM status_incidents i JOIN status_pages p ON p.id = i.status_page_id WHERE i.id = $1 AND p.project_id = $2`,
      [incidentId, projectId]
    );
    if (!result.rows[0]) throw new NotFoundException('Incident not found.');
    return result.rows[0];
  }

  private async validComponentIds(pageId: string, ids: unknown): Promise<string[]> {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const wanted = [...new Set(ids.filter((id): id is string => typeof id === 'string'))];
    const result = await this.database.query<{ id: string }>(
      `SELECT id FROM status_page_components WHERE status_page_id = $1 AND id = ANY($2::text[])`,
      [pageId, wanted]
    );
    return result.rows.map((row) => row.id);
  }

  private async components(pageId: string): Promise<ComponentRow[]> {
    const result = await this.database.query<ComponentRow>(
      `
        SELECT c.id, c.monitor_id, c.display_name, c.description, c.position, m.status AS monitor_status
        FROM status_page_components c JOIN synthetic_monitors m ON m.id = c.monitor_id
        WHERE c.status_page_id = $1
        ORDER BY c.position, c.display_name
      `,
      [pageId]
    );
    return result.rows;
  }

  private async incidents(pageId: string, options: { sinceDays: number; includeOpen: boolean }): Promise<Array<IncidentRow & { updates: UpdateRow[] }>> {
    const result = await this.database.query<IncidentRow>(
      `
        SELECT * FROM status_incidents
        WHERE status_page_id = $1
          AND (
            started_at >= now() - ($2::int * interval '1 day')
            OR ($3 AND resolved_at IS NULL)
            OR scheduled_end >= now()
          )
        ORDER BY started_at DESC
        LIMIT 100
      `,
      [pageId, options.sinceDays, options.includeOpen]
    );
    if (!result.rows.length) return [];
    const updates = await this.database.query<UpdateRow>(
      `SELECT * FROM status_incident_updates WHERE incident_id = ANY($1::text[]) ORDER BY created_at DESC`,
      [result.rows.map((row) => row.id)]
    );
    return result.rows.map((row) => ({ ...row, updates: updates.rows.filter((update) => update.incident_id === row.id) }));
  }

  // ─── Public ───────────────────────────────────────────────────────────────

  async getPublicPage(slugInput: string, now = new Date()) {
    const slug = typeof slugInput === 'string' ? slugInput.trim().toLowerCase() : '';
    if (!SLUG_PATTERN.test(slug)) throw new NotFoundException('Status page not found.');
    const cached = this.cache.get(slug);
    if (cached && now.getTime() - cached.at < PUBLIC_CACHE_MS) return cached.value;

    const pageResult = await this.database.query<PageRow>(`SELECT * FROM status_pages WHERE slug = $1 AND enabled = true`, [slug]);
    const page = pageResult.rows[0];
    if (!page) throw new NotFoundException('Status page not found.');

    const components = await this.components(page.id);
    const monitorIds = components.map((c) => c.monitor_id);
    const since = startOfUtcDay(new Date(now.getTime() - (STATUS_PAGE_HISTORY_DAYS - 1) * DAY_MS));
    const [days, recent, incidents] = await Promise.all([
      monitorIds.length
        ? this.database.query<RunDayRow>(
            `
              SELECT monitor_id, to_char(date_trunc('day', completed_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
                count(*) FILTER (WHERE status = 'passed') AS passed,
                count(*) FILTER (WHERE status IN ('failed', 'timed_out')) AS failed
              FROM synthetic_runs
              WHERE monitor_id = ANY($1::text[]) AND completed_at >= $2 AND status IN ('passed', 'failed', 'timed_out')
              GROUP BY 1, 2
            `,
            [monitorIds, since.toISOString()]
          )
        : Promise.resolve({ rows: [] as RunDayRow[] }),
      monitorIds.length
        ? this.database.query<RecentRunRow>(
            `
              SELECT monitor_id, status, rn FROM (
                SELECT monitor_id, status, row_number() OVER (PARTITION BY monitor_id ORDER BY completed_at DESC) AS rn
                FROM synthetic_runs
                WHERE monitor_id = ANY($1::text[]) AND status IN ('passed', 'failed', 'timed_out') AND completed_at IS NOT NULL
              ) recent WHERE rn <= 2
            `,
            [monitorIds]
          )
        : Promise.resolve({ rows: [] as RecentRunRow[] }),
      this.incidents(page.id, { sinceDays: PAST_INCIDENT_DAYS, includeOpen: true })
    ]);

    const value = buildPublicStatusPage({ page, components, dayRows: days.rows, recentRuns: recent.rows, incidents, now });
    this.cache.set(slug, { at: now.getTime(), value });
    if (this.cache.size > 1000) this.cache.delete(this.cache.keys().next().value as string);
    return value;
  }
}

// ─── Pure helpers (exported for tests) ──────────────────────────────────────

export function normalizeSlug(input: unknown): string {
  const slug = typeof input === 'string' ? input.trim().toLowerCase() : '';
  if (!SLUG_PATTERN.test(slug)) {
    throw new BadRequestException('The address must be 3–48 characters: lowercase letters, numbers and hyphens, not starting or ending with a hyphen.');
  }
  if (RESERVED_SLUGS.has(slug)) throw new BadRequestException(`"${slug}" is reserved. Pick another address.`);
  return slug;
}

export function suggestSlug(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/g, '');
  return base.length >= 3 && !RESERVED_SLUGS.has(base) ? base : `${base || 'my'}-status`.slice(0, 48);
}

/** Incident state as visitors should see it: maintenance windows start and end on schedule. */
export function effectiveStatus(incident: Pick<IncidentRow, 'kind' | 'status' | 'scheduled_start' | 'scheduled_end'>, now: Date): string {
  if (incident.kind !== 'maintenance' || incident.status === 'completed') return incident.status;
  const start = incident.scheduled_start ? new Date(incident.scheduled_start).getTime() : null;
  const end = incident.scheduled_end ? new Date(incident.scheduled_end).getTime() : null;
  if (end !== null && now.getTime() >= end) return 'completed';
  if (incident.status === 'in_progress' || (start !== null && now.getTime() >= start)) return 'in_progress';
  return 'scheduled';
}

function isOpen(status: string) {
  return status !== 'resolved' && status !== 'completed';
}

function serializeIncident(incident: IncidentRow & { updates: UpdateRow[] }, now: Date) {
  const status = effectiveStatus(incident, now);
  return {
    id: incident.id,
    kind: incident.kind,
    title: incident.title,
    status,
    impact: incident.impact,
    componentIds: incident.component_ids ?? [],
    scheduledStart: incident.scheduled_start ? iso(incident.scheduled_start) : null,
    scheduledEnd: incident.scheduled_end ? iso(incident.scheduled_end) : null,
    startedAt: iso(incident.started_at),
    resolvedAt: incident.resolved_at ? iso(incident.resolved_at) : null,
    updates: incident.updates.map((update) => ({ status: update.status, body: update.body, createdAt: iso(update.created_at) }))
  };
}

const IMPACT_STATE: Record<Impact, ComponentState> = { none: 'operational', minor: 'degraded', major: 'down', critical: 'down' };
const SEVERITY: Record<ComponentState, number> = { unknown: 0, operational: 1, maintenance: 2, degraded: 3, down: 4 };

/**
 * Builds the public payload. It contains public names, states, uptime and the
 * incident text the team wrote; never monitor names, URLs, failure reasons,
 * screenshots or any other detail from the runs.
 */
export function buildPublicStatusPage(input: {
  page: Pick<PageRow, 'slug' | 'title' | 'description'>;
  components: Array<Pick<ComponentRow, 'id' | 'monitor_id' | 'display_name' | 'description' | 'monitor_status'>>;
  dayRows: RunDayRow[];
  recentRuns: RecentRunRow[];
  incidents: Array<IncidentRow & { updates: UpdateRow[] }>;
  now: Date;
  days?: number;
}) {
  const days = input.days ?? STATUS_PAGE_HISTORY_DAYS;
  const today = startOfUtcDay(input.now).getTime();
  const counts = new Map(input.dayRows.map((row) => [`${row.monitor_id}:${row.day}`, { passed: Number(row.passed), failed: Number(row.failed) }]));
  const recent = new Map<string, string[]>();
  for (const run of [...input.recentRuns].sort((a, b) => Number(a.rn) - Number(b.rn))) {
    recent.set(run.monitor_id, [...(recent.get(run.monitor_id) ?? []), run.status]);
  }

  const incidents = input.incidents.map((incident) => serializeIncident(incident, input.now));
  const open = incidents.filter((incident) => incident.kind === 'incident' && isOpen(incident.status));
  const maintenanceNow = incidents.filter((incident) => incident.kind === 'maintenance' && incident.status === 'in_progress');

  const components = input.components.map((component) => {
    let passed = 0;
    let total = 0;
    const history: Array<{ date: string; level: DayLevel; uptimePercent: number | null }> = [];
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const date = new Date(today - offset * DAY_MS).toISOString().slice(0, 10);
      const count = counts.get(`${component.monitor_id}:${date}`);
      const runs = count ? count.passed + count.failed : 0;
      if (!count || runs === 0) {
        history.push({ date, level: 'none', uptimePercent: null });
        continue;
      }
      passed += count.passed;
      total += runs;
      const uptime = (count.passed / runs) * 100;
      history.push({ date, level: dayLevel(uptime), uptimePercent: roundPercent(uptime) });
    }

    // Monitors run every few minutes to hours, so one failure is "degraded"; two in a row is an outage.
    const last = recent.get(component.monitor_id) ?? [];
    let state: ComponentState =
      component.monitor_status !== 'active' || last.length === 0 ? 'unknown'
        : last[0] === 'passed' ? 'operational'
          : last[1] && last[1] !== 'passed' ? 'down' : 'degraded';
    for (const incident of open) {
      if (incident.componentIds.includes(component.id) && SEVERITY[IMPACT_STATE[incident.impact]] > SEVERITY[state]) {
        state = IMPACT_STATE[incident.impact];
      }
    }
    if (maintenanceNow.some((incident) => incident.componentIds.includes(component.id))) state = 'maintenance';

    return {
      id: component.id,
      name: component.display_name,
      description: component.description ?? '',
      status: state,
      uptimePercent: total ? roundPercent((passed / total) * 100) : null,
      history
    };
  });

  const states = components.map((component) => component.status);
  const worst = states.reduce<ComponentState>((acc, s) => (SEVERITY[s] > SEVERITY[acc] ? s : acc), 'unknown');
  const status: 'operational' | 'degraded' | 'down' | 'maintenance' | 'unknown' =
    worst === 'down' ? 'down' : worst === 'degraded' ? 'degraded' : worst === 'maintenance' ? 'maintenance'
      : open.some((incident) => incident.impact !== 'none') ? 'degraded'
        // No monitor has a result yet: don't claim everything is fine.
        : worst === 'unknown' ? 'unknown' : 'operational';

  const pastCutoff = input.now.getTime() - PAST_INCIDENT_DAYS * DAY_MS;
  return {
    page: { slug: input.page.slug, title: input.page.title, description: input.page.description ?? '' },
    status,
    generatedAt: input.now.toISOString(),
    days,
    components,
    activeIncidents: incidents.filter((i) => (i.kind === 'incident' && isOpen(i.status)) || (i.kind === 'maintenance' && i.status === 'in_progress')),
    upcomingMaintenance: incidents
      .filter((i) => i.kind === 'maintenance' && i.status === 'scheduled')
      .sort((a, b) => Date.parse(a.scheduledStart ?? a.startedAt) - Date.parse(b.scheduledStart ?? b.startedAt)),
    pastIncidents: incidents.filter((i) => !isOpen(i.status) && Date.parse(i.resolvedAt ?? i.scheduledEnd ?? i.startedAt) >= pastCutoff)
  };
}

function dayLevel(uptime: number): DayLevel {
  if (uptime >= 100) return 'operational';
  if (uptime >= 95) return 'degraded';
  return 'down';
}

function roundPercent(value: number) {
  return Math.floor(value * 100) / 100;
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function iso(value: Date | string) {
  return new Date(value).toISOString();
}

function text(value: unknown, field: string, max: number, required: boolean): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    if (required) throw new BadRequestException(`${field} is required.`);
    return null;
  }
  if (trimmed.length > max) throw new BadRequestException(`${field} must be at most ${max} characters.`);
  return trimmed;
}

function date(value: unknown, field: string): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new BadRequestException(`${field} must be a date and time.`);
  return parsed;
}
