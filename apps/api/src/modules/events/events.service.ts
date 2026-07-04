import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';

type JsonObject = Record<string, unknown>;

interface WriteKeyRecord {
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
}

@Injectable()
export class EventsService {
  constructor(private readonly database: DatabaseService) {}

  async ingest(input: IngestEventRequest): Promise<IngestEventResponse> {
    const writeKey = this.requiredString(input.writeKey, 'writeKey');
    const projectId = this.requiredString(input.projectId, 'projectId');
    const eventName = this.requiredString(input.eventName, 'eventName');
    const occurredAt = this.parseTimestamp(input.timestamp);
    const auth = await this.authenticateWriteKey(writeKey, projectId);
    const anonymousId = this.optionalString(input.anonymousId);
    const userId = await this.ensureUser(auth.project_id, input.userId, anonymousId);
    const sessionId = await this.ensureSession(auth.project_id, input.sessionId, userId, anonymousId, input.context);
    const eventId = `evt_${randomUUID()}`;

    await this.database.query(
      `
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
      `,
      [
        eventId,
        auth.organization_id,
        auth.project_id,
        userId,
        anonymousId,
        sessionId,
        eventName,
        JSON.stringify(input.properties ?? {}),
        JSON.stringify(input.deviceInfo ?? {}),
        JSON.stringify(input.networkInfo ?? {}),
        JSON.stringify(input.context ?? {}),
        occurredAt.toISOString()
      ]
    );

    return {
      accepted: true,
      eventId
    };
  }

  async listRecentEvents(projectId: string, limit = 25) {
    const safeLimit = Math.min(Math.max(Number.isFinite(limit) ? Math.trunc(limit) : 25, 1), 100);
    const requiredProjectId = this.requiredString(projectId, 'projectId');

    const result = await this.database.query(
      `
        SELECT
          id,
          project_id AS "projectId",
          user_id AS "userId",
          anonymous_id AS "anonymousId",
          session_id AS "sessionId",
          event_name AS "eventName",
          properties,
          device_info AS "deviceInfo",
          network_info AS "networkInfo",
          context,
          occurred_at AS "occurredAt",
          received_at AS "receivedAt"
        FROM events
        WHERE project_id = $1
        ORDER BY received_at DESC
        LIMIT $2
      `,
      [requiredProjectId, safeLimit]
    );

    return {
      events: result.rows
    };
  }

  private async authenticateWriteKey(writeKey: string, projectId: string): Promise<WriteKeyRecord> {
    const keyHash = this.sha256(writeKey);
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

    const existing = await this.database.query<UserRecord>(
      `
        SELECT id
        FROM users
        WHERE project_id = $1
          AND external_id = $2
        LIMIT 1
      `,
      [projectId, safeExternalId]
    );

    const existingUser = existing.rows[0];
    if (existingUser) {
      await this.database.query(
        `
          UPDATE users
          SET anonymous_id = COALESCE(anonymous_id, $3),
              last_seen_at = now(),
              updated_at = now()
          WHERE project_id = $1
            AND external_id = $2
        `,
        [projectId, safeExternalId, anonymousId ?? null]
      );

      return existingUser.id;
    }

    const userId = `usr_${randomUUID()}`;
    await this.database.query(
      `
        INSERT INTO users (id, project_id, external_id, anonymous_id)
        VALUES ($1, $2, $3, $4)
      `,
      [userId, projectId, safeExternalId, anonymousId ?? null]
    );

    return userId;
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
