import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';
export type SurveyStatus = 'draft' | 'published' | 'paused' | 'closed' | 'archived';
export type SurveyQuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'short_text'
  | 'long_text'
  | 'rating_scale'
  | 'nps';

export interface SurveyChoiceOption {
  id: string;
  label: string;
  value: string;
}

export interface SurveyQuestion {
  id: string;
  type: SurveyQuestionType;
  prompt: string;
  description?: string;
  required: boolean;
  options?: SurveyChoiceOption[];
  minRating?: number;
  maxRating?: number;
  minLabel?: string;
  maxLabel?: string;
}

export interface SurveyTargeting {
  type: 'all' | 'property' | 'event';
  propertyKey?: string;
  propertyOperator?: string;
  propertyValue?: string | number | boolean;
  eventName?: string;
}

export interface Survey {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  status: SurveyStatus;
  environment: string;
  questions: SurveyQuestion[];
  targeting: SurveyTargeting;
  displayTrigger?: {
    type: 'immediate' | 'event' | 'delay';
    delaySeconds?: number;
    eventName?: string;
  };
  publishedAt?: string | null;
  closedAt?: string | null;
  archivedAt?: string | null;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SurveyAnswer {
  questionId: string;
  questionType: SurveyQuestionType;
  prompt: string;
  answerText?: string;
  selectedOptions?: string[];
  rating?: number;
  score?: number;
}

export interface SurveyResponseRecord {
  id: string;
  surveyId: string;
  distinctId: string;
  userId?: string | null;
  anonymousId?: string | null;
  sessionId?: string | null;
  answers: SurveyAnswer[];
  metadata?: Record<string, unknown>;
  occurredAt: string;
  receivedAt: string;
}

export interface SurveyQuestionDistribution {
  questionId: string;
  prompt: string;
  type: SurveyQuestionType;
  totalResponses: number;
  options?: Array<{
    optionId: string;
    label: string;
    count: number;
    percentage: number;
  }>;
  averageRating?: number;
  npsScore?: number;
  promoters?: number;
  passives?: number;
  detractors?: number;
  recentTextAnswers?: Array<{
    id: string;
    distinctId: string;
    text: string;
    occurredAt: string;
  }>;
}

export interface SurveyResults {
  surveyId: string;
  surveyName: string;
  status: SurveyStatus;
  impressionsCount: number;
  responsesCount: number;
  responseRate: number;
  completionRate: number;
  questions: SurveyQuestionDistribution[];
  recentResponses: SurveyResponseRecord[];
}

export interface CreateSurveyDto {
  projectId?: string;
  name: string;
  description?: string;
  environment?: string;
  questions?: SurveyQuestion[];
  targeting?: SurveyTargeting;
  displayTrigger?: {
    type: 'immediate' | 'event' | 'delay';
    delaySeconds?: number;
    eventName?: string;
  };
}

export interface UpdateSurveyDto {
  name?: string;
  description?: string;
  environment?: string;
  questions?: SurveyQuestion[];
  targeting?: SurveyTargeting;
  displayTrigger?: {
    type: 'immediate' | 'event' | 'delay';
    delaySeconds?: number;
    eventName?: string;
  };
}

export interface SubmitSurveyResponseDto {
  projectId?: string;
  writeKey?: string;
  surveyId: string;
  distinctId: string;
  userId?: string;
  anonymousId?: string;
  sessionId?: string;
  answers: SurveyAnswer[];
  metadata?: Record<string, unknown>;
}

@Injectable()
export class SurveysService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService
  ) {}

  // --------------------------------------------------------------------------
  // Dashboard Management
  // --------------------------------------------------------------------------

  async list(
    user: DashboardUser,
    projectId?: string,
    filters?: { environment?: string; status?: string; search?: string }
  ) {
    const project = await this.projects.resolveActiveProject(user, projectId);
    if (!project) return { project: null, surveys: [], metrics: this.emptyMetrics() };

    const queryParams: unknown[] = [project.id];
    let sql = `
      SELECT s.*,
        (
          SELECT count(*)::int
          FROM survey_responses r
          WHERE r.survey_id = s.id
        ) AS response_count,
        (
          SELECT count(*)::int
          FROM survey_interactions i
          WHERE i.survey_id = s.id AND i.action = 'impression'
        ) AS impression_count
      FROM surveys s
      WHERE s.project_id = $1
    `;

    if (filters?.environment) {
      queryParams.push(filters.environment);
      sql += ` AND s.environment = $${queryParams.length}`;
    }

    if (filters?.status && filters.status !== 'all') {
      queryParams.push(filters.status);
      sql += ` AND s.status = $${queryParams.length}`;
    } else {
      sql += ` AND s.status != 'archived'`;
    }

    if (filters?.search && filters.search.trim().length > 0) {
      queryParams.push(`%${filters.search.trim()}%`);
      sql += ` AND (s.name ILIKE $${queryParams.length} OR s.description ILIKE $${queryParams.length})`;
    }

    sql += ` ORDER BY s.created_at DESC;`;

    const result = await this.database.query<any>(sql, queryParams);

    const surveys = result.rows.map((row) => {
      const survey = this.mapRow(row);
      const responses = parseInt(row.response_count, 10) || 0;
      const impressions = parseInt(row.impression_count, 10) || 0;
      const responseRate = impressions > 0 ? Math.round((responses / impressions) * 1000) / 10 : 0;
      return {
        ...survey,
        responseCount: responses,
        impressionCount: impressions,
        responseRate
      };
    });

    const allSurveys = await this.database.query<any>(
      `
        SELECT
          count(*)::int AS total_count,
          count(*) FILTER (WHERE status = 'published')::int AS published_count,
          count(*) FILTER (WHERE status = 'closed')::int AS closed_count,
          count(*) FILTER (WHERE status = 'draft')::int AS draft_count,
          (SELECT count(*)::int FROM survey_responses sr JOIN surveys s ON s.id = sr.survey_id WHERE s.project_id = $1) AS total_responses
        FROM surveys
        WHERE project_id = $1 AND status != 'archived';
      `,
      [project.id]
    );

    const metrics = {
      total: allSurveys.rows[0]?.total_count ?? 0,
      published: allSurveys.rows[0]?.published_count ?? 0,
      closed: allSurveys.rows[0]?.closed_count ?? 0,
      draft: allSurveys.rows[0]?.draft_count ?? 0,
      totalResponses: allSurveys.rows[0]?.total_responses ?? 0
    };

    return {
      project: { id: project.id, name: project.name },
      surveys,
      metrics
    };
  }

  async get(user: DashboardUser, id: string, projectId?: string) {
    let resolvedProjectId = projectId;
    if (!resolvedProjectId) {
      const srvRes = await this.database.query<{ project_id: string }>(
        `
          SELECT s.project_id
          FROM surveys s
          JOIN projects p ON p.id = s.project_id
          JOIN organization_members om ON om.organization_id = p.organization_id
          WHERE s.id = $1 AND om.user_id = $2
          LIMIT 1;
        `,
        [id, user.id]
      );
      if (srvRes.rows[0]) {
        resolvedProjectId = srvRes.rows[0].project_id;
      }
    }

    const project = await this.projects.resolveActiveProject(user, resolvedProjectId);
    if (!project) throw new NotFoundException('Project not found');

    const result = await this.database.query<any>(
      `SELECT * FROM surveys WHERE id = $1 AND project_id = $2 LIMIT 1;`,
      [id, project.id]
    );

    const row = result.rows[0];
    if (!row) throw new NotFoundException('Survey not found');

    const survey = this.mapRow(row);
    const results = await this.calculateResults(survey);

    return {
      project: { id: project.id, name: project.name },
      survey,
      results
    };
  }

  async create(user: DashboardUser, dto: CreateSurveyDto) {
    const project = await this.projects.resolveActiveProject(user, dto.projectId);
    if (!project) throw new NotFoundException('Project not found');

    const name = dto.name?.trim();
    if (!name || name.length > 128) {
      throw new BadRequestException('Survey name is required (max 128 characters).');
    }

    if (dto.targeting?.type === 'event' && (!dto.targeting.eventName || !dto.targeting.eventName.trim())) {
      throw new BadRequestException('Trigger event name is required when targeting by event.');
    }
    if (
      dto.targeting?.type === 'property' &&
      (!dto.targeting.propertyKey?.trim() || dto.targeting.propertyValue === undefined || String(dto.targeting.propertyValue).trim() === '')
    ) {
      throw new BadRequestException('Property key and value are required when targeting by property.');
    }

    const questions = this.normalizeQuestions(dto.questions || []);
    if (questions.length === 0) {
      questions.push({
        id: randomUUID(),
        type: 'rating_scale',
        prompt: 'How would you rate your experience?',
        required: true,
        minRating: 1,
        maxRating: 5,
        minLabel: 'Poor',
        maxLabel: 'Excellent'
      });
    }

    const id = `srv_${randomUUID()}`;
    const environment = dto.environment || 'production';
    const targeting = dto.targeting || { type: 'all' };
    const displayTrigger = dto.displayTrigger || { type: 'immediate' };

    const result = await this.database.query<any>(
      `
        INSERT INTO surveys (
          id, project_id, name, description, status, environment,
          questions, targeting, display_trigger, created_by_user_id,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, now(), now())
        RETURNING *;
      `,
      [
        id,
        project.id,
        name,
        dto.description?.trim() || null,
        environment,
        JSON.stringify(questions),
        JSON.stringify(targeting),
        JSON.stringify(displayTrigger),
        user.id
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  async update(user: DashboardUser, id: string, dto: UpdateSurveyDto, projectId?: string) {
    let resolvedProjectId = projectId;
    if (!resolvedProjectId) {
      const srvRes = await this.database.query<{ project_id: string }>(
        `
          SELECT s.project_id
          FROM surveys s
          JOIN projects p ON p.id = s.project_id
          JOIN organization_members om ON om.organization_id = p.organization_id
          WHERE s.id = $1 AND om.user_id = $2
          LIMIT 1;
        `,
        [id, user.id]
      );
      if (srvRes.rows[0]) {
        resolvedProjectId = srvRes.rows[0].project_id;
      }
    }

    const project = await this.projects.resolveActiveProject(user, resolvedProjectId);
    if (!project) throw new NotFoundException('Project not found');

    const existing = await this.database.query<any>(
      `SELECT * FROM surveys WHERE id = $1 AND project_id = $2 LIMIT 1;`,
      [id, project.id]
    );
    if (!existing.rows[0]) throw new NotFoundException('Survey not found');

    const current = existing.rows[0];

    const name = dto.name !== undefined ? dto.name.trim() : current.name;
    const description = dto.description !== undefined ? dto.description.trim() : current.description;
    const environment = dto.environment !== undefined ? dto.environment : current.environment;
    const targeting = dto.targeting !== undefined ? dto.targeting : current.targeting;
    if (targeting?.type === 'event' && (!targeting.eventName || !targeting.eventName.trim())) {
      throw new BadRequestException('Trigger event name is required when targeting by event.');
    }
    if (
      targeting?.type === 'property' &&
      (!targeting.propertyKey?.trim() || targeting.propertyValue === undefined || String(targeting.propertyValue).trim() === '')
    ) {
      throw new BadRequestException('Property key and value are required when targeting by property.');
    }
    const displayTrigger = dto.displayTrigger !== undefined ? dto.displayTrigger : current.display_trigger;

    let questions = current.questions;
    if (dto.questions) {
      questions = this.normalizeQuestions(dto.questions);
    }

    const result = await this.database.query<any>(
      `
        UPDATE surveys
        SET name = $1,
            description = $2,
            environment = $3,
            questions = $4,
            targeting = $5,
            display_trigger = $6,
            updated_at = now()
        WHERE id = $7 AND project_id = $8
        RETURNING *;
      `,
      [
        name,
        description,
        environment,
        JSON.stringify(questions),
        JSON.stringify(targeting),
        JSON.stringify(displayTrigger),
        id,
        project.id
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  async updateStatus(user: DashboardUser, id: string, status: SurveyStatus, projectId?: string) {
    let resolvedProjectId = projectId;
    if (!resolvedProjectId) {
      const srvRes = await this.database.query<{ project_id: string }>(
        `
          SELECT s.project_id
          FROM surveys s
          JOIN projects p ON p.id = s.project_id
          JOIN organization_members om ON om.organization_id = p.organization_id
          WHERE s.id = $1 AND om.user_id = $2
          LIMIT 1;
        `,
        [id, user.id]
      );
      if (srvRes.rows[0]) {
        resolvedProjectId = srvRes.rows[0].project_id;
      }
    }

    const project = await this.projects.resolveActiveProject(user, resolvedProjectId);
    if (!project) throw new NotFoundException('Project not found');

    let publishedClause = '';
    let closedClause = '';
    let archivedClause = '';

    if (status === 'published') {
      publishedClause = `, published_at = COALESCE(published_at, now())`;
    } else if (status === 'closed') {
      closedClause = `, closed_at = now()`;
    } else if (status === 'archived') {
      archivedClause = `, archived_at = now()`;
    }

    const result = await this.database.query<any>(
      `
        UPDATE surveys
        SET status = $1,
            updated_at = now()
            ${publishedClause}
            ${closedClause}
            ${archivedClause}
        WHERE id = $2 AND project_id = $3
        RETURNING *;
      `,
      [status, id, project.id]
    );

    if (!result.rows[0]) throw new NotFoundException('Survey not found');
    return this.mapRow(result.rows[0]);
  }

  async remove(user: DashboardUser, id: string, projectId?: string) {
    let resolvedProjectId = projectId;
    if (!resolvedProjectId) {
      const srvRes = await this.database.query<{ project_id: string }>(
        `
          SELECT s.project_id
          FROM surveys s
          JOIN projects p ON p.id = s.project_id
          JOIN organization_members om ON om.organization_id = p.organization_id
          WHERE s.id = $1 AND om.user_id = $2
          LIMIT 1;
        `,
        [id, user.id]
      );
      if (srvRes.rows[0]) {
        resolvedProjectId = srvRes.rows[0].project_id;
      }
    }

    const project = await this.projects.resolveActiveProject(user, resolvedProjectId);
    if (!project) throw new NotFoundException('Project not found');

    await this.database.query(`DELETE FROM surveys WHERE id = $1 AND project_id = $2;`, [id, project.id]);
    return { success: true };
  }

  // --------------------------------------------------------------------------
  // Survey Results & Aggregation
  // --------------------------------------------------------------------------

  async getResults(user: DashboardUser, id: string, projectId?: string): Promise<SurveyResults> {
    let resolvedProjectId = projectId;
    if (!resolvedProjectId) {
      const srvRes = await this.database.query<{ project_id: string }>(
        `
          SELECT s.project_id
          FROM surveys s
          JOIN projects p ON p.id = s.project_id
          JOIN organization_members om ON om.organization_id = p.organization_id
          WHERE s.id = $1 AND om.user_id = $2
          LIMIT 1;
        `,
        [id, user.id]
      );
      if (srvRes.rows[0]) {
        resolvedProjectId = srvRes.rows[0].project_id;
      }
    }

    const project = await this.projects.resolveActiveProject(user, resolvedProjectId);
    if (!project) throw new NotFoundException('Project not found');

    const result = await this.database.query<any>(
      `SELECT * FROM surveys WHERE id = $1 AND project_id = $2 LIMIT 1;`,
      [id, project.id]
    );
    if (!result.rows[0]) throw new NotFoundException('Survey not found');

    const survey = this.mapRow(result.rows[0]);
    return this.calculateResults(survey);
  }

  private async calculateResults(survey: Survey): Promise<SurveyResults> {
    // 1. Fetch interaction metrics
    const interactionsRes = await this.database.query<{ action: string; count: string }>(
      `
        SELECT action, count(*)::int AS count
        FROM survey_interactions
        WHERE survey_id = $1
        GROUP BY action;
      `,
      [survey.id]
    );

    let impressionsCount = 0;
    let dismissCount = 0;
    interactionsRes.rows.forEach((r) => {
      const c = parseInt(r.count, 10) || 0;
      if (r.action === 'impression') impressionsCount = c;
      if (r.action === 'dismiss') dismissCount = c;
    });

    // 2. Fetch all response records
    const responsesRes = await this.database.query<any>(
      `
        SELECT *
        FROM survey_responses
        WHERE survey_id = $1
        ORDER BY occurred_at DESC;
      `,
      [survey.id]
    );

    const responsesCount = responsesRes.rows.length;
    const responseRate = impressionsCount > 0 ? Math.round((responsesCount / impressionsCount) * 1000) / 10 : 0;
    const completionRate = (responsesCount + dismissCount) > 0
      ? Math.round((responsesCount / (responsesCount + dismissCount)) * 1000) / 10
      : (responsesCount > 0 ? 100 : 0);

    const recentResponses: SurveyResponseRecord[] = responsesRes.rows.map((r) => ({
      id: r.id,
      surveyId: r.survey_id,
      distinctId: r.distinct_id,
      userId: r.user_id,
      anonymousId: r.anonymous_id,
      sessionId: r.session_id,
      answers: Array.isArray(r.answers) ? r.answers : [],
      metadata: r.metadata || {},
      occurredAt: new Date(r.occurred_at).toISOString(),
      receivedAt: new Date(r.received_at).toISOString()
    }));

    // 3. Question breakdown distributions
    const questionDistributions: SurveyQuestionDistribution[] = survey.questions.map((q) => {
      let totalAnswered = 0;
      const optionCounts: Record<string, number> = {};
      const ratings: number[] = [];
      let promoters = 0;
      let passives = 0;
      let detractors = 0;
      const textAnswers: Array<{ id: string; distinctId: string; text: string; occurredAt: string }> = [];

      for (const resp of recentResponses) {
        const ans = resp.answers.find((a) => a.questionId === q.id);
        if (!ans) continue;

        totalAnswered++;

        if (q.type === 'single_choice' && ans.selectedOptions && ans.selectedOptions.length > 0) {
          const opt = ans.selectedOptions[0];
          optionCounts[opt] = (optionCounts[opt] || 0) + 1;
        } else if (q.type === 'multiple_choice' && ans.selectedOptions) {
          for (const opt of ans.selectedOptions) {
            optionCounts[opt] = (optionCounts[opt] || 0) + 1;
          }
        } else if (q.type === 'rating_scale') {
          const ratingVal = typeof ans.rating === 'number' ? ans.rating : (typeof ans.score === 'number' ? ans.score : null);
          if (ratingVal !== null) {
            ratings.push(ratingVal);
            optionCounts[String(ratingVal)] = (optionCounts[String(ratingVal)] || 0) + 1;
          }
        } else if (q.type === 'nps') {
          const npsVal = typeof ans.score === 'number' ? ans.score : (typeof ans.rating === 'number' ? ans.rating : null);
          if (npsVal !== null) {
            ratings.push(npsVal);
            optionCounts[String(npsVal)] = (optionCounts[String(npsVal)] || 0) + 1;
            if (npsVal >= 9) promoters++;
            else if (npsVal >= 7) passives++;
            else detractors++;
          }
        } else if ((q.type === 'short_text' || q.type === 'long_text') && ans.answerText) {
          textAnswers.push({
            id: resp.id,
            distinctId: resp.distinctId,
            text: ans.answerText,
            occurredAt: resp.occurredAt
          });
        }
      }

      // Build options array
      let optionsList: Array<{ optionId: string; label: string; count: number; percentage: number }> | undefined;

      if (q.options && q.options.length > 0) {
        optionsList = q.options.map((opt) => {
          const count = optionCounts[opt.id] || optionCounts[opt.value] || optionCounts[opt.label] || 0;
          const percentage = totalAnswered > 0 ? Math.round((count / totalAnswered) * 1000) / 10 : 0;
          return {
            optionId: opt.id,
            label: opt.label,
            count,
            percentage
          };
        });
      } else if (q.type === 'rating_scale' || q.type === 'nps') {
        const min = q.minRating ?? (q.type === 'nps' ? 0 : 1);
        const max = q.maxRating ?? (q.type === 'nps' ? 10 : 5);
        optionsList = [];
        for (let i = min; i <= max; i++) {
          const count = optionCounts[String(i)] || 0;
          const percentage = totalAnswered > 0 ? Math.round((count / totalAnswered) * 1000) / 10 : 0;
          optionsList.push({
            optionId: String(i),
            label: String(i),
            count,
            percentage
          });
        }
      }

      let averageRating: number | undefined;
      if (ratings.length > 0) {
        const sum = ratings.reduce((acc, r) => acc + r, 0);
        averageRating = Math.round((sum / ratings.length) * 10) / 10;
      }

      let npsScore: number | undefined;
      if (q.type === 'nps' && totalAnswered > 0) {
        const pctPromoters = (promoters / totalAnswered) * 100;
        const pctDetractors = (detractors / totalAnswered) * 100;
        npsScore = Math.round(pctPromoters - pctDetractors);
      }

      return {
        questionId: q.id,
        prompt: q.prompt,
        type: q.type,
        totalResponses: totalAnswered,
        options: optionsList,
        averageRating,
        npsScore,
        promoters,
        passives,
        detractors,
        recentTextAnswers: textAnswers
      };
    });

    return {
      surveyId: survey.id,
      surveyName: survey.name,
      status: survey.status,
      impressionsCount,
      responsesCount,
      responseRate,
      completionRate,
      questions: questionDistributions,
      recentResponses: recentResponses.slice(0, 50)
    };
  }

  // --------------------------------------------------------------------------
  // Public Runtime / SDK Delivery & Responses
  // --------------------------------------------------------------------------

  async getEligibleSurveys(
    writeKey?: string,
    projectId?: string,
    distinctId?: string,
    properties?: Record<string, unknown>,
    eventName?: string,
    environment = 'production'
  ) {
    if (!distinctId) {
      throw new BadRequestException('distinctId is required.');
    }

    const resolvedProjectId = await this.resolveProjectIdByWriteKey(writeKey, projectId);
    if (!resolvedProjectId) {
      throw new NotFoundException('Project write key not valid.');
    }

    // Fetch published surveys in this environment
    const result = await this.database.query<any>(
      `
        SELECT *
        FROM surveys
        WHERE project_id = $1 AND environment = $2 AND status = 'published'
        ORDER BY created_at DESC;
      `,
      [resolvedProjectId, environment]
    );

    if (result.rows.length === 0) return { surveys: [] };

    // Check surveys already completed or dismissed by this user
    const interactedRes = await this.database.query<{ survey_id: string }>(
      `
        SELECT DISTINCT survey_id
        FROM survey_interactions
        WHERE project_id = $1 AND distinct_id = $2 AND action IN ('complete', 'dismiss');
      `,
      [resolvedProjectId, distinctId]
    );

    const alreadyInteracted = new Set(interactedRes.rows.map((r) => r.survey_id));

    const eligibleSurveys: Survey[] = [];

    for (const row of result.rows) {
      if (alreadyInteracted.has(row.id)) continue;

      const survey = this.mapRow(row);

      // Check targeting conditions
      if (survey.targeting) {
        if (survey.targeting.type === 'property' && survey.targeting.propertyKey) {
          const userVal = properties?.[survey.targeting.propertyKey];
          if (String(userVal) !== String(survey.targeting.propertyValue)) {
            continue;
          }
        } else if (survey.targeting.type === 'event' && survey.targeting.eventName) {
          if (eventName !== survey.targeting.eventName) {
            continue;
          }
        }
      }

      eligibleSurveys.push(survey);
    }

    return { surveys: eligibleSurveys };
  }

  async recordImpression(
    writeKey?: string,
    projectId?: string,
    surveyId?: string,
    distinctId?: string,
    userId?: string,
    anonymousId?: string,
    sessionId?: string
  ) {
    if (!surveyId || !distinctId) {
      throw new BadRequestException('surveyId and distinctId are required.');
    }

    const resolvedProjectId = await this.resolveProjectIdByWriteKey(writeKey, projectId);
    if (!resolvedProjectId) throw new NotFoundException('Invalid project write key.');

    const interactionId = `srv_imp_${randomUUID()}`;
    await this.database.query(
      `
        INSERT INTO survey_interactions (id, project_id, survey_id, distinct_id, user_id, anonymous_id, session_id, action, occurred_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'impression', now());
      `,
      [interactionId, resolvedProjectId, surveyId, distinctId, userId || null, anonymousId || null, sessionId || null]
    );

    // Forward to events pipeline
    try {
      await this.database.query(
        `
          INSERT INTO events (id, organization_id, project_id, user_id, anonymous_id, session_id, event_name, properties, occurred_at, received_at)
          VALUES (
            $1, (SELECT organization_id FROM projects WHERE id = $2), $2, $3, $4, $5,
            '$survey_impression', $6, now(), now()
          );
        `,
        [`evt_${randomUUID()}`, resolvedProjectId, userId || null, anonymousId || null, sessionId || null, JSON.stringify({ surveyId })]
      );
    } catch {
      // Impression tracking is best-effort; never fail the survey request.
    }

    return { success: true, interactionId };
  }

  async recordDismissal(
    writeKey?: string,
    projectId?: string,
    surveyId?: string,
    distinctId?: string,
    userId?: string,
    anonymousId?: string,
    sessionId?: string
  ) {
    if (!surveyId || !distinctId) {
      throw new BadRequestException('surveyId and distinctId are required.');
    }

    const resolvedProjectId = await this.resolveProjectIdByWriteKey(writeKey, projectId);
    if (!resolvedProjectId) throw new NotFoundException('Invalid project write key.');

    const interactionId = `srv_dsm_${randomUUID()}`;
    await this.database.query(
      `
        INSERT INTO survey_interactions (id, project_id, survey_id, distinct_id, user_id, anonymous_id, session_id, action, occurred_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'dismiss', now());
      `,
      [interactionId, resolvedProjectId, surveyId, distinctId, userId || null, anonymousId || null, sessionId || null]
    );

    try {
      await this.database.query(
        `
          INSERT INTO events (id, organization_id, project_id, user_id, anonymous_id, session_id, event_name, properties, occurred_at, received_at)
          VALUES (
            $1, (SELECT organization_id FROM projects WHERE id = $2), $2, $3, $4, $5,
            '$survey_dismissed', $6, now(), now()
          );
        `,
        [`evt_${randomUUID()}`, resolvedProjectId, userId || null, anonymousId || null, sessionId || null, JSON.stringify({ surveyId })]
      );
    } catch {
      // Impression tracking is best-effort; never fail the survey request.
    }

    return { success: true, interactionId };
  }

  async submitResponse(writeKey?: string, projectId?: string, dto?: SubmitSurveyResponseDto) {
    if (!dto?.surveyId || !dto?.distinctId || !Array.isArray(dto?.answers)) {
      throw new BadRequestException('surveyId, distinctId, and answers array are required.');
    }

    const resolvedProjectId = await this.resolveProjectIdByWriteKey(writeKey, projectId || dto.projectId);
    if (!resolvedProjectId) throw new NotFoundException('Invalid project write key.');

    const responseId = `srv_res_${randomUUID()}`;
    const interactionId = `srv_cmp_${randomUUID()}`;

    // 1. Insert survey response
    await this.database.query(
      `
        INSERT INTO survey_responses (
          id, project_id, survey_id, distinct_id, user_id, anonymous_id,
          session_id, answers, metadata, occurred_at, received_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now());
      `,
      [
        responseId,
        resolvedProjectId,
        dto.surveyId,
        dto.distinctId,
        dto.userId || null,
        dto.anonymousId || null,
        dto.sessionId || null,
        JSON.stringify(dto.answers),
        JSON.stringify(dto.metadata || {})
      ]
    );

    // 2. Insert completed interaction to mark user as responded
    await this.database.query(
      `
        INSERT INTO survey_interactions (id, project_id, survey_id, distinct_id, user_id, anonymous_id, session_id, action, occurred_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'complete', now());
      `,
      [interactionId, resolvedProjectId, dto.surveyId, dto.distinctId, dto.userId || null, dto.anonymousId || null, dto.sessionId || null]
    );

    // 3. Log event into analytics pipeline
    try {
      await this.database.query(
        `
          INSERT INTO events (id, organization_id, project_id, user_id, anonymous_id, session_id, event_name, properties, occurred_at, received_at)
          VALUES (
            $1, (SELECT organization_id FROM projects WHERE id = $2), $2, $3, $4, $5,
            '$survey_response', $6, now(), now()
          );
        `,
        [
          `evt_${randomUUID()}`,
          resolvedProjectId,
          dto.userId || null,
          dto.anonymousId || null,
          dto.sessionId || null,
          JSON.stringify({
            surveyId: dto.surveyId,
            answerCount: dto.answers.length
          })
        ]
      );
    } catch {
      // Impression tracking is best-effort; never fail the survey request.
    }

    return { success: true, responseId };
  }

  private async resolveProjectIdByWriteKey(writeKey?: string, projectId?: string): Promise<string | null> {
    if (projectId) return projectId;
    if (!writeKey) return null;

    const hash = createHash('sha256').update(writeKey).digest('hex');
    const result = await this.database.query<{ project_id: string }>(
      `SELECT project_id FROM project_write_keys WHERE key_hash = $1 AND revoked_at IS NULL LIMIT 1;`,
      [hash]
    );
    return result.rows[0]?.project_id ?? null;
  }

  private normalizeQuestions(questions: any[]): SurveyQuestion[] {
    return questions.map((q, idx) => {
      const type = q.type || 'short_text';
      const id = q.id || randomUUID();
      const prompt = q.prompt?.trim() || `Question ${idx + 1}`;
      const required = Boolean(q.required ?? true);

      let options = undefined;
      if ((type === 'single_choice' || type === 'multiple_choice') && Array.isArray(q.options)) {
        options = q.options.map((opt: any, optIdx: number) => ({
          id: opt.id || `opt_${optIdx + 1}`,
          label: opt.label?.trim() || `Option ${optIdx + 1}`,
          value: opt.value?.trim() || opt.label?.trim() || `option_${optIdx + 1}`
        }));
      }

      return {
        id,
        type,
        prompt,
        description: q.description?.trim() || undefined,
        required,
        options,
        minRating: q.minRating,
        maxRating: q.maxRating,
        minLabel: q.minLabel,
        maxLabel: q.maxLabel
      };
    });
  }

  private mapRow(row: any): Survey {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      description: row.description,
      status: row.status,
      environment: row.environment,
      questions: Array.isArray(row.questions) ? row.questions : [],
      targeting: row.targeting || { type: 'all' },
      displayTrigger: row.display_trigger || { type: 'immediate' },
      publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
      closedAt: row.closed_at ? new Date(row.closed_at).toISOString() : null,
      archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null,
      createdByUserId: row.created_by_user_id,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
    };
  }

  private emptyMetrics() {
    return {
      total: 0,
      published: 0,
      closed: 0,
      draft: 0,
      totalResponses: 0
    };
  }
}
