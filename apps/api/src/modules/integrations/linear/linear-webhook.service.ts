import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { DatabaseService } from '../../../database/database.service';

/** Linear's guidance: reject deliveries whose timestamp is more than a minute off. */
export const LINEAR_WEBHOOK_TOLERANCE_MS = 60_000;
/** Linear workflow state types that mean the work is finished. */
export const DONE_STATE_TYPES = new Set(['completed', 'canceled']);

export interface LinearWebhookPayload {
  action?: string;
  type?: string;
  /** The Linear workspace (organization) the event belongs to. */
  organizationId?: string;
  createdAt?: string;
  webhookTimestamp?: number;
  webhookId?: string;
  data?: {
    id?: string;
    identifier?: string;
    updatedAt?: string;
    state?: { id?: string; name?: string; type?: string } | null;
  };
}

export type WebhookOutcome =
  | 'ignored'
  | 'unlinked'
  | 'workspace_mismatch'
  | 'stale'
  | 'recorded'
  | 'resolved'
  | 'reopened';

/**
 * Checks `Linear-Signature` (hex HMAC-SHA256 of the raw body with the webhook secret)
 * and the delivery's `webhookTimestamp`. Returns the parsed payload.
 */
export function verifyLinearWebhook(
  secret: string,
  rawBody: Buffer,
  signature: string | undefined,
  now = Date.now()
): LinearWebhookPayload {
  if (!secret) throw new ServiceUnavailableException('Linear webhooks are not set up on this TraceIQ server.');
  const supplied = typeof signature === 'string' && /^[0-9a-f]{64}$/i.test(signature.trim()) ? Buffer.from(signature.trim(), 'hex') : null;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  if (!supplied || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new UnauthorizedException('Invalid Linear webhook signature.');
  }

  let payload: LinearWebhookPayload;
  try {
    payload = JSON.parse(rawBody.toString('utf8')) as LinearWebhookPayload;
  } catch {
    throw new UnauthorizedException('Invalid Linear webhook body.');
  }
  const timestamp = Number(payload?.webhookTimestamp);
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > LINEAR_WEBHOOK_TOLERANCE_MS) {
    throw new UnauthorizedException('Stale Linear webhook delivery.');
  }
  return payload;
}

type LinkRow = {
  projectId: string;
  fingerprint: string;
  workspaceId: string;
  linearStateType: string | null;
  linearUpdatedAt: string | null;
};

/**
 * Applies Linear issue updates to the linked TraceIQ error: done (completed or
 * canceled) resolves it, moving back out of done reopens it. Idempotent and
 * order-safe: an update older than the last one applied is ignored.
 */
@Injectable()
export class LinearWebhookService {
  private readonly logger = new Logger(LinearWebhookService.name);

  constructor(private readonly database: DatabaseService) {}

  get secret(): string {
    return (process.env.LINEAR_WEBHOOK_SECRET ?? '').trim();
  }

  async handle(payload: LinearWebhookPayload): Promise<WebhookOutcome> {
    if (payload.type !== 'Issue' || (payload.action !== 'update' && payload.action !== 'create')) return 'ignored';
    const issueId = payload.data?.id;
    const stateType = payload.data?.state?.type ?? null;
    if (!issueId || !stateType) return 'ignored';
    const updatedAt = parseTime(payload.data?.updatedAt) ?? parseTime(payload.createdAt) ?? new Date(Number(payload.webhookTimestamp));

    return this.database.transaction(async (client) => {
      const found = await client.query<LinkRow>(
        `SELECT project_id AS "projectId", fingerprint, workspace_id AS "workspaceId",
                linear_state_type AS "linearStateType", linear_updated_at AS "linearUpdatedAt"
         FROM error_linear_issues WHERE linear_issue_id = $1 FOR UPDATE`,
        [issueId]
      );
      const link = found.rows[0];
      if (!link) return 'unlinked';
      // The secret is shared by every workspace that installed the app; never let one
      // workspace's event touch an error linked to another.
      if (!payload.organizationId || payload.organizationId !== link.workspaceId) return 'workspace_mismatch';
      if (link.linearUpdatedAt && new Date(link.linearUpdatedAt).getTime() >= updatedAt.getTime()) return 'stale';

      await client.query(
        `UPDATE error_linear_issues SET linear_state_type = $2, linear_updated_at = $3 WHERE linear_issue_id = $1`,
        [issueId, stateType, updatedAt.toISOString()]
      );

      const wasDone = link.linearStateType !== null && DONE_STATE_TYPES.has(link.linearStateType);
      const isDone = DONE_STATE_TYPES.has(stateType);

      if (isDone && !wasDone) {
        // Ignored errors stay ignored; everything else is resolved from Linear.
        const resolved = await client.query(
          `INSERT INTO error_issues (project_id, fingerprint, status, resolved_at, status_source)
           VALUES ($1, $2, 'resolved', now(), 'linear')
           ON CONFLICT (project_id, fingerprint) DO UPDATE SET
             status = 'resolved', resolved_at = now(), status_source = 'linear', updated_by_user_id = NULL, updated_at = now()
           WHERE error_issues.status <> 'ignored'
           RETURNING 1`,
          [link.projectId, link.fingerprint]
        );
        return resolved.rows.length ? 'resolved' : 'recorded';
      }

      if (!isDone && wasDone) {
        const reopened = await client.query(
          `UPDATE error_issues
           SET status = 'open', resolved_at = NULL, status_source = 'linear', updated_by_user_id = NULL, updated_at = now()
           WHERE project_id = $1 AND fingerprint = $2 AND status = 'resolved'
           RETURNING 1`,
          [link.projectId, link.fingerprint]
        );
        return reopened.rows.length ? 'reopened' : 'recorded';
      }
      return 'recorded';
    });
  }

  /** Logs outcomes without any payload content. */
  logOutcome(outcome: WebhookOutcome, deliveryId?: string) {
    if (outcome === 'resolved' || outcome === 'reopened' || outcome === 'workspace_mismatch') {
      this.logger.log(`Linear webhook ${deliveryId ?? ''} ${outcome}`.replace(/\s+/g, ' '));
    }
  }
}

function parseTime(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
