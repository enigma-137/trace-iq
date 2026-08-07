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
  targeting: FlagTarget[] | null;
  payload: unknown;
};

export type FlagTarget = {
  property: string;
  operator: FlagOperator;
  value: string | number | boolean;
};

export type FlagOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';
const ALLOWED_OPERATORS: readonly FlagOperator[] = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'];
const MAX_TARGETS = 20;

export interface CreateFlagRequest {
  key?: string;
  name?: string;
  description?: string;
  enabled?: boolean;
  rolloutPercentage?: number;
  overrides?: unknown;
  targeting?: unknown;
  payload?: unknown;
  projectId?: string;
}

export interface UpdateFlagRequest {
  name?: string;
  description?: string;
  enabled?: boolean;
  rolloutPercentage?: number;
  overrides?: unknown;
  targeting?: unknown;
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
    const targeting = sanitizeTargeting(body.targeting);

    const id = `flg_${randomUUID()}`;
    await this.database.query(
      `
        INSERT INTO feature_flags (id, project_id, key, name, description, enabled, rollout_percentage, overrides, targeting, payload, created_by_user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11)
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
        JSON.stringify(targeting),
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
    const targeting = body.targeting === undefined ? flag.targeting ?? [] : sanitizeTargeting(body.targeting);

    await this.database.query(
      `
        UPDATE feature_flags
        SET name = $3, description = $4, enabled = $5, rollout_percentage = $6, overrides = $7::jsonb, targeting = $8::jsonb, payload = $9::jsonb, updated_at = now()
        WHERE id = $1 AND project_id = $2
      `,
      [id, project.id, name, description, enabled, rollout, JSON.stringify(overrides), JSON.stringify(targeting), payloadJson]
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

  async evaluate(
    writeKey: string | undefined,
    projectId: string | undefined,
    distinctId: string | undefined,
    properties?: Record<string, unknown>
  ) {
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
      const on = evaluateFlag(flag, distinct, properties ?? {});
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
      targeting: row.targeting ?? [],
      payload: row.payload ?? null,
      updatedAt: row.updated_at ?? null
    };
  }
}

// Deterministic + sticky: the same (key, distinctId) always lands in the same 0–99 bucket,
// so a user never flickers in and out as long as the rollout % only grows.
// Precedence: master switch → per-user override → targeting rules → % rollout.
export function evaluateFlag(
  flag: Pick<FlagRow, 'enabled' | 'rollout_percentage' | 'overrides' | 'targeting' | 'key'>,
  distinctId: string,
  properties: Record<string, unknown> = {}
): boolean {
  if (!flag.enabled) return false;
  const override = flag.overrides?.[distinctId];
  if (typeof override === 'boolean') return override;
  if (flag.targeting && flag.targeting.length > 0 && !matchesTargeting(flag.targeting, properties)) {
    return false;
  }
  if (flag.rollout_percentage >= 100) return true;
  if (flag.rollout_percentage <= 0) return false;
  return bucketOf(flag.key, distinctId) < flag.rollout_percentage;
}

// AND-only: every rule must match, and a referenced property must actually be present.
export function matchesTargeting(targeting: FlagTarget[], properties: Record<string, unknown>): boolean {
  for (const rule of targeting) {
    if (!(rule.property in properties)) {
      return false;
    }
    if (!compareOperator(properties[rule.property], rule.operator, rule.value)) {
      return false;
    }
  }
  return true;
}

function compareOperator(actual: unknown, operator: FlagOperator, expected: FlagTarget['value']): boolean {
  switch (operator) {
    case 'eq':
      return valuesEqual(actual, expected);
    case 'ne':
      return !valuesEqual(actual, expected);
    case 'gt':
      return numericCmp(actual, expected) > 0;
    case 'gte':
      return numericCmp(actual, expected) >= 0;
    case 'lt':
      return numericCmp(actual, expected) < 0;
    case 'lte':
      return numericCmp(actual, expected) <= 0;
    default:
      return false;
  }
}

function valuesEqual(actual: unknown, expected: unknown): boolean {
  const left = typeof actual === 'number' || typeof expected === 'number' ? normalizeNumber(actual) : String(actual);
  const right = typeof actual === 'number' || typeof expected === 'number' ? normalizeNumber(expected) : String(expected);
  if (typeof left === 'number' && typeof right === 'number' && Number.isFinite(left) && Number.isFinite(right)) {
    return left === right;
  }
  return String(actual) === String(expected);
}

// NaN (or null/undefined/mismatched) means the comparison is inconclusive → no match,
// so missing/wrong-type values never satisfy a numeric rule by accident.
function numericCmp(actual: unknown, expected: unknown): number {
  const left = Number(actual);
  const right = Number(expected);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return NaN;
  return left - right;
}

function normalizeNumber(value: unknown): number | string {
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? asNumber : String(value);
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

// Normalizes a flag's AND-combined targeting rules. undefined/null → []. Invalid entries
// are rejected so the dashboard never stores a rule that silently matches nothing.
function sanitizeTargeting(input: unknown): FlagTarget[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) {
    throw new BadRequestException('targeting must be an array of { property, operator, value } rules.');
  }
  const out: FlagTarget[] = [];
  for (const item of input) {
    if (out.length >= MAX_TARGETS) break;
    const source = (item ?? {}) as Record<string, unknown>;
    const property = typeof source.property === 'string' ? source.property.trim() : '';
    const operator = typeof source.operator === 'string' ? source.operator : '';
    if (!property) throw new BadRequestException('Each targeting rule needs a property.');
    if (!ALLOWED_OPERATORS.includes(operator as FlagOperator)) {
      throw new BadRequestException(`Unsupported targeting operator: "${operator}".`);
    }
    const value = source.value;
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      throw new BadRequestException(`Targeting value for "${property}" must be a string, number or boolean.`);
    }
    out.push({ property, operator: operator as FlagOperator, value });
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
