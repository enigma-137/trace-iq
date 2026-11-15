import { HttpException, Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { ISSUE_ID_SQL } from '../../errors/errors.service';
import { EXCEPTION_EVENT } from '../../errors/fingerprint';
import { LINEAR_ISSUE_WINDOW_DAYS, LinearIssuesService } from './linear-issues.service';

export type AutoCreateRule = {
  organizationId: string;
  minOccurrences: number | null;
  minUsers: number | null;
};

/** How long a project's rule (or the lack of one) is reused before re-reading it. */
export const RULE_CACHE_MS = 30_000;
/** How long one error is left alone after it was checked, so a hot error is not re-counted per event. */
export const RECHECK_AFTER_MS = 60_000;
const MAX_TRACKED = 10_000;

export function meetsThreshold(rule: Pick<AutoCreateRule, 'minOccurrences' | 'minUsers'>, counts: { occurrences: number; users: number }): boolean {
  return (
    (rule.minOccurrences !== null && counts.occurrences >= rule.minOccurrences) ||
    (rule.minUsers !== null && counts.users >= rule.minUsers)
  );
}

/**
 * Opt-in: creates a Linear issue for an error once it crosses the project's threshold.
 * Called from ingestion after the response is decided; {@link onExceptionsIngested}
 * returns immediately, never throws, and never waits on Linear.
 */
@Injectable()
export class LinearAutoCreateService {
  private readonly logger = new Logger(LinearAutoCreateService.name);
  private readonly rules = new Map<string, { rule: AutoCreateRule | null; expiresAt: number }>();
  private readonly checkedAt = new Map<string, number>();
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(
    private readonly database: DatabaseService,
    private readonly issues: LinearIssuesService
  ) {}

  /** Fire-and-forget hook for ingestion. */
  onExceptionsIngested(projectId: string | undefined, fingerprints: Array<string | undefined>): void {
    try {
      if (!projectId) return;
      const now = Date.now();
      for (const fingerprint of new Set(fingerprints)) {
        if (!fingerprint) continue;
        const key = `${projectId}:${fingerprint}`;
        if (this.inFlight.has(key) || (this.checkedAt.get(key) ?? 0) > now - RECHECK_AFTER_MS) continue;
        this.remember(key, now);
        const task = this.evaluate(projectId, fingerprint)
          .then(() => undefined)
          .catch((error) => this.logger.warn(`Linear auto-create failed for ${projectId}: ${describe(error)}`))
          .finally(() => this.inFlight.delete(key));
        this.inFlight.set(key, task);
      }
    } catch (error) {
      this.logger.warn(`Linear auto-create hook failed: ${describe(error)}`);
    }
  }

  /** For tests and shutdown: wait for checks already started. */
  async settle(): Promise<void> {
    await Promise.all([...this.inFlight.values()]);
  }

  async evaluate(projectId: string, fingerprint: string): Promise<'no_rule' | 'linked' | 'ignored' | 'below_threshold' | 'created' | 'existing'> {
    const rule = await this.rule(projectId);
    if (!rule) return 'no_rule';

    const facts = await this.database.query<{ linked: boolean; status: string | null; occurrences: number; users: number }>(
      `SELECT
         EXISTS (SELECT 1 FROM error_linear_issues WHERE project_id = $1 AND fingerprint = $3) AS linked,
         (SELECT status FROM error_issues WHERE project_id = $1 AND fingerprint = $3) AS status,
         count(*)::int AS occurrences,
         count(DISTINCT COALESCE(e.user_id::text, e.anonymous_id))::int AS users
       FROM events e
       WHERE e.project_id = $1 AND e.event_name = $2 AND ${ISSUE_ID_SQL} = $3
         AND e.occurred_at >= now() - make_interval(days => $4::int)`,
      [projectId, EXCEPTION_EVENT, fingerprint, LINEAR_ISSUE_WINDOW_DAYS]
    );
    const row = facts.rows[0];
    if (!row) return 'below_threshold';
    if (row.linked) return 'linked';
    if (row.status === 'ignored') return 'ignored';
    if (!meetsThreshold(rule, { occurrences: Number(row.occurrences), users: Number(row.users) })) {
      // Not yet: let the next occurrence check again.
      this.checkedAt.delete(`${projectId}:${fingerprint}`);
      return 'below_threshold';
    }

    try {
      const result = await this.issues.createLinked({ id: projectId, organizationId: rule.organizationId }, fingerprint, {
        actorUserId: null,
        via: 'auto'
      });
      return result.created ? 'created' : 'existing';
    } catch (error) {
      // Another request is creating it, or the connection changed under us: nothing to do.
      const code = error instanceof HttpException ? (error.getResponse() as { code?: string })?.code : undefined;
      if (code === 'LINEAR_ISSUE_IN_PROGRESS' || code === 'LINEAR_NOT_CONNECTED' || code === 'LINEAR_TEAM_NOT_SET') return 'existing';
      throw error;
    }
  }

  /** The project's active rule: auto-create on, a working connection, same workspace. */
  private async rule(projectId: string): Promise<AutoCreateRule | null> {
    const cached = this.rules.get(projectId);
    if (cached && cached.expiresAt > Date.now()) return cached.rule;

    const result = await this.database.query<AutoCreateRule>(
      `SELECT p.organization_id AS "organizationId",
              s.auto_create_min_occurrences AS "minOccurrences",
              s.auto_create_min_users AS "minUsers"
       FROM linear_project_settings s
       JOIN projects p ON p.id = s.project_id
       JOIN linear_connections c ON c.organization_id = p.organization_id AND c.workspace_id = s.workspace_id
       WHERE s.project_id = $1 AND s.auto_create_linear_issues AND c.status = 'active'
         AND (s.auto_create_min_occurrences IS NOT NULL OR s.auto_create_min_users IS NOT NULL)`,
      [projectId]
    );
    const rule = result.rows[0] ?? null;
    if (this.rules.size >= MAX_TRACKED) this.rules.clear();
    this.rules.set(projectId, { rule, expiresAt: Date.now() + RULE_CACHE_MS });
    return rule;
  }

  private remember(key: string, now: number) {
    if (this.checkedAt.size >= MAX_TRACKED) this.checkedAt.clear();
    this.checkedAt.set(key, now);
  }
}

function describe(error: unknown): string {
  if (error instanceof HttpException) return `${error.name} (${error.getStatus()})`;
  return error instanceof Error ? error.name : 'unknown error';
}
