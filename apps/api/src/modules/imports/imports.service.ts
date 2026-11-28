import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { EventsService, IngestEventRequest } from '../events/events.service';
import { ProjectsService, ResolvedProject } from '../projects/projects.service';
import { PostHogClient, PostHogConnection, PostHogError, normalizePostHogHost, planWindows } from './posthog-client';
import { mapPostHogEvent } from './posthog-mapper';
import { normalizeTraceIQEvent } from './traceiq-format';

export const IMPORT_BATCH_SIZE = 500;
const POLL_INTERVAL_MS = 5_000;
/** A running job with no heartbeat for this long lost its API process (deploy, crash). */
const STALE_AFTER_MS = 10 * 60 * 1000;
/** Longest range one PostHog import may cover, to keep a mistaken click cheap. */
const MAX_RANGE_DAYS = 3 * 366;

export type ImportFormat = 'posthog' | 'traceiq';

export interface ImportEventsBody {
  projectId?: string;
  format?: string;
  events?: unknown[];
  /** The file import (from POST /import/files) this chunk belongs to. Its counters are added to that record. */
  importId?: string;
}

export interface StartFileImportBody {
  projectId?: string;
  fileName?: string;
  format?: string;
}

export interface FinishFileImportBody {
  projectId?: string;
  status?: string;
  error?: string;
  /** Rows the browser dropped before sending (lines that are not JSON, events too large to send). */
  read?: number;
  skipped?: number;
  rejected?: number;
  skippedEvents?: Record<string, number>;
}

export interface PostHogImportBody {
  projectId?: string;
  host?: string;
  posthogProjectId?: string | number;
  apiKey?: string;
  since?: string;
  until?: string;
}

export interface ImportJobRow {
  [column: string]: unknown;
  id: string;
  project_id: string;
  source: string;
  status: string;
  source_host: string | null;
  source_project: string | null;
  range_start: Date | null;
  range_end: Date | null;
  file_name: string | null;
  file_format: string | null;
  completed_through: Date | null;
  windows_total: number;
  windows_done: number;
  read_count: string;
  imported_count: string;
  skipped_count: string;
  rejected_count: string;
  skipped_events: Record<string, number>;
  error: string | null;
  created_at: Date;
  heartbeat_at: Date;
  finished_at: Date | null;
}

interface Counters {
  read: number;
  imported: number;
  skipped: number;
  rejected: number;
  skippedEvents: Record<string, number>;
}

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);
  /** Overridable in tests. */
  createPostHogClient = (connection: PostHogConnection) => new PostHogClient(connection);
  sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  pollIntervalMs = POLL_INTERVAL_MS;

  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService,
    private readonly events: EventsService
  ) {}

  private async requireImportProject(user: DashboardUser, projectId?: string): Promise<ResolvedProject> {
    const project = await this.projects.requireWritableProject(user, projectId);
    if (!['owner', 'admin'].includes(project.role)) {
      throw new ForbiddenException('Only owners and admins can import events.');
    }
    return project;
  }

  /**
   * Starts the record of a file upload. The browser then sends the file in chunks with
   * this id, and each chunk adds to the record, so the upload shows in the import history.
   */
  async startFileImport(user: DashboardUser, body: StartFileImportBody) {
    const project = await this.requireImportProject(user, body.projectId);
    const fileName = typeof body.fileName === 'string' ? body.fileName.trim().slice(0, 200) : '';
    if (!fileName) throw new BadRequestException('fileName is required.');
    const format = body.format === 'posthog' || body.format === 'traceiq' ? body.format : null;
    const id = `imp_${randomUUID()}`;
    await this.database.query(
      `
        INSERT INTO import_jobs (id, project_id, source, status, file_name, file_format, created_by_user_id)
        VALUES ($1, $2, 'file', 'running', $3, $4, $5)
      `,
      [id, project.id, fileName, format, user.id]
    );
    return this.getJob(user, id, project.id);
  }

  /** Checks that `id` is a running file import this user started in this project. */
  private async requireRunningFileImport(user: DashboardUser, project: ResolvedProject, id: string) {
    const result = await this.database.query<{ status: string; created_by_user_id: string }>(
      `SELECT status, created_by_user_id FROM import_jobs WHERE id = $1 AND project_id = $2 AND source = 'file'`,
      [id, project.id]
    );
    const job = result.rows[0];
    if (!job || job.created_by_user_id !== user.id) throw new NotFoundException('Import not found.');
    if (job.status !== 'running') throw new ConflictException('This import has already finished. Start a new one.');
  }

  private async addToFileImport(id: string, counters: Counters, format: string | null) {
    await this.database.query(
      `
        UPDATE import_jobs SET
          read_count = read_count + $2, imported_count = imported_count + $3,
          skipped_count = skipped_count + $4, rejected_count = rejected_count + $5,
          skipped_events = (
            SELECT COALESCE(jsonb_object_agg(key, total), '{}'::jsonb)
            FROM (
              SELECT key, SUM(value::bigint) AS total
              FROM (SELECT * FROM jsonb_each_text(import_jobs.skipped_events) UNION ALL SELECT * FROM jsonb_each_text($6::jsonb)) AS entries
              GROUP BY key
            ) AS merged
          ),
          file_format = COALESCE(file_format, $7),
          heartbeat_at = now()
        WHERE id = $1
      `,
      [id, counters.read, counters.imported, counters.skipped, counters.rejected, JSON.stringify(counters.skippedEvents), format]
    );
  }

  /** Closes a file import: done, stopped by the person, or failed in the browser. */
  async finishFileImport(user: DashboardUser, id: string, body: FinishFileImportBody) {
    const project = await this.requireImportProject(user, body.projectId);
    const status = body.status;
    if (status !== 'completed' && status !== 'cancelled' && status !== 'failed') {
      throw new BadRequestException('status must be "completed", "cancelled" or "failed".');
    }
    await this.requireRunningFileImport(user, project, id);
    const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
    const skippedEvents: Record<string, number> = {};
    for (const [name, value] of Object.entries(body.skippedEvents ?? {}).slice(0, 50)) {
      if (count(value) > 0) skippedEvents[name.slice(0, 200)] = count(value);
    }
    const extra = { read: count(body.read), imported: 0, skipped: count(body.skipped), rejected: count(body.rejected), skippedEvents };
    if (extra.read || extra.skipped || extra.rejected || Object.keys(skippedEvents).length) await this.addToFileImport(id, extra, null);
    const error = status === 'failed' && typeof body.error === 'string' ? body.error.slice(0, 500) : undefined;
    await this.finish(id, status, error);
    return this.getJob(user, id, project.id);
  }

  /** One chunk of a file import. The browser (or CLI) reads the file and sends it in chunks. */
  async importEvents(user: DashboardUser, body: ImportEventsBody) {
    const project = await this.requireImportProject(user, body.projectId);
    const importId = typeof body.importId === 'string' && body.importId ? body.importId : null;
    const format = body.format;
    if (format !== 'posthog' && format !== 'traceiq') {
      throw new BadRequestException('format must be "posthog" or "traceiq".');
    }
    const rows = body.events;
    if (!Array.isArray(rows) || rows.length === 0) throw new BadRequestException('events must be a non-empty array.');
    if (rows.length > IMPORT_BATCH_SIZE) throw new BadRequestException(`Send at most ${IMPORT_BATCH_SIZE} events per request.`);

    if (importId) await this.requireRunningFileImport(user, project, importId);

    const counters = emptyCounters();
    const mapped = mapRows(rows, format, counters);
    const errors = mapped.length > 0 ? await this.ingest(project, mapped, counters) : [];
    if (importId) await this.addToFileImport(importId, counters, format);
    return {
      read: counters.read,
      imported: counters.imported,
      skipped: counters.skipped,
      rejected: counters.rejected,
      skippedEvents: counters.skippedEvents,
      errors
    };
  }

  private async ingest(project: ResolvedProject, batch: IngestEventRequest[], counters: Counters): Promise<string[]> {
    const response = await this.events.ingestImportBatch(project, batch);
    const errors: string[] = [];
    response.results.forEach((result, i) => {
      if (result?.accepted) {
        counters.imported += 1;
      } else {
        counters.rejected += 1;
        if (errors.length < 5) errors.push(`${batch[i]?.eventName}: ${result?.error ?? 'rejected'}`);
      }
    });
    return errors;
  }

  // ─── PostHog direct import ────────────────────────────────────────────────

  private parsePostHogBody(body: PostHogImportBody, requireRange: boolean) {
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    if (!apiKey) throw new BadRequestException('A PostHog personal API key is required.');
    const posthogProjectId = String(body.posthogProjectId ?? '').trim();
    if (!/^\d+$/.test(posthogProjectId)) {
      throw new BadRequestException('PostHog project ID must be a number (the one after /project/ in your PostHog URL).');
    }
    const connection: PostHogConnection = { host: normalizePostHogHost(body.host), projectId: posthogProjectId, apiKey };
    if (!requireRange) return { connection };

    const since = parseDate(body.since, 'since');
    if (!since) throw new BadRequestException('Choose a start date.');
    const now = new Date();
    const until = parseDate(body.until, 'until');
    const end = until && until < now ? until : now;
    if (since >= end) throw new BadRequestException('The start date must be before the end date (and before now).');
    if (end.getTime() - since.getTime() > MAX_RANGE_DAYS * 86_400_000) {
      throw new BadRequestException('Import at most three years at a time.');
    }
    return { connection, since, until: end };
  }

  async checkPostHog(user: DashboardUser, body: PostHogImportBody) {
    await this.requireImportProject(user, body.projectId);
    const { connection } = this.parsePostHogBody(body, false);
    await this.withPostHogErrors(() => this.createPostHogClient(connection).checkAccess());
    return { ok: true, host: connection.host };
  }

  async startPostHogImport(user: DashboardUser, body: PostHogImportBody) {
    const project = await this.requireImportProject(user, body.projectId);
    const { connection, since, until } = this.parsePostHogBody(body, true);
    const client = this.createPostHogClient(connection);
    await this.withPostHogErrors(() => client.checkAccess());

    const windows = planWindows(since!, until!);
    const id = `imp_${randomUUID()}`;
    // A job whose API process died (deploy, crash) stops sending heartbeats; close it
    // out so it no longer counts as the project's active import.
    await this.database.query(
      `
        UPDATE import_jobs SET status = 'failed', finished_at = now(),
          error = 'The import stopped when the TraceIQ API restarted. Start it again from the date it reached.'
        WHERE project_id = $1 AND status IN ('running', 'cancelling') AND heartbeat_at < now() - ($2 || ' milliseconds')::interval
      `,
      [project.id, String(STALE_AFTER_MS)]
    );
    try {
      await this.database.query(
        `
          INSERT INTO import_jobs (id, project_id, source, status, source_host, source_project, range_start, range_end, windows_total, created_by_user_id)
          VALUES ($1, $2, 'posthog', 'running', $3, $4, $5, $6, $7, $8)
        `,
        [id, project.id, connection.host, connection.projectId, since!.toISOString(), until!.toISOString(), windows.length, user.id]
      );
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('An import is already running for this project. Wait for it to finish or cancel it.');
      }
      throw error;
    }

    // Runs in the background; progress is written to the job row.
    void this.runPostHogJob(id, project, client, windows);
    return this.getJob(user, id, project.id);
  }

  private async withPostHogErrors<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof PostHogError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private async jobStatus(id: string): Promise<string | undefined> {
    const result = await this.database.query<{ status: string }>(`SELECT status FROM import_jobs WHERE id = $1`, [id]);
    return result.rows[0]?.status;
  }

  async runPostHogJob(id: string, project: ResolvedProject, client: PostHogClient, windows: Array<{ start: Date; end: Date }>) {
    const counters = emptyCounters();
    const save = async (extra: { windowsDone?: number; completedThrough?: Date } = {}) => {
      await this.database.query(
        `
          UPDATE import_jobs SET
            read_count = $2, imported_count = $3, skipped_count = $4, rejected_count = $5, skipped_events = $6::jsonb,
            windows_done = COALESCE($7, windows_done), completed_through = COALESCE($8, completed_through), heartbeat_at = now()
          WHERE id = $1
        `,
        [
          id,
          counters.read,
          counters.imported,
          counters.skipped,
          counters.rejected,
          JSON.stringify(counters.skippedEvents),
          extra.windowsDone ?? null,
          extra.completedThrough?.toISOString() ?? null
        ]
      );
    };
    const cancelled = async () => (await this.jobStatus(id)) === 'cancelling';

    try {
      for (const [index, window] of windows.entries()) {
        if (await cancelled()) return this.finish(id, 'cancelled');
        const runId = await client.startExport(window);

        let files: string[] | null = null;
        while (files === null) {
          await this.sleep(this.pollIntervalMs);
          if (await cancelled()) {
            await client.cancelExport(runId);
            return this.finish(id, 'cancelled');
          }
          files = await client.exportStatus(runId);
          await save();
        }

        for (const fileId of files) {
          let batch: unknown[] = [];
          const flush = async () => {
            const mapped = mapRows(batch, 'posthog', counters);
            batch = [];
            if (mapped.length > 0) await this.ingest(project, mapped, counters);
            await save();
          };
          for await (const row of client.readFile(runId, fileId)) {
            if ('error' in row && Object.keys(row).length === 1) {
              counters.read += 1;
              counters.skipped += 1;
              bump(counters.skippedEvents, '(lines that are not valid JSON)');
              continue;
            }
            batch.push(row);
            if (batch.length >= IMPORT_BATCH_SIZE) {
              await flush();
              if (await cancelled()) return this.finish(id, 'cancelled');
            }
          }
          if (batch.length > 0) await flush();
        }
        await save({ windowsDone: index + 1, completedThrough: window.end });
      }
      await this.finish(id, 'completed');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Import ${id} failed: ${message}`);
      await save().catch(() => undefined);
      await this.finish(id, 'failed', message);
    }
  }

  private async finish(id: string, status: 'completed' | 'cancelled' | 'failed', error?: string) {
    await this.database.query(
      `UPDATE import_jobs SET status = $2, error = $3, finished_at = now(), heartbeat_at = now() WHERE id = $1`,
      [id, status, error ?? null]
    );
  }

  async listJobs(user: DashboardUser, projectId?: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const result = await this.database.query<ImportJobRow>(
      `SELECT * FROM import_jobs WHERE project_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [project.id]
    );
    return { jobs: result.rows.map(serializeJob) };
  }

  async getJob(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const result = await this.database.query<ImportJobRow>(`SELECT * FROM import_jobs WHERE id = $1 AND project_id = $2`, [id, project.id]);
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Import not found.');
    return { job: serializeJob(row) };
  }

  async cancelJob(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.requireImportProject(user, projectId);
    // A job whose process died can't notice the flag, so close it out directly.
    const result = await this.database.query<ImportJobRow>(
      `
        UPDATE import_jobs SET
          status = CASE WHEN heartbeat_at < now() - ($3 || ' milliseconds')::interval THEN 'cancelled' ELSE 'cancelling' END,
          finished_at = CASE WHEN heartbeat_at < now() - ($3 || ' milliseconds')::interval THEN now() ELSE finished_at END
        WHERE id = $1 AND project_id = $2 AND status = 'running' AND source = 'posthog'
        RETURNING *
      `,
      [id, project.id, String(STALE_AFTER_MS)]
    );
    if (!result.rows[0]) return this.getJob(user, id, project.id);
    return { job: serializeJob(result.rows[0]) };
  }
}

function emptyCounters(): Counters {
  return { read: 0, imported: 0, skipped: 0, rejected: 0, skippedEvents: {} };
}

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function mapRows(rows: unknown[], format: ImportFormat, counters: Counters): IngestEventRequest[] {
  const mapped: IngestEventRequest[] = [];
  for (const row of rows) {
    counters.read += 1;
    const result =
      format === 'posthog'
        ? row && typeof row === 'object' && !Array.isArray(row)
          ? mapPostHogEvent(row as Parameters<typeof mapPostHogEvent>[0])
          : { skipped: '(not an object)' }
        : normalizeTraceIQEvent(row);
    if ('skipped' in result) {
      counters.skipped += 1;
      bump(counters.skippedEvents, result.skipped);
    } else {
      mapped.push(result.event as IngestEventRequest);
    }
  }
  return mapped;
}

function parseDate(value: unknown, name: string): Date | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const raw = value.trim();
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`${name} must be a date.`);
  return date;
}

export function serializeJob(row: ImportJobRow) {
  const stale = (row.status === 'running' || row.status === 'cancelling') && Date.now() - new Date(row.heartbeat_at).getTime() > STALE_AFTER_MS;
  return {
    id: row.id,
    source: row.source,
    status: stale ? 'interrupted' : row.status,
    sourceHost: row.source_host,
    sourceProject: row.source_project,
    rangeStart: row.range_start ? new Date(row.range_start).toISOString() : null,
    rangeEnd: row.range_end ? new Date(row.range_end).toISOString() : null,
    fileName: row.file_name ?? null,
    fileFormat: row.file_format ?? null,
    completedThrough: row.completed_through ? new Date(row.completed_through).toISOString() : null,
    windowsTotal: row.windows_total,
    windowsDone: row.windows_done,
    read: Number(row.read_count),
    imported: Number(row.imported_count),
    skipped: Number(row.skipped_count),
    rejected: Number(row.rejected_count),
    skippedEvents: row.skipped_events ?? {},
    error: stale ? 'The import stopped when the TraceIQ API restarted. Start it again from the date it reached.' : row.error,
    createdAt: new Date(row.created_at).toISOString(),
    finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null
  };
}
