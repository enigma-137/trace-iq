import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';

type FlagRow = {
  [column: string]: unknown;
  id: string;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  rollout_percentage: number;
  overrides: Record<string, boolean> | null;
  payload: unknown;
};

export interface CreateFlagRequest {
  key?: string;
  name?: string;
  description?: string;
  enabled?: boolean;
  rolloutPercentage?: number;
  overrides?: unknown;
  payload?: unknown;
  projectId?: string;
}

export interface UpdateFlagRequest {
  name?: string;
  description?: string;
  enabled?: boolean;
  rolloutPercentage?: number;
  overrides?: unknown;
  payload?: unknown;
  projectId?: string;
}

const KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
// Guard against someone stashing a whole document in a flag. 10KB of JSON is
// plenty for config objects, copy, or limits.
const MAX_PAYLOAD_BYTES = 10 * 1024;

@Injectable()
export class FlagsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService
  ) {}

  // -- Dashboard CRUD -----------------------------------------------------

  async list(user: DashboardUser, projectId?: string) {
    const project = await this.projects.resolveActiveProject(user, projectId);
    if (!project) return { project: null, flags: [] };

    const result = await this.database.query<FlagRow & { updated_at: string }>(
      `SELECT * FROM feature_flags WHERE project_id = $1 ORDER BY created_at DESC`,
      [project.id]
    );
    return { project, flags: result.rows.map((row) => this.toDto(row)) };
  }

  async create(user: DashboardUser, body: CreateFlagRequest) {
    const project = await this.projects.requireActiveProject(user, body.projectId);

    const key = (typeof body.key === 'string' ? body.key.trim().toLowerCase() : '').replace(/\s+/g, '-');
    if (!KEY_PATTERN.test(key)) {
      throw new BadRequestException('Key must be lowercase letters, numbers, dashes or underscores (e.g. new-checkout).');
    }
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : key;

    const existing = await this.database.query(`SELECT 1 FROM feature_flags WHERE project_id = $1 AND key = $2`, [
      project.id,
      key
    ]);
    if (existing.rowCount > 0) {
      throw new BadRequestException(`A flag with key "${key}" already exists.`);
    }

    const payload = sanitizePayload(body.payload);

    const id = `flg_${randomUUID()}`;
    await this.database.query(
      `
        INSERT INTO feature_flags (id, project_id, key, name, description, enabled, rollout_percentage, overrides, payload, created_by_user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)
      `,
      [
        id,
        project.id,
        key,
        name,
        typeof body.description === 'string' ? body.description.trim() : null,
        Boolean(body.enabled),
        clampPercent(body.rolloutPercentage),
        JSON.stringify(sanitizeOverrides(body.overrides)),
        payload == null ? null : JSON.stringify(payload),
        user.id
      ]
    );
    return { id, key };
  }

  async update(user: DashboardUser, id: string, body: UpdateFlagRequest) {
    const project = await this.projects.requireActiveProject(user, body.projectId);
    const current = await this.database.query<FlagRow>(`SELECT * FROM feature_flags WHERE id = $1 AND project_id = $2`, [
      id,
      project.id
    ]);
    const flag = current.rows[0];
    if (!flag) throw new NotFoundException('Flag not found.');

    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : flag.name;
    const description =
      body.description === undefined ? flag.description : typeof body.description === 'string' ? body.description.trim() : null;
    const enabled = typeof body.enabled === 'boolean' ? body.enabled : flag.enabled;
    const rollout = body.rolloutPercentage === undefined ? flag.rollout_percentage : clampPercent(body.rolloutPercentage);
    const overrides = body.overrides === undefined ? flag.overrides ?? {} : sanitizeOverrides(body.overrides);
    // undefined = leave as-is, null = clear the payload, any value = replace it.
    const payload = body.payload === undefined ? flag.payload : sanitizePayload(body.payload);
    const payloadJson = payload == null ? null : JSON.stringify(payload);

    await this.database.query(
      `
        UPDATE feature_flags
        SET name = $3, description = $4, enabled = $5, rollout_percentage = $6, overrides = $7::jsonb, payload = $8::jsonb, updated_at = now()
        WHERE id = $1 AND project_id = $2
      `,
      [id, project.id, name, description, enabled, rollout, JSON.stringify(overrides), payloadJson]
    );
    return { id };
  }

  async remove(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const result = await this.database.query(`DELETE FROM feature_flags WHERE id = $1 AND project_id = $2`, [id, project.id]);
    if (result.rowCount === 0) throw new NotFoundException('Flag not found.');
    return { deleted: true };
  }

  // -- Public evaluation (write-key auth) --------------------------------

  async evaluate(writeKey: string | undefined, projectId: string | undefined, distinctId: string | undefined) {
    const key = requiredString(writeKey, 'writeKey');
    const pid = requiredString(projectId, 'projectId');
    const distinct = requiredString(distinctId, 'distinctId');
    const auth = await this.authenticateWriteKey(key, pid);

    const result = await this.database.query<FlagRow>(`SELECT * FROM feature_flags WHERE project_id = $1`, [
      auth.project_id
    ]);

    const flags: Record<string, boolean> = {};
    const payloads: Record<string, unknown> = {};
    for (const flag of result.rows) {
      const on = evaluateFlag(flag, distinct);
      flags[flag.key] = on;
      // Only ship a payload for a flag the user actually has on — a payload
      // behind an off flag should never leak to the client.
      if (on && flag.payload != null) {
        payloads[flag.key] = flag.payload;
      }
    }
    return { flags, payloads };
  }

  private async authenticateWriteKey(writeKey: string, projectId: string): Promise<{ project_id: string }> {
    const keyHash = createHash('sha256').update(writeKey).digest('hex');
    const result = await this.database.query<{ project_id: string }>(
      `
        SELECT pwk.project_id
        FROM project_write_keys pwk
        WHERE pwk.key_hash = $1 AND pwk.project_id = $2 AND pwk.revoked_at IS NULL
        LIMIT 1
      `,
      [keyHash, projectId]
    );
    const record = result.rows[0];
    if (!record) {
      throw new UnauthorizedException('Invalid projectId or write key.');
    }
    return record;
  }

  private toDto(row: FlagRow & { updated_at?: string }) {
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      enabled: row.enabled,
      rolloutPercentage: row.rollout_percentage,
      overrides: row.overrides ?? {},
      payload: row.payload ?? null,
      updatedAt: row.updated_at ?? null
    };
  }
}

// Deterministic + sticky: the same (key, distinctId) always lands in the same 0–99 bucket,
// so a user never flickers in and out as long as the rollout % only grows.
export function evaluateFlag(
  flag: Pick<FlagRow, 'enabled' | 'rollout_percentage' | 'overrides' | 'key'>,
  distinctId: string
): boolean {
  if (!flag.enabled) return false;
  const override = flag.overrides?.[distinctId];
  if (typeof override === 'boolean') return override;
  if (flag.rollout_percentage >= 100) return true;
  if (flag.rollout_percentage <= 0) return false;
  return bucketOf(flag.key, distinctId) < flag.rollout_percentage;
}

export function bucketOf(key: string, distinctId: string): number {
  const hash = createHash('sha256').update(`${key}:${distinctId}`).digest('hex');
  return parseInt(hash.slice(0, 8), 16) % 100;
}

function clampPercent(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(Math.round(parsed), 0), 100);
}

function sanitizeOverrides(input: unknown): Record<string, boolean> {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, boolean> = {};
  let count = 0;
  for (const [distinctId, value] of Object.entries(input as Record<string, unknown>)) {
    if (count >= 200) break;
    const id = distinctId.trim();
    if (id && typeof value === 'boolean') {
      out[id] = value;
      count += 1;
    }
  }
  return out;
}

// Normalizes a remote-config payload. undefined stays undefined (caller decides
// "not provided"); null means "clear". Any other value is round-tripped through
// JSON so functions/undefined are dropped, then size-capped.
function sanitizePayload(input: unknown): unknown {
  if (input === undefined) return undefined;
  if (input === null) return null;
  let serialized: string;
  try {
    serialized = JSON.stringify(input);
  } catch {
    throw new BadRequestException('Payload must be JSON-serializable.');
  }
  if (serialized === undefined) {
    // JSON.stringify returns undefined for a bare function/symbol.
    throw new BadRequestException('Payload must be JSON-serializable.');
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_PAYLOAD_BYTES) {
    throw new BadRequestException(`Payload is too large (max ${MAX_PAYLOAD_BYTES / 1024}KB).`);
  }
  return JSON.parse(serialized);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(`${field} is required.`);
  }
  return value.trim();
}
