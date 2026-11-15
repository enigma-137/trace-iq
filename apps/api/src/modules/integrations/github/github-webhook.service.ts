import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { DatabaseService } from '../../../database/database.service';
import { GitHubAppClient } from './github-app.client';

export interface GitHubWebhookPayload {
  action?: string;
  installation?: { id?: number; repository_selection?: string; suspended_at?: string | null; account?: { login?: string } };
  repository_selection?: string;
  repositories_removed?: Array<{ id?: number; full_name?: string }>;
  repositories_added?: Array<{ id?: number; full_name?: string }>;
}

export type GitHubWebhookOutcome = 'ignored' | 'unknown_installation' | 'uninstalled' | 'suspended' | 'unsuspended' | 'repositories_updated';

/** Checks `X-Hub-Signature-256` ("sha256=" + hex HMAC-SHA256 of the raw body). */
export function verifyGitHubWebhook(secret: string, rawBody: Buffer, signature: string | undefined): GitHubWebhookPayload {
  if (!secret) throw new ServiceUnavailableException('GitHub webhooks are not set up on this TraceIQ server.');
  const match = typeof signature === 'string' ? /^sha256=([0-9a-f]{64})$/i.exec(signature.trim()) : null;
  const supplied = match ? Buffer.from(match[1], 'hex') : null;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  if (!supplied || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new UnauthorizedException('Invalid GitHub webhook signature.');
  }
  try {
    return JSON.parse(rawBody.toString('utf8')) as GitHubWebhookPayload;
  } catch {
    throw new UnauthorizedException('Invalid GitHub webhook body.');
  }
}

/** Keeps installations in step with GitHub: uninstall, suspend, and repository access changes. */
@Injectable()
export class GitHubWebhookService {
  private readonly logger = new Logger(GitHubWebhookService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly github: GitHubAppClient
  ) {}

  get secret(): string {
    return (process.env.GITHUB_APP_WEBHOOK_SECRET ?? '').trim();
  }

  async handle(event: string | undefined, payload: GitHubWebhookPayload): Promise<GitHubWebhookOutcome> {
    const installationId = Number(payload.installation?.id);
    if (!Number.isSafeInteger(installationId) || installationId <= 0) return 'ignored';

    if (event === 'installation') {
      if (payload.action === 'deleted') {
        this.github.forgetInstallation(installationId);
        // Repo links go with it (ON DELETE CASCADE).
        const removed = await this.database.query(`DELETE FROM github_installations WHERE installation_id = $1 RETURNING 1`, [installationId]);
        return removed.rows.length ? 'uninstalled' : 'unknown_installation';
      }
      if (payload.action === 'suspend' || payload.action === 'unsuspend') {
        const status = payload.action === 'suspend' ? 'suspended' : 'active';
        if (status === 'suspended') this.github.forgetInstallation(installationId);
        const updated = await this.database.query(
          `UPDATE github_installations SET status = $2, updated_at = now() WHERE installation_id = $1 RETURNING 1`,
          [installationId, status]
        );
        return updated.rows.length ? (status === 'suspended' ? 'suspended' : 'unsuspended') : 'unknown_installation';
      }
      return 'ignored';
    }

    if (event === 'installation_repositories') {
      const selection = payload.repository_selection === 'all' ? 'all' : payload.repository_selection === 'selected' ? 'selected' : null;
      const updated = await this.database.query(
        `UPDATE github_installations SET repository_selection = COALESCE($2, repository_selection), updated_at = now()
         WHERE installation_id = $1 RETURNING 1`,
        [installationId, selection]
      );
      if (!updated.rows.length) return 'unknown_installation';
      const removedIds = (payload.repositories_removed ?? [])
        .map((repo) => Number(repo.id))
        .filter((id) => Number.isSafeInteger(id) && id > 0);
      if (removedIds.length) {
        // Projects linked to a repo the app can no longer see are unlinked.
        await this.database.query(
          `DELETE FROM github_project_repos WHERE installation_id = $1 AND repo_id = ANY($2::bigint[])`,
          [installationId, removedIds]
        );
      }
      return 'repositories_updated';
    }

    return 'ignored';
  }

  logOutcome(outcome: GitHubWebhookOutcome, deliveryId?: string) {
    if (outcome !== 'ignored') this.logger.log(`GitHub webhook ${deliveryId ?? ''} ${outcome}`.replace(/\s+/g, ' '));
  }
}
