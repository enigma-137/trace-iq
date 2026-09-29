import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';
import type {
  Experiment,
  ExperimentAudienceRule,
  ExperimentResults,
  ExperimentStatus,
  ExperimentVariant,
  VariantResultMetric
} from '@traceiq/types';

export interface CreateExperimentDto {
  projectId?: string;
  key: string;
  name: string;
  description?: string;
  environment?: string;
  primaryMetric: string;
  secondaryMetrics?: string[];
  variants?: Array<{
    id?: string;
    key: string;
    name: string;
    weight: number;
    isControl?: boolean;
    payload?: unknown;
  }>;
  audienceFilter?: {
    rules?: ExperimentAudienceRule[];
  };
  targetPercentage?: number;
}

export interface UpdateExperimentDto {
  name?: string;
  description?: string;
  environment?: string;
  primaryMetric?: string;
  secondaryMetrics?: string[];
  variants?: Array<{
    id?: string;
    key: string;
    name: string;
    weight: number;
    isControl?: boolean;
    payload?: unknown;
  }>;
  audienceFilter?: {
    rules?: ExperimentAudienceRule[];
  };
  targetPercentage?: number;
  winnerVariantKey?: string | null;
}

export interface TrackExposureDto {
  projectId?: string;
  writeKey?: string;
  experimentKey?: string;
  experimentId?: string;
  variantKey: string;
  distinctId: string;
  userId?: string;
  anonymousId?: string;
  sessionId?: string;
  environment?: string;
}

const KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

// Standard Normal Cumulative Distribution Function (error function approximation)
function normalCdf(z: number): number {
  if (z === 0) return 0.5;
  const sign = z < 0 ? -1 : 1;
  const absZ = Math.abs(z);
  // Abramowitz and Stegun approximation
  const p = 0.2316419;
  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const t = 1.0 / (1.0 + p * absZ);
  const pdf = (1.0 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * absZ * absZ);
  const cdf = 1.0 - pdf * (b1 * t + b2 * Math.pow(t, 2) + b3 * Math.pow(t, 3) + b4 * Math.pow(t, 4) + b5 * Math.pow(t, 5));
  return sign === 1 ? cdf : 1.0 - cdf;
}

@Injectable()
export class ExperimentsService {
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
    if (!project) return { project: null, experiments: [], metrics: this.emptyMetrics() };

    const queryParams: unknown[] = [project.id];
    let sql = `
      SELECT e.*,
        (
          SELECT count(*)::int
          FROM experiment_exposures exp
          WHERE exp.experiment_id = e.id
        ) AS total_exposures,
        (
          SELECT max(occurred_at)
          FROM experiment_exposures exp
          WHERE exp.experiment_id = e.id
        ) AS last_exposed_at
      FROM experiments e
      WHERE e.project_id = $1
    `;

    if (filters?.environment) {
      queryParams.push(filters.environment);
      sql += ` AND e.environment = $${queryParams.length}`;
    }

    if (filters?.status && filters.status !== 'all') {
      queryParams.push(filters.status);
      sql += ` AND e.status = $${queryParams.length}`;
    } else {
      sql += ` AND e.status != 'archived'`;
    }

    if (filters?.search && filters.search.trim().length > 0) {
      queryParams.push(`%${filters.search.trim()}%`);
      sql += ` AND (e.name ILIKE $${queryParams.length} OR e.key ILIKE $${queryParams.length} OR e.description ILIKE $${queryParams.length})`;
    }

    sql += ` ORDER BY e.created_at DESC;`;

    const result = await this.database.query<any>(sql, queryParams);

    const experiments: Experiment[] = result.rows.map((row) => this.mapRow(row));

    // Calculate aggregate metrics across experiments for the project
    const allExps = await this.database.query<any>(
      `
        SELECT
          count(*)::int AS total_count,
          count(*) FILTER (WHERE status = 'running')::int AS running_count,
          count(*) FILTER (WHERE status = 'completed')::int AS completed_count,
          count(*) FILTER (WHERE status = 'draft')::int AS draft_count
        FROM experiments
        WHERE project_id = $1 AND status != 'archived';
      `,
      [project.id]
    );

    const expMetrics = {
      total: allExps.rows[0]?.total_count ?? 0,
      running: allExps.rows[0]?.running_count ?? 0,
      completed: allExps.rows[0]?.completed_count ?? 0,
      draft: allExps.rows[0]?.draft_count ?? 0
    };

    return {
      project: { id: project.id, name: project.name },
      experiments,
      metrics: expMetrics
    };
  }

  async get(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.projects.resolveActiveProject(user, projectId);
    if (!project) throw new NotFoundException('Project not found');

    const result = await this.database.query<any>(
      `
        SELECT *
        FROM experiments
        WHERE id = $1 AND project_id = $2
        LIMIT 1;
      `,
      [id, project.id]
    );

    const row = result.rows[0];
    if (!row) throw new NotFoundException('Experiment not found');

    const experiment = this.mapRow(row);
    const results = await this.calculateResults(experiment);

    return {
      project: { id: project.id, name: project.name },
      experiment,
      results
    };
  }

  async create(user: DashboardUser, dto: CreateExperimentDto) {
    const project = await this.projects.resolveActiveProject(user, dto.projectId);
    if (!project) throw new NotFoundException('Project not found');

    const key = dto.key?.trim().toLowerCase();
    if (!key || !KEY_PATTERN.test(key)) {
      throw new BadRequestException('Experiment key must be 1-64 lowercase alphanumeric, hyphens, or underscores.');
    }

    const name = dto.name?.trim();
    if (!name || name.length > 128) {
      throw new BadRequestException('Experiment name is required (max 128 chars).');
    }

    const primaryMetric = dto.primaryMetric?.trim();
    if (!primaryMetric) {
      throw new BadRequestException('Primary success metric event name is required.');
    }

    // Process & validate variants
    const rawVariants = dto.variants && dto.variants.length >= 2
      ? dto.variants
      : [
          { id: randomUUID(), key: 'control', name: 'Control (A)', weight: 50, isControl: true },
          { id: randomUUID(), key: 'variant_b', name: 'Variant B', weight: 50, isControl: false }
        ];

    let hasControl = false;
    let totalWeight = 0;
    const variants: ExperimentVariant[] = rawVariants.map((v, index) => {
      const vKey = v.key?.trim().toLowerCase() || `variant_${index}`;
      const isControl = Boolean(v.isControl ?? (index === 0 && !hasControl));
      if (isControl) hasControl = true;
      const weight = typeof v.weight === 'number' && v.weight >= 0 ? v.weight : 50;
      totalWeight += weight;
      return {
        id: v.id || randomUUID(),
        key: vKey,
        name: v.name?.trim() || (isControl ? 'Control' : `Variant ${vKey}`),
        weight,
        isControl,
        payload: v.payload
      };
    });

    if (!hasControl && variants.length > 0) {
      variants[0].isControl = true;
    }

    // Normalize weights to 100% if they don't sum to 100
    if (totalWeight > 0 && Math.abs(totalWeight - 100) > 0.01) {
      variants.forEach((v) => {
        v.weight = Math.round((v.weight / totalWeight) * 100);
      });
      // Adjust rounding remainder to the last variant
      const currentSum = variants.reduce((sum, v) => sum + v.weight, 0);
      if (currentSum !== 100 && variants.length > 0) {
        variants[variants.length - 1].weight += (100 - currentSum);
      }
    }

    const id = `exp_${randomUUID()}`;
    const environment = dto.environment || 'production';
    const targetPercentage = typeof dto.targetPercentage === 'number' ? Math.max(1, Math.min(100, dto.targetPercentage)) : 100;
    const secondaryMetrics = Array.isArray(dto.secondaryMetrics) ? dto.secondaryMetrics.filter(Boolean) : [];
    const audienceFilter = dto.audienceFilter || {};

    try {
      const result = await this.database.query<any>(
        `
          INSERT INTO experiments (
            id, project_id, key, name, description, status, environment,
            primary_metric, secondary_metrics, variants, audience_filter,
            target_percentage, created_by_user_id, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, $8, $9, $10, $11, $12, now(), now())
          RETURNING *;
        `,
        [
          id,
          project.id,
          key,
          name,
          dto.description?.trim() || null,
          environment,
          primaryMetric,
          JSON.stringify(secondaryMetrics),
          JSON.stringify(variants),
          JSON.stringify(audienceFilter),
          targetPercentage,
          user.id
        ]
      );

      return this.mapRow(result.rows[0]);
    } catch (err: any) {
      if (err.code === '23505') {
        throw new BadRequestException(`An experiment with key "${key}" already exists in this project.`);
      }
      throw err;
    }
  }

  async update(user: DashboardUser, id: string, dto: UpdateExperimentDto, projectId?: string) {
    const project = await this.projects.resolveActiveProject(user, projectId);
    if (!project) throw new NotFoundException('Project not found');

    const existing = await this.database.query<any>(
      `SELECT * FROM experiments WHERE id = $1 AND project_id = $2 LIMIT 1;`,
      [id, project.id]
    );
    if (!existing.rows[0]) throw new NotFoundException('Experiment not found');

    const current = existing.rows[0];

    const name = dto.name !== undefined ? dto.name.trim() : current.name;
    const description = dto.description !== undefined ? dto.description.trim() : current.description;
    const environment = dto.environment !== undefined ? dto.environment : current.environment;
    const primaryMetric = dto.primaryMetric !== undefined ? dto.primaryMetric.trim() : current.primary_metric;
    const secondaryMetrics = dto.secondaryMetrics !== undefined ? dto.secondaryMetrics : current.secondary_metrics;
    const targetPercentage = dto.targetPercentage !== undefined ? Math.max(1, Math.min(100, dto.targetPercentage)) : current.target_percentage;
    const audienceFilter = dto.audienceFilter !== undefined ? dto.audienceFilter : current.audience_filter;
    const winnerVariantKey = dto.winnerVariantKey !== undefined ? dto.winnerVariantKey : current.winner_variant_key;

    let variants = current.variants;
    if (dto.variants && Array.isArray(dto.variants)) {
      variants = dto.variants;
    }

    const result = await this.database.query<any>(
      `
        UPDATE experiments
        SET name = $1,
            description = $2,
            environment = $3,
            primary_metric = $4,
            secondary_metrics = $5,
            variants = $6,
            audience_filter = $7,
            target_percentage = $8,
            winner_variant_key = $9,
            updated_at = now()
        WHERE id = $10 AND project_id = $11
        RETURNING *;
      `,
      [
        name,
        description,
        environment,
        primaryMetric,
        JSON.stringify(secondaryMetrics),
        JSON.stringify(variants),
        JSON.stringify(audienceFilter),
        targetPercentage,
        winnerVariantKey,
        id,
        project.id
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  async updateStatus(
    user: DashboardUser,
    id: string,
    status: ExperimentStatus,
    winnerVariantKey?: string | null,
    projectId?: string
  ) {
    const project = await this.projects.resolveActiveProject(user, projectId);
    if (!project) throw new NotFoundException('Project not found');

    const existing = await this.database.query<any>(
      `SELECT * FROM experiments WHERE id = $1 AND project_id = $2 LIMIT 1;`,
      [id, project.id]
    );
    if (!existing.rows[0]) throw new NotFoundException('Experiment not found');

    let startedAtClause = '';
    let pausedAtClause = '';
    let completedAtClause = '';
    let archivedAtClause = '';

    if (status === 'running') {
      startedAtClause = `, started_at = COALESCE(started_at, now()), paused_at = NULL`;
    } else if (status === 'paused') {
      pausedAtClause = `, paused_at = now()`;
    } else if (status === 'completed') {
      completedAtClause = `, completed_at = COALESCE(completed_at, now())`;
    } else if (status === 'archived') {
      archivedAtClause = `, archived_at = now()`;
    }

    const winnerClause = winnerVariantKey !== undefined ? `, winner_variant_key = '${winnerVariantKey || ''}'` : '';

    const result = await this.database.query<any>(
      `
        UPDATE experiments
        SET status = $1,
            updated_at = now()
            ${startedAtClause}
            ${pausedAtClause}
            ${completedAtClause}
            ${archivedAtClause}
            ${winnerClause}
        WHERE id = $2 AND project_id = $3
        RETURNING *;
      `,
      [status, id, project.id]
    );

    return this.mapRow(result.rows[0]);
  }

  async remove(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.projects.resolveActiveProject(user, projectId);
    if (!project) throw new NotFoundException('Project not found');

    await this.database.query(
      `DELETE FROM experiments WHERE id = $1 AND project_id = $2;`,
      [id, project.id]
    );

    return { success: true };
  }

  // --------------------------------------------------------------------------
  // Results & Analytics Calculation
  // --------------------------------------------------------------------------

  async getResults(user: DashboardUser, id: string, projectId?: string): Promise<ExperimentResults> {
    const project = await this.projects.resolveActiveProject(user, projectId);
    if (!project) throw new NotFoundException('Project not found');

    const existing = await this.database.query<any>(
      `SELECT * FROM experiments WHERE id = $1 AND project_id = $2 LIMIT 1;`,
      [id, project.id]
    );
    if (!existing.rows[0]) throw new NotFoundException('Experiment not found');

    const experiment = this.mapRow(existing.rows[0]);
    return this.calculateResults(experiment);
  }

  private async calculateResults(experiment: Experiment): Promise<ExperimentResults> {
    // 1. Fetch exposure count per variant
    const exposureResult = await this.database.query<{ variant_key: string; exposure_count: string }>(
      `
        SELECT variant_key, count(DISTINCT distinct_id)::int AS exposure_count
        FROM experiment_exposures
        WHERE experiment_id = $1
        GROUP BY variant_key;
      `,
      [experiment.id]
    );

    const exposureMap = new Map<string, number>();
    let totalExposures = 0;
    exposureResult.rows.forEach((r) => {
      const count = parseInt(r.exposure_count, 10) || 0;
      exposureMap.set(r.variant_key, count);
      totalExposures += count;
    });

    // 2. Fetch conversions per variant: users exposed to variant who subsequently triggered primary_metric
    // We join events matching the primary_metric event name with the user's exposed variant
    const conversionResult = await this.database.query<{ variant_key: string; conversion_count: string }>(
      `
        SELECT exp.variant_key, count(DISTINCT ev.distinct_id)::int AS conversion_count
        FROM experiment_exposures exp
        JOIN events ev ON ev.project_id = exp.project_id
          AND (
            (ev.distinct_id IS NOT NULL AND ev.distinct_id = exp.distinct_id)
            OR (ev.user_id IS NOT NULL AND exp.user_id IS NOT NULL AND ev.user_id = exp.user_id)
          )
          AND ev.event_name = $2
          AND ev.occurred_at >= exp.occurred_at
        WHERE exp.experiment_id = $1
        GROUP BY exp.variant_key;
      `,
      [experiment.id, experiment.primaryMetric]
    );

    const conversionMap = new Map<string, number>();
    let totalConversions = 0;
    conversionResult.rows.forEach((r) => {
      const count = parseInt(r.conversion_count, 10) || 0;
      conversionMap.set(r.variant_key, count);
      totalConversions += count;
    });

    // 3. Find control variant
    const controlVariant = experiment.variants.find((v) => v.isControl) ?? experiment.variants[0];
    const controlKey = controlVariant?.key || 'control';
    const controlExposures = exposureMap.get(controlKey) || 0;
    const controlConversions = conversionMap.get(controlKey) || 0;
    const controlCR = controlExposures > 0 ? controlConversions / controlExposures : 0;

    let hasEnoughData = totalExposures >= 60; // minimum combined threshold
    let recommendedWinner: string | null = null;
    let highestSignificantUplift = 0;

    const variantMetrics: VariantResultMetric[] = experiment.variants.map((v) => {
      const exposures = exposureMap.get(v.key) || 0;
      const conversions = conversionMap.get(v.key) || 0;
      const conversionRate = exposures > 0 ? conversions / exposures : 0;

      if (v.isControl) {
        return {
          variantKey: v.key,
          variantName: v.name,
          isControl: true,
          weight: v.weight,
          exposures,
          conversions,
          conversionRate,
          uplift: 0,
          zScore: null,
          pValue: null,
          confidence: null,
          isSignificant: false,
          sampleStatus: exposures < 30 ? 'insufficient_data' : 'neutral'
        };
      }

      // Variant vs Control 2-proportion Z-test
      let uplift: number | null = null;
      let zScore: number | null = null;
      let pValue: number | null = null;
      let confidence: number | null = null;
      let isSignificant = false;
      let sampleStatus: 'insufficient_data' | 'collecting' | 'significant' | 'neutral' = 'insufficient_data';

      if (controlCR > 0) {
        uplift = Math.round(((conversionRate - controlCR) / controlCR) * 1000) / 10; // e.g. +14.2%
      } else if (conversionRate > 0 && controlExposures > 0) {
        uplift = 100;
      }

      if (controlExposures >= 30 && exposures >= 30) {
        const pooledP = (controlConversions + conversions) / (controlExposures + exposures);
        const se = Math.sqrt(pooledP * (1 - pooledP) * (1 / controlExposures + 1 / exposures));

        if (se > 0) {
          zScore = Math.round(((conversionRate - controlCR) / se) * 100) / 100;
          const twoTailedP = 2 * (1 - normalCdf(Math.abs(zScore)));
          pValue = Math.round(twoTailedP * 1000) / 1000;
          confidence = Math.round((1 - twoTailedP) * 1000) / 10; // e.g. 95.8%

          if (pValue < 0.05) {
            isSignificant = true;
            sampleStatus = 'significant';
            if (uplift !== null && uplift > highestSignificantUplift) {
              highestSignificantUplift = uplift;
              recommendedWinner = v.key;
            }
          } else {
            sampleStatus = 'neutral';
          }
        }
      } else if (exposures > 0) {
        sampleStatus = 'collecting';
      }

      return {
        variantKey: v.key,
        variantName: v.name,
        isControl: false,
        weight: v.weight,
        exposures,
        conversions,
        conversionRate,
        uplift,
        zScore,
        pValue,
        confidence,
        isSignificant,
        sampleStatus
      };
    });

    // 4. Fetch daily time-series
    const timeseriesResult = await this.database.query<{
      date: string;
      variant_key: string;
      exposures: string;
      conversions: string;
    }>(
      `
        SELECT
          to_char(exp.occurred_at, 'YYYY-MM-DD') AS date,
          exp.variant_key,
          count(DISTINCT exp.distinct_id)::int AS exposures,
          count(DISTINCT ev.distinct_id)::int AS conversions
        FROM experiment_exposures exp
        LEFT JOIN events ev ON ev.project_id = exp.project_id
          AND (
            (ev.distinct_id IS NOT NULL AND ev.distinct_id = exp.distinct_id)
            OR (ev.user_id IS NOT NULL AND exp.user_id IS NOT NULL AND ev.user_id = exp.user_id)
          )
          AND ev.event_name = $2
          AND ev.occurred_at >= exp.occurred_at
        WHERE exp.experiment_id = $1
        GROUP BY date, exp.variant_key
        ORDER BY date ASC;
      `,
      [experiment.id, experiment.primaryMetric]
    );

    const timeseries = timeseriesResult.rows.map((r) => ({
      date: r.date,
      variantKey: r.variant_key,
      exposures: parseInt(r.exposures, 10) || 0,
      conversions: parseInt(r.conversions, 10) || 0
    }));

    return {
      experimentId: experiment.id,
      primaryMetric: experiment.primaryMetric,
      totalExposures,
      totalConversions,
      overallConversionRate: totalExposures > 0 ? totalConversions / totalExposures : 0,
      variants: variantMetrics,
      status: experiment.status,
      hasEnoughData,
      recommendedWinner,
      timeseries
    };
  }

  // --------------------------------------------------------------------------
  // Public Runtime / SDK Evaluation & Ingestion
  // --------------------------------------------------------------------------

  async evaluate(
    writeKey?: string,
    projectId?: string,
    experimentKey?: string,
    distinctId?: string,
    properties?: Record<string, unknown>,
    environment = 'production'
  ) {
    if (!distinctId) {
      throw new BadRequestException('distinctId is required for experiment evaluation.');
    }

    const resolvedProjectId = await this.resolveProjectIdByWriteKey(writeKey, projectId);
    if (!resolvedProjectId) {
      throw new NotFoundException('Project write key not valid.');
    }

    if (!experimentKey) {
      throw new BadRequestException('experimentKey is required.');
    }

    const result = await this.database.query<any>(
      `
        SELECT *
        FROM experiments
        WHERE project_id = $1 AND key = $2 AND environment = $3 AND status = 'running'
        LIMIT 1;
      `,
      [resolvedProjectId, experimentKey, environment]
    );

    const row = result.rows[0];
    if (!row) {
      return {
        experimentKey,
        isEligible: false,
        variantKey: 'control',
        variantName: 'Control',
        isControl: true,
        payload: null
      };
    }

    const experiment = this.mapRow(row);
    const assignedVariant = this.assignVariant(experiment, distinctId, properties);

    return {
      experimentId: experiment.id,
      experimentKey: experiment.key,
      isEligible: assignedVariant !== null,
      variantKey: assignedVariant?.key ?? 'control',
      variantName: assignedVariant?.name ?? 'Control',
      isControl: assignedVariant?.isControl ?? true,
      payload: assignedVariant?.payload ?? null
    };
  }

  /**
   * Deterministic hash-based variant assignment
   */
  assignVariant(
    experiment: Experiment,
    distinctId: string,
    properties?: Record<string, unknown>
  ): ExperimentVariant | null {
    // 1. Check audience targeting filter if present
    if (experiment.audienceFilter?.rules && experiment.audienceFilter.rules.length > 0) {
      const matches = this.evaluateAudienceRules(experiment.audienceFilter.rules, properties || {});
      if (!matches) return null;
    }

    // 2. Check rollout target percentage (0-100)
    const rolloutHash = this.hashMod(`${experiment.id}:rollout:${distinctId}`, 100);
    if (rolloutHash >= experiment.targetPercentage) {
      return null;
    }

    // 3. Assign variant bucket based on weights
    const variantHash = this.hashMod(`${experiment.id}:variant:${distinctId}`, 100);
    let cumulative = 0;
    for (const variant of experiment.variants) {
      cumulative += variant.weight;
      if (variantHash < cumulative) {
        return variant;
      }
    }

    return experiment.variants[0] || null;
  }

  private hashMod(seed: string, mod: number): number {
    const hash = createHash('sha256').update(seed).digest('hex');
    const intVal = parseInt(hash.slice(0, 8), 16);
    return intVal % mod;
  }

  private evaluateAudienceRules(rules: ExperimentAudienceRule[], props: Record<string, unknown>): boolean {
    for (const rule of rules) {
      const val = props[rule.property];
      switch (rule.operator) {
        case 'eq':
          if (String(val) !== String(rule.value)) return false;
          break;
        case 'ne':
          if (String(val) === String(rule.value)) return false;
          break;
        case 'contains':
          if (typeof val !== 'string' || !val.includes(String(rule.value))) return false;
          break;
        case 'not_contains':
          if (typeof val === 'string' && val.includes(String(rule.value))) return false;
          break;
        case 'exists':
          if (val === undefined || val === null) return false;
          break;
        case 'not_exists':
          if (val !== undefined && val !== null) return false;
          break;
        case 'gt':
          if (Number(val) <= Number(rule.value)) return false;
          break;
        case 'gte':
          if (Number(val) < Number(rule.value)) return false;
          break;
        case 'lt':
          if (Number(val) >= Number(rule.value)) return false;
          break;
        case 'lte':
          if (Number(val) > Number(rule.value)) return false;
          break;
      }
    }
    return true;
  }

  async trackExposure(writeKey?: string, projectId?: string, dto?: TrackExposureDto) {
    if (!dto?.distinctId || !dto?.variantKey) {
      throw new BadRequestException('distinctId and variantKey are required to track experiment exposure.');
    }

    const resolvedProjectId = await this.resolveProjectIdByWriteKey(writeKey, projectId || dto.projectId);
    if (!resolvedProjectId) {
      throw new NotFoundException('Project write key not valid.');
    }

    // Lookup experiment id if key was provided
    let experimentId = dto.experimentId;
    if (!experimentId && dto.experimentKey) {
      const expRes = await this.database.query<{ id: string }>(
        `SELECT id FROM experiments WHERE project_id = $1 AND key = $2 LIMIT 1;`,
        [resolvedProjectId, dto.experimentKey]
      );
      experimentId = expRes.rows[0]?.id;
    }

    if (!experimentId) {
      throw new NotFoundException('Experiment not found.');
    }

    const exposureId = `exp_exp_${randomUUID()}`;
    const env = dto.environment || 'production';

    await this.database.query(
      `
        INSERT INTO experiment_exposures (
          id, project_id, experiment_id, variant_key, distinct_id,
          user_id, anonymous_id, session_id, environment, occurred_at, received_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now());
      `,
      [
        exposureId,
        resolvedProjectId,
        experimentId,
        dto.variantKey,
        dto.distinctId,
        dto.userId || null,
        dto.anonymousId || null,
        dto.sessionId || null,
        env
      ]
    );

    // Also forward exposure as an internal TraceIQ event `$experiment_exposure` so the general event analytics capture it
    try {
      await this.database.query(
        `
          INSERT INTO events (
            id, organization_id, project_id, user_id, anonymous_id, session_id,
            event_name, properties, occurred_at, received_at
          )
          VALUES (
            $1,
            (SELECT organization_id FROM projects WHERE id = $2),
            $2, $3, $4, $5,
            '$experiment_exposure',
            $6, now(), now()
          );
        `,
        [
          `evt_${randomUUID()}`,
          resolvedProjectId,
          dto.userId || null,
          dto.anonymousId || null,
          dto.sessionId || null,
          JSON.stringify({
            experimentId,
            experimentKey: dto.experimentKey,
            variantKey: dto.variantKey,
            environment: env
          })
        ]
      );
    } catch {
      // Non-blocking event log
    }

    return { success: true, exposureId };
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

  private mapRow(row: any): Experiment {
    return {
      id: row.id,
      projectId: row.project_id,
      key: row.key,
      name: row.name,
      description: row.description,
      status: row.status,
      environment: row.environment,
      primaryMetric: row.primary_metric,
      secondaryMetrics: Array.isArray(row.secondary_metrics) ? row.secondary_metrics : [],
      variants: Array.isArray(row.variants) ? row.variants : [],
      audienceFilter: row.audience_filter || {},
      targetPercentage: row.target_percentage ?? 100,
      winnerVariantKey: row.winner_variant_key,
      startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
      pausedAt: row.paused_at ? new Date(row.paused_at).toISOString() : null,
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null,
      createdByUserId: row.created_by_user_id,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
    };
  }

  private emptyMetrics() {
    return {
      total: 0,
      running: 0,
      completed: 0,
      draft: 0
    };
  }
}
