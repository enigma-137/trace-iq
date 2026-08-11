import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService, ResolvedProject } from '../projects/projects.service';
import { EmailService, isValidEmail } from '../emails/email.service';

export interface UnlockEmailItem {
  slug: string;
  title: string;
  description: string;
  category: string;
}

export interface AchievementDefinition {
  [column: string]: unknown;
  id: string;
  slug: string;
  title: string;
  description: string;
  badge: string;
  category: string;
  kind: string;
  metric: string;
  threshold: number;
  hidden: boolean;
  sort_order: number;
}

export interface AchievementView {
  id: string;
  slug: string;
  title: string;
  description: string;
  badge: string;
  category: string;
  kind: string;
  metric: string;
  threshold: number;
  progress: number;
  unlocked: boolean;
  unlockedAt: string | null;
}

type MetricScope = {
  organizationId: string;
  projectId: string;
};

type MetricEvaluator = (database: DatabaseService, scope: MetricScope) => Promise<number>;

// A straight COUNT over a project- or organization-scoped table.
const counter =
  (table: string, column: 'project_id' | 'organization_id', key: 'projectId' | 'organizationId'): MetricEvaluator =>
  async (database, scope) => {
    const result = await database.query<{ value: number }>(
      `SELECT COUNT(*)::float8 AS value FROM ${table} WHERE ${column} = $1`,
      [scope[key]]
    );
    return result.rows[0]?.value ?? 0;
  };

// Registry of metric keys -> SQL-backed values. Every metric a definition references
// must live here; anything else evaluates to 0 and can never unlock. New achievement
// conditions (streaks, time windows, feature usage, ...) are added as new entries.
const METRICS: Record<string, MetricEvaluator> = {
  'events.all_time': counter('events', 'project_id', 'projectId'),
  'events.24h': async (database, scope) => {
    const result = await database.query<{ value: number }>(
      `SELECT COUNT(*)::float8 AS value FROM events
       WHERE project_id = $1 AND occurred_at >= now() - interval '24 hours'`,
      [scope.projectId]
    );
    return result.rows[0]?.value ?? 0;
  },
  'users.all_time': counter('users', 'project_id', 'projectId'),
  'projects.count': counter('projects', 'organization_id', 'organizationId'),
  'flags.count': counter('feature_flags', 'project_id', 'projectId'),
  'alerts.count': counter('alerts', 'project_id', 'projectId'),
  'webhooks.count': counter('webhooks', 'project_id', 'projectId'),
  'funnels.count': counter('funnels', 'project_id', 'projectId'),
  'dashboards.count': counter('dashboards', 'project_id', 'projectId'),
  'cohorts.count': counter('cohorts', 'project_id', 'projectId'),
  'org.tenure_months': async (database, scope) => {
    const result = await database.query<{ value: number }>(
      `SELECT COALESCE(EXTRACT(EPOCH FROM (now() - created_at)) / 2592000, 0)::float8 AS value
       FROM organizations WHERE id = $1`,
      [scope.organizationId]
    );
    return result.rows[0]?.value ?? 0;
  }
};

// Only metrics that actually change on event ingestion are evaluated in the ingest
// hot path. Workspace/account counts (projects, flags, tenure, ...) are checked
// lazily on dashboard read instead, so a single event never triggers 20 queries.
const INGEST_METRIC_KEYS: readonly string[] = ['events.all_time', 'events.24h', 'users.all_time'];

const CATALOGUE_SQL = `
  SELECT id, slug, title, description, badge, category, kind, metric, threshold, hidden, sort_order
  FROM achievements
  WHERE hidden = false
  ORDER BY sort_order ASC, created_at ASC
`;

@Injectable()
export class AchievementsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService,
    private readonly email: EmailService
  ) {}

  /**
   * Dashboard listing. Evaluates progress live, awards anything newly earned to
   * every workspace member, then returns the fresh catalogue for the caller.
   */
  async list(user: DashboardUser, projectId?: string): Promise<{ project: ResolvedProject | null; achievements: AchievementView[] }> {
    const project = await this.projects.resolveActiveProject(user, projectId);
    if (!project) return { project: null, achievements: [] };

    const scope = { organizationId: project.organizationId, projectId: project.id };
    const catalogue = await this.loadCatalogue();
    const progress = await this.evaluateAll(catalogue, scope);
    const toAward = catalogue.filter((row) => progress[row.id] >= row.threshold).map((row) => row.id);

    const unlocks = await this.userUnlocks(user.id);
    if (toAward.length > 0) {
      const memberIds = await this.orgMemberIds(project.organizationId);
      await this.award(toAward, memberIds);
      const fresh = await this.userUnlocks(user.id);
      for (const id of toAward) {
        const unlockedAt = fresh.get(id);
        if (unlockedAt) unlocks.set(id, unlockedAt);
      }
    }

    // Notifications: remember the reader's email so future unlocks (including ones
    // awarded by the ingest hook) can reach them, then best-effort email anything
    // that hasn't been sent yet — without blocking the page load.
    if (user.email) {
      await this.cacheMemberEmail(project.organizationId, user.id, user.email);
    }
    void this.emailNewUnlocks(project.organizationId);

    return {
      project,
      achievements: catalogue.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        description: row.description,
        badge: row.badge,
        category: row.category,
        kind: row.kind,
        metric: row.metric,
        threshold: row.threshold,
        progress: progress[row.id] ?? 0,
        unlocked: unlocks.has(row.id),
        unlockedAt: unlocks.get(row.id) ?? null
      }))
    };
  }

  /**
   * Best-effort post-ingest evaluation. Fire-and-forget from the event write path:
   * it must never block or fail ingestion, so every error is swallowed here.
   */
  async afterProjectIngest(projectId: string): Promise<void> {
    try {
      const result = await this.database.query<{ organization_id: string }>(
        `SELECT organization_id FROM projects WHERE id = $1 LIMIT 1`,
        [projectId]
      );
      const org = result.rows[0];
      if (!org) return;

      const catalogue = await this.loadCatalogue();
      // The ingest hook fires on every event write, so only evaluate metrics that
      // actually change with ingestion. Workspace/account counts are checked lazily
      // on dashboard read instead.
      const relevant = catalogue.filter((row) => INGEST_METRIC_KEYS.includes(row.metric));
      if (relevant.length === 0) return;

      const progress = await this.evaluateAll(relevant, { organizationId: org.organization_id, projectId });
      const toAward = relevant.filter((row) => progress[row.id] >= row.threshold).map((row) => row.id);
      if (toAward.length === 0) return;

      const memberIds = await this.orgMemberIds(org.organization_id);
      if (memberIds.length === 0) return;
      await this.award(toAward, memberIds);

      // Email members who have a cached email (they've opened the dashboard before).
      await this.emailNewUnlocks(org.organization_id);
    } catch {
      // Ingestion must never break because of an achievements evaluation.
    }
  }

  private async loadCatalogue(): Promise<AchievementDefinition[]> {
    const result = await this.database.query<AchievementDefinition>(CATALOGUE_SQL);
    return result.rows;
  }

  private async evaluateAll(catalogue: AchievementDefinition[], scope: MetricScope): Promise<Record<string, number>> {
    const progress: Record<string, number> = {};
    for (const row of catalogue) {
      const evaluator = METRICS[row.metric];
      if (!evaluator) {
        // Unknown metric keys never unlock. Safe default so a typo'd catalogue
        // row can't hand out achievements.
        progress[row.id] = 0;
        continue;
      }
      progress[row.id] = await evaluator(this.database, scope);
    }
    return progress;
  }

  // Idempotent: ON CONFLICT DO NOTHING means re-evaluation never overwrites the
  // original unlocked_at, and a duplicate award is a no-op.
  private async award(achievementIds: string[], userIds: string[]): Promise<void> {
    await this.database.transaction(async (client) => {
      for (const achievementId of achievementIds) {
        const values: unknown[] = [];
        const groups: string[] = [];
        userIds.forEach((userId, index) => {
          const base = index * 2;
          groups.push(`($${base + 1}, $${base + 2})`);
          values.push(userId, achievementId);
        });
        await client.query(
          `INSERT INTO achievement_unlocks (user_id, achievement_id)
           VALUES ${groups.join(', ')}
           ON CONFLICT (user_id, achievement_id) DO NOTHING`,
          values
        );
      }
    });
  }

  private async orgMemberIds(organizationId: string): Promise<string[]> {
    const result = await this.database.query<{ user_id: string }>(
      `SELECT user_id FROM organization_members WHERE organization_id = $1`,
      [organizationId]
    );
    return result.rows.map((row) => row.user_id);
  }

  private async userUnlocks(userId: string): Promise<Map<string, string>> {
    const result = await this.database.query<{ achievement_id: string; unlocked_at: string }>(
      `SELECT achievement_id, unlocked_at FROM achievement_unlocks WHERE user_id = $1`,
      [userId]
    );
    const map = new Map<string, string>();
    for (const row of result.rows) map.set(row.achievement_id, row.unlocked_at);
    return map;
  }

  private async cacheMemberEmail(organizationId: string, userId: string, email: string): Promise<void> {
    const safe = email.trim().toLowerCase();
    if (!isValidEmail(safe)) return;
    await this.database.query(
      `UPDATE organization_members SET email = $3, updated_at = now()
       WHERE organization_id = $1 AND user_id = $2`,
      [organizationId, userId, safe]
    );
  }

  // Finds unlocks that haven't been emailed yet, groups them per recipient, and
  // sends one email per member. Successful sends are marked so they never repeat;
  // failures are left unmarked and retried on the next read/ingest. Any error here
  // is swallowed — email is best-effort and must never break a page or an ingest.
  private async emailNewUnlocks(organizationId: string): Promise<void> {
    try {
      const result = await this.database.query<{
        user_id: string;
        email: string;
        achievement_id: string;
        slug: string;
        title: string;
        description: string;
        category: string;
      }>(
        `SELECT om.user_id, om.email, u.achievement_id, a.slug, a.title, a.description, a.category
         FROM achievement_unlocks u
         JOIN achievements a ON a.id = u.achievement_id
         JOIN organization_members om ON om.user_id = u.user_id
         WHERE om.organization_id = $1
           AND om.email IS NOT NULL
           AND u.email_sent_at IS NULL
         ORDER BY u.unlocked_at ASC`,
        [organizationId]
      );

      if (result.rows.length === 0) return;

      const byRecipient = new Map<string, Array<{ userId: string; achievementId: string } & UnlockEmailItem>>();
      for (const row of result.rows) {
        const list = byRecipient.get(row.email) ?? [];
        list.push({
          userId: row.user_id,
          achievementId: row.achievement_id,
          slug: row.slug,
          title: row.title,
          description: row.description,
          category: row.category
        });
        byRecipient.set(row.email, list);
      }

      for (const [recipient, unlocks] of byRecipient) {
        const sent = await this.email.send({
          to: [recipient],
          subject: unlockSubject(unlocks),
          html: buildUnlockEmail(unlocks)
        });
        if (!sent.ok) continue;

        for (const unlock of unlocks) {
          await this.database.query(
            `UPDATE achievement_unlocks SET email_sent_at = now()
             WHERE user_id = $1 AND achievement_id = $2`,
            [unlock.userId, unlock.achievementId]
          );
        }
      }
    } catch {
      // Email must never break a page load or an ingest.
    }
  }
}

export function unlockSubject(items: UnlockEmailItem[]): string {
  if (items.length === 1) {
    return `Achievement unlocked: ${items[0].title}`;
  }
  return `You unlocked ${items.length} achievements on TraceIQ`;
}

export function buildUnlockEmail(items: UnlockEmailItem[]): string {
  const dashboardUrl = process.env.DASHBOARD_URL ?? 'http://localhost:3000';
  const medal =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      [
        '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 96 96">',
        '<circle cx="48" cy="48" r="46" fill="#0b0d12"/>',
        '<circle cx="48" cy="48" r="45" fill="none" stroke="#34d399" stroke-opacity="0.8" stroke-width="2"/>',
        '<path d="M48 30 28 40l20 10 20-10-20-10ZM28 50l20 10 20-10M28 60l20 10 20-10" fill="none" stroke="#e2e8f0" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
        '</svg>'
      ].join('')
    );

  const heading =
    items.length === 1
      ? `You earned <strong>${escapeHtml(items[0].title)}</strong>`
      : `You earned <strong>${items.length} achievements</strong>`;

  const cards = items
    .map(
      (item) => `
      <div style="padding:14px 16px;border:1px solid #e2e8f0;border-radius:8px;margin-top:8px;">
        <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">${escapeHtml(item.category)}</div>
        <div style="font-weight:700;font-size:15px;color:#0f172a;margin-top:2px;">${escapeHtml(item.title)}</div>
        <div style="font-size:14px;color:#334155;margin-top:6px;line-height:1.5;">${escapeHtml(item.description)}</div>
      </div>`
    )
    .join('');

  return `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;color:#0f172a;">
      <div style="padding:20px 0;border-bottom:1px solid #e2e8f0;">
        <img src="${medal}" width="56" height="56" alt="" style="display:block;margin:0 0 10px;" />
        <div style="font-size:13px;color:#94a3b8;">TraceIQ · achievements</div>
        <div style="font-size:20px;font-weight:700;margin-top:4px;">Achievement unlocked</div>
      </div>
      <p style="font-size:15px;line-height:1.5;color:#334155;">${heading}. It unlocked automatically as your workspace tracks usage.</p>
      ${cards}
      <p style="margin-top:20px;">
        <a href="${dashboardUrl}/dashboard/achievements" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:6px;">View achievements</a>
      </p>
      <p style="font-size:13px;color:#94a3b8;margin-top:20px;">TraceIQ · traceiq.run</p>
    </div>`;
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
