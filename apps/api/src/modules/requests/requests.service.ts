import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService, QueryExecutor } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService, ResolvedProject } from '../projects/projects.service';
import {
  ApiRequestRecord,
  CAPTURE_STATES,
  CaptureSettings,
  CaptureState,
  DEFAULT_CAPTURE_SETTINGS,
  MAX_BODY_BYTES_LIMIT,
  clientRequestSql,
  parseRequestSource,
  rowToCaptureSettings
} from './request-capture';

export interface RequestsQuery {
  projectId?: string;
  range?: string;
  from?: string;
  to?: string;
  service?: string;
  method?: string;
  status?: string;
  environment?: string;
  capture?: string;
  route?: string;
  search?: string;
  /** `server` (SDK middleware), `client` (browser capture) or `all` (default). */
  source?: string;
  sort?: string;
  cursor?: string;
  limit?: string | number;
}

export interface RequestListItem {
  [column: string]: unknown;
  id: string;
  occurredAt: string;
  requestId: string | null;
  traceId: string | null;
  service: string | null;
  environment: string | null;
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  responseSize: number | null;
  captureState: CaptureState;
  /** `client` for browser-timed round trips, `server` for handler timings. */
  timedBy: 'server' | 'client';
}

export interface RequestDetail extends RequestListItem {
  projectId: string;
  receivedAt: string;
  spanId: string | null;
  parentSpanId: string | null;
  sessionId: string | null;
  userId: string | null;
  anonymousId: string | null;
  instrumentation: string | null;
  host: string | null;
  url: string | null;
  requestSize: number | null;
  captureReason: string | null;
  payload: unknown;
}

export interface TimelineEntry {
  kind: 'request' | 'log';
  id: string;
  name: string;
  service: string | null;
  startedAt: string;
  offsetMs: number;
  durationMs: number | null;
  status: string;
  statusCode: number | null;
  current: boolean;
  matchedBy: 'trace_id' | 'request_id' | 'self';
}

export const TIME_RANGES: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000
};

const MAX_RANGE_MS = 31 * 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
// Dashboard reads must never pin the database: every explorer query runs with a
// transaction-local statement timeout.
const QUERY_TIMEOUT_MS = 8_000;
// Correlated records are looked up by exact id, but always inside a bounded time
// window so the lookup stays on the (project, time) indexes.
const CORRELATION_WINDOW_MS = 60 * 60 * 1000;
const SETTINGS_TTL_MS = 30_000;
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

const LIST_COLUMNS = `
  id,
  occurred_at AS "occurredAt",
  request_id AS "requestId",
  trace_id AS "traceId",
  service,
  environment,
  method,
  route,
  status_code AS "statusCode",
  duration_ms AS "durationMs",
  response_size AS "responseSize",
  capture_state AS "captureState",
  CASE WHEN ${clientRequestSql('instrumentation', 'session_id')} THEN 'client' ELSE 'server' END AS "timedBy"
`;

const DETAIL_COLUMNS = `
  ${LIST_COLUMNS},
  project_id AS "projectId",
  received_at AS "receivedAt",
  span_id AS "spanId",
  parent_span_id AS "parentSpanId",
  session_id AS "sessionId",
  user_id AS "userId",
  anonymous_id AS "anonymousId",
  instrumentation,
  host,
  url,
  request_size AS "requestSize",
  capture_reason AS "captureReason",
  payload
`;

interface Cursor {
  k: 'time' | 'duration';
  v: string | number;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string | undefined, sort: 'time' | 'duration'): Cursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Cursor;
    if (parsed.k !== sort || typeof parsed.id !== 'string') throw new Error('mismatch');
    if (sort === 'time' && Number.isNaN(new Date(String(parsed.v)).getTime())) throw new Error('bad time');
    if (sort === 'duration' && typeof parsed.v !== 'number') throw new Error('bad duration');
    return parsed;
  } catch {
    throw new BadRequestException('Invalid pagination cursor.');
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

@Injectable()
export class RequestsService {
  private settingsCache = new Map<string, { settings: CaptureSettings | null; expiresAt: number }>();

  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService
  ) {}

  // ─── Ingest side ─────────────────────────────────────────────────────────

  /** The project's capture policy, cached briefly so the ingest path stays cheap. */
  async captureSettingsFor(projectId: string): Promise<CaptureSettings | null> {
    const cached = this.settingsCache.get(projectId);
    if (cached && cached.expiresAt > Date.now()) return cached.settings;
    let settings: CaptureSettings | null = null;
    try {
      const result = await this.database.query<{
        enabled: boolean;
        services: string[];
        routes: string[];
        capture_headers: boolean;
        capture_bodies: boolean;
        redact_fields: string[];
        max_body_bytes: number;
      }>(
        `SELECT enabled, services, routes, capture_headers, capture_bodies, redact_fields, max_body_bytes
         FROM api_request_capture_settings WHERE project_id = $1`,
        [projectId]
      );
      settings = result.rows[0] ? rowToCaptureSettings(result.rows[0]) : null;
    } catch {
      // Fail closed: if the policy can't be read, capture nothing.
      settings = null;
    }
    this.settingsCache.set(projectId, { settings, expiresAt: Date.now() + SETTINGS_TTL_MS });
    return settings;
  }

  /** Inserts normalized request rows; called inside the event-ingest transaction. */
  async insertRecords(client: QueryExecutor | PoolClient, records: ApiRequestRecord[]): Promise<void> {
    if (records.length === 0) return;
    const columns = 26;
    const values: unknown[] = [];
    const groups: string[] = [];
    records.forEach((r, i) => {
      const base = i * columns;
      groups.push(`(${Array.from({ length: columns }, (_, c) => `$${base + c + 1}`).join(', ')})`);
      values.push(
        r.id,
        r.eventId,
        r.organizationId,
        r.projectId,
        r.occurredAt,
        r.requestId,
        r.traceId,
        r.spanId,
        r.parentSpanId,
        r.sessionId,
        r.userId,
        r.anonymousId,
        r.service,
        r.environment,
        r.instrumentation,
        r.host,
        r.method,
        r.route,
        r.url,
        r.statusCode,
        r.durationMs,
        r.requestSize,
        r.responseSize,
        r.captureState,
        r.captureReason,
        r.payload ? JSON.stringify(r.payload) : null
      );
    });
    // Runs inside the event-ingest transaction. A savepoint keeps a failure here
    // (e.g. code deployed before the migration) from rolling back the event itself.
    await client.query('SAVEPOINT api_requests_insert');
    try {
      await client.query(
        `INSERT INTO api_requests (
          id, event_id, organization_id, project_id, occurred_at,
          request_id, trace_id, span_id, parent_span_id, session_id, user_id, anonymous_id,
          service, environment, instrumentation, host,
          method, route, url, status_code, duration_ms, request_size, response_size,
          capture_state, capture_reason, payload
        ) VALUES ${groups.join(', ')}
        ON CONFLICT (id) DO NOTHING`,
        values
      );
      await client.query('RELEASE SAVEPOINT api_requests_insert');
    } catch {
      await client.query('ROLLBACK TO SAVEPOINT api_requests_insert');
    }
  }

  // ─── Dashboard reads ───────────────────────────────────────────────────────

  async list(user: DashboardUser, query: RequestsQuery) {
    const project = await this.projects.resolveActiveProject(user, query.projectId);
    if (!project) return { project: null, requests: [], nextCursor: null };

    const sort = query.sort === 'duration' ? 'duration' : 'time';
    const limit = Math.min(Math.max(Number(query.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const cursor = decodeCursor(query.cursor, sort);
    const { where, params, window } = this.buildFilters(project.id, query);

    if (cursor) {
      if (sort === 'time') {
        params.push(new Date(String(cursor.v)).toISOString(), cursor.id);
        where.push(`(occurred_at, id) < ($${params.length - 1}::timestamptz, $${params.length})`);
      } else {
        params.push(cursor.v, cursor.id);
        where.push(`(duration_ms, id) < ($${params.length - 1}::double precision, $${params.length})`);
      }
    }
    params.push(limit + 1);
    const order = sort === 'time' ? 'occurred_at DESC, id DESC' : 'duration_ms DESC, id DESC';

    const result = await this.timed((db) =>
      db.query<RequestListItem>(
        `SELECT ${LIST_COLUMNS} FROM api_requests WHERE ${where.join(' AND ')}
         ORDER BY ${order} LIMIT $${params.length}`,
        params
      )
    );

    const rows = result.rows.map(normalizeListRow);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor(
            sort === 'time'
              ? { k: 'time', v: new Date(last.occurredAt).toISOString(), id: last.id }
              : { k: 'duration', v: last.durationMs, id: last.id }
          )
        : null;

    return {
      project: { id: project.id, name: project.name },
      requests: page,
      nextCursor,
      sort,
      window: { from: window.from.toISOString(), to: window.to.toISOString() }
    };
  }

  async summary(user: DashboardUser, query: RequestsQuery) {
    const project = await this.projects.resolveActiveProject(user, query.projectId);
    const empty = {
      total: 0,
      serverErrors: 0,
      errorRate: 0,
      p95: 0,
      captures: { captured: 0, redacted: 0, metadataOnly: 0, unavailable: 0 }
    };
    if (!project) return { project: null, summary: empty };

    const { where, params, window } = this.buildFilters(project.id, query);
    const result = await this.timed((db) =>
      db.query<{
        total: number;
        server_errors: number;
        p95: number | null;
        captured: number;
        redacted: number;
        metadata_only: number;
        unavailable: number;
      }>(
        `SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE status_code >= 500)::int AS server_errors,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95,
          count(*) FILTER (WHERE capture_state = 'captured')::int AS captured,
          count(*) FILTER (WHERE capture_state = 'redacted')::int AS redacted,
          count(*) FILTER (WHERE capture_state = 'metadata_only')::int AS metadata_only,
          count(*) FILTER (WHERE capture_state = 'unavailable')::int AS unavailable
         FROM api_requests WHERE ${where.join(' AND ')}`,
        params
      )
    );

    const row = result.rows[0];
    if (!row) return { project: { id: project.id, name: project.name }, summary: empty };
    const total = Number(row.total) || 0;
    const serverErrors = Number(row.server_errors) || 0;
    return {
      project: { id: project.id, name: project.name },
      window: { from: window.from.toISOString(), to: window.to.toISOString() },
      summary: {
        total,
        serverErrors,
        errorRate: total > 0 ? Math.round((serverErrors / total) * 10_000) / 100 : 0,
        p95: row.p95 === null || row.p95 === undefined ? 0 : Math.round(Number(row.p95) * 10) / 10,
        captures: {
          captured: Number(row.captured) || 0,
          redacted: Number(row.redacted) || 0,
          metadataOnly: Number(row.metadata_only) || 0,
          unavailable: Number(row.unavailable) || 0
        }
      }
    };
  }

  /** Distinct services / environments in the window, for the filter menus. */
  async facets(user: DashboardUser, query: RequestsQuery) {
    const project = await this.projects.resolveActiveProject(user, query.projectId);
    if (!project) return { project: null, services: [], environments: [] };
    const { where, params } = this.buildFilters(project.id, { range: query.range, from: query.from, to: query.to });
    const [services, environments] = await this.timed((db) =>
      Promise.all([
        db.query<{ value: string; count: number }>(
          `SELECT service AS value, count(*)::int AS count FROM api_requests
           WHERE ${where.join(' AND ')} AND service IS NOT NULL
           GROUP BY 1 ORDER BY 2 DESC LIMIT 50`,
          params
        ),
        db.query<{ value: string; count: number }>(
          `SELECT environment AS value, count(*)::int AS count FROM api_requests
           WHERE ${where.join(' AND ')} AND environment IS NOT NULL
           GROUP BY 1 ORDER BY 2 DESC LIMIT 20`,
          params
        )
      ])
    );
    return {
      project: { id: project.id, name: project.name },
      services: services.rows.map((r) => ({ value: r.value, count: Number(r.count) })),
      environments: environments.rows.map((r) => ({ value: r.value, count: Number(r.count) }))
    };
  }

  async detail(user: DashboardUser, id: string, projectId?: string): Promise<RequestDetail> {
    const project = await this.projects.requireActiveProject(user, projectId);
    const request = await this.findRequest(project.id, id);
    if (!request) throw new NotFoundException('Request not found.');
    return request;
  }

  /**
   * Recorded operations for this request: the request itself, other requests that
   * share its trace id (cross-service hops), and structured logs that carry the same
   * trace id or request id. Nothing is inferred from timestamps alone.
   */
  async timeline(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const request = await this.findRequest(project.id, id);
    if (!request) throw new NotFoundException('Request not found.');

    const self: TimelineEntry = {
      kind: 'request',
      id: request.id,
      name: `${request.method} ${request.route}`,
      service: request.service,
      startedAt: request.occurredAt,
      offsetMs: 0,
      durationMs: request.durationMs,
      status: request.statusCode >= 500 ? 'error' : request.statusCode >= 400 ? 'warning' : 'success',
      statusCode: request.statusCode,
      current: true,
      matchedBy: 'self'
    };

    if (!request.traceId && !request.requestId) {
      return {
        request: { id: request.id, traceId: null, requestId: null },
        instrumented: false,
        entries: [self]
      };
    }

    const { from, to } = this.correlationWindow(request.occurredAt);
    const [peers, logs] = await this.timed((db) =>
      Promise.all([
        request.traceId
          ? db.query<RequestListItem>(
              `SELECT ${LIST_COLUMNS} FROM api_requests
               WHERE project_id = $1 AND trace_id = $2 AND id <> $3
                 AND occurred_at BETWEEN $4 AND $5
               ORDER BY occurred_at ASC LIMIT 50`,
              [project.id, request.traceId, request.id, from, to]
            )
          : Promise.resolve({ rows: [] as RequestListItem[] }),
        this.correlatedLogs(db, project.id, request, from, to)
      ])
    );

    const entries: TimelineEntry[] = [self];
    for (const peer of peers.rows.map(normalizeListRow)) {
      entries.push({
        kind: 'request',
        id: peer.id,
        name: `${peer.method} ${peer.route}`,
        service: peer.service,
        startedAt: peer.occurredAt,
        offsetMs: 0,
        durationMs: peer.durationMs,
        status: peer.statusCode >= 500 ? 'error' : peer.statusCode >= 400 ? 'warning' : 'success',
        statusCode: peer.statusCode,
        current: false,
        matchedBy: 'trace_id'
      });
    }
    for (const log of logs) {
      entries.push({
        kind: 'log',
        id: log.id,
        name: log.operation,
        service: log.service,
        startedAt: log.timestamp,
        offsetMs: 0,
        durationMs: log.durationMs,
        status: log.status,
        statusCode: log.statusCode,
        current: false,
        matchedBy: log.matchedBy
      });
    }

    entries.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
    const origin = new Date(entries[0].startedAt).getTime();
    for (const entry of entries) entry.offsetMs = Math.max(0, new Date(entry.startedAt).getTime() - origin);

    return {
      request: { id: request.id, traceId: request.traceId, requestId: request.requestId },
      instrumented: entries.length > 1,
      entries
    };
  }

  /** Records genuinely correlated by request id / trace id / session. */
  async related(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const request = await this.findRequest(project.id, id);
    if (!request) throw new NotFoundException('Request not found.');

    const session = request.sessionId ? { id: request.sessionId } : null;
    const user_ = request.userId ? { id: request.userId } : null;

    if (!request.traceId && !request.requestId) {
      return {
        correlation: { requestId: null, traceId: null },
        logs: [],
        errors: [],
        syntheticRuns: [],
        session,
        user: user_
      };
    }

    const { from, to } = this.correlationWindow(request.occurredAt);
    const ids = [request.requestId, request.traceId].filter(Boolean);

    const [logs, errors, runs] = await this.timed((db) =>
      Promise.all([
        this.correlatedLogs(db, project.id, request, from, to),
        db.query<{ id: string; type: string; message: string; occurredAt: string; matchedBy: string }>(
          `SELECT
             id,
             COALESCE(NULLIF(properties->>'type', ''), 'Error') AS type,
             COALESCE(NULLIF(properties->>'message', ''), '(no message)') AS message,
             occurred_at AS "occurredAt",
             CASE WHEN $4::text IS NOT NULL AND properties->>'requestId' = $4 THEN 'request_id' ELSE 'trace_id' END AS "matchedBy"
           FROM events
           WHERE project_id = $1
             AND event_name IN ('$exception', '$error')
             AND occurred_at BETWEEN $2 AND $3
             AND (
               ($4::text IS NOT NULL AND properties->>'requestId' = $4)
               OR ($5::text IS NOT NULL AND properties->>'traceId' = $5)
             )
           ORDER BY occurred_at ASC
           LIMIT 25`,
          [project.id, from, to, request.requestId, request.traceId]
        ),
        request.requestId
          ? db.query<{ id: string; monitorId: string; monitorName: string | null; status: string; createdAt: string }>(
              `SELECT r.id, r.monitor_id AS "monitorId", m.name AS "monitorName", r.status, r.created_at AS "createdAt"
               FROM synthetic_runs r
               LEFT JOIN synthetic_monitors m ON m.id = r.monitor_id
               WHERE r.project_id = $1
                 AND r.created_at BETWEEN $2::timestamptz - interval '1 day' AND $3::timestamptz + interval '1 day'
                 AND (
                   r.network_requests @> jsonb_build_array(jsonb_build_object('requestId', $4::text))
                   OR r.http_errors @> jsonb_build_array(jsonb_build_object('requestId', $4::text))
                 )
               ORDER BY r.created_at DESC
               LIMIT 10`,
              [project.id, from, to, request.requestId]
            )
          : Promise.resolve({ rows: [] as Array<{ id: string; monitorId: string; monitorName: string | null; status: string; createdAt: string }> })
      ])
    );

    return {
      correlation: { requestId: request.requestId, traceId: request.traceId, ids },
      logs,
      errors: errors.rows,
      syntheticRuns: runs.rows,
      session,
      user: user_
    };
  }

  // ─── Capture settings ──────────────────────────────────────────────────────

  async getCaptureSettings(user: DashboardUser, projectId?: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const settings = (await this.readSettings(project.id)) ?? DEFAULT_CAPTURE_SETTINGS;
    return {
      project: { id: project.id, name: project.name },
      settings,
      canEdit: user.authMethod !== 'pat' && (project.role === 'owner' || project.role === 'admin')
    };
  }

  async updateCaptureSettings(user: DashboardUser, body: Partial<CaptureSettings> & { projectId?: string }) {
    const project = await this.projects.requireActiveProject(user, body.projectId);
    this.assertCanEdit(user, project);
    const settings = validateSettings(body);
    await this.database.query(
      `INSERT INTO api_request_capture_settings (
         project_id, enabled, services, routes, capture_headers, capture_bodies,
         redact_fields, max_body_bytes, updated_by_user_id, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       ON CONFLICT (project_id) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         services = EXCLUDED.services,
         routes = EXCLUDED.routes,
         capture_headers = EXCLUDED.capture_headers,
         capture_bodies = EXCLUDED.capture_bodies,
         redact_fields = EXCLUDED.redact_fields,
         max_body_bytes = EXCLUDED.max_body_bytes,
         updated_by_user_id = EXCLUDED.updated_by_user_id,
         updated_at = now()`,
      [
        project.id,
        settings.enabled,
        settings.services,
        settings.routes,
        settings.captureHeaders,
        settings.captureBodies,
        settings.redactFields,
        settings.maxBodyBytes,
        user.id
      ]
    );
    this.settingsCache.delete(project.id);
    return { project: { id: project.id, name: project.name }, settings, canEdit: true };
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private assertCanEdit(user: DashboardUser, project: ResolvedProject) {
    if (user.authMethod === 'pat') {
      throw new ForbiddenException('Personal access tokens cannot change capture settings.');
    }
    if (project.role !== 'owner' && project.role !== 'admin') {
      throw new ForbiddenException('Only owners and admins can change payload capture settings.');
    }
  }

  private async readSettings(projectId: string): Promise<CaptureSettings | null> {
    const result = await this.database.query<Parameters<typeof rowToCaptureSettings>[0]>(
      `SELECT enabled, services, routes, capture_headers, capture_bodies, redact_fields, max_body_bytes
       FROM api_request_capture_settings WHERE project_id = $1`,
      [projectId]
    );
    return result.rows[0] ? rowToCaptureSettings(result.rows[0]) : null;
  }

  private async findRequest(projectId: string, id: string): Promise<RequestDetail | null> {
    if (!id || id.length > 128) return null;
    const result = await this.database.query<RequestDetail>(
      `SELECT ${DETAIL_COLUMNS} FROM api_requests WHERE id = $1 AND project_id = $2 LIMIT 1`,
      [id, projectId]
    );
    const row = result.rows[0];
    return row ? (normalizeListRow(row) as RequestDetail) : null;
  }

  private correlationWindow(occurredAt: string) {
    const at = new Date(occurredAt).getTime();
    return {
      from: new Date(at - CORRELATION_WINDOW_MS).toISOString(),
      to: new Date(at + CORRELATION_WINDOW_MS).toISOString()
    };
  }

  private async correlatedLogs(
    db: QueryExecutor,
    projectId: string,
    request: RequestDetail,
    from: string,
    to: string
  ) {
    const result = await db.query<{
      id: string;
      timestamp: string;
      level: string;
      service: string;
      operation: string;
      message: string;
      status: string;
      statusCode: number | null;
      durationMs: number | null;
      matchedBy: 'trace_id' | 'request_id';
    }>(
      `SELECT
         id,
         timestamp,
         level,
         service,
         COALESCE(route, message) AS operation,
         message,
         status,
         status_code AS "statusCode",
         duration_ms AS "durationMs",
         CASE WHEN $4::text IS NOT NULL AND request_id = $4 THEN 'request_id' ELSE 'trace_id' END AS "matchedBy"
       FROM observability_logs
       WHERE project_id = $1
         AND timestamp BETWEEN $2 AND $3
         AND (
           ($4::text IS NOT NULL AND request_id = $4)
           OR ($5::text IS NOT NULL AND trace_id = $5)
         )
       ORDER BY timestamp ASC
       LIMIT 100`,
      [projectId, from, to, request.requestId, request.traceId]
    );
    return result.rows;
  }

  /** Runs dashboard reads inside a transaction with a local statement timeout. */
  private async timed<T>(fn: (db: QueryExecutor) => Promise<T>): Promise<T> {
    return this.database.transaction(async (client) => {
      await client.query(`SET LOCAL statement_timeout = ${QUERY_TIMEOUT_MS}`);
      return fn(client as unknown as QueryExecutor);
    });
  }

  buildFilters(projectId: string, query: RequestsQuery) {
    const window = resolveWindow(query);
    const params: unknown[] = [projectId, window.from.toISOString(), window.to.toISOString()];
    const where = ['project_id = $1', 'occurred_at >= $2', 'occurred_at <= $3'];

    const service = clean(query.service, 128);
    if (service) {
      params.push(service);
      where.push(`service = $${params.length}`);
    }

    const environment = clean(query.environment, 64);
    if (environment) {
      params.push(environment);
      where.push(`environment = $${params.length}`);
    }

    const method = clean(query.method, 16)?.toUpperCase();
    if (method) {
      if (!HTTP_METHODS.has(method)) throw new BadRequestException(`Unsupported method filter "${method}".`);
      params.push(method);
      where.push(`method = $${params.length}`);
    }

    const status = clean(query.status, 8)?.toLowerCase();
    if (status) {
      if (/^[1-5]xx$/.test(status)) {
        const floor = Number(status[0]) * 100;
        params.push(floor);
        where.push(`status_code >= $${params.length} AND status_code < $${params.length} + 100`);
      } else if (status === 'error') {
        where.push('status_code >= 500');
      } else if (status === 'failed') {
        where.push('status_code = 0');
      } else if (/^\d{1,3}$/.test(status)) {
        params.push(Number(status));
        where.push(`status_code = $${params.length}`);
      } else {
        throw new BadRequestException(`Unsupported status filter "${status}".`);
      }
    }

    const rawSource = clean(query.source, 16);
    if (rawSource) {
      const source = parseRequestSource(rawSource);
      if (!source) throw new BadRequestException(`Unsupported source filter "${rawSource}".`);
      const isClient = clientRequestSql('instrumentation', 'session_id');
      if (source === 'client') where.push(isClient);
      if (source === 'server') where.push(`NOT ${isClient}`);
    }

    const capture = clean(query.capture, 32);
    if (capture) {
      if (capture === 'payload') {
        where.push(`capture_state IN ('captured', 'redacted')`);
      } else if ((CAPTURE_STATES as readonly string[]).includes(capture)) {
        params.push(capture);
        where.push(`capture_state = $${params.length}`);
      } else {
        throw new BadRequestException(`Unsupported capture filter "${capture}".`);
      }
    }

    const route = clean(query.route, 512);
    if (route) {
      params.push(route);
      where.push(`route = $${params.length}`);
    }

    const search = clean(query.search, 200);
    if (search) {
      params.push(`%${escapeLike(search)}%`);
      const like = params.length;
      params.push(search);
      const exact = params.length;
      where.push(`(
        route ILIKE $${like}
        OR service ILIKE $${like}
        OR request_id = $${exact}
        OR trace_id = $${exact}
      )`);
    }

    return { where, params, window };
  }
}

function clean(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export function resolveWindow(query: Pick<RequestsQuery, 'range' | 'from' | 'to'>) {
  const now = new Date();
  if (query.from || query.to) {
    const to = query.to ? new Date(query.to) : now;
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - TIME_RANGES['24h']);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid "from" or "to" timestamp.');
    }
    if (from > to) throw new BadRequestException('"from" must be before "to".');
    if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
      throw new BadRequestException('Time range is limited to 31 days.');
    }
    return { from, to };
  }
  const span = TIME_RANGES[query.range ?? '24h'] ?? TIME_RANGES['24h'];
  return { from: new Date(now.getTime() - span), to: now };
}

function normalizeListRow<T extends RequestListItem>(row: T): T {
  return {
    ...row,
    occurredAt: new Date(row.occurredAt).toISOString(),
    statusCode: Number(row.statusCode),
    durationMs: Number(row.durationMs),
    responseSize: row.responseSize === null || row.responseSize === undefined ? null : Number(row.responseSize)
  };
}

function stringList(value: unknown, field: string, maxItems: number, maxLength: number): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new BadRequestException(`${field} must be an array of strings.`);
  const list = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .map((item) => item.slice(0, maxLength));
  if (list.length > maxItems) throw new BadRequestException(`${field} is limited to ${maxItems} entries.`);
  return [...new Set(list)];
}

export function validateSettings(body: Partial<CaptureSettings>): CaptureSettings {
  const maxBodyBytes = body.maxBodyBytes === undefined ? DEFAULT_CAPTURE_SETTINGS.maxBodyBytes : Number(body.maxBodyBytes);
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 0 || maxBodyBytes > MAX_BODY_BYTES_LIMIT) {
    throw new BadRequestException(`maxBodyBytes must be an integer between 0 and ${MAX_BODY_BYTES_LIMIT}.`);
  }
  const routes = stringList(body.routes, 'routes', 50, 256);
  if (routes.some((route) => !route.startsWith('/'))) {
    throw new BadRequestException('Route prefixes must start with "/".');
  }
  return {
    enabled: body.enabled === true,
    services: stringList(body.services, 'services', 50, 128),
    routes,
    captureHeaders: body.captureHeaders !== false,
    captureBodies: body.captureBodies === true,
    redactFields: stringList(body.redactFields, 'redactFields', 100, 64),
    maxBodyBytes
  };
}
