import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { TraceMap } from '@jridgewell/trace-mapping';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';
import { SymbolicatedStack, framePath, loadTraceMap, matchMapFile, normalizeMapFile, symbolicateStack } from './symbolicate';

/** Largest map accepted, after decompression. Matches the upload body limit in main.ts. */
export const MAX_SOURCE_MAP_BYTES = 25 * 1024 * 1024;
const MAX_MAPS_PER_RELEASE = 2000;
const MAX_RELEASE_LENGTH = 200;
const MAX_FILE_LENGTH = 500;
/** Parsed maps kept in memory between issue reads. */
const CACHE_SIZE = 20;

type MapFileRow = {
  id: string;
  release: string;
  file: string;
  updatedAt: string;
};

@Injectable()
export class SourceMapsService {
  private readonly cache = new Map<string, TraceMap>();

  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService
  ) {}

  /** Stores (or replaces) the map for one minified file of a release. */
  async upload(
    user: DashboardUser,
    params: { projectId?: string; release?: string; file?: string },
    body: unknown
  ) {
    const release = this.cleanRelease(params.release);
    const file = this.cleanFile(params.file);
    const content = this.bodyText(body);
    try {
      loadTraceMap(content);
    } catch (error) {
      throw new BadRequestException(`Not a valid source map: ${error instanceof Error ? error.message : 'could not parse it'}`);
    }

    const project = await this.projects.requireWritableProject(user, params.projectId);

    const existing = await this.database.query<{ total: number; present: boolean }>(
      `SELECT count(*)::int AS total, bool_or(file = $3) AS present
       FROM source_maps WHERE project_id = $1 AND release = $2`,
      [project.id, release, file]
    );
    const counts = existing.rows[0];
    if (counts && !counts.present && counts.total >= MAX_MAPS_PER_RELEASE) {
      throw new BadRequestException(`A release can have at most ${MAX_MAPS_PER_RELEASE} source maps.`);
    }

    const result = await this.database.query<{ file: string; sizeBytes: number; updatedAt: string }>(
      `INSERT INTO source_maps (id, project_id, release, file, content, size_bytes, uploaded_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (project_id, release, file) DO UPDATE SET
         content = EXCLUDED.content,
         size_bytes = EXCLUDED.size_bytes,
         uploaded_by_user_id = EXCLUDED.uploaded_by_user_id,
         updated_at = now()
       RETURNING file, size_bytes AS "sizeBytes", updated_at AS "updatedAt"`,
      [`smap_${randomUUID()}`, project.id, release, file, content, Buffer.byteLength(content), user.id]
    );

    return { project: { id: project.id, name: project.name }, release, map: result.rows[0] };
  }

  /** Releases with uploaded maps, or the maps of one release. */
  async list(user: DashboardUser, params: { projectId?: string; release?: string }) {
    const project = await this.projects.requireActiveProject(user, params.projectId);
    const release = params.release?.trim() ? this.cleanRelease(params.release) : null;

    if (!release) {
      const releases = await this.database.query<{ release: string; maps: number; sizeBytes: number; updatedAt: string }>(
        `SELECT release, count(*)::int AS maps, sum(size_bytes)::bigint::float8 AS "sizeBytes", max(updated_at) AS "updatedAt"
         FROM source_maps WHERE project_id = $1
         GROUP BY release ORDER BY max(updated_at) DESC LIMIT 100`,
        [project.id]
      );
      return { project: { id: project.id, name: project.name }, releases: releases.rows };
    }

    const maps = await this.database.query<{ file: string; sizeBytes: number; updatedAt: string }>(
      `SELECT file, size_bytes AS "sizeBytes", updated_at AS "updatedAt"
       FROM source_maps WHERE project_id = $1 AND release = $2
       ORDER BY file ASC`,
      [project.id, release]
    );
    return { project: { id: project.id, name: project.name }, release, maps: maps.rows };
  }

  /**
   * Symbolicates the stacks of a project's error samples. Returns one entry per
   * sample, null where there is no stack, no release or no matching map. Never
   * throws: a broken map leaves that sample's stack as it was.
   */
  async symbolicate(
    projectId: string,
    samples: Array<{ stack?: string | null; release?: string | null }>
  ): Promise<Array<SymbolicatedStack | null>> {
    const releases = [...new Set(samples.filter((s) => s.stack && s.release).map((s) => s.release as string))];
    if (releases.length === 0) return samples.map(() => null);

    let files: MapFileRow[];
    try {
      const result = await this.database.query<MapFileRow>(
        `SELECT id, release, file, updated_at AS "updatedAt"
         FROM source_maps WHERE project_id = $1 AND release = ANY($2::text[])`,
        [projectId, releases]
      );
      files = result.rows;
    } catch {
      return samples.map(() => null);
    }
    if (files.length === 0) return samples.map(() => null);

    const byRelease = new Map<string, MapFileRow[]>();
    for (const row of files) {
      const list = byRelease.get(row.release) ?? [];
      list.push(row);
      byRelease.set(row.release, list);
    }

    const output: Array<SymbolicatedStack | null> = [];
    for (const sample of samples) {
      const candidates = sample.release ? byRelease.get(sample.release) : undefined;
      if (!sample.stack || !candidates) {
        output.push(null);
        continue;
      }
      try {
        const result = await symbolicateStack(sample.stack, async (url) => {
          const row = matchMapFile(framePath(url), candidates);
          return row ? this.loadMap(row) : null;
        });
        output.push(result.mappedFrames > 0 ? result : null);
      } catch {
        output.push(null);
      }
    }
    return output;
  }

  private async loadMap(row: MapFileRow): Promise<TraceMap | null> {
    const key = `${row.id}:${new Date(row.updatedAt).getTime()}`;
    const cached = this.cache.get(key);
    if (cached) {
      // Refresh its position so the least recently used map is evicted first.
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }

    const result = await this.database.query<{ content: string }>(`SELECT content FROM source_maps WHERE id = $1`, [row.id]);
    const content = result.rows[0]?.content;
    if (!content) return null;
    let map: TraceMap;
    try {
      map = loadTraceMap(content);
    } catch {
      return null;
    }

    this.cache.set(key, map);
    while (this.cache.size > CACHE_SIZE) {
      const oldest = this.cache.keys().next().value as string;
      this.cache.delete(oldest);
    }
    return map;
  }

  private bodyText(body: unknown): string {
    // main.ts reads this route's body raw; a parsed object only reaches here if that is bypassed.
    const text = Buffer.isBuffer(body)
      ? body.toString('utf8')
      : typeof body === 'string'
        ? body
        : body && typeof body === 'object' && Object.keys(body).length > 0
          ? JSON.stringify(body)
          : '';
    if (!text.trim()) throw new BadRequestException('Send the source map JSON as the request body.');
    if (Buffer.byteLength(text) > MAX_SOURCE_MAP_BYTES) {
      throw new BadRequestException(`Source maps can be at most ${MAX_SOURCE_MAP_BYTES / 1024 / 1024} MB.`);
    }
    return text;
  }

  private cleanRelease(value: string | undefined): string {
    const release = typeof value === 'string' ? value.trim() : '';
    if (!release) throw new BadRequestException('release is required.');
    if (release.length > MAX_RELEASE_LENGTH) {
      throw new BadRequestException(`release must be ${MAX_RELEASE_LENGTH} characters or fewer.`);
    }
    return release;
  }

  private cleanFile(value: string | undefined): string {
    const file = typeof value === 'string' ? normalizeMapFile(value) : '';
    if (!file) throw new BadRequestException('file is required: the path of the minified file, e.g. assets/index-3f2a9c1b.js.');
    if (file.length > MAX_FILE_LENGTH) throw new BadRequestException(`file must be ${MAX_FILE_LENGTH} characters or fewer.`);
    return file;
  }
}
