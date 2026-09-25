import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Subject, Subscription } from 'rxjs';
import { DatabaseService } from '../../database/database.service';

export interface SetupVerificationRecord {
  [column: string]: unknown;
  id: string;
  project_id: string;
  status: 'pending' | 'verified' | 'expired';
  created_at: string;
  expires_at: string;
  verified_at: string | null;
  verified_event_name: string | null;
  verified_event_id: string | null;
  verified_metadata: Record<string, unknown> | null;
}

export interface VerificationEventPayload {
  verificationId: string;
  projectId: string;
  projectName?: string;
  status: 'verified';
  verifiedAt: string;
  event: {
    id: string;
    name: string;
    source?: string;
    environment?: string;
    browser?: string;
    host?: string;
    userId?: string | null;
    anonymousId?: string | null;
    properties?: Record<string, unknown>;
  };
}

@Injectable()
export class SetupVerificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SetupVerificationsService.name);
  private readonly verificationSubject = new Subject<VerificationEventPayload>();
  private cleanupInterval?: NodeJS.Timeout;

  constructor(private readonly database: DatabaseService) {}

  onModuleInit() {
    // Periodically expire old sessions in the database (every 60s)
    this.cleanupInterval = setInterval(() => {
      void this.expireStaleSessions();
    }, 60_000);
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
   * Create a temporary verification session for a project.
   */
  async createSession(projectId: string, ttlSeconds = 300): Promise<{ verificationId: string; expiresAt: string; projectId: string }> {
    const validTtl = Math.min(Math.max(ttlSeconds, 60), 600); // 1 - 10 minutes
    const verificationId = `verify_${randomUUID().replace(/-/g, '')}`;
    const expiresAt = new Date(Date.now() + validTtl * 1000).toISOString();

    await this.database.query(
      `
        INSERT INTO setup_verifications (id, project_id, status, created_at, expires_at)
        VALUES ($1, $2, 'pending', now(), $3)
      `,
      [verificationId, projectId, expiresAt]
    );

    return {
      verificationId,
      expiresAt,
      projectId
    };
  }

  /**
   * Retrieve verification session status.
   */
  async getSession(verificationId: string): Promise<SetupVerificationRecord | null> {
    const result = await this.database.query<SetupVerificationRecord>(
      `
        SELECT
          id,
          project_id,
          status,
          created_at,
          expires_at,
          verified_at,
          verified_event_name,
          verified_event_id,
          verified_metadata
        FROM setup_verifications
        WHERE id = $1
      `,
      [verificationId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const session = result.rows[0];
    if (session.status === 'pending' && new Date(session.expires_at).getTime() <= Date.now()) {
      await this.database.query(
        `UPDATE setup_verifications SET status = 'expired' WHERE id = $1 AND status = 'pending'`,
        [verificationId]
      );
      session.status = 'expired';
    }

    return session;
  }

  /**
   * Verify an incoming event from the real ingestion pipeline against pending verification sessions.
   */
  async recordVerificationIfMatching(
    projectId: string,
    event: {
      eventName?: string;
      properties?: Record<string, unknown>;
      context?: Record<string, unknown>;
      deviceInfo?: Record<string, unknown>;
      networkInfo?: Record<string, unknown>;
      userId?: string | null;
      anonymousId?: string | null;
    },
    meta: {
      ip?: string;
      forwardedFor?: string;
      headers?: Record<string, string | undefined>;
    } = {},
    eventId?: string
  ): Promise<boolean> {
    const rawVerificationId =
      event.properties?.verification_id ??
      event.properties?.verificationId ??
      event.context?.verification_id ??
      event.context?.verificationId;

    if (!rawVerificationId || typeof rawVerificationId !== 'string') {
      return false;
    }

    const verificationId = rawVerificationId.trim();
    if (!verificationId.startsWith('verify_')) {
      return false;
    }

    // Attempt to atomically transition from 'pending' to 'verified' matching projectId and unexpired session
    const verifiedMetadata = {
      source: meta.headers?.['host'] ?? meta.headers?.['origin'] ?? 'localhost:3000',
      host: meta.headers?.['host'] ?? null,
      origin: meta.headers?.['origin'] ?? null,
      userAgent: meta.headers?.['user-agent'] ?? (event.deviceInfo?.userAgent as string) ?? null,
      environment: (event.context?.environment as string) ?? (event.properties?.environment as string) ?? 'development',
      browser: (event.deviceInfo?.browser as string) ?? null,
      ip: meta.ip ?? meta.forwardedFor ?? null,
      properties: event.properties ?? {},
      timestamp: new Date().toISOString()
    };

    const updateResult = await this.database.query<SetupVerificationRecord>(
      `
        UPDATE setup_verifications
        SET
          status = 'verified',
          verified_at = now(),
          verified_event_name = $1,
          verified_event_id = $2,
          verified_metadata = $3
        WHERE id = $4
          AND project_id = $5
          AND status = 'pending'
          AND expires_at > now()
        RETURNING *
      `,
      [event.eventName ?? 'traceiq_setup_verified', eventId ?? `evt_${randomUUID()}`, JSON.stringify(verifiedMetadata), verificationId, projectId]
    );

    if (updateResult.rows.length === 0) {
      return false;
    }

    const updated = updateResult.rows[0];

    // Fetch project name for richer feedback
    let projectName = 'TraceIQ Project';
    try {
      const projRes = await this.database.query<{ name: string }>(
        `SELECT name FROM projects WHERE id = $1`,
        [projectId]
      );
      if (projRes.rows.length > 0) {
        projectName = projRes.rows[0].name;
      }
    } catch {
      // Non-critical fallback
    }

    const payload: VerificationEventPayload = {
      verificationId,
      projectId,
      projectName,
      status: 'verified',
      verifiedAt: (updated.verified_at as string) ?? new Date().toISOString(),
      event: {
        id: (updated.verified_event_id as string) ?? eventId ?? '',
        name: (updated.verified_event_name as string) ?? event.eventName ?? 'traceiq_setup_verified',
        source: verifiedMetadata.source,
        environment: verifiedMetadata.environment,
        browser: verifiedMetadata.browser ?? undefined,
        host: verifiedMetadata.host ?? undefined,
        userId: event.userId,
        anonymousId: event.anonymousId,
        properties: event.properties
      }
    };

    // Emit to in-process subscribers
    this.broadcastVerification(payload);

    // Also broadcast through Postgres NOTIFY for multi-instance deployments
    try {
      await this.database.query(
        `SELECT pg_notify('traceiq_setup_verified', $1)`,
        [JSON.stringify(payload)]
      );
    } catch (error) {
      this.logger.debug(`Could not send pg_notify for verification: ${error}`);
    }

    return true;
  }

  /**
   * Broadcast verification event payload to in-memory listeners.
   */
  broadcastVerification(payload: VerificationEventPayload): void {
    this.verificationSubject.next(payload);
  }

  /**
   * Handle incoming PostgreSQL LISTEN notifications from remote cluster nodes.
   */
  handlePgNotification(rawPayload: string): void {
    try {
      const parsed = JSON.parse(rawPayload) as VerificationEventPayload;
      if (parsed && parsed.verificationId && parsed.status === 'verified') {
        this.broadcastVerification(parsed);
      }
    } catch (err) {
      this.logger.debug(`Failed to parse pg notification payload: ${err}`);
    }
  }

  /**
   * Subscribe to verification events for a specific verificationId.
   */
  subscribeToVerification(verificationId: string, onVerified: (payload: VerificationEventPayload) => void): () => void {
    const subscription: Subscription = this.verificationSubject.subscribe({
      next: (payload) => {
        if (payload.verificationId === verificationId) {
          onVerified(payload);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }

  /**
   * Return number of active in-process SSE/verification observers.
   */
  getActiveObserverCount(): number {
    return this.verificationSubject.observers.length;
  }

  /**
   * Expire stale pending sessions.
   */
  private async expireStaleSessions(): Promise<void> {
    try {
      await this.database.query(
        `
          UPDATE setup_verifications
          SET status = 'expired'
          WHERE status = 'pending' AND expires_at < now()
        `
      );
    } catch (err) {
      this.logger.debug(`Error expiring stale setup verifications: ${err}`);
    }
  }

  /**
   * Authenticate write key for verification endpoint.
   */
  async authenticateWriteKey(writeKey: string, projectId: string): Promise<boolean> {
    const keyHash = createHash('sha256').update(writeKey).digest('hex');
    const result = await this.database.query(
      `
        SELECT project_id
        FROM write_keys
        WHERE key_hash = $1 AND project_id = $2
      `,
      [keyHash, projectId]
    );
    return result.rows.length > 0;
  }
}
