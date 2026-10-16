import { BadRequestException, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DashboardUser } from '../auth/auth.service';
import { DatabaseService } from '../../database/database.service';
import { extractClientIp, resolveGeo } from '../../common/geo';
import { WebhooksService } from '../webhooks/webhooks.service';
import { AchievementsService } from '../achievements/achievements.service';
import { UsageService } from '../billing/usage.service';
import { EntitlementService } from '../billing/entitlement.service';
import { sanitizeIngestedTraits } from '../users/users.service';
import { getPreferredProjectId } from '../../common/active-project';
import { SetupVerificationsService } from '../setup-verifications/setup-verifications.service';
import { RequestsService } from '../requests/requests.service';
import {
  API_REQUEST_EVENT,
  ApiRequestRecord,
  normalizeApiRequest,
  stripApiRequestPayload
} from '../requests/request-capture';

type JsonObject = Record<string, unknown>;

export interface IngestMeta {
  ip?: string;
  forwardedFor?: string;
  realIp?: string;
  headers?: Record<string, string | undefined>;
}

export interface WriteKeyRecord {
  [column: string]: unknown;
  project_id: string;
  organization_id: string;
}

interface UserRecord {
  [column: string]: unknown;
  id: string;
}

export interface IngestEventRequest {
  writeKey?: string;
  projectId?: string;
  userId?: string;
  anonymousId?: string;
  sessionId?: string;
  eventName?: string;
  properties?: JsonObject;
  deviceInfo?: JsonObject;
  networkInfo?: JsonObject;
  context?: JsonObject;
  timestamp?: string;
}

export interface IngestEventResponse {
  accepted: true;
  eventId: string;
  usageWarningPercentage?: 70 | 90 | 100;
}

export interface BatchIngestResponse {
  accepted: true;
  results: Array<{ accepted: boolean; eventId?: string; error?: string }>;
  usageWarningPercentage?: 70 | 90 | 100;
}

const MAX_BATCH_SIZE = 500;

// Write keys change rarely, so caching the lookup removes a DB round-trip from the
// ingest hot path. Kept short so a revoked key stops working within seconds.
const WRITE_KEY_TTL_MS = 10 * 1000;
// Once an anonymous_id is stitched to a user we never need to redo it, so remember
// the pairing and skip the (transactional) backfill on every later event.
const MAX_LINK_CACHE = 100_000;

// One prepared, validated event awaiting a bulk insert.
interface PreparedEvent {
  index: number;
  eventName: string;
  occurredAt: Date;
  anonymousId?: string;
  externalId?: string;
  sessionId?: string;
  properties?: JsonObject;
  // `$api_request` only: the properties as sent, payload included. Never stored on
  // the event; only read to build the redacted `api_requests` row.
  rawProperties?: JsonObject;
  deviceInfo?: JsonObject;
  networkInfo: JsonObject;
  context: JsonObject;
  userId: string | null;
}

@Injectable()
export class EventsService {
  private writeKeyCache = new Map<string, { record: WriteKeyRecord; expiresAt: number }>();
  private linkedIdentities = new Set<string>();

  constructor(
    private readonly database: DatabaseService,
    private readonly webhooks: WebhooksService,
    private readonly achievements: AchievementsService,
    private readonly usage: UsageService = new UsageService(new EntitlementService(database)),
    @Optional() private readonly setupVerifications?: SetupVerificationsService,
    @Optional() private readonly requests?: RequestsService
  ) {}

  async ingest(input: IngestEventRequest, meta: IngestMeta = {}): Promise<IngestEventResponse> {
    const writeKey = this.requiredString(input.writeKey, 'writeKey');
    const projectId = this.requiredString(input.projectId, 'projectId');
    const auth = await this.authenticateWriteKey(writeKey, projectId);
    return this.ingestWithAuth(auth, input, meta);
  }

  // Batch path for server SDKs: authenticate the write key once, then insert every
  // event. A single bad event fails only itself; the rest still land.
  async ingestBatch(
    writeKey: string | undefined,
    projectId: string | undefined,
    batch: IngestEventRequest[] | undefined,
    meta: IngestMeta = {}
  ): Promise<BatchIngestResponse> {
    const key = this.requiredString(writeKey, 'writeKey');
    const pid = this.requiredString(projectId, 'projectId');
    if (!Array.isArray(batch) || batch.length === 0) {
      throw new BadRequestException('batch must be a non-empty array of events.');
    }
    if (batch.length > MAX_BATCH_SIZE) {
      throw new BadRequestException(`batch is limited to ${MAX_BATCH_SIZE} events per request.`);
    }

    const auth = await this.authenticateWriteKey(key, pid);
    const results: BatchIngestResponse['results'] = new Array(batch.length);

    // Validate + normalize each event up front. A bad event fails only itself; the
    // rest are processed together in bulk below.
    const prepared: PreparedEvent[] = [];
    batch.forEach((item, index) => {
      try {
        const eventName = this.requiredString(item.eventName, 'eventName');
        prepared.push({
          index,
          eventName,
          occurredAt: this.parseTimestamp(item.timestamp),
          anonymousId: this.optionalString(item.anonymousId),
          externalId: this.optionalString(item.userId),
          sessionId: this.optionalString(item.sessionId),
          properties: stripApiRequestPayload(eventName, item.properties),
          rawProperties: eventName === API_REQUEST_EVENT ? item.properties : undefined,
          deviceInfo: item.deviceInfo,
          networkInfo: this.buildNetworkInfo(item.networkInfo, meta),
          context: item.context ?? {},
          userId: null
        });
      } catch (error) {
        results[index] = { accepted: false, error: error instanceof Error ? error.message : 'ingest failed' };
      }
    });

    if (prepared.length === 0) {
      return { accepted: true, results };
    }

    // 1) Upsert every distinct identified user once, then map each event to its user id.
    const userMap = await this.bulkEnsureUsers(
      auth.project_id,
      prepared.filter((p) => p.externalId).map((p) => ({ externalId: p.externalId as string, anonymousId: p.anonymousId }))
    );
    for (const p of prepared) {
      p.userId = p.externalId ? userMap.get(p.externalId) ?? null : null;
    }

    // 2) Upsert every distinct session once.
    const sessionIds = [...new Set(prepared.filter((p) => p.sessionId).map((p) => p.sessionId as string))];
    await this.bulkEnsureSessions(
      auth.project_id,
      prepared
        .filter((p) => p.sessionId)
        .map((p) => ({ sessionId: p.sessionId as string, userId: p.userId, anonymousId: p.anonymousId, context: p.context }))
    );
    await this.backfillSessionIdentities(auth.project_id, sessionIds);

    // 3) Stitch each distinct new anonymous→user pairing (cache-guarded, so repeats are free).
    const seenPairs = new Set<string>();
    for (const p of prepared) {
      if (p.userId && p.anonymousId) {
        const pairKey = `${p.anonymousId}=>${p.userId}`;
        if (!seenPairs.has(pairKey)) {
          seenPairs.add(pairKey);
          await this.linkIdentity(auth.project_id, p.anonymousId, p.userId);
        }
      }
    }

    // 4) One multi-row insert for the whole batch.
    const { eventIds, usageWarningPercentage } = await this.bulkInsertEvents(auth, prepared);
    await this.backfillSessionIdentities(auth.project_id, sessionIds);

    // Merge traits onto user profiles if identified
    for (const p of prepared) {
      if (p.userId && (p.eventName === '$identify' || (p.properties && p.properties.traits))) {
        const rawTraits = (p.properties?.traits ?? (p.eventName === '$identify' ? p.properties : {})) as Record<string, unknown>;
        const sanitized = sanitizeIngestedTraits(rawTraits);
        if (sanitized && Object.keys(sanitized).length > 0) {
          void this.database.query(
            `UPDATE users SET traits = COALESCE(traits, '{}'::jsonb) || $3::jsonb, updated_at = now() WHERE project_id = $1 AND id = $2`,
            [auth.project_id, p.userId, JSON.stringify(sanitized)]
          );
        }
      }
    }

    prepared.forEach((p, i) => {
      const eventId = eventIds[i];
      results[p.index] = { accepted: true, eventId };
      void this.webhooks.deliverForEvent(auth.project_id, {
        id: eventId,
        eventName: p.eventName,
        userId: p.userId,
        anonymousId: p.anonymousId ?? null,
        sessionId: p.sessionId ?? null,
        properties: p.properties ?? {},
        occurredAt: p.occurredAt.toISOString()
      });

      // Match against pending verification sessions
      const resolvedProjectId = auth.project_id ?? (auth as { projectId?: string }).projectId;
      if (resolvedProjectId) {
        void this.setupVerifications?.recordVerificationIfMatching(
          resolvedProjectId,
          {
            eventName: p.eventName,
            occurredAt: p.occurredAt,
            properties: p.properties,
            context: p.context,
            deviceInfo: p.deviceInfo,
            networkInfo: p.networkInfo,
            userId: p.userId,
            anonymousId: p.anonymousId
          },
          meta,
          eventId
        );
      }
    });

    // Re-evaluate workspace achievements without blocking the ingest response.
    void this.achievements.afterProjectIngest(auth.project_id);

    return { accepted: true, results, ...(usageWarningPercentage ? { usageWarningPercentage } : {}) };
  }

  // Ensure every unique external_id in this batch has a corresponding row in `users`.
  // Uses ON CONFLICT to make it idempotent, returning a map of external_id -> user_id.
  private async bulkEnsureUsers(
    projectId: string,
    users: Array<{ externalId: string; anonymousId?: string }>
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    // Dedupe by external_id so one INSERT can't touch the same conflict row twice.
    const distinct = new Map<string, string | undefined>();
    for (const u of users) {
      if (!distinct.has(u.externalId)) distinct.set(u.externalId, u.anonymousId);
    }
    if (distinct.size === 0) return map;

    const values: unknown[] = [];
    const groups: string[] = [];
    let idx = 0;
    for (const [externalId, anon] of distinct) {
      const base = idx * 4;
      groups.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
      values.push(`usr_${randomUUID()}`, projectId, externalId, anon ?? null);
      idx += 1;
    }

    const result = await this.database.query<{ external_id: string; id: string }>(
      `
        INSERT INTO users (id, project_id, external_id, anonymous_id)
        VALUES ${groups.join(', ')}
        ON CONFLICT (project_id, external_id)
        WHERE external_id IS NOT NULL
        DO UPDATE
        SET anonymous_id = COALESCE(users.anonymous_id, EXCLUDED.anonymous_id),
            last_seen_at = now(),
            updated_at = now()
        RETURNING external_id, id
      `,
      values
    );
    for (const row of result.rows) map.set(row.external_id, row.id);
    return map;
  }

  // Upsert distinct sessions in a single statement.
  private async bulkEnsureSessions(
    projectId: string,
    sessions: Array<{ sessionId: string; userId: string | null; anonymousId?: string; context: JsonObject }>
  ): Promise<void> {
    const distinct = new Map<string, { userId: string | null; anonymousId?: string; context: JsonObject }>();
    for (const s of sessions) {
      const existing = distinct.get(s.sessionId);
      distinct.set(s.sessionId, {
        userId: s.userId ?? existing?.userId ?? null,
        anonymousId: s.anonymousId ?? existing?.anonymousId,
        context: s.context ?? existing?.context ?? {}
      });
    }
    if (distinct.size === 0) return;

    const values: unknown[] = [];
    const groups: string[] = [];
    let idx = 0;
    for (const [sessionId, s] of distinct) {
      const base = idx * 5;
      groups.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::jsonb)`);
      values.push(sessionId, projectId, s.userId, s.anonymousId ?? null, JSON.stringify(s.context ?? {}));
      idx += 1;
    }

    await this.database.query(
      `
        INSERT INTO sessions (id, project_id, user_id, anonymous_id, context)
        VALUES ${groups.join(', ')}
        ON CONFLICT (id) DO UPDATE
        SET user_id = COALESCE(EXCLUDED.user_id, sessions.user_id),
            anonymous_id = COALESCE(EXCLUDED.anonymous_id, sessions.anonymous_id),
            last_seen_at = now(),
            context = sessions.context || EXCLUDED.context
      `,
      values
    );
  }

  // Insert all prepared events in one multi-row statement; returns ids aligned to `prepared`.
  // Normalizes `$api_request` events into request records (payloads gated by the
  // project's capture policy and redacted). Malformed requests are skipped here
  // but the event itself is still stored, exactly as before.
  private async buildApiRequestRecords(
    auth: WriteKeyRecord,
    items: Array<{
      eventId: string;
      eventName: string;
      occurredAt: Date;
      sessionId?: string;
      anonymousId?: string;
      userId: string | null;
      rawProperties?: JsonObject;
      context: JsonObject;
    }>
  ): Promise<ApiRequestRecord[]> {
    const candidates = items.filter((item) => item.eventName === API_REQUEST_EVENT);
    if (!this.requests || candidates.length === 0) return [];
    const hasPayload = candidates.some((item) => item.rawProperties?.payload);
    const settings = hasPayload ? await this.requests.captureSettingsFor(auth.project_id) : null;

    const records: ApiRequestRecord[] = [];
    for (const item of candidates) {
      const record = normalizeApiRequest({
        id: `req_${randomUUID().replace(/-/g, '')}`,
        eventId: item.eventId,
        organizationId: auth.organization_id,
        projectId: auth.project_id,
        occurredAt: item.occurredAt,
        properties: item.rawProperties,
        context: item.context,
        sessionId: item.sessionId ?? null,
        userId: item.userId,
        anonymousId: item.anonymousId ?? null,
        settings
      });
      if (record) records.push(record);
    }
    return records;
  }

  private async bulkInsertEvents(auth: WriteKeyRecord, prepared: PreparedEvent[]) {
    if (prepared.length === 0) return { eventIds: [] as string[], usageWarningPercentage: undefined };

    const values: unknown[] = [];
    const groups: string[] = [];
    const ids: string[] = [];
    prepared.forEach((p, i) => {
      const eventId = `evt_${randomUUID()}`;
      ids.push(eventId);
      const base = i * 12;
      groups.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}::jsonb, $${base + 9}::jsonb, $${base + 10}::jsonb, $${base + 11}::jsonb, $${base + 12})`
      );
      values.push(
        eventId,
        auth.organization_id,
        auth.project_id,
        p.userId,
        p.anonymousId ?? null,
        p.sessionId ?? null,
        p.eventName,
        JSON.stringify(p.properties ?? {}),
        JSON.stringify(p.deviceInfo ?? {}),
        JSON.stringify(p.networkInfo),
        JSON.stringify(p.context ?? {}),
        p.occurredAt.toISOString()
      );
    });

    const requestRecords = await this.buildApiRequestRecords(
      auth,
      prepared.map((p, i) => ({ ...p, eventId: ids[i] }))
    );

    const consumption = await this.database.transaction(async (client) => {
      const usage = await this.usage.consumeProjectEvents(client, auth.organization_id, auth.project_id, prepared.length);
      await client.query(`
        INSERT INTO events (
          id, organization_id, project_id, user_id, anonymous_id, session_id,
          event_name, properties, device_info, network_info, context, occurred_at
        )
        VALUES ${groups.join(', ')}
      `, values);
      await this.requests?.insertRecords(client, requestRecords);
      return usage;
    });
    return { eventIds: ids, usageWarningPercentage: consumption.warningThreshold ?? undefined };
  }

  private async ingestWithAuth(
    auth: WriteKeyRecord,
    input: IngestEventRequest,
    meta: IngestMeta
  ): Promise<IngestEventResponse> {
    const eventName = this.requiredString(input.eventName, 'eventName');
    const rawProperties = input.properties;
    // Payload material on `$api_request` never reaches the events table or webhooks.
    input = { ...input, properties: stripApiRequestPayload(eventName, input.properties) };
    const occurredAt = this.parseTimestamp(input.timestamp);
    const anonymousId = this.optionalString(input.anonymousId);
    const userId = await this.ensureUser(auth.project_id, input.userId, anonymousId);
    const sessionId = await this.ensureSession(auth.project_id, input.sessionId, userId, anonymousId, input.context);

    // Identity stitching: once a previously-anonymous visitor identifies, merge their
    // earlier anonymous events onto the user so they count as one person everywhere.
    if (userId && anonymousId) {
      await this.linkIdentity(auth.project_id, anonymousId, userId);
    }
    if (userId && sessionId) {
      await this.backfillSessionIdentities(auth.project_id, [sessionId]);
    }

    // Merge traits onto user profile if identified
    if (userId && (eventName === '$identify' || input.properties?.traits)) {
      const rawTraits = (input.properties?.traits ?? (eventName === '$identify' ? input.properties : {})) as Record<string, unknown>;
      const sanitized = sanitizeIngestedTraits(rawTraits);
      if (sanitized && Object.keys(sanitized).length > 0) {
        void this.database.query(
          `UPDATE users SET traits = COALESCE(traits, '{}'::jsonb) || $3::jsonb, updated_at = now() WHERE project_id = $1 AND id = $2`,
          [auth.project_id, userId, JSON.stringify(sanitized)]
        );
      }
    }

    const networkInfo = this.buildNetworkInfo(input.networkInfo, meta);
    const eventId = `evt_${randomUUID()}`;
    const requestRecords =
      eventName === API_REQUEST_EVENT
        ? await this.buildApiRequestRecords(auth, [
            {
              eventId,
              eventName,
              occurredAt,
              sessionId: sessionId ?? undefined,
              anonymousId,
              userId,
              rawProperties,
              context: input.context ?? {}
            }
          ])
        : [];

    const consumption = await this.database.transaction(async (client) => {
      const usage = await this.usage.consumeProjectEvents(client, auth.organization_id, auth.project_id, 1);
      await client.query(`
        INSERT INTO events (
          id,
          organization_id,
          project_id,
          user_id,
          anonymous_id,
          session_id,
          event_name,
          properties,
          device_info,
          network_info,
          context,
          occurred_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12)
      `, [
        eventId,
        auth.organization_id,
        auth.project_id,
        userId,
        anonymousId,
        sessionId,
        eventName,
        JSON.stringify(input.properties ?? {}),
        JSON.stringify(input.deviceInfo ?? {}),
        JSON.stringify(networkInfo),
        JSON.stringify(input.context ?? {}),
        occurredAt.toISOString()
      ]);
      await this.requests?.insertRecords(client, requestRecords);
      return usage;
    });

    // Forward to outbound webhooks without blocking the ingest response — delivery
    // is best-effort and must never fail or slow down an event write.
    void this.webhooks.deliverForEvent(auth.project_id, {
      id: eventId,
      eventName,
      userId,
      anonymousId: anonymousId ?? null,
      sessionId,
      properties: input.properties ?? {},
      occurredAt: occurredAt.toISOString()
    });

    // Match against pending verification sessions
    const resolvedProjectId = auth.project_id ?? (auth as { projectId?: string }).projectId;
    if (resolvedProjectId) {
      void this.setupVerifications?.recordVerificationIfMatching(
        resolvedProjectId,
        {
          eventName,
          properties: input.properties,
          context: input.context,
          deviceInfo: input.deviceInfo,
          networkInfo,
          userId,
          anonymousId
        },
        meta,
        eventId
      );
    }

    // Re-evaluate workspace achievements without blocking the ingest response.
    void this.achievements.afterProjectIngest(auth.project_id);

    return {
      accepted: true,
      eventId,
      ...(consumption.warningThreshold ? { usageWarningPercentage: consumption.warningThreshold } : {})
    };
  }

  async listRecentEvents(projectId: string, limit = 25) {
    const safeLimit = Math.min(Math.max(Number.isFinite(limit) ? Math.trunc(limit) : 25, 1), 100);
    const requiredProjectId = this.requiredString(projectId, 'projectId');
    const events = await this.queryRecentEvents(requiredProjectId, safeLimit);

    return {
      events
    };
  }

  async listDashboardRecentEvents(user: DashboardUser, limit = 50) {
    const safeLimit = Math.min(Math.max(Number.isFinite(limit) ? Math.trunc(limit) : 50, 1), 100);
    const result = await this.database.query(
      `
        SELECT
          p.id,
          p.name,
          p.slug,
          o.id AS "organizationId",
          o.name AS "organizationName",
          om.role
        FROM organization_members om
        JOIN organizations o ON o.id = om.organization_id
        JOIN projects p ON p.organization_id = o.id
        WHERE om.user_id = $1
        ORDER BY (p.id = $2) DESC NULLS LAST, o.created_at ASC, p.created_at ASC
        LIMIT 1
      `,
      [user.id, getPreferredProjectId()]
    );

    const project = result.rows[0];

    if (!project) {
      return {
        project: null,
        events: []
      };
    }

    const events = await this.queryRecentEvents(project.id as string, safeLimit);

    return {
      project,
      events
    };
  }

  private async queryRecentEvents(projectId: string, limit: number) {
    const result = await this.database.query(
      `
        SELECT
          e.id,
          e.project_id AS "projectId",
          e.user_id AS "userId",
          u.external_id AS "externalUserId",
          e.anonymous_id AS "anonymousId",
          e.session_id AS "sessionId",
          e.event_name AS "eventName",
          e.properties,
          e.device_info AS "deviceInfo",
          e.network_info AS "networkInfo",
          e.context,
          e.occurred_at AS "occurredAt",
          e.received_at AS "receivedAt"
        FROM events e
        LEFT JOIN users u ON u.id = e.user_id
        WHERE e.project_id = $1
        ORDER BY e.received_at DESC
        LIMIT $2
      `,
      [projectId, limit]
    );

    return result.rows;
  }

  async authenticateWriteKey(writeKey: string, projectId: string): Promise<WriteKeyRecord> {
    const keyHash = this.sha256(writeKey);
    const cacheKey = `${projectId}:${keyHash}`;
    const cached = this.writeKeyCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.record;
    }

    const result = await this.database.query<WriteKeyRecord>(
      `
        SELECT
          pwk.project_id,
          p.organization_id
        FROM project_write_keys pwk
        JOIN projects p ON p.id = pwk.project_id
        WHERE pwk.key_hash = $1
          AND pwk.project_id = $2
          AND pwk.revoked_at IS NULL
        LIMIT 1
      `,
      [keyHash, projectId]
    );

    const record = result.rows[0];
    if (!record) {
      throw new UnauthorizedException('Invalid projectId or write key.');
    }

    this.writeKeyCache.set(cacheKey, { record, expiresAt: Date.now() + WRITE_KEY_TTL_MS });
    return record;
  }

  private async ensureUser(
    projectId: string,
    externalId?: string,
    anonymousId?: string
  ): Promise<string | null> {
    const safeExternalId = this.optionalString(externalId);
    if (!safeExternalId) {
      return null;
    }

    const userId = `usr_${randomUUID()}`;
    const result = await this.database.query<UserRecord>(
      `
        INSERT INTO users (id, project_id, external_id, anonymous_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (project_id, external_id)
        WHERE external_id IS NOT NULL
        DO UPDATE
        SET anonymous_id = COALESCE(users.anonymous_id, EXCLUDED.anonymous_id),
            last_seen_at = now(),
            updated_at = now()
        RETURNING id
      `,
      [userId, projectId, safeExternalId, anonymousId ?? null]
    );

    return result.rows[0]?.id ?? userId;
  }

  private async ensureSession(
    projectId: string,
    sessionId?: string,
    userId?: string | null,
    anonymousId?: string,
    context: JsonObject = {}
  ): Promise<string | null> {
    const safeSessionId = this.optionalString(sessionId);
    if (!safeSessionId) {
      return null;
    }

    await this.database.query(
      `
        INSERT INTO sessions (id, project_id, user_id, anonymous_id, context)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (id) DO UPDATE
        SET user_id = COALESCE(EXCLUDED.user_id, sessions.user_id),
            anonymous_id = COALESCE(EXCLUDED.anonymous_id, sessions.anonymous_id),
            last_seen_at = now(),
            context = sessions.context || EXCLUDED.context
      `,
      [safeSessionId, projectId, userId ?? null, anonymousId ?? null, JSON.stringify(context)]
    );

    return safeSessionId;
  }

  // Links an anonymous_id to a user the first time we see the pairing, then backfills
  // the user's pre-identify anonymous events + sessions. Wrapped in a transaction so a
  // failed backfill doesn't record the link (it retries on the next event).
  private async linkIdentity(projectId: string, anonymousId: string, userId: string): Promise<void> {
    // Fast path: we've already stitched this anonymous_id in this process — the DB
    // work would be a no-op, so skip the whole transaction.
    const cacheKey = `${projectId}:${anonymousId}`;
    if (this.linkedIdentities.has(cacheKey)) {
      return;
    }

    await this.database.transaction(async (client) => {
      const linked = await client.query(
        `
          INSERT INTO identity_links (project_id, anonymous_id, user_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (project_id, anonymous_id) DO NOTHING
        `,
        [projectId, anonymousId, userId]
      );

      // Already linked — nothing to backfill.
      if (linked.rowCount === 0) {
        return;
      }

      await client.query(
        `UPDATE events SET user_id = $3 WHERE project_id = $1 AND anonymous_id = $2 AND user_id IS NULL`,
        [projectId, anonymousId, userId]
      );
      await client.query(
        `UPDATE sessions SET user_id = $3 WHERE project_id = $1 AND anonymous_id = $2 AND user_id IS NULL`,
        [projectId, anonymousId, userId]
      );
      await client.query(
        `UPDATE session_replays SET user_id = $3, updated_at = now()
          WHERE project_id = $1 AND anonymous_id = $2 AND user_id IS NULL AND deleted_at IS NULL`,
        [projectId, anonymousId, userId]
      );
    });

    // Remember the pairing so later events skip straight past this. Bounded so a
    // long-lived process with many anonymous ids can't grow the set forever.
    if (this.linkedIdentities.size >= MAX_LINK_CACHE) {
      this.linkedIdentities.clear();
    }
    this.linkedIdentities.add(cacheKey);
  }

  private async backfillSessionIdentities(projectId: string, sessionIds: string[]): Promise<void> {
    if (sessionIds.length === 0) {
      return;
    }

    await this.database.query(
      `UPDATE events e
        SET user_id = s.user_id
        FROM sessions s
        WHERE e.project_id = $1
          AND e.session_id = ANY($2)
          AND e.user_id IS NULL
          AND e.anonymous_id IS NOT NULL
          AND s.id = e.session_id
          AND s.user_id IS NOT NULL
          AND s.anonymous_id = e.anonymous_id`,
      [projectId, sessionIds]
    );
    await this.database.query(
      `UPDATE session_replays r
        SET user_id = s.user_id, updated_at = now()
        FROM sessions s
        WHERE r.project_id = $1
          AND r.session_id = ANY($2)
          AND r.user_id IS NULL
          AND r.session_id = s.id
          AND r.project_id = s.project_id
          AND s.user_id IS NOT NULL
          AND r.deleted_at IS NULL`,
      [projectId, sessionIds]
    );
  }

  private buildNetworkInfo(clientNetworkInfo: JsonObject | undefined, meta: IngestMeta): JsonObject {
    const clientIp = extractClientIp(meta.forwardedFor, meta.ip, meta.realIp);
    const geo = resolveGeo(clientIp, meta.headers ?? {});
    // Server-resolved IP + geo win over anything the (untrusted) client sent.
    return {
      ...(clientNetworkInfo ?? {}),
      ...geo
    };
  }

  private parseTimestamp(timestamp?: string): Date {
    if (!timestamp) {
      return new Date();
    }

    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('timestamp must be a valid ISO date string.');
    }

    return parsed;
  }

  private requiredString(value: unknown, fieldName: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`${fieldName} is required.`);
    }

    return value.trim();
  }

  private optionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
