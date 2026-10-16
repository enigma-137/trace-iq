import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';

export type PersonSummary = {
  id: string;
  externalId: string | null;
  anonymousId: string | null;
  distinctId: string;
  displayName: string;
  emailMasked: string | null;
  email: string | null;
  traits: Record<string, unknown>;
  traitsPreview: Record<string, string | number | boolean>;
  eventCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  lastOs?: string | null;
  lastDeviceType?: string | null;
  lastBrowser?: string | null;
  lastCountry?: string | null;
  lastCity?: string | null;
  isMissing?: boolean;
};

export type PersonProfile = {
  id: string;
  externalId: string | null;
  anonymousId: string | null;
  distinctId: string;
  displayName: string;
  emailMasked: string | null;
  email: string | null;
  traits: Record<string, unknown>;
  traitsPreview: Record<string, string | number | boolean>;
  eventCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  sessionCount: number;
  lastOs: string | null;
  lastDeviceType: string | null;
  lastBrowser: string | null;
  lastCountry: string | null;
  lastCity: string | null;
};

export type TimelineItem = {
  id: string;
  eventName: string;
  properties: Record<string, unknown>;
  sessionId: string | null;
  occurredAt: string;
  receivedAt: string;
};

// Priority display name resolution helper
export function resolveDisplayName(
  traits: Record<string, unknown> | null | undefined,
  externalId: string | null | undefined,
  anonymousId: string | null | undefined,
  id: string
): string {
  const t = traits ?? {};

  // 1. name
  if (typeof t.name === 'string' && t.name.trim()) return t.name.trim();
  // 2. full_name / fullName
  if (typeof t.full_name === 'string' && t.full_name.trim()) return t.full_name.trim();
  if (typeof t.fullName === 'string' && t.fullName.trim()) return t.fullName.trim();
  // 3. displayName / display_name
  if (typeof t.displayName === 'string' && t.displayName.trim()) return t.displayName.trim();
  if (typeof t.display_name === 'string' && t.display_name.trim()) return t.display_name.trim();
  // 4. firstName + lastName
  const first = typeof t.firstName === 'string' ? t.firstName.trim() : typeof t.first_name === 'string' ? t.first_name.trim() : '';
  const last = typeof t.lastName === 'string' ? t.lastName.trim() : typeof t.last_name === 'string' ? t.last_name.trim() : '';
  if (first || last) return [first, last].filter(Boolean).join(' ');
  // 5. username
  if (typeof t.username === 'string' && t.username.trim()) return t.username.trim();
  // 6. profile_name / profileName
  if (typeof t.profile_name === 'string' && t.profile_name.trim()) return t.profile_name.trim();
  if (typeof t.profileName === 'string' && t.profileName.trim()) return t.profileName.trim();

  // 7. Human-readable external_id (e.g. if developer set external_id to a clear human username "john_doe")
  // Exclude email strings, internal generated IDs (usr_..., anon_...), and UUIDs so emails are never exposed as display names
  if (externalId && typeof externalId === 'string' && externalId.trim()) {
    const ext = externalId.trim();
    const isInternalOrEmailPattern =
      ext.includes('@') ||
      /^usr_[a-zA-Z0-9_-]+/i.test(ext) ||
      /^anon_[a-zA-Z0-9_-]+/i.test(ext) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(ext) ||
      /^[0-9a-f]{16,}$/i.test(ext);

    if (!isInternalOrEmailPattern) {
      return ext;
    }
  }

  // 8. Fallback: User <shortId> (e.g. User 91A2)
  if (externalId || id) {
    const rawId = (externalId || id).replace(/^(usr_|anon_)/, '');
    const shortCode = rawId.slice(-4).toUpperCase();
    return `User ${shortCode}`;
  }

  return 'Anonymous User';
}

// Mask sensitive email for clean UI
export function maskEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== 'string' || !email.includes('@')) return null;
  const parts = email.split('@');
  const local = parts[0];
  const domain = parts[1];
  if (!local || !domain) return null;
  const first = local[0];
  return `${first}••••••••@${domain}`;
}

export const SENSITIVE_TRAIT_KEYS = new Set([
  'token',
  'access_token',
  'refresh_token',
  'auth_token',
  'authorization',
  'jwt',
  'secret',
  'client_secret',
  'apikey',
  'api_key',
  'writekey',
  'write_key',
  'password',
  'passwd',
  'password_hash',
  'hash',
  'salt',
  'session_id',
  'sessionid',
  'cookie',
  'private_key',
  'privatekey',
  'credit_card',
  'cvv',
  'ssn',
  'pin',
  'private'
]);

export function isSensitiveTraitKey(key: string): boolean {
  const lower = key.toLowerCase().trim();
  if (SENSITIVE_TRAIT_KEYS.has(lower)) return true;
  if (
    lower.includes('token') ||
    lower.includes('secret') ||
    lower.includes('password') ||
    lower.includes('passwd') ||
    lower.includes('cookie') ||
    lower.includes('session') ||
    lower.includes('private_key') ||
    lower.includes('privatekey') ||
    lower.includes('api_key') ||
    lower.includes('apikey') ||
    lower.includes('auth_') ||
    lower.startsWith('auth')
  ) {
    return true;
  }
  return false;
}

export function sanitizeTraitsPreview(traits: Record<string, unknown> | null | undefined): Record<string, string | number | boolean> {
  if (!traits || typeof traits !== 'object') return {};
  const preview: Record<string, string | number | boolean> = {};

  for (const [key, val] of Object.entries(traits)) {
    if (isSensitiveTraitKey(key)) {
      continue;
    }
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      preview[key] = val;
    }
  }
  return preview;
}

// Ingestion validation and sanitization for $identify and user traits
export function sanitizeIngestedTraits(rawTraits: unknown): Record<string, unknown> {
  if (!rawTraits || typeof rawTraits !== 'object' || Array.isArray(rawTraits)) {
    return {};
  }

  const sanitized: Record<string, unknown> = {};
  const entries = Object.entries(rawTraits as Record<string, unknown>);
  const MAX_KEYS = 100;
  const MAX_KEY_LEN = 64;
  const MAX_STRING_LEN = 1024;
  const MAX_TOTAL_SIZE = 16384; // 16 KB

  let currentCount = 0;
  for (const [rawKey, val] of entries) {
    if (currentCount >= MAX_KEYS) break;
    const key = String(rawKey).trim();
    if (!key || key.length > MAX_KEY_LEN) continue;

    // Prototype pollution guards
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }

    // Exclude sensitive traits from persistence
    if (isSensitiveTraitKey(key)) {
      continue;
    }

    if (typeof val === 'string') {
      sanitized[key] = val.slice(0, MAX_STRING_LEN);
      currentCount++;
    } else if (typeof val === 'number') {
      if (Number.isFinite(val)) {
        sanitized[key] = val;
        currentCount++;
      }
    } else if (typeof val === 'boolean') {
      sanitized[key] = val;
      currentCount++;
    } else if (Array.isArray(val)) {
      sanitized[key] = val
        .slice(0, 50)
        .filter((item) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean')
        .map((item) => (typeof item === 'string' ? item.slice(0, 256) : item));
      currentCount++;
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      // Allow shallow child objects with max 20 primitive entries
      const nested: Record<string, unknown> = {};
      let nestedCount = 0;
      for (const [nKey, nVal] of Object.entries(val as Record<string, unknown>)) {
        if (nestedCount >= 20) break;
        const nk = String(nKey).trim();
        if (!nk || nk.length > MAX_KEY_LEN || nk === '__proto__' || nk === 'constructor' || nk === 'prototype' || isSensitiveTraitKey(nk)) {
          continue;
        }
        if (typeof nVal === 'string') {
          nested[nk] = nVal.slice(0, 256);
          nestedCount++;
        } else if (typeof nVal === 'number' && Number.isFinite(nVal)) {
          nested[nk] = nVal;
          nestedCount++;
        } else if (typeof nVal === 'boolean') {
          nested[nk] = nVal;
          nestedCount++;
        }
      }
      sanitized[key] = nested;
      currentCount++;
    }
  }

  const serialized = JSON.stringify(sanitized);
  if (serialized.length > MAX_TOTAL_SIZE) {
    // If still too large, return top essential keys only
    const trimmed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(sanitized)) {
      if (JSON.stringify(trimmed).length + JSON.stringify({ [k]: v }).length < MAX_TOTAL_SIZE) {
        trimmed[k] = v;
      }
    }
    return trimmed;
  }

  return sanitized;
}

// Shared by the page query and its match count. $1 = project id, $2 = escaped search
// (ILIKE pattern body) or NULL for no search.
const PERSON_SEARCH_WHERE = `u.project_id = $1
          AND (
            $2::text IS NULL
            OR u.external_id ILIKE '%' || $2 || '%'
            OR u.anonymous_id ILIKE '%' || $2 || '%'
            OR u.id ILIKE '%' || $2 || '%'
            OR u.traits->>'name' ILIKE '%' || $2 || '%'
            OR u.traits->>'full_name' ILIKE '%' || $2 || '%'
            OR u.traits->>'displayName' ILIKE '%' || $2 || '%'
            OR u.traits->>'first_name' ILIKE '%' || $2 || '%'
            OR u.traits->>'last_name' ILIKE '%' || $2 || '%'
            OR u.traits->>'email' ILIKE '%' || $2 || '%'
            OR u.traits->>'username' ILIKE '%' || $2 || '%'
          )`;

@Injectable()
export class UsersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService
  ) {}

  async listPersons(
    user: DashboardUser,
    params: { search?: string; limit?: string; offset?: string; projectId?: string }
  ): Promise<{
    project: unknown;
    persons: PersonSummary[];
    limit: number;
    offset: number;
    totalCount?: number;
    stats?: { totalUsers: number; activeUsers14d: number; newUsers14d: number; returningUsers: number };
  }> {
    const project = await this.projects.resolveActiveProject(user, params.projectId);
    const limit = this.clamp(params.limit, 25, 1, 100);
    const offset = this.clamp(params.offset, 0, 0, 100000);
    const search = this.optionalString(params.search) ?? null;
    // Matched with ILIKE, so a literal % or _ in the query must not act as a wildcard.
    const searchPattern = search ? search.slice(0, 200).replace(/[\\%_]/g, (char) => `\\${char}`) : null;

    if (!project) {
      return { project: null, persons: [], limit, offset };
    }

    const result = await this.database.query<{
      id: string;
      externalId: string | null;
      anonymousId: string | null;
      traits: Record<string, unknown>;
      firstSeenAt: string;
      lastSeenAt: string;
      eventCount: number;
      lastOs: string | null;
      lastDeviceType: string | null;
      lastBrowser: string | null;
      lastCountry: string | null;
      lastCity: string | null;
    }>(
      `
        SELECT
          u.id,
          u.external_id AS "externalId",
          u.anonymous_id AS "anonymousId",
          u.traits,
          u.first_seen_at AS "firstSeenAt",
          u.last_seen_at AS "lastSeenAt",
          (SELECT count(*) FROM events e WHERE e.user_id = u.id)::int AS "eventCount",
          (SELECT e.device_info->>'os' FROM events e WHERE e.user_id = u.id AND NULLIF(e.device_info->>'os','') IS NOT NULL ORDER BY e.occurred_at DESC LIMIT 1) AS "lastOs",
          (SELECT e.device_info->>'deviceType' FROM events e WHERE e.user_id = u.id AND NULLIF(e.device_info->>'deviceType','') IS NOT NULL ORDER BY e.occurred_at DESC LIMIT 1) AS "lastDeviceType",
          (SELECT e.device_info->>'browser' FROM events e WHERE e.user_id = u.id AND NULLIF(e.device_info->>'browser','') IS NOT NULL ORDER BY e.occurred_at DESC LIMIT 1) AS "lastBrowser",
          (SELECT e.network_info->>'country' FROM events e WHERE e.user_id = u.id AND NULLIF(e.network_info->>'country','') IS NOT NULL ORDER BY e.occurred_at DESC LIMIT 1) AS "lastCountry",
          (SELECT e.network_info->>'city' FROM events e WHERE e.user_id = u.id AND NULLIF(e.network_info->>'city','') IS NOT NULL ORDER BY e.occurred_at DESC LIMIT 1) AS "lastCity"
        FROM users u
        WHERE ${PERSON_SEARCH_WHERE}
        ORDER BY u.last_seen_at DESC
        LIMIT $3 OFFSET $4
      `,
      [project.id, searchPattern, limit, offset]
    );

    const persons: PersonSummary[] = result.rows.map((row) => {
      const distinctId = row.externalId ?? row.id;
      const displayName = resolveDisplayName(row.traits, row.externalId, row.anonymousId, row.id);
      const emailRaw =
        typeof row.traits?.email === 'string'
          ? (row.traits.email as string)
          : row.externalId && row.externalId.includes('@')
            ? row.externalId
            : null;
      const emailMasked = maskEmail(emailRaw);
      const traitsPreview = sanitizeTraitsPreview(row.traits);

      return {
        id: row.id,
        externalId: row.externalId,
        anonymousId: row.anonymousId,
        distinctId,
        displayName,
        emailMasked,
        email: emailRaw,
        traits: row.traits ?? {},
        traitsPreview,
        eventCount: row.eventCount ?? 0,
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
        lastOs: row.lastOs ?? null,
        lastDeviceType: row.lastDeviceType ?? null,
        lastBrowser: row.lastBrowser ?? null,
        lastCountry: row.lastCountry ?? null,
        lastCity: row.lastCity ?? null
      };
    });
    const countResult = await this.database.query<{
      totalUsers: number;
      activeUsers14d: number;
      newUsers14d: number;
      returningUsers: number;
    }>(
      `
        SELECT
          count(*)::int AS "totalUsers",
          count(CASE WHEN u.last_seen_at >= now() - interval '14 days' THEN 1 END)::int AS "activeUsers14d",
          count(CASE WHEN u.first_seen_at >= now() - interval '14 days' THEN 1 END)::int AS "newUsers14d",
          count(CASE WHEN u.first_seen_at < now() - interval '14 days' AND u.last_seen_at >= now() - interval '14 days' THEN 1 END)::int AS "returningUsers"
        FROM users u
        WHERE u.project_id = $1
      `,
      [project.id]
    );

    const stats = countResult.rows[0] ?? {
      totalUsers: 0,
      activeUsers14d: 0,
      newUsers14d: 0,
      returningUsers: 0
    };

    // While searching, pagination counts the matches; the stat cards stay project-wide.
    let totalCount = stats.totalUsers;
    if (searchPattern) {
      const matches = await this.database.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM users u WHERE ${PERSON_SEARCH_WHERE}`,
        [project.id, searchPattern]
      );
      totalCount = Number(matches.rows[0]?.count ?? 0);
    }

    return {
      project,
      persons,
      limit,
      offset,
      totalCount,
      stats
    };
  }

  async searchPersons(
    user: DashboardUser,
    params: { search?: string; limit?: string; cursor?: string; offset?: string; projectId?: string }
  ): Promise<{ persons: PersonSummary[]; nextCursor: string | null }> {
    const project = await this.projects.resolveActiveProject(user, params.projectId);
    const limit = this.clamp(params.limit, 25, 1, 100);
    const search = this.optionalString(params.search) ?? null;

    if (!project) {
      return { persons: [], nextCursor: null };
    }

    let cursorDate: string | null = null;
    let cursorId: string | null = null;
    if (params.cursor && params.cursor.includes(':')) {
      const [cDate, ...rest] = params.cursor.split(':');
      const cId = rest.join(':');
      if (cDate && cId && !isNaN(Date.parse(cDate))) {
        cursorDate = new Date(cDate).toISOString();
        cursorId = cId;
      }
    }

    const result = await this.database.query<{
      id: string;
      externalId: string | null;
      anonymousId: string | null;
      traits: Record<string, unknown>;
      firstSeenAt: string;
      lastSeenAt: string;
    }>(
      `
        SELECT
          u.id,
          u.external_id AS "externalId",
          u.anonymous_id AS "anonymousId",
          u.traits,
          u.first_seen_at AS "firstSeenAt",
          u.last_seen_at AS "lastSeenAt"
        FROM users u
        WHERE u.project_id = $1
          AND (
            $2::text IS NULL
            OR u.external_id ILIKE '%' || $2 || '%'
            OR (
              COALESCE(u.traits->>'name', '') || ' ' ||
              COALESCE(u.traits->>'full_name', '') || ' ' ||
              COALESCE(u.traits->>'displayName', '') || ' ' ||
              COALESCE(u.traits->>'email', '') || ' ' ||
              COALESCE(u.traits->>'username', '')
            ) ILIKE '%' || $2 || '%'
            OR u.anonymous_id ILIKE '%' || $2 || '%'
            OR u.id = $2
          )
          AND (
            $3::timestamptz IS NULL
            OR (u.last_seen_at, u.id) < ($3::timestamptz, $4::text)
          )
        ORDER BY u.last_seen_at DESC, u.id DESC
        LIMIT $5
      `,
      [project.id, search, cursorDate, cursorId, limit + 1]
    );

    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
    const lastRow = rows[rows.length - 1];
    const nextCursor = hasMore && lastRow ? `${lastRow.lastSeenAt}:${lastRow.id}` : null;

    const persons: PersonSummary[] = rows.map((row) => {
      const distinctId = row.externalId ?? row.id;
      const displayName = resolveDisplayName(row.traits, row.externalId, row.anonymousId, row.id);
      const emailRaw =
        typeof row.traits?.email === 'string'
          ? (row.traits.email as string)
          : row.externalId && row.externalId.includes('@')
            ? row.externalId
            : null;
      const emailMasked = maskEmail(emailRaw);
      const traitsPreview = sanitizeTraitsPreview(row.traits);

      return {
        id: row.id,
        externalId: row.externalId,
        anonymousId: row.anonymousId,
        distinctId,
        displayName,
        emailMasked,
        email: emailRaw,
        traits: row.traits ?? {},
        traitsPreview,
        eventCount: 0,
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
        lastOs: null,
        lastDeviceType: null,
        lastBrowser: null,
        lastCountry: typeof row.traits?.country === 'string' ? row.traits.country : null,
        lastCity: null
      };
    });

    return { persons, nextCursor };
  }

  async resolveUsersByIds(
    user: DashboardUser,
    distinctIds: string[],
    projectId?: string
  ): Promise<{ persons: PersonSummary[] }> {
    const project = await this.projects.requireActiveProject(user, projectId);
    if (!distinctIds || distinctIds.length === 0) {
      return { persons: [] };
    }

    const uniqueIds = Array.from(new Set(distinctIds.map((id) => id.trim()).filter(Boolean)));
    if (uniqueIds.length === 0) {
      return { persons: [] };
    }

    const result = await this.database.query<{
      id: string;
      externalId: string | null;
      anonymousId: string | null;
      traits: Record<string, unknown>;
      firstSeenAt: string;
      lastSeenAt: string;
      eventCount: number;
      lastOs: string | null;
      lastDeviceType: string | null;
      lastBrowser: string | null;
      lastCountry: string | null;
      lastCity: string | null;
    }>(
      `
        SELECT
          u.id,
          u.external_id AS "externalId",
          u.anonymous_id AS "anonymousId",
          u.traits,
          u.first_seen_at AS "firstSeenAt",
          u.last_seen_at AS "lastSeenAt",
          (SELECT count(*) FROM events e WHERE e.user_id = u.id)::int AS "eventCount",
          (SELECT e.device_info->>'os' FROM events e WHERE e.user_id = u.id AND NULLIF(e.device_info->>'os','') IS NOT NULL ORDER BY e.occurred_at DESC LIMIT 1) AS "lastOs",
          (SELECT e.device_info->>'deviceType' FROM events e WHERE e.user_id = u.id AND NULLIF(e.device_info->>'deviceType','') IS NOT NULL ORDER BY e.occurred_at DESC LIMIT 1) AS "lastDeviceType",
          (SELECT e.device_info->>'browser' FROM events e WHERE e.user_id = u.id AND NULLIF(e.device_info->>'browser','') IS NOT NULL ORDER BY e.occurred_at DESC LIMIT 1) AS "lastBrowser",
          (SELECT e.network_info->>'country' FROM events e WHERE e.user_id = u.id AND NULLIF(e.network_info->>'country','') IS NOT NULL ORDER BY e.occurred_at DESC LIMIT 1) AS "lastCountry",
          (SELECT e.network_info->>'city' FROM events e WHERE e.user_id = u.id AND NULLIF(e.network_info->>'city','') IS NOT NULL ORDER BY e.occurred_at DESC LIMIT 1) AS "lastCity"
        FROM users u
        WHERE u.project_id = $1
          AND (
            u.external_id = ANY($2)
            OR u.id = ANY($2)
            OR u.anonymous_id = ANY($2)
          )
      `,
      [project.id, uniqueIds]
    );

    const foundMap = new Map<string, PersonSummary>();
    for (const row of result.rows) {
      const distinctId = row.externalId ?? row.id;
      const displayName = resolveDisplayName(row.traits, row.externalId, row.anonymousId, row.id);
      const emailRaw =
        typeof row.traits?.email === 'string'
          ? (row.traits.email as string)
          : row.externalId && row.externalId.includes('@')
            ? row.externalId
            : null;
      const emailMasked = maskEmail(emailRaw);
      const traitsPreview = sanitizeTraitsPreview(row.traits);

      const summary: PersonSummary = {
        id: row.id,
        externalId: row.externalId,
        anonymousId: row.anonymousId,
        distinctId,
        displayName,
        emailMasked,
        email: emailRaw,
        traits: row.traits ?? {},
        traitsPreview,
        eventCount: row.eventCount ?? 0,
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
        lastOs: row.lastOs ?? null,
        lastDeviceType: row.lastDeviceType ?? null,
        lastBrowser: row.lastBrowser ?? null,
        lastCountry: row.lastCountry ?? null,
        lastCity: row.lastCity ?? null
      };

      if (row.externalId) foundMap.set(row.externalId, summary);
      if (row.id) foundMap.set(row.id, summary);
      if (row.anonymousId) foundMap.set(row.anonymousId, summary);
    }

    // Return in order requested, including friendly placeholder if missing/deleted
    const persons: PersonSummary[] = uniqueIds.map((targetId) => {
      const existing = foundMap.get(targetId);
      if (existing) return existing;

      return {
        id: targetId,
        externalId: targetId,
        anonymousId: null,
        distinctId: targetId,
        displayName: targetId.includes('@') ? targetId.split('@')[0] : `Unknown user (${targetId.slice(-6)})`,
        emailMasked: targetId.includes('@') ? maskEmail(targetId) : null,
        email: targetId.includes('@') ? targetId : null,
        traits: {},
        traitsPreview: {},
        eventCount: 0,
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        isMissing: true
      };
    });

    return { persons };
  }

  async getPerson(user: DashboardUser, personId: string, projectId?: string): Promise<PersonProfile> {
    const project = await this.projects.requireActiveProject(user, projectId);

    const result = await this.database.query<{
      id: string;
      externalId: string | null;
      anonymousId: string | null;
      traits: Record<string, unknown>;
      firstSeenAt: string;
      lastSeenAt: string;
      eventCount: number;
      sessionCount: number;
      lastOs: string | null;
      lastDeviceType: string | null;
      lastBrowser: string | null;
      lastCountry: string | null;
      lastCity: string | null;
    }>(
      `
        SELECT
          u.id,
          u.external_id AS "externalId",
          u.anonymous_id AS "anonymousId",
          u.traits,
          u.first_seen_at AS "firstSeenAt",
          u.last_seen_at AS "lastSeenAt",
          (SELECT count(*) FROM events e WHERE e.user_id = u.id)::int AS "eventCount",
          (SELECT count(*) FROM sessions s WHERE s.user_id = u.id)::int AS "sessionCount",
          (SELECT e.device_info->>'os' FROM events e WHERE e.user_id = u.id AND NULLIF(e.device_info->>'os','') IS NOT NULL ORDER BY e.occurred_at DESC LIMIT 1) AS "lastOs",
          (SELECT e.device_info->>'deviceType' FROM events e WHERE e.user_id = u.id AND NULLIF(e.device_info->>'deviceType','') IS NOT NULL ORDER BY e.occurred_at DESC LIMIT 1) AS "lastDeviceType",
          (SELECT e.device_info->>'browser' FROM events e WHERE e.user_id = u.id AND NULLIF(e.device_info->>'browser','') IS NOT NULL ORDER BY e.occurred_at DESC LIMIT 1) AS "lastBrowser",
          (SELECT e.network_info->>'country' FROM events e WHERE e.user_id = u.id AND NULLIF(e.network_info->>'country','') IS NOT NULL ORDER BY e.occurred_at DESC LIMIT 1) AS "lastCountry",
          (SELECT e.network_info->>'city' FROM events e WHERE e.user_id = u.id AND NULLIF(e.network_info->>'city','') IS NOT NULL ORDER BY e.occurred_at DESC LIMIT 1) AS "lastCity"
        FROM users u
        WHERE u.id = $1 AND u.project_id = $2
        LIMIT 1
      `,
      [personId, project.id]
    );

    const person = result.rows[0];
    if (!person) {
      throw new NotFoundException('Person not found.');
    }

    const distinctId = person.externalId ?? person.id;
    const displayName = resolveDisplayName(person.traits, person.externalId, person.anonymousId, person.id);
    const emailRaw =
      typeof person.traits?.email === 'string'
        ? (person.traits.email as string)
        : person.externalId && person.externalId.includes('@')
          ? person.externalId
          : null;
    const emailMasked = maskEmail(emailRaw);
    const traitsPreview = sanitizeTraitsPreview(person.traits);

    return {
      ...person,
      distinctId,
      displayName,
      emailMasked,
      email: emailRaw,
      traitsPreview
    };
  }

  async getTimeline(
    user: DashboardUser,
    personId: string,
    params: { limit?: string; offset?: string; projectId?: string }
  ): Promise<{ items: TimelineItem[]; limit: number; offset: number }> {
    const project = await this.projects.requireActiveProject(user, params.projectId);
    // Ensure the person belongs to this project before returning their events.
    await this.getPerson(user, personId, project.id);

    const limit = this.clamp(params.limit, 50, 1, 200);
    const offset = this.clamp(params.offset, 0, 0, 100000);

    const result = await this.database.query<TimelineItem>(
      `
        SELECT
          e.id,
          e.event_name AS "eventName",
          e.properties,
          e.session_id AS "sessionId",
          e.occurred_at AS "occurredAt",
          e.received_at AS "receivedAt"
        FROM events e
        WHERE e.project_id = $1 AND e.user_id = $2
        ORDER BY e.occurred_at DESC
        LIMIT $3 OFFSET $4
      `,
      [project.id, personId, limit, offset]
    );

    return { items: result.rows, limit, offset };
  }

  private clamp(value: string | undefined, fallback: number, min: number, max: number): number {
    const parsed = value ? Number(value) : undefined;
    if (parsed === undefined || !Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(Math.max(Math.trunc(parsed), min), max);
  }

  private optionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
}
