import { Injectable } from '@nestjs/common';
import { NUMERIC_GUARD } from '../../common/measures';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';
import {
  DEFAULT_REVENUE_SETTINGS,
  RevenueSettings,
  RevenueTotals,
  loadRevenueSettings,
  normalizeRevenueSettings,
  queryRevenueTotals,
  revenueActive,
  suggestRevenueRole
} from './revenue.util';

export interface RevenueEventCandidate {
  name: string;
  count: number;
  withAmount: number;
  suggested: 'success' | 'failed' | null;
}

export interface RevenueSettingsResponse {
  project: { id: string; name: string };
  configured: boolean;
  settings: RevenueSettings;
  candidates: RevenueEventCandidate[];
  // Last 30 days with the saved settings, so the page can show setup is working.
  summary: RevenueTotals | null;
}

const CANDIDATE_DAYS = 30;
const MAX_CANDIDATES = 60;

@Injectable()
export class RevenueService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService
  ) {}

  async getSettings(user: DashboardUser, projectId?: string): Promise<RevenueSettingsResponse> {
    const project = await this.projects.requireActiveProject(user, projectId);
    return this.describe(project.id, project.name);
  }

  async updateSettings(user: DashboardUser, projectId: string | undefined, input: Partial<RevenueSettings>) {
    const project = await this.projects.requireWritableProject(user, projectId);
    const current = (await loadRevenueSettings(this.database, project.id)) ?? DEFAULT_REVENUE_SETTINGS;
    const next = normalizeRevenueSettings(input ?? {}, current);
    await this.database.query(
      `INSERT INTO revenue_settings (project_id, enabled, success_events, failed_events, amount_property, currency)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (project_id) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         success_events = EXCLUDED.success_events,
         failed_events = EXCLUDED.failed_events,
         amount_property = EXCLUDED.amount_property,
         currency = EXCLUDED.currency,
         updated_at = now()`,
      [project.id, next.enabled, next.successEvents, next.failedEvents, next.amountProperty, next.currency]
    );
    return this.describe(project.id, project.name);
  }

  private async describe(projectId: string, projectName: string): Promise<RevenueSettingsResponse> {
    const saved = await loadRevenueSettings(this.database, projectId);
    const settings = saved ?? DEFAULT_REVENUE_SETTINGS;
    const [candidates, summary] = await Promise.all([
      this.candidates(projectId, settings),
      revenueActive(saved) ? queryRevenueTotals(this.database, projectId, saved, `${CANDIDATE_DAYS} days`) : Promise.resolve(null)
    ]);
    return { project: { id: projectId, name: projectName }, configured: saved !== null, settings, candidates, summary };
  }

  /** Recent custom events, busiest first, with how many carried a numeric amount. */
  private async candidates(projectId: string, settings: RevenueSettings): Promise<RevenueEventCandidate[]> {
    const result = await this.database.query<{ name: string; count: number; with_amount: number }>(
      `SELECT event_name AS name,
              count(*)::int AS count,
              count(*) FILTER (WHERE properties->>$2 ~ ${NUMERIC_GUARD})::int AS with_amount
       FROM events
       WHERE project_id = $1 AND occurred_at >= now() - interval '${CANDIDATE_DAYS} days'
         AND event_name !~ '^\\$'
       GROUP BY event_name
       ORDER BY count(*) DESC
       LIMIT ${MAX_CANDIDATES}`,
      [projectId, settings.amountProperty]
    );
    const candidates: RevenueEventCandidate[] = result.rows.map((row) => ({
      name: row.name,
      count: row.count,
      withAmount: row.with_amount,
      suggested: suggestRevenueRole(row.name, row.with_amount > 0)
    }));
    // Keep chosen events listed even when they had no traffic recently.
    for (const name of [...settings.successEvents, ...settings.failedEvents]) {
      if (!candidates.some((candidate) => candidate.name === name)) {
        candidates.push({ name, count: 0, withAmount: 0, suggested: null });
      }
    }
    return candidates;
  }
}
