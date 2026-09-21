import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { QueryResultRow } from 'pg';
import { DatabaseService } from '../../database/database.service';

export type AuditAction =
  | 'member.added'
  | 'member.removed'
  | 'member.role_changed'
  | 'invite.created'
  | 'invite.resend'
  | 'invite.cancelled'
  | 'invite.accepted'
  | 'write_key.rotated'
  | 'project.created'
  | 'project.renamed'
  | 'project.deleted'
  | 'organization.renamed';

export interface AuditEvent {
  organizationId: string;
  actorUserId: string;
  action: AuditAction;
  targetUserId?: string | null;
  targetEmail?: string | null;
  role?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface AuditRow extends QueryResultRow {
  id: string;
  organization_id: string;
  actor_user_id: string;
  action: AuditAction;
  target_user_id: string | null;
  target_email: string | null;
  role: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Append-only trail of member-management and key-rotation events, so an
 * organization can always answer "who invited / removed / changed whose role".
 * New groups of events should be added to the AuditAction union and to the
 * CHECK constraint in migration 0019.
 */
@Injectable()
export class AuditService {
  constructor(private readonly database: DatabaseService) {}

  async record(event: AuditEvent) {
    await this.database.query(
      `
        INSERT INTO organization_audit_events
          (id, organization_id, actor_user_id, action, target_user_id, target_email, role, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
      `,
      [
        `aud_${randomUUID()}`,
        event.organizationId,
        event.actorUserId,
        event.action,
        event.targetUserId ?? null,
        event.targetEmail ?? null,
        event.role ?? null,
        event.metadata ?? null
      ]
    );
  }

  async listForOrganization(organizationId: string, limit = 100) {
    const result = await this.database.query<AuditRow>(
      `
        SELECT id, organization_id, actor_user_id, action, target_user_id, target_email, role, metadata, created_at
        FROM organization_audit_events
        WHERE organization_id = $1
        ORDER BY created_at DESC
        LIMIT $2;
      `,
      [organizationId, Math.min(limit, 500)]
    );

    return result.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      actorUserId: row.actor_user_id,
      action: row.action,
      targetUserId: row.target_user_id,
      targetEmail: row.target_email,
      role: row.role,
      metadata: row.metadata,
      createdAt: row.created_at
    }));
  }
}