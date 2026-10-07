import {
  BadRequestException, ConflictException, ForbiddenException, Inject, Injectable,
  Logger, NotFoundException
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { QueryResultRow } from 'pg';
import { DatabaseService, QueryExecutor } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { EntitlementService } from '../billing/entitlement.service';
import { EventsService } from '../events/events.service';
import { ProjectsService, ResolvedProject } from '../projects/projects.service';
import {
  AuthorizeReplayUploadRequest, IngestReplayChunkRequest, ReplayRecordingFormat, ReplaySettings, ReplayUploadClaims
} from './interfaces/replay.interface';
import { REPLAY_FORMAT_VERSION, REPLAY_LIMITS, ReplayPrivacyMode } from './replay.constants';
import { validateMobileReplayChunk } from './mobile-replay-validator';
import { isolateReplayEventsForPlayback, sanitizeReplayEvents } from './replay-sanitizer';
import { ReplayTokenService } from './replay-token.service';
import { REPLAY_STORAGE, ReplayStorage } from './storage/replay-storage.interface';

interface ReplayRow extends QueryResultRow {
  id: string; organization_id: string; project_id: string; session_id: string;
  storage_prefix: string; privacy_mode: ReplayPrivacyMode; recording_format: ReplayRecordingFormat;
  recording_version: string; started_at: string; ended_at?: string | null;
  expires_at: string; chunk_count: number; event_count: number; compressed_size_bytes: number;
  uncompressed_size_bytes: number; status: string; deleted_at?: string | null;
}

interface ChunkRow extends QueryResultRow {
  id: string; replay_id?: string; sequence: number; storage_key: string; content_sha256: string; status: string;
  event_count: number; compressed_size_bytes: number; uncompressed_size_bytes: number;
  reserved_at?: string;
}

interface SessionIdentityRow extends QueryResultRow {
  id: string; user_id: string | null; anonymous_id: string | null; external_id: string | null;
}

interface ReplayFunnelRow extends QueryResultRow {
  id: string;
  name: string;
  trigger_event_name: string;
}

@Injectable()
export class ReplayService {
  private readonly logger = new Logger(ReplayService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly events: EventsService,
    private readonly projects: ProjectsService,
    private readonly entitlements: EntitlementService,
    private readonly tokens: ReplayTokenService,
    @Inject(REPLAY_STORAGE) private readonly storage: ReplayStorage
  ) {}

  async getRecorderConfig(writeKey: string, projectId: string) {
    const safeProjectId = this.required(projectId, 'projectId');
    const auth = await this.events.authenticateWriteKey(this.required(writeKey, 'writeKey'), safeProjectId);
    const settings = await this.loadSettings(safeProjectId);
    const entitlement = await this.entitlements.getSnapshot(auth.organization_id);
    const available = entitlement.deploymentMode === 'self_hosted' || entitlement.features.sessionReplay;
    const selectedFunnels = await this.loadSelectedFunnels(safeProjectId);
    const { selectedFunnelIds: _selectedFunnelIds, ...recorderSettings } = settings;
    return {
      ...recorderSettings,
      enabled: settings.enabled && available && selectedFunnels.length > 0,
      entitlementAvailable: available,
      flowTriggerEventNames: [...new Set(selectedFunnels.map((funnel) => funnel.trigger_event_name))]
    };
  }

  async authorizeUpload(writeKey: string, input: AuthorizeReplayUploadRequest) {
    const projectId = this.required(input.projectId, 'projectId');
    const sessionId = this.safeId(input.sessionId, 'sessionId');
    const anonymousId = this.optional(input.anonymousId);
    const userId = this.optional(input.userId);
    const recordingFormat = this.recordingFormat(input.recordingFormat);
    const auth = await this.events.authenticateWriteKey(this.required(writeKey, 'writeKey'), projectId);
    const settings = await this.loadSettings(projectId);
    if (!settings.enabled) throw new ForbiddenException('Session Replay is disabled for this project.');
    await this.entitlements.assertReplayAvailable(auth.organization_id);
    if (settings.requireConsent && input.consentGranted !== true) {
      throw new ForbiddenException('Replay consent is required before an upload token can be issued.');
    }
    await this.assertSessionIdentity(projectId, sessionId, anonymousId, userId);
    if (!sampleSession(sessionId, settings.sampleRate)) {
      throw new ForbiddenException('This session was not selected by the Replay sample rate.');
    }
    const matchedFunnelIds = await this.loadMatchedFunnelIds(projectId, sessionId);
    if (matchedFunnelIds.length === 0) {
      throw new ForbiddenException('This session has not entered a selected Replay flow.');
    }
    await this.storage.assertReady();
    const replayId = input.replayId ? this.safeId(input.replayId, 'replayId') : `rpl_${randomUUID()}`;
    const tokenGrant = this.tokens.sign({
      projectId, organizationId: auth.organization_id, sessionId, replayId, anonymousId, userId,
      consentGranted: input.consentGranted === true,
      requireConsent: settings.requireConsent,
      privacyMode: settings.privacyMode,
      maxDurationSeconds: settings.maxDurationSeconds,
      maxChunks: REPLAY_LIMITS.maxChunksPerReplay,
      maxCompressedBytes: REPLAY_LIMITS.maxReplayBytes,
      maxUncompressedBytes: REPLAY_LIMITS.maxReplayUncompressedBytes,
      matchedFunnelIds,
      recordingFormat
    }, REPLAY_LIMITS.uploadTokenSeconds);
    return { ...tokenGrant, replayId };
  }

  async ingestChunk(uploadToken: string, input: IngestReplayChunkRequest) {
    const claims = this.verifyInputClaims(uploadToken, input);
    const sequence = this.sequence(input.sequence);
    const recordingFormat = this.recordingFormat(claims.recordingFormat);
    const receivedAt = new Date();
    const settings = await this.loadSettings(claims.projectId);
    await this.assertTokenStillAllowed(claims, settings);
    await this.entitlements.assertReplayAvailable(claims.organizationId);

    const decoded = this.decodeEvents(input);
    const sanitized = recordingFormat === 'mobile-structural-v1'
      ? validateMobileReplayChunk(decoded, sequence)
      : sanitizeReplayEvents(decoded, settings.privacyMode);
    const recordedEvents = Array.isArray(sanitized) ? sanitized : sanitized.events;
    const uncompressed = Buffer.from(JSON.stringify(sanitized));
    if (uncompressed.byteLength > REPLAY_LIMITS.maxUncompressedChunkBytes) {
      throw new BadRequestException('Replay chunk exceeds the uncompressed size limit.');
    }
    const compressed = gzipSync(uncompressed, { level: 6 });
    if (compressed.byteLength > REPLAY_LIMITS.maxEncodedBytes) throw new BadRequestException('Replay chunk exceeds the compressed size limit.');
    const digest = createHash('sha256').update(compressed).digest('hex');
    const bounds = this.eventBounds(recordedEvents);
    const authorizedDurationSeconds = Math.min(settings.maxDurationSeconds, claims.maxDurationSeconds);
    this.validateEventTimes(bounds, receivedAt, authorizedDurationSeconds);
    const claimedStartedAt = input.startedAt !== undefined ? this.date(input.startedAt) : undefined;
    if (claimedStartedAt) {
      if (claimedStartedAt.getTime() > receivedAt.getTime() + REPLAY_LIMITS.clockSkewMs) {
        throw new BadRequestException('startedAt is outside the permitted server clock-skew window.');
      }
      if (claimedStartedAt.getTime() < receivedAt.getTime() - authorizedDurationSeconds * 1_000 - REPLAY_LIMITS.clockSkewMs) {
        throw new BadRequestException('startedAt precedes the permitted replay window.');
      }
      if (bounds.first.getTime() < claimedStartedAt.getTime() - REPLAY_LIMITS.clockSkewMs) {
        throw new BadRequestException('Replay chunk event timestamps precede the claimed replay start.');
      }
    }
    this.validateClaimedTimestamp(input.endedAt, bounds.last, 'endedAt');

    const prepared = await this.database.transaction(async (client) => {
      await this.lockSession(client, claims.projectId, claims.sessionId);
      await this.lockReplaySettings(client, claims.projectId);
      const currentSettings = await this.loadSettings(claims.projectId, client);
      const activeMatchedFunnelIds = await this.assertTokenStillAllowed(claims, currentSettings, client);
      const currentDurationSeconds = Math.min(currentSettings.maxDurationSeconds, claims.maxDurationSeconds);
      this.validateEventTimes(bounds, receivedAt, currentDurationSeconds);
      const session = await this.ensureSession(client, claims, bounds.first);
      const candidate = await this.ensureReplay(client, claims, session, currentSettings, claimedStartedAt ?? bounds.first, activeMatchedFunnelIds, recordingFormat);
      await this.lockReplay(client, candidate.id);
      const replayResult = await client.query<ReplayRow>('SELECT * FROM session_replays WHERE id=$1 FOR UPDATE', [candidate.id]);
      const replay = replayResult.rows[0];
      if (!replay) throw new NotFoundException('Replay no longer exists.');
      this.assertReplayFormat(replay, recordingFormat);
      this.assertReplayWritable(replay, receivedAt);
      if (claimedStartedAt) {
        this.validateClaimedTimestamp(claimedStartedAt, new Date(replay.started_at), 'startedAt');
      }
      if (bounds.first.getTime() < new Date(replay.started_at).getTime() - REPLAY_LIMITS.clockSkewMs) {
        throw new BadRequestException('Replay chunk event timestamps precede the authoritative replay start.');
      }
      if (bounds.last.getTime() - new Date(replay.started_at).getTime() > currentDurationSeconds * 1_000 + REPLAY_LIMITS.clockSkewMs) {
        throw new BadRequestException('Replay exceeds the project maximum duration.');
      }
      const existing = await client.query<ChunkRow>(`
        SELECT id,sequence,storage_key,content_sha256,status,event_count,compressed_size_bytes,uncompressed_size_bytes
        FROM replay_chunks WHERE replay_id=$1 AND sequence=$2 AND deleted_at IS NULL FOR UPDATE
      `, [replay.id, sequence]);
      if (existing.rows[0]) {
        if (existing.rows[0].content_sha256 !== digest) throw new ConflictException('Chunk sequence already exists with different content.');
        if (existing.rows[0].status === 'ready') return { replay, duplicate: true, chunk: existing.rows[0] };
        throw new ConflictException('Chunk upload is already reserved; retry after stale-upload reconciliation.');
      }
      this.assertReplayCapacity(replay, compressed.byteLength, uncompressed.byteLength, claims);
      const storageKey = this.chunkKey(replay.storage_prefix, sequence, digest);
      const chunkId = `rpc_${randomUUID()}`;
      await client.query(`
        INSERT INTO replay_chunks (
          id,replay_id,sequence,storage_key,event_count,compressed_size_bytes,uncompressed_size_bytes,
          content_sha256,first_event_at,last_event_at,status,reserved_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'uploading',now())
      `, [chunkId, replay.id, sequence, storageKey, recordedEvents.length, compressed.byteLength,
        uncompressed.byteLength, digest, bounds.first, bounds.last]);
      return { replay, duplicate: false, chunk: {
        id: chunkId, sequence, storage_key: storageKey, content_sha256: digest, status: 'uploading',
        event_count: recordedEvents.length, compressed_size_bytes: compressed.byteLength,
        uncompressed_size_bytes: uncompressed.byteLength
      } as ChunkRow };
    });

    if (prepared.duplicate) return { accepted: true, duplicate: true, replayId: prepared.replay.id, sequence };

    let objectStored = false;
    try {
      await this.storage.put(prepared.chunk.storage_key, compressed, { contentType: 'application/gzip', ifNoneMatch: true });
      objectStored = true;
      await this.database.transaction(async (client) => {
        await this.lockReplaySettings(client, claims.projectId);
        const currentSettings = await this.loadSettings(claims.projectId, client);
        await this.assertTokenStillAllowed(claims, currentSettings, client);
        const currentDurationSeconds = Math.min(currentSettings.maxDurationSeconds, claims.maxDurationSeconds);
        this.validateEventTimes(bounds, new Date(), currentDurationSeconds);
        await this.lockReplay(client, prepared.replay.id);
        const replayResult = await client.query<ReplayRow>('SELECT * FROM session_replays WHERE id=$1 FOR UPDATE', [prepared.replay.id]);
        const replay = replayResult.rows[0];
        if (!replay) throw new NotFoundException('Replay no longer exists.');
        this.assertReplayFormat(replay, recordingFormat);
        this.assertReplayWritable(replay, new Date());
        if (bounds.last.getTime() - new Date(replay.started_at).getTime() > currentDurationSeconds * 1_000 + REPLAY_LIMITS.clockSkewMs) {
          throw new BadRequestException('Replay exceeds the project maximum duration.');
        }
        const chunkResult = await client.query<ChunkRow>(`
          SELECT id,sequence,storage_key,content_sha256,status,event_count,compressed_size_bytes,uncompressed_size_bytes
          FROM replay_chunks WHERE id=$1 AND replay_id=$2 AND deleted_at IS NULL FOR UPDATE
        `, [prepared.chunk.id, replay.id]);
        const chunk = chunkResult.rows[0];
        if (!chunk || chunk.status !== 'uploading' || chunk.content_sha256 !== digest) {
          throw new ConflictException('Replay chunk reservation is no longer valid.');
        }
        this.assertReplayCapacity(replay, chunk.compressed_size_bytes, chunk.uncompressed_size_bytes, claims);
        const isFirstStoredChunk = Number(replay.chunk_count) === 0;
        await this.entitlements.assertReplayCapacity(claims.organizationId, chunk.compressed_size_bytes, isFirstStoredChunk, client);
        await client.query("UPDATE replay_chunks SET status='ready',finalized_at=now(),delete_error=NULL WHERE id=$1", [chunk.id]);
        await client.query(`
          UPDATE session_replays SET
            ended_at=GREATEST(COALESCE(ended_at,$2),$2),
            duration_ms=GREATEST(duration_ms,EXTRACT(EPOCH FROM ($2-started_at))*1000),
            chunk_count=chunk_count+1,event_count=event_count+$3,
            compressed_size_bytes=compressed_size_bytes+$4,
            uncompressed_size_bytes=uncompressed_size_bytes+$5,updated_at=now()
          WHERE id=$1
        `, [replay.id, bounds.last, chunk.event_count, chunk.compressed_size_bytes, chunk.uncompressed_size_bytes]);
        await this.entitlements.recordReplayUsage(claims.organizationId, chunk.compressed_size_bytes, isFirstStoredChunk, client);
      });
      this.logger.log(`replay_chunk_stored replay=${prepared.replay.id} sequence=${sequence} bytes=${compressed.byteLength}`);
      return { accepted: true, duplicate: false, replayId: prepared.replay.id, sequence };
    } catch (error) {
      const removed = !objectStored || await this.storage.delete(prepared.chunk.storage_key).then(() => true).catch(() => false);
      if (removed) {
        await this.database.query("DELETE FROM replay_chunks WHERE id=$1 AND status='uploading'", [prepared.chunk.id]).catch(() => undefined);
      } else {
        await this.database.query("UPDATE replay_chunks SET status='delete_failed',delete_attempts=delete_attempts+1,delete_error='reserved object cleanup failed' WHERE id=$1", [prepared.chunk.id]).catch(() => undefined);
      }
      this.logger.error(`replay_chunk_failed replay=${prepared.replay.id} sequence=${sequence}`);
      throw error;
    }
  }

  async complete(uploadToken: string, input: { projectId?: string; sessionId?: string; anonymousId?: string; userId?: string; endedAt?: string }) {
    const claims = this.verifyInputClaims(uploadToken, input);
    const settings = await this.loadSettings(claims.projectId);
    await this.assertTokenStillAllowed(claims, settings);
    await this.entitlements.assertReplayAvailable(claims.organizationId);
    const receivedAt = new Date();
    this.validateClaimedTimestamp(input.endedAt, receivedAt, 'endedAt');
    await this.database.transaction(async (client) => {
      await this.lockSession(client, claims.projectId, claims.sessionId);
      await this.lockReplaySettings(client, claims.projectId);
      const currentSettings = await this.loadSettings(claims.projectId, client);
      const activeMatchedFunnelIds = await this.assertTokenStillAllowed(claims, currentSettings, client);
      const candidate = claims.replayId
        ? await client.query<ReplayRow>('SELECT * FROM session_replays WHERE id=$1 AND project_id=$2 AND deleted_at IS NULL LIMIT 1', [claims.replayId, claims.projectId])
        : await client.query<ReplayRow>('SELECT * FROM session_replays WHERE project_id=$1 AND session_id=$2 AND deleted_at IS NULL ORDER BY started_at DESC LIMIT 1', [claims.projectId, claims.sessionId]);
      if (!candidate.rows[0]) return;
      await this.lockReplay(client, candidate.rows[0].id);
      const result = await client.query<ReplayRow>('SELECT * FROM session_replays WHERE id=$1 FOR UPDATE', [candidate.rows[0].id]);
      const replay = result.rows[0];
      if (!replay) return;
      this.assertReplayFormat(replay, this.recordingFormat(claims.recordingFormat));
      this.assertReplayWritable(replay, receivedAt);
      await client.query(`
        INSERT INTO session_replay_funnels(replay_id,project_id,funnel_id)
        SELECT $1,$2,unnest($3::text[])
        ON CONFLICT(replay_id,funnel_id) DO NOTHING
      `, [replay.id, claims.projectId, activeMatchedFunnelIds]);
      const maximumEnd = new Date(new Date(replay.started_at).getTime()
        + Math.min(currentSettings.maxDurationSeconds, claims.maxDurationSeconds) * 1_000);
      const authoritativeEnd = receivedAt < maximumEnd ? receivedAt : maximumEnd;
      await client.query(`
        UPDATE session_replays SET status='complete',ended_at=GREATEST(COALESCE(ended_at,$2),$2),
          duration_ms=GREATEST(duration_ms,EXTRACT(EPOCH FROM ($2-started_at))*1000),updated_at=now()
        WHERE id=$1
      `, [replay.id, authoritativeEnd]);
    });
    return { accepted: true };
  }

  async list(user: DashboardUser, params: { projectId?: string; userId?: string; anonymousId?: string; sessionId?: string; limit?: string; offset?: string }) {
    const project = await this.projects.requireActiveProject(user, params.projectId);
    const limit = this.clamp(params.limit, 25, 1, 100);
    const offset = this.clamp(params.offset, 0, 0, 100_000);
    const result = await this.database.query(`
      SELECT r.id,r.session_id AS "sessionId",r.user_id AS "userId",r.anonymous_id AS "anonymousId",
        COALESCE(u.external_id,r.anonymous_id,r.session_id) AS "identity",r.started_at AS "startedAt",
        r.ended_at AS "endedAt",r.duration_ms::float8 AS "durationMs",r.event_count AS "eventCount",
        r.chunk_count AS "chunkCount",r.compressed_size_bytes::float8 AS "compressedSizeBytes",
        r.privacy_mode AS "privacyMode",r.recording_format AS "recordingFormat",
        r.recording_version AS "recordingVersion",r.status,r.expires_at AS "expiresAt",
        COALESCE(mf.flows,'[]'::json) AS "matchedFlows",
        COALESCE(e.context->'page'->>'url',e.context->'page'->>'path') AS "entryPage",
        e.device_info->>'deviceType' AS "deviceType",e.device_info->>'browser' AS "browser",
        e.network_info->>'country' AS "country"
      FROM session_replays r
      LEFT JOIN users u ON u.id=r.user_id AND u.project_id=r.project_id
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('id',f.id,'name',f.name) ORDER BY f.name) AS flows
        FROM session_replay_funnels rf
        JOIN funnels f ON f.id=rf.funnel_id AND f.project_id=rf.project_id
        WHERE rf.replay_id=r.id AND rf.project_id=r.project_id
      ) mf ON true
      LEFT JOIN LATERAL (SELECT context,device_info,network_info FROM events
        WHERE project_id=r.project_id AND session_id=r.session_id ORDER BY occurred_at LIMIT 1) e ON true
      WHERE r.project_id=$1 AND r.deleted_at IS NULL
        AND ($2::text IS NULL OR r.user_id=$2) AND ($3::text IS NULL OR r.anonymous_id=$3)
        AND ($4::text IS NULL OR r.session_id=$4)
      ORDER BY r.started_at DESC LIMIT $5 OFFSET $6
    `, [project.id, this.optional(params.userId), this.optional(params.anonymousId), this.optional(params.sessionId), limit, offset]);
    return { project, replays: result.rows, limit, offset };
  }

  async playback(user: DashboardUser, replayId: string, projectId?: string, cursorValue?: string, limitValue?: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const result = await this.database.query<ReplayRow>('SELECT * FROM session_replays WHERE id=$1 AND project_id=$2 AND deleted_at IS NULL AND expires_at>now() LIMIT 1', [this.safeId(replayId, 'replayId'), project.id]);
    const replay = result.rows[0];
    if (!replay) throw new NotFoundException('Replay not found, expired, or inaccessible.');
    const recordingFormat = this.recordingFormat(replay.recording_format);
    if (Number(replay.uncompressed_size_bytes) > REPLAY_LIMITS.maxReplayUncompressedBytes) throw new BadRequestException('Replay exceeds the expanded playback limit.');
    const cursor = this.clamp(cursorValue, -1, -1, REPLAY_LIMITS.maxChunksPerReplay - 1);
    const limit = this.clamp(limitValue, 10, 1, 25);
    const chunks = await this.database.query<ChunkRow>(`
      SELECT id,sequence,storage_key,content_sha256,status,event_count,compressed_size_bytes,uncompressed_size_bytes
      FROM replay_chunks WHERE replay_id=$1 AND status='ready' AND deleted_at IS NULL AND sequence>$2
      ORDER BY sequence LIMIT $3
    `, [replay.id, cursor, limit + 1]);
    const selected: ChunkRow[] = [];
    let selectedExpanded = 0;
    const pageLimit = Math.max(REPLAY_LIMITS.maxPlaybackPageBytes, REPLAY_LIMITS.maxUncompressedChunkBytes);
    for (const chunk of chunks.rows.slice(0, limit)) {
      if (selected.length && selectedExpanded + Number(chunk.uncompressed_size_bytes) > pageLimit) break;
      selected.push(chunk);
      selectedExpanded += Number(chunk.uncompressed_size_bytes);
    }
    const events: unknown[] = [];
    let runtime: string | undefined;
    let platform: string | undefined;
    let compressedBytes = 0;
    let expandedBytes = 0;
    for (const chunk of selected) {
      const compressed = await this.storage.get(chunk.storage_key).catch((error) => {
        this.logger.error(`replay_playback_retrieval_failed replay=${replay.id} sequence=${chunk.sequence}`);
        throw error;
      });
      compressedBytes += compressed.byteLength;
      if (compressedBytes > REPLAY_LIMITS.maxReplayBytes) throw new BadRequestException('Playback page exceeds its compressed byte limit.');
      if (createHash('sha256').update(compressed).digest('hex') !== chunk.content_sha256) throw new Error('Replay chunk integrity check failed.');
      const json = gunzipSync(compressed, { maxOutputLength: REPLAY_LIMITS.maxUncompressedChunkBytes });
      expandedBytes += json.byteLength;
      if (expandedBytes > pageLimit) throw new BadRequestException('Playback page exceeds its expanded byte limit.');
      const parsed = JSON.parse(json.toString('utf8')) as unknown;
      if (recordingFormat === 'mobile-structural-v1') {
        const mobile = validateMobileReplayChunk(parsed, chunk.sequence);
        if (runtime && (runtime !== mobile.runtime || platform !== mobile.platform)) {
          throw new Error('Stored mobile replay chunks have inconsistent platform metadata.');
        }
        runtime = mobile.runtime;
        platform = mobile.platform;
        events.push(...mobile.events);
      } else {
        if (!Array.isArray(parsed)) throw new Error('Stored replay chunk is malformed.');
        events.push(...isolateReplayEventsForPlayback(parsed));
      }
    }
    const lastSequence = selected.at(-1)?.sequence ?? cursor;
    const hasMore = chunks.rows.length > selected.length;
    return { replayId: replay.id, recordingFormat, recordingVersion: replay.recording_version,
      ...(runtime ? { runtime, platform } : {}), events, nextCursor: hasMore ? lastSequence : null, done: !hasMore };
  }

  async getEventsForExtraction(user: DashboardUser, replayId: string, projectId?: string, maxChunks = 50) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const result = await this.database.query(`
      SELECT r.*,
        COALESCE(e.context->'page'->>'url', e.context->'page'->>'path') AS "entryPage",
        e.device_info AS "deviceInfo",
        e.network_info AS "networkInfo"
      FROM session_replays r
      LEFT JOIN LATERAL (
        SELECT context, device_info, network_info FROM events
        WHERE project_id=r.project_id AND session_id=r.session_id ORDER BY occurred_at LIMIT 1
      ) e ON true
      WHERE r.id=$1 AND r.project_id=$2 AND r.deleted_at IS NULL LIMIT 1
    `, [this.safeId(replayId, 'replayId'), project.id]);
    const replay = result.rows[0];
    if (!replay) throw new NotFoundException('Replay not found or inaccessible.');

    const chunks = await this.database.query<ChunkRow>(`
      SELECT id, sequence, storage_key, content_sha256, status, event_count, compressed_size_bytes, uncompressed_size_bytes
      FROM replay_chunks WHERE replay_id=$1 AND status='ready' AND deleted_at IS NULL
      ORDER BY sequence LIMIT $2
    `, [replay.id, maxChunks]);

    const events: any[] = [];
    for (const chunk of chunks.rows) {
      try {
        const compressed = await this.storage.get(chunk.storage_key);
        if (createHash('sha256').update(compressed).digest('hex') !== chunk.content_sha256) continue;
        const json = gunzipSync(compressed, { maxOutputLength: REPLAY_LIMITS.maxUncompressedChunkBytes });
        const parsed = JSON.parse(json.toString('utf8'));
        if (Array.isArray(parsed)) {
          events.push(...isolateReplayEventsForPlayback(parsed));
        }
      } catch (err) {
        this.logger.warn(`Failed to read chunk ${chunk.id} for extraction: ${err instanceof Error ? err.message : err}`);
      }
    }

    return {
      replay: {
        id: replay.id as string,
        sessionId: replay.session_id as string,
        userId: (replay.user_id as string | null) || null,
        anonymousId: (replay.anonymous_id as string | null) || null,
        startedAt: replay.started_at as string,
        durationSeconds: Math.round((Number(replay.duration_ms) || 0) / 1000),
        entryPage: replay.entryPage as string | undefined,
        deviceInfo: replay.deviceInfo as any
      },
      events
    };
  }

  async getSettings(user: DashboardUser, projectId?: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const settings = await this.loadSettings(project.id);
    const funnels = await this.loadAvailableFunnels(project.id);
    const entitlement = await this.entitlements.getSnapshot(project.organizationId);
    return { project, settings, funnels, entitlement: {
      available: entitlement.deploymentMode === 'self_hosted' || entitlement.features.sessionReplay,
      plan: entitlement.plan,
      limits: { sessionsPerMonth: entitlement.limits.replaySessions, storageBytesPerMonth: entitlement.limits.replayStorageBytes,
        maxSampleRatePercent: entitlement.limits.replayMaxSampleRatePercent, maxRetentionDays: entitlement.limits.replayMaxRetentionDays,
        maxDurationSeconds: entitlement.limits.replayMaxDurationSeconds }
    }};
  }

  async updateSettings(user: DashboardUser, projectId: string | undefined, input: Partial<ReplaySettings>, acknowledgePrivacyRisk = false) {
    const project = await this.projects.requireWritableProject(user, projectId);
    this.assertCanManage(project);
    const current = await this.loadSettings(project.id);
    const next = this.validateSettings({ ...current, ...input });
    if (next.enabled && next.selectedFunnelIds.length === 0) {
      throw new BadRequestException('Select at least one flow before recording can begin.');
    }
    if ((next.privacyMode === 'custom' || !next.requireConsent) && !acknowledgePrivacyRisk) throw new BadRequestException('Explicit privacy-risk acknowledgement is required for Custom masking or consent-free recording.');
    await this.entitlements.assertReplaySettings(project.organizationId, next);
    if (next.enabled) await this.storage.assertReady();
    await this.database.transaction(async (client) => {
      await this.lockReplaySettings(client, project.id);
      const validFunnels = await client.query<{ id: string }>(
        'SELECT id FROM funnels WHERE project_id=$1 AND id=ANY($2::text[]) FOR SHARE',
        [project.id, next.selectedFunnelIds]
      );
      if (validFunnels.rows.length !== next.selectedFunnelIds.length) {
        throw new BadRequestException('One or more selected flows do not belong to this project.');
      }
      await client.query(`
        INSERT INTO replay_settings (project_id,enabled,sample_rate,max_duration_seconds,retention_days,privacy_mode,require_consent,mask_selectors,block_selectors,ignore_selectors)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT(project_id) DO UPDATE SET enabled=EXCLUDED.enabled,sample_rate=EXCLUDED.sample_rate,
          max_duration_seconds=EXCLUDED.max_duration_seconds,retention_days=EXCLUDED.retention_days,
          privacy_mode=EXCLUDED.privacy_mode,require_consent=EXCLUDED.require_consent,
          mask_selectors=EXCLUDED.mask_selectors,block_selectors=EXCLUDED.block_selectors,
          ignore_selectors=EXCLUDED.ignore_selectors,updated_at=now()
      `, [project.id, next.enabled, next.sampleRate, next.maxDurationSeconds, next.retentionDays,
        next.privacyMode, next.requireConsent, next.maskSelectors, next.blockSelectors, next.ignoreSelectors]);
      await client.query('DELETE FROM replay_setting_funnels WHERE project_id=$1', [project.id]);
      if (next.selectedFunnelIds.length > 0) {
        await client.query(`
          INSERT INTO replay_setting_funnels(project_id,funnel_id)
          SELECT $1,unnest($2::text[])
        `, [project.id, next.selectedFunnelIds]);
      }
    });
    return { project, settings: next, funnels: await this.loadAvailableFunnels(project.id) };
  }

  async delete(user: DashboardUser, replayId: string, projectId?: string, reason = 'manual') {
    const project = await this.projects.requireWritableProject(user, projectId);
    this.assertCanManage(project);
    if (!await this.deleteById(replayId, project.id, reason)) throw new NotFoundException('Replay was not found or could not be deleted.');
    return { deleted: true };
  }

  async deleteById(replayId: string, projectId?: string, reason = 'retention') {
    const candidate = await this.database.query<ReplayRow>('SELECT * FROM session_replays WHERE id=$1 AND ($2::text IS NULL OR project_id=$2) AND deleted_at IS NULL LIMIT 1', [replayId, projectId ?? null]);
    if (!candidate.rows[0]) return false;
    const replay = await this.database.transaction(async (client) => {
      await this.lockReplay(client, replayId);
      const result = await client.query<ReplayRow>('SELECT * FROM session_replays WHERE id=$1 AND ($2::text IS NULL OR project_id=$2) AND deleted_at IS NULL FOR UPDATE', [replayId, projectId ?? null]);
      if (!result.rows[0]) return undefined;
      await client.query("UPDATE session_replays SET status='deleting',deletion_reason=$2,updated_at=now() WHERE id=$1", [replayId, reason]);
      return result.rows[0];
    });
    if (!replay) return false;
    const chunks = await this.database.query<ChunkRow>('SELECT id,sequence,storage_key,content_sha256,status,event_count,compressed_size_bytes,uncompressed_size_bytes,reserved_at FROM replay_chunks WHERE replay_id=$1 AND deleted_at IS NULL', [replay.id]);
    const staleBefore = Date.now() - REPLAY_LIMITS.staleUploadSeconds * 1_000;
    if (chunks.rows.some((chunk) => chunk.status === 'uploading'
      && (!chunk.reserved_at || new Date(chunk.reserved_at).getTime() > staleBefore))) {
      // An object upload may still be in flight. Leave the replay in `deleting`;
      // finalization will clean it, or stale reconciliation will after the lease.
      return false;
    }
    for (const chunk of chunks.rows) {
      try {
        await this.storage.delete(chunk.storage_key);
        await this.database.query("UPDATE replay_chunks SET deleted_at=now(),delete_error=NULL WHERE id=$1", [chunk.id]);
      } catch (error) {
        await this.database.query("UPDATE replay_chunks SET status='delete_failed',delete_attempts=delete_attempts+1,delete_error=$2 WHERE id=$1", [chunk.id, error instanceof Error ? error.message.slice(0, 500) : 'storage deletion failed']);
        this.logger.error(`replay_cleanup_failed replay=${replay.id} sequence=${chunk.sequence}`);
        return false;
      }
    }
    await this.database.transaction(async (client) => {
      await this.lockReplay(client, replay.id);
      const remaining = await client.query('SELECT 1 FROM replay_chunks WHERE replay_id=$1 AND deleted_at IS NULL LIMIT 1 FOR UPDATE', [replay.id]);
      if (remaining.rows.length) throw new ConflictException('Replay still has pending storage objects.');
      await client.query("UPDATE session_replays SET status=CASE WHEN $2='retention' THEN 'expired' ELSE 'deleted' END,deleted_at=now(),updated_at=now() WHERE id=$1", [replay.id, reason]);
      await client.query(`
        INSERT INTO replay_deletion_audit(id,replay_id,organization_id,project_id,session_id,reason,chunk_count,compressed_size_bytes)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING
      `, [`rda_${createHash('sha256').update(`${replay.id}:${reason}`).digest('hex').slice(0, 32)}`, replay.id,
        replay.organization_id, replay.project_id, replay.session_id, reason, replay.chunk_count, replay.compressed_size_bytes]);
    });
    return true;
  }

  async reconcileStaleUploads() {
    const cutoff = new Date(Date.now() - REPLAY_LIMITS.staleUploadSeconds * 1_000);
    const result = await this.database.query<ChunkRow>(`
      SELECT id,replay_id,sequence,storage_key,content_sha256,status,event_count,compressed_size_bytes,uncompressed_size_bytes
      FROM replay_chunks WHERE status IN ('uploading','delete_failed') AND reserved_at<$1
      ORDER BY reserved_at LIMIT 100
    `, [cutoff]);
    let reconciled = 0;
    for (const chunk of result.rows) {
      try {
        const reserved = await this.database.transaction(async (client) => {
          if (!chunk.replay_id) return false;
          await this.lockReplay(client, chunk.replay_id);
          const current = await client.query<{ status: string }>(
            "SELECT status FROM replay_chunks WHERE id=$1 AND reserved_at<$2 AND status IN ('uploading','delete_failed') FOR UPDATE",
            [chunk.id, cutoff]
          );
          if (!current.rows[0]) return false;
          await client.query("UPDATE replay_chunks SET status='delete_failed',delete_error='stale reservation pending cleanup' WHERE id=$1", [chunk.id]);
          return true;
        });
        if (!reserved) continue;
        await this.storage.delete(chunk.storage_key);
        const removed = await this.database.query("DELETE FROM replay_chunks WHERE id=$1 AND status='delete_failed'", [chunk.id]);
        if ((removed.rowCount ?? 0) > 0) reconciled += 1;
      } catch {
        await this.database.query("UPDATE replay_chunks SET status='delete_failed',delete_attempts=delete_attempts+1,delete_error='stale reservation cleanup failed' WHERE id=$1", [chunk.id]);
      }
    }
    return { scanned: result.rows.length, reconciled };
  }

  deleteForProject(projectId: string) { return this.deleteMatching('project_id=$1', [projectId], 'project_deleted'); }
  deleteForOrganization(organizationId: string) { return this.deleteMatching('organization_id=$1', [organizationId], 'organization_deleted'); }
  deleteForSubject(projectId: string, userId?: string, anonymousId?: string) {
    if (!userId && !anonymousId) throw new BadRequestException('A userId or anonymousId is required.');
    return this.deleteMatching('project_id=$1 AND ($2::text IS NULL OR user_id=$2) AND ($3::text IS NULL OR anonymous_id=$3)', [projectId, userId ?? null, anonymousId ?? null], 'data_subject_request');
  }

  private async deleteMatching(predicate: string, values: unknown[], reason: string) {
    let deleted = 0;
    for (;;) {
      const result = await this.database.query<{ id: string; deleted_at: string | null }>(`SELECT id,deleted_at FROM session_replays WHERE ${predicate} ORDER BY created_at LIMIT 100`, values);
      if (!result.rows.length) break;
      for (const row of result.rows) {
        const storageClean = row.deleted_at !== null || await this.deleteById(row.id, undefined, reason);
        if (!storageClean) throw new Error(`Replay ${row.id} could not be cleaned; owner deletion was stopped.`);
        await this.database.query('DELETE FROM session_replays WHERE id=$1', [row.id]);
        deleted += 1;
      }
      if (result.rows.length < 100) break;
    }
    return { deleted };
  }

  private async loadSettings(
    projectId: string,
    executor: QueryExecutor = this.database
  ): Promise<ReplaySettings> {
    const result = await executor.query<any>(`
      SELECT enabled,sample_rate::float8 AS "sampleRate",max_duration_seconds AS "maxDurationSeconds",
        retention_days AS "retentionDays",privacy_mode AS "privacyMode",require_consent AS "requireConsent",
        mask_selectors AS "maskSelectors",block_selectors AS "blockSelectors",ignore_selectors AS "ignoreSelectors",
        COALESCE((SELECT array_agg(rsf.funnel_id ORDER BY rsf.funnel_id)
          FROM replay_setting_funnels rsf WHERE rsf.project_id=replay_settings.project_id),ARRAY[]::text[]) AS "selectedFunnelIds"
      FROM replay_settings WHERE project_id=$1
    `, [projectId]);
    return result.rows[0] ?? { enabled: false, sampleRate: 0.1, maxDurationSeconds: 600, retentionDays: 30,
      privacyMode: 'strict', requireConsent: true, maskSelectors: [], blockSelectors: [], ignoreSelectors: [], selectedFunnelIds: [] };
  }

  private async loadAvailableFunnels(projectId: string) {
    const result = await this.database.query<ReplayFunnelRow>(`
      SELECT f.id,f.name,fs.event_name AS trigger_event_name
      FROM funnels f
      JOIN funnel_steps fs ON fs.funnel_id=f.id AND fs.step_order=0
      WHERE f.project_id=$1
      ORDER BY f.created_at DESC,f.id
    `, [projectId]);
    return result.rows.map((row) => ({ id: row.id, name: row.name, triggerEventName: row.trigger_event_name }));
  }

  private async loadSelectedFunnels(projectId: string) {
    const result = await this.database.query<ReplayFunnelRow>(`
      SELECT f.id,f.name,fs.event_name AS trigger_event_name
      FROM replay_setting_funnels rsf
      JOIN funnels f ON f.id=rsf.funnel_id AND f.project_id=rsf.project_id
      JOIN funnel_steps fs ON fs.funnel_id=f.id AND fs.step_order=0
      WHERE rsf.project_id=$1
      ORDER BY f.id
    `, [projectId]);
    return result.rows;
  }

  private async loadMatchedFunnelIds(
    projectId: string,
    sessionId: string,
    executor: QueryExecutor = this.database
  ) {
    const result = await executor.query<{ id: string }>(`
      SELECT f.id
      FROM replay_setting_funnels rsf
      JOIN funnels f ON f.id=rsf.funnel_id AND f.project_id=rsf.project_id
      JOIN funnel_steps fs ON fs.funnel_id=f.id AND fs.step_order=0
      WHERE rsf.project_id=$1
        AND EXISTS (
          SELECT 1 FROM events e
          WHERE e.project_id=rsf.project_id AND e.session_id=$2 AND e.event_name=fs.event_name
        )
      ORDER BY f.id
      FOR KEY SHARE OF rsf,f,fs
    `, [projectId, sessionId]);
    return result.rows.map((row) => row.id);
  }

  private decodeEvents(input: IngestReplayChunkRequest): unknown {
    if (input.encoding === 'gzip-base64') {
      if (typeof input.encodedEvents !== 'string' || input.encodedEvents.length > REPLAY_LIMITS.maxEncodedBytes * 1.4) throw new BadRequestException('Encoded replay chunk is missing or oversized.');
      const compressed = Buffer.from(input.encodedEvents, 'base64');
      if (compressed.byteLength > REPLAY_LIMITS.maxEncodedBytes) throw new BadRequestException('Compressed replay chunk is oversized.');
      try { return JSON.parse(gunzipSync(compressed, { maxOutputLength: REPLAY_LIMITS.maxUncompressedChunkBytes }).toString('utf8')); }
      catch { throw new BadRequestException('Compressed replay chunk is malformed or expands beyond the limit.'); }
    }
    return input.events;
  }

  private async assertSessionIdentity(projectId: string, sessionId: string, anonymousId?: string, externalId?: string) {
    const result = await this.database.query<SessionIdentityRow>(`
      SELECT s.id,s.user_id,s.anonymous_id,u.external_id FROM sessions s
      LEFT JOIN users u ON u.id=s.user_id AND u.project_id=s.project_id
      WHERE s.id=$1 AND s.project_id=$2 LIMIT 1
    `, [sessionId, projectId]);
    const session = result.rows[0];
    if (session) {
      if ((session.anonymous_id ?? undefined) !== anonymousId || (session.external_id ?? undefined) !== externalId) throw new ForbiddenException('Replay session identity does not match the existing session.');
    } else if (externalId) {
      const user = await this.database.query('SELECT 1 FROM users WHERE project_id=$1 AND external_id=$2 LIMIT 1', [projectId, externalId]);
      if (!user.rows.length) throw new ForbiddenException('Replay user identity does not exist in the authenticated project.');
    }
  }

  private async ensureSession(executor: QueryExecutor, claims: ReplayUploadClaims, startedAt: Date) {
    let internalUserId: string | null = null;
    if (claims.userId) {
      const user = await executor.query<{ id: string }>('SELECT id FROM users WHERE project_id=$1 AND external_id=$2 LIMIT 1', [claims.projectId, claims.userId]);
      internalUserId = user.rows[0]?.id ?? null;
      if (!internalUserId) throw new ForbiddenException('Replay user identity does not belong to the authenticated project.');
    }
    await executor.query('INSERT INTO sessions(id,project_id,user_id,anonymous_id,started_at,last_seen_at) VALUES($1,$2,$3,$4,$5,$5) ON CONFLICT(id) DO NOTHING', [claims.sessionId, claims.projectId, internalUserId, claims.anonymousId ?? null, startedAt]);
    const result = await executor.query<SessionIdentityRow>(`
      SELECT s.id,s.user_id,s.anonymous_id,u.external_id FROM sessions s
      LEFT JOIN users u ON u.id=s.user_id AND u.project_id=s.project_id
      WHERE s.id=$1 AND s.project_id=$2 LIMIT 1
    `, [claims.sessionId, claims.projectId]);
    const session = result.rows[0];
    if (!session) throw new ForbiddenException('Session does not belong to the authenticated project.');
    if ((session.anonymous_id ?? undefined) !== claims.anonymousId || (session.external_id ?? undefined) !== claims.userId) throw new ForbiddenException('Replay session identity mismatch.');
    return session;
  }

  private async ensureReplay(
    executor: QueryExecutor,
    claims: ReplayUploadClaims,
    session: SessionIdentityRow,
    settings: ReplaySettings,
    startedAt: Date,
    matchedFunnelIds: string[],
    recordingFormat: ReplayRecordingFormat
  ) {
    const replayId = claims.replayId;
    let replay: ReplayRow | undefined;
    if (replayId) {
      const existing = await executor.query<ReplayRow>(
        'SELECT * FROM session_replays WHERE id=$1 AND project_id=$2 AND deleted_at IS NULL LIMIT 1',
        [replayId, claims.projectId]
      );
      replay = existing.rows[0];
    } else {
      const existing = await executor.query<ReplayRow>(
        'SELECT * FROM session_replays WHERE project_id=$1 AND session_id=$2 AND deleted_at IS NULL ORDER BY started_at DESC LIMIT 1',
        [claims.projectId, session.id]
      );
      replay = existing.rows[0];
    }
    if (!replay) {
      const id = replayId || `rpl_${randomUUID()}`;
      const prefix = [claims.organizationId, claims.projectId, session.id].map((part) => this.pathSegment(part)).join('/');
      const result = await executor.query<ReplayRow>(`
        INSERT INTO session_replays(id,organization_id,project_id,session_id,user_id,anonymous_id,started_at,storage_prefix,recording_format,recording_version,privacy_mode,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()+($12::int*interval '1 day')) RETURNING *
      `, [id, claims.organizationId, claims.projectId, session.id, session.user_id, session.anonymous_id, startedAt,
        prefix, recordingFormat, recordingFormat === 'mobile-structural-v1' ? '1' : REPLAY_FORMAT_VERSION,
        settings.privacyMode, settings.retentionDays]);
      replay = result.rows[0];
    }
    if (!replay) throw new Error('Replay could not be created.');
    if (replay.session_id !== session.id) throw new ForbiddenException('Replay does not belong to the upload grant session.');
    this.assertReplayFormat(replay, recordingFormat);
    await executor.query(`
      INSERT INTO session_replay_funnels(replay_id,project_id,funnel_id)
      SELECT $1,$2,unnest($3::text[])
      ON CONFLICT(replay_id,funnel_id) DO NOTHING
    `, [replay.id, claims.projectId, matchedFunnelIds]);
    return replay;
  }

  private verifyInputClaims(token: string, input: { projectId?: string; sessionId?: string; anonymousId?: string; userId?: string }) {
    const claims = this.tokens.verify(this.required(token, 'replayUploadToken'));
    if (claims.projectId !== this.required(input.projectId, 'projectId') || claims.sessionId !== this.safeId(input.sessionId, 'sessionId')
      || claims.anonymousId !== this.optional(input.anonymousId) || claims.userId !== this.optional(input.userId)) {
      throw new ForbiddenException('Replay upload token is not valid for this project, session, or identity.');
    }
    return claims;
  }

  private async assertTokenStillAllowed(
    claims: ReplayUploadClaims,
    settings: ReplaySettings,
    executor: QueryExecutor = this.database
  ) {
    if (!settings.enabled || claims.privacyMode !== settings.privacyMode || claims.requireConsent !== settings.requireConsent || (settings.requireConsent && !claims.consentGranted)) {
      throw new ForbiddenException('Replay upload token no longer matches project privacy settings.');
    }
    if (!sampleSession(claims.sessionId, settings.sampleRate)) {
      throw new ForbiddenException('Replay upload token no longer matches the project sample rate.');
    }
    const matched = await this.loadMatchedFunnelIds(claims.projectId, claims.sessionId, executor);
    const activeMatchedFunnelIds = claims.matchedFunnelIds.filter((id) => matched.includes(id));
    if (activeMatchedFunnelIds.length === 0) {
      throw new ForbiddenException('Replay upload token no longer matches a selected Replay flow.');
    }
    return activeMatchedFunnelIds;
  }

  private assertReplayWritable(replay: ReplayRow, now: Date) {
    if (replay.deleted_at || ['deleting', 'deleted', 'expired', 'failed'].includes(replay.status) || new Date(replay.expires_at) <= now) throw new ConflictException('Replay is deleted, deleting, expired, or otherwise not writable.');
  }

  private assertReplayFormat(replay: ReplayRow, expected: ReplayRecordingFormat) {
    if (replay.recording_format !== expected) throw new ConflictException('Replay recording format does not match the upload grant.');
  }

  private recordingFormat(value: unknown): ReplayRecordingFormat {
    if (value === undefined || value === 'rrweb-json-gzip') return 'rrweb-json-gzip';
    if (value === 'mobile-structural-v1') return value;
    throw new BadRequestException('Replay recording format is unsupported.');
  }

  private assertReplayCapacity(replay: ReplayRow, compressedBytes: number, uncompressedBytes: number, claims: ReplayUploadClaims) {
    const maxChunks = Math.min(REPLAY_LIMITS.maxChunksPerReplay, claims.maxChunks);
    const maxCompressed = Math.min(REPLAY_LIMITS.maxReplayBytes, claims.maxCompressedBytes);
    const maxUncompressed = Math.min(REPLAY_LIMITS.maxReplayUncompressedBytes, claims.maxUncompressedBytes);
    if (Number(replay.chunk_count) + 1 > maxChunks) throw new BadRequestException('Replay chunk limit reached.');
    if (Number(replay.compressed_size_bytes) + compressedBytes > maxCompressed) throw new BadRequestException('Replay compressed byte limit reached.');
    if (Number(replay.uncompressed_size_bytes) + uncompressedBytes > maxUncompressed) throw new BadRequestException('Replay expanded byte limit reached.');
  }

  private validateEventTimes(bounds: { first: Date; last: Date }, receivedAt: Date, maxDurationSeconds: number) {
    if (bounds.last < bounds.first || bounds.last.getTime() > receivedAt.getTime() + REPLAY_LIMITS.clockSkewMs
      || bounds.first.getTime() < receivedAt.getTime() - maxDurationSeconds * 1_000 - REPLAY_LIMITS.clockSkewMs) {
      throw new BadRequestException('Replay event timestamps are outside the permitted server clock-skew window.');
    }
    if (bounds.last.getTime() - bounds.first.getTime() > maxDurationSeconds * 1_000) throw new BadRequestException('Replay chunk timestamps exceed the maximum replay duration.');
  }

  private validateClaimedTimestamp(value: unknown, expected: Date, field: string) {
    if (value === undefined) return;
    const parsed = this.date(value);
    if (Math.abs(parsed.getTime() - expected.getTime()) > REPLAY_LIMITS.clockSkewMs) throw new BadRequestException(`${field} does not match the authoritative replay time window.`);
  }

  private validateSettings(settings: ReplaySettings): ReplaySettings {
    const privacyMode = ['strict', 'balanced', 'custom'].includes(settings.privacyMode) ? settings.privacyMode : 'strict';
    const selectors = (items: unknown) => Array.isArray(items) ? items.filter((item): item is string => typeof item === 'string' && item.length > 0 && item.length <= 200).slice(0, 50) : [];
    const requestedFunnelIds = Array.isArray(settings.selectedFunnelIds) ? settings.selectedFunnelIds : [];
    if (requestedFunnelIds.length > 100 || requestedFunnelIds.some((id) =>
      typeof id !== 'string' || !/^fnl_[A-Za-z0-9_-]{1,156}$/.test(id.trim()))) {
      throw new BadRequestException('selectedFunnelIds contains an invalid flow identifier.');
    }
    const selectedFunnelIds = [...new Set(requestedFunnelIds.map((id) => id.trim()))];
    return { enabled: settings.enabled === true, sampleRate: this.number(settings.sampleRate, 0, 1, 'sampleRate'),
      maxDurationSeconds: this.number(settings.maxDurationSeconds, 1, REPLAY_LIMITS.maxDurationSeconds, 'maxDurationSeconds', true),
      retentionDays: this.number(settings.retentionDays, 1, 3650, 'retentionDays', true), privacyMode: privacyMode as ReplayPrivacyMode,
      requireConsent: settings.requireConsent !== false, maskSelectors: selectors(settings.maskSelectors),
      blockSelectors: selectors(settings.blockSelectors), ignoreSelectors: selectors(settings.ignoreSelectors),
      selectedFunnelIds };
  }

  private lockSession(executor: QueryExecutor, projectId: string, sessionId: string) { return executor.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`replay:${projectId}:${sessionId}`]); }
  private lockReplaySettings(executor: QueryExecutor, projectId: string) { return executor.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`replay-settings:${projectId}`]); }
  private lockReplay(executor: QueryExecutor, replayId: string) { return executor.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`replay-id:${replayId}`]); }
  private assertCanManage(project: ResolvedProject) { if (project.role !== 'owner' && project.role !== 'admin') throw new ForbiddenException('Project admin access is required.'); }
  private chunkKey(prefix: string, sequence: number, digest: string) { return `${prefix}/${String(sequence).padStart(6, '0')}-${digest.slice(0, 12)}.json.gz`; }
  private pathSegment(value: string) { return /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : createHash('sha256').update(value).digest('hex'); }
  private safeId(value: unknown, field: string) { const text = this.required(value, field); if (text.length > 160 || !/^[A-Za-z0-9_-]+$/.test(text)) throw new BadRequestException(`${field} is invalid.`); return text; }
  private required(value: unknown, field: string) { if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`${field} is required.`); return value.trim(); }
  private optional(value: unknown) { return typeof value === 'string' && value.trim() ? value.trim().slice(0, 256) : undefined; }
  private sequence(value: unknown) { if (!Number.isInteger(value) || Number(value) < 0 || Number(value) >= REPLAY_LIMITS.maxChunksPerReplay) throw new BadRequestException('sequence is invalid.'); return Number(value); }
  private date(value: unknown) { const parsed = typeof value === 'string' ? new Date(value) : value instanceof Date ? value : new Date(Number.NaN); if (Number.isNaN(parsed.getTime())) throw new BadRequestException('Replay timestamp is invalid.'); return parsed; }
  private number(value: unknown, min: number, max: number, field: string, integer=false) { const n=Number(value); if (!Number.isFinite(n) || n<min || n>max || (integer&&!Number.isInteger(n))) throw new BadRequestException(`${field} is invalid.`); return n; }
  private clamp(value: string|undefined, fallback:number,min:number,max:number) { const n=Number(value); return Number.isFinite(n) ? Math.min(max,Math.max(min,Math.trunc(n))) : fallback; }
  private eventBounds(events: Array<{ timestamp?: unknown }>) { const times=events.map((event) => Number(event.timestamp)).filter(Number.isFinite); return { first:new Date(Math.min(...times)), last:new Date(Math.max(...times)) }; }
}

export function sampleSession(sessionId: string, rate: number) {
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  let hash = 2166136261;
  for (let index = 0; index < sessionId.length; index += 1) {
    hash ^= sessionId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x1_0000_0000 < rate;
}
