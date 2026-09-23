import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService, ResolvedProject } from '../projects/projects.service';
import { createHash, randomUUID } from 'node:crypto';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export type LogStatus = 'success' | 'warning' | 'error' | 'info' | 'pending';
export type LogSource =
  | 'all'
  | 'api'
  | 'webhook'
  | 'ai'
  | 'alert'
  | 'error'
  | 'auth'
  | 'job'
  | 'sdk'
  | 'custom';

export interface ObservabilityLogEntry {
  id: string;
  projectId: string;
  timestamp: string;
  level: LogLevel;
  source: string;
  service: string;
  message: string;
  status: LogStatus;
  statusCode?: number | null;
  durationMs?: number | null;
  method?: string | null;
  route?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  traceId?: string | null;
  requestId?: string | null;
  sessionId?: string | null;
  distinctId?: string | null;
  actorUserId?: string | null;
  provider?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costUsd?: number | null;
  environment: string;
  metadata?: Record<string, unknown> | null;
  errorDetails?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface LogsQuery {
  projectId?: string;
  from?: string;
  to?: string;
  source?: string;
  level?: string;
  status?: string;
  search?: string;
  method?: string;
  statusCode?: string | number;
  model?: string;
  traceId?: string;
  requestId?: string;
  sessionId?: string;
  distinctId?: string;
  limit?: string | number;
  offset?: string | number;
}

export interface HistogramBucket {
  timestamp: string;
  total: number;
  success: number;
  warning: number;
  error: number;
  avgDuration: number;
}

export interface TraceSpan {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: string;
  service: string;
  operation: string;
  status: LogStatus;
  statusCode?: number | null;
  durationMs?: number | null;
  offsetMs: number;
  traceId?: string | null;
  requestId?: string | null;
  details?: Record<string, unknown> | null;
}

const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-traceiq-write-key',
  'x-api-key',
  'api-key',
  'apikey',
  'password',
  'secret',
  'token',
  'access_token',
  'refresh_token',
  'bearer',
  'private_key'
]);

@Injectable()
export class ObservabilityService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService
  ) {}

  async getLogs(user: DashboardUser, query: LogsQuery) {
    const project = await this.projects.resolveActiveProject(user, query.projectId);
    if (!project) {
      return { project: null, logs: [], total: 0, hasMore: false };
    }

    const { from, to, limit, offset } = this.parseTimeRange(query);
    const params: unknown[] = [project.id, from.toISOString(), to.toISOString()];
    const filters: string[] = ['project_id = $1', 'timestamp >= $2', 'timestamp <= $3'];

    if (query.source && query.source !== 'all') {
      params.push(query.source.toLowerCase());
      filters.push(`source = $${params.length}`);
    }

    if (query.level) {
      params.push(query.level.toLowerCase());
      filters.push(`level = $${params.length}`);
    }

    if (query.status) {
      params.push(query.status.toLowerCase());
      filters.push(`status = $${params.length}`);
    }

    if (query.method) {
      params.push(query.method.toUpperCase());
      filters.push(`method = $${params.length}`);
    }

    if (query.statusCode) {
      const code = Number(query.statusCode);
      if (!Number.isNaN(code)) {
        params.push(code);
        filters.push(`status_code = $${params.length}`);
      }
    }

    if (query.model) {
      params.push(`%${query.model.toLowerCase()}%`);
      filters.push(`LOWER(model) LIKE $${params.length}`);
    }

    if (query.traceId) {
      params.push(query.traceId);
      filters.push(`trace_id = $${params.length}`);
    }

    if (query.requestId) {
      params.push(query.requestId);
      filters.push(`request_id = $${params.length}`);
    }

    if (query.sessionId) {
      params.push(query.sessionId);
      filters.push(`session_id = $${params.length}`);
    }

    if (query.distinctId) {
      params.push(query.distinctId);
      filters.push(`distinct_id = $${params.length}`);
    }

    if (query.search && query.search.trim()) {
      params.push(`%${query.search.trim().toLowerCase()}%`);
      const idx = params.length;
      filters.push(`(
        LOWER(message) LIKE $${idx}
        OR LOWER(COALESCE(route, '')) LIKE $${idx}
        OR LOWER(COALESCE(service, '')) LIKE $${idx}
        OR LOWER(COALESCE(trace_id, '')) LIKE $${idx}
        OR LOWER(COALESCE(request_id, '')) LIKE $${idx}
        OR LOWER(COALESCE(provider, '')) LIKE $${idx}
        OR LOWER(COALESCE(model, '')) LIKE $${idx}
        OR LOWER(COALESCE(distinct_id, '')) LIKE $${idx}
      )`);
    }

    const whereClause = filters.join(' AND ');

    // Query logs
    params.push(limit + 1);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const querySql = `
      SELECT
        id,
        project_id AS "projectId",
        timestamp,
        level,
        source,
        service,
        message,
        status,
        status_code AS "statusCode",
        duration_ms AS "durationMs",
        method,
        route,
        client_ip AS "clientIp",
        user_agent AS "userAgent",
        trace_id AS "traceId",
        request_id AS "requestId",
        session_id AS "sessionId",
        distinct_id AS "distinctId",
        actor_user_id AS "actorUserId",
        provider,
        model,
        input_tokens AS "inputTokens",
        output_tokens AS "outputTokens",
        cost_usd AS "costUsd",
        environment,
        metadata,
        error_details AS "errorDetails"
      FROM observability_logs
      WHERE ${whereClause}
      ORDER BY timestamp DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const result = await this.database.query<ObservabilityLogEntry>(querySql, params);
    const hasMore = result.rows.length > limit;
    const logs = hasMore ? result.rows.slice(0, limit) : result.rows;

    return {
      project: { id: project.id, name: project.name },
      logs: logs.map((log) => this.sanitizeLog(log)),
      hasMore,
      limit,
      offset
    };
  }

  async getHistogram(user: DashboardUser, query: LogsQuery) {
    const project = await this.projects.resolveActiveProject(user, query.projectId);
    if (!project) {
      return {
        project: null,
        buckets: [],
        summary: { total: 0, success: 0, warning: 0, error: 0, avgDuration: 0, p95Duration: 0 },
        sourceCounts: {}
      };
    }

    const { from, to } = this.parseTimeRange(query);
    const diffMs = to.getTime() - from.getTime();

    // Determine interval bucket size (aim for 24 to 60 buckets)
    let intervalSeconds = 60; // 1 min default
    if (diffMs > 7 * 86400000) {
      intervalSeconds = 21600; // 6 hours for > 7d
    } else if (diffMs > 2 * 86400000) {
      intervalSeconds = 3600; // 1 hour for > 2d
    } else if (diffMs > 12 * 3600000) {
      intervalSeconds = 1800; // 30 mins for 12-48h
    } else if (diffMs > 3 * 3600000) {
      intervalSeconds = 300; // 5 mins for 3-12h
    } else if (diffMs > 3600000) {
      intervalSeconds = 120; // 2 mins for 1-3h
    }

    const params: unknown[] = [project.id, from.toISOString(), to.toISOString()];
    const filters: string[] = ['project_id = $1', 'timestamp >= $2', 'timestamp <= $3'];

    if (query.source && query.source !== 'all') {
      params.push(query.source.toLowerCase());
      filters.push(`source = $${params.length}`);
    }

    if (query.level) {
      params.push(query.level.toLowerCase());
      filters.push(`level = $${params.length}`);
    }

    if (query.status) {
      params.push(query.status.toLowerCase());
      filters.push(`status = $${params.length}`);
    }

    if (query.search && query.search.trim()) {
      params.push(`%${query.search.trim().toLowerCase()}%`);
      const idx = params.length;
      filters.push(`(
        LOWER(message) LIKE $${idx}
        OR LOWER(COALESCE(route, '')) LIKE $${idx}
        OR LOWER(COALESCE(service, '')) LIKE $${idx}
        OR LOWER(COALESCE(provider, '')) LIKE $${idx}
        OR LOWER(COALESCE(model, '')) LIKE $${idx}
      )`);
    }

    const whereClause = filters.join(' AND ');

    // Bucket aggregation query
    params.push(intervalSeconds);
    const intervalIdx = params.length;

    const bucketSql = `
      SELECT
        to_timestamp(floor(extract(epoch FROM timestamp) / $${intervalIdx}) * $${intervalIdx}) AS bucket_time,
        count(*)::int AS total,
        count(*) FILTER (WHERE status = 'success')::int AS success,
        count(*) FILTER (WHERE status = 'warning')::int AS warning,
        count(*) FILTER (WHERE status = 'error')::int AS error,
        COALESCE(avg(duration_ms), 0)::int AS avg_duration
      FROM observability_logs
      WHERE ${whereClause}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    // Global summary query
    const summarySql = `
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE status = 'success')::int AS success,
        count(*) FILTER (WHERE status = 'warning')::int AS warning,
        count(*) FILTER (WHERE status = 'error')::int AS error,
        COALESCE(avg(duration_ms), 0)::int AS avg_duration,
        COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms), 0)::int AS p95_duration
      FROM observability_logs
      WHERE ${whereClause}
    `;

    // Source distribution query
    const sourceSql = `
      SELECT
        source,
        count(*)::int AS count
      FROM observability_logs
      WHERE ${whereClause}
      GROUP BY source
    `;

    const [bucketResult, summaryResult, sourceResult] = await Promise.all([
      this.database.query<{
        bucket_time: string;
        total: number;
        success: number;
        warning: number;
        error: number;
        avg_duration: number;
      }>(bucketSql, params),
      this.database.query<{
        total: number;
        success: number;
        warning: number;
        error: number;
        avg_duration: number;
        p95_duration: number;
      }>(summarySql, params.slice(0, intervalIdx - 1)),
      this.database.query<{ source: string; count: number }>(
        sourceSql,
        params.slice(0, intervalIdx - 1)
      )
    ]);

    const buckets: HistogramBucket[] = bucketResult.rows.map((row) => ({
      timestamp: new Date(row.bucket_time).toISOString(),
      total: Number(row.total),
      success: Number(row.success),
      warning: Number(row.warning),
      error: Number(row.error),
      avgDuration: Number(row.avg_duration)
    }));

    const summaryRow = summaryResult.rows[0] ?? {
      total: 0,
      success: 0,
      warning: 0,
      error: 0,
      avg_duration: 0,
      p95_duration: 0
    };

    const sourceCounts: Record<string, number> = {};
    for (const row of sourceResult.rows) {
      sourceCounts[row.source] = Number(row.count);
    }

    return {
      project: { id: project.id, name: project.name },
      intervalSeconds,
      buckets,
      summary: {
        total: Number(summaryRow.total),
        success: Number(summaryRow.success),
        warning: Number(summaryRow.warning),
        error: Number(summaryRow.error),
        avgDuration: Number(summaryRow.avg_duration),
        p95Duration: Number(summaryRow.p95_duration)
      },
      sourceCounts
    };
  }

  async getLogDetail(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.projects.resolveActiveProject(user, projectId);
    if (!project) return null;

    const result = await this.database.query<ObservabilityLogEntry>(
      `
        SELECT
          id,
          project_id AS "projectId",
          timestamp,
          level,
          source,
          service,
          message,
          status,
          status_code AS "statusCode",
          duration_ms AS "durationMs",
          method,
          route,
          client_ip AS "clientIp",
          user_agent AS "userAgent",
          trace_id AS "traceId",
          request_id AS "requestId",
          session_id AS "sessionId",
          distinct_id AS "distinctId",
          actor_user_id AS "actorUserId",
          provider,
          model,
          input_tokens AS "inputTokens",
          output_tokens AS "outputTokens",
          cost_usd AS "costUsd",
          environment,
          metadata,
          error_details AS "errorDetails"
        FROM observability_logs
        WHERE id = $1 AND project_id = $2
        LIMIT 1
      `,
      [id, project.id]
    );

    const log = result.rows[0];
    if (!log) return null;

    return this.sanitizeLog(log);
  }

  async getTrace(user: DashboardUser, id: string, projectId?: string) {
    const log = await this.getLogDetail(user, id, projectId);
    if (!log) return { root: null, spans: [] };

    const project = await this.projects.resolveActiveProject(user, projectId ?? log.projectId);
    if (!project) return { root: null, spans: [] };

    const targetTime = new Date(log.timestamp);
    const windowStart = new Date(targetTime.getTime() - 15 * 60 * 1000).toISOString();
    const windowEnd = new Date(targetTime.getTime() + 15 * 60 * 1000).toISOString();

    const correlationFilters: string[] = [];
    const params: unknown[] = [project.id, windowStart, windowEnd];

    if (log.traceId) {
      params.push(log.traceId);
      correlationFilters.push(`trace_id = $${params.length}`);
    }
    if (log.requestId) {
      params.push(log.requestId);
      correlationFilters.push(`request_id = $${params.length}`);
    }
    if (log.sessionId) {
      params.push(log.sessionId);
      correlationFilters.push(`session_id = $${params.length}`);
    }
    if (log.distinctId) {
      params.push(log.distinctId);
      correlationFilters.push(`distinct_id = $${params.length}`);
    }

    const correlationClause =
      correlationFilters.length > 0 ? `(${correlationFilters.join(' OR ')})` : `id = '${log.id}'`;

    const traceSql = `
      SELECT
        id,
        timestamp,
        level,
        source,
        service,
        COALESCE(route, message) AS operation,
        status,
        status_code AS "statusCode",
        duration_ms AS "durationMs",
        trace_id AS "traceId",
        request_id AS "requestId",
        metadata
      FROM observability_logs
      WHERE project_id = $1 AND timestamp >= $2 AND timestamp <= $3 AND ${correlationClause}
      ORDER BY timestamp ASC
      LIMIT 100
    `;

    const result = await this.database.query<{
      id: string;
      timestamp: string;
      level: LogLevel;
      source: string;
      service: string;
      operation: string;
      status: LogStatus;
      statusCode?: number | null;
      durationMs?: number | null;
      traceId?: string | null;
      requestId?: string | null;
      metadata?: Record<string, unknown> | null;
    }>(traceSql, params);

    const firstTime = result.rows[0]
      ? new Date(result.rows[0].timestamp).getTime()
      : targetTime.getTime();

    const spans: TraceSpan[] = result.rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      level: row.level,
      source: row.source,
      service: row.service,
      operation: row.operation,
      status: row.status,
      statusCode: row.statusCode,
      durationMs: row.durationMs,
      offsetMs: Math.max(0, new Date(row.timestamp).getTime() - firstTime),
      traceId: row.traceId,
      requestId: row.requestId,
      details: this.sanitizeObject(row.metadata)
    }));

    return {
      root: log,
      spans
    };
  }

  async recordLog(entry: Partial<ObservabilityLogEntry> & { projectId: string; message: string }) {
    const id = entry.id ?? `log_${randomUUID()}`;
    const timestamp = entry.timestamp ?? new Date().toISOString();
    const level = entry.level ?? 'info';
    const source = entry.source ?? 'custom';
    const service = entry.service ?? 'api';
    const status = entry.status ?? (level === 'error' || level === 'fatal' ? 'error' : 'success');

    const sanitizedMeta = this.sanitizeObject(entry.metadata);
    const sanitizedError = this.sanitizeObject(entry.errorDetails);

    await this.database.query(
      `
        INSERT INTO observability_logs (
          id, project_id, timestamp, level, source, service, message, status,
          status_code, duration_ms, method, route, client_ip, user_agent,
          trace_id, request_id, session_id, distinct_id, actor_user_id,
          provider, model, input_tokens, output_tokens, cost_usd, environment,
          metadata, error_details
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19,
          $20, $21, $22, $23, $24, $25,
          $26, $27
        )
        ON CONFLICT (id) DO NOTHING
      `,
      [
        id,
        entry.projectId,
        timestamp,
        level,
        source,
        service,
        entry.message,
        status,
        entry.statusCode ?? null,
        entry.durationMs ?? null,
        entry.method ?? null,
        entry.route ?? null,
        entry.clientIp ?? null,
        entry.userAgent ?? null,
        entry.traceId ?? null,
        entry.requestId ?? null,
        entry.sessionId ?? null,
        entry.distinctId ?? null,
        entry.actorUserId ?? null,
        entry.provider ?? null,
        entry.model ?? null,
        entry.inputTokens ?? null,
        entry.outputTokens ?? null,
        entry.costUsd ?? null,
        entry.environment ?? 'production',
        JSON.stringify(sanitizedMeta ?? {}),
        JSON.stringify(sanitizedError ?? null)
      ]
    );

    return { id, ok: true };
  }

  async ingestLogFromSdk(
    entry: Partial<ObservabilityLogEntry> & { projectId?: string; writeKey?: string; message: string },
    writeKeyHeader?: string
  ) {
    const key = writeKeyHeader ?? entry.writeKey;
    if (!key) {
      throw new BadRequestException('Write key is required to ingest logs.');
    }

    const keyHash = createHash('sha256').update(key).digest('hex');
    let resolvedProjectId = entry.projectId;

    if (resolvedProjectId) {
      const authRes = await this.database.query<{ project_id: string }>(
        `
          SELECT project_id
          FROM project_write_keys
          WHERE key_hash = $1
            AND project_id = $2
            AND revoked_at IS NULL
          LIMIT 1
        `,
        [keyHash, resolvedProjectId]
      );
      if (!authRes.rows[0]) {
        throw new BadRequestException('Invalid project ID or write key.');
      }
    } else {
      const authRes = await this.database.query<{ project_id: string }>(
        `
          SELECT project_id
          FROM project_write_keys
          WHERE key_hash = $1
            AND revoked_at IS NULL
          LIMIT 1
        `,
        [keyHash]
      );
      if (!authRes.rows[0]) {
        throw new BadRequestException('Invalid write key.');
      }
      resolvedProjectId = authRes.rows[0].project_id;
    }

    return this.recordLog({
      ...entry,
      projectId: resolvedProjectId,
      source: entry.source ?? 'sdk'
    });
  }

  private parseTimeRange(query: LogsQuery) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 60 * 60 * 1000); // 1 hour default

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid date format for "from" or "to".');
    }

    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const offset = Math.max(Number(query.offset) || 0, 0);

    return { from, to, limit, offset };
  }

  private sanitizeLog(log: ObservabilityLogEntry): ObservabilityLogEntry {
    return {
      ...log,
      metadata: this.sanitizeObject(log.metadata),
      errorDetails: this.sanitizeObject(log.errorDetails)
    };
  }

  private sanitizeObject(obj: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
    if (!obj || typeof obj !== 'object') return null;
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase()) || key.toLowerCase().includes('key') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('token') || key.toLowerCase().includes('password')) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeObject(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}
