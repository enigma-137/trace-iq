import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';
import { ObservabilityService } from '../observability/observability.service';
import {
  ReplaySyntheticDraft,
  SyntheticBrowser,
  SyntheticCiGroupDetail,
  SyntheticCiRunGroup,
  SyntheticCiTriggerRequest,
  SyntheticCiTriggerResponse,
  SyntheticMonitor,
  SyntheticMonitorStatus,
  SyntheticMonitorSummary,
  SyntheticRun,
  SyntheticRunStatus,
  SyntheticSchedule,
  SyntheticStep
} from '@traceiq/types';
import { SyntheticRunnerService } from './synthetic-runner.service';
import { SyntheticSsrfValidator } from './synthetic-ssrf-validator';
import { SyntheticCryptoService } from './synthetic-crypto.service';
import { SyntheticArtifactService } from './synthetic-artifact.service';
import { ReplaySyntheticExtractorService } from './replay-synthetic-extractor.service';
import { ReplayService } from '../replay/replay.service';

export interface CreateSyntheticMonitorDto {
  name: string;
  description?: string;
  baseUrl: string;
  schedule?: SyntheticSchedule;
  browser?: SyntheticBrowser;
  viewportWidth?: number;
  viewportHeight?: number;
  timeoutMs?: number;
  steps: SyntheticStep[];
  environment?: string;
  sourceType?: 'manual' | 'funnel' | 'template' | 'replay';
  sourceFunnelId?: string;
  sourceFunnelName?: string;
  sourceFunnelUpdatedAt?: string;
  sourceFunnelStepCount?: number;
  sourceReplayId?: string;
  sourceSessionId?: string;
  sourceReplayStartedAt?: string;
  projectId?: string;
}

export interface UpdateSyntheticMonitorDto {
  name?: string;
  description?: string;
  baseUrl?: string;
  schedule?: SyntheticSchedule;
  browser?: SyntheticBrowser;
  viewportWidth?: number;
  viewportHeight?: number;
  timeoutMs?: number;
  steps?: SyntheticStep[];
  environment?: string;
  status?: SyntheticMonitorStatus;
}

export interface CreateSecretDto {
  name: string;
  description?: string;
  value: string;
  projectId?: string;
}

export interface SecretSummary {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

@Injectable()
export class SyntheticMonitoringService {
  private readonly logger = new Logger(SyntheticMonitoringService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService,
    private readonly runner: SyntheticRunnerService,
    private readonly observability: ObservabilityService,
    private readonly crypto: SyntheticCryptoService,
    private readonly artifacts: SyntheticArtifactService,
    private readonly replayExtractor: ReplaySyntheticExtractorService,
    private readonly replayService: ReplayService
  ) {}

  // ---------------------------------------------------------------------------
  // MONITORS CRUD
  // ---------------------------------------------------------------------------

  async list(user: DashboardUser, projectId?: string): Promise<{ monitors: SyntheticMonitorSummary[] }> {
    const project = await this.projects.requireActiveProject(user, projectId);

    const query = `
      SELECT
        sm.id,
        sm.project_id AS "projectId",
        sm.name,
        sm.description,
        sm.base_url AS "baseUrl",
        sm.status,
        sm.schedule,
        sm.browser,
        sm.viewport_width AS "viewportWidth",
        sm.viewport_height AS "viewportHeight",
        sm.timeout_ms AS "timeoutMs",
        sm.steps,
        sm.environment,
        sm.next_run_at AS "nextRunAt",
        sm.last_run_at AS "lastRunAt",
        sm.last_run_status AS "lastRunStatus",
        sm.last_run_duration_ms AS "lastRunDurationMs",
        sm.source_type AS "sourceType",
        sm.source_funnel_id AS "sourceFunnelId",
        sm.source_funnel_name AS "sourceFunnelName",
        sm.source_funnel_updated_at AS "sourceFunnelUpdatedAt",
        sm.source_funnel_step_count AS "sourceFunnelStepCount",
        sm.source_replay_id AS "sourceReplayId",
        sm.source_session_id AS "sourceSessionId",
        sm.source_replay_started_at AS "sourceReplayStartedAt",
        sm.created_by_user_id AS "createdByUserId",
        sm.created_at AS "createdAt",
        sm.updated_at AS "updatedAt"
      FROM synthetic_monitors sm
      WHERE sm.project_id = $1 AND sm.status != 'archived'
      ORDER BY sm.created_at DESC
    `;

    const result = await this.database.query<SyntheticMonitor>(query, [project.id]);
    const monitors = result.rows;

    const summaries: SyntheticMonitorSummary[] = [];

    for (const mon of monitors) {
      const statsQuery = `
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'passed') AS passed
        FROM synthetic_runs
        WHERE monitor_id = $1 AND created_at >= NOW() - INTERVAL '24 hours'
      `;
      const statsRes = await this.database.query<{ total: string; passed: string }>(statsQuery, [mon.id]);
      const total = parseInt(statsRes.rows[0]?.total || '0', 10);
      const passed = parseInt(statsRes.rows[0]?.passed || '0', 10);
      const successRate = total > 0 ? Math.round((passed / total) * 100) : undefined;

      const recentRunsRes = await this.database.query<{
        id: string;
        status: SyntheticRunStatus;
        durationMs: number | null;
        createdAt: string;
      }>(
        `
          SELECT id, status, duration_ms AS "durationMs", created_at AS "createdAt"
          FROM synthetic_runs
          WHERE monitor_id = $1
          ORDER BY created_at DESC
          LIMIT 5
        `,
        [mon.id]
      );

      summaries.push({
        ...mon,
        successRate24h: successRate,
        totalRuns24h: total,
        recentRuns: recentRunsRes.rows
      });
    }

    return { monitors: summaries };
  }

  async get(user: DashboardUser, id: string, projectId?: string): Promise<SyntheticMonitor> {
    const project = await this.projects.requireActiveProject(user, projectId);

    const query = `
      SELECT
        id,
        project_id AS "projectId",
        name,
        description,
        base_url AS "baseUrl",
        status,
        schedule,
        browser,
        viewport_width AS "viewportWidth",
        viewport_height AS "viewportHeight",
        timeout_ms AS "timeoutMs",
        steps,
        environment,
        next_run_at AS "nextRunAt",
        last_run_at AS "lastRunAt",
        last_run_status AS "lastRunStatus",
        last_run_duration_ms AS "lastRunDurationMs",
        source_type AS "sourceType",
        source_funnel_id AS "sourceFunnelId",
        source_funnel_name AS "sourceFunnelName",
        source_funnel_updated_at AS "sourceFunnelUpdatedAt",
        source_funnel_step_count AS "sourceFunnelStepCount",
        source_replay_id AS "sourceReplayId",
        source_session_id AS "sourceSessionId",
        source_replay_started_at AS "sourceReplayStartedAt",
        created_by_user_id AS "createdByUserId",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM synthetic_monitors
      WHERE id = $1 AND project_id = $2
    `;

    const result = await this.database.query<SyntheticMonitor>(query, [id, project.id]);
    const monitor = result.rows[0];

    if (!monitor) {
      throw new NotFoundException('Synthetic monitor not found.');
    }

    return monitor;
  }

  async listByFunnel(user: DashboardUser, funnelId: string, projectId?: string): Promise<{ monitors: SyntheticMonitor[] }> {
    const project = await this.projects.requireActiveProject(user, projectId);

    const query = `
      SELECT
        id,
        project_id AS "projectId",
        name,
        description,
        base_url AS "baseUrl",
        status,
        schedule,
        browser,
        viewport_width AS "viewportWidth",
        viewport_height AS "viewportHeight",
        timeout_ms AS "timeoutMs",
        steps,
        environment,
        next_run_at AS "nextRunAt",
        last_run_at AS "lastRunAt",
        last_run_status AS "lastRunStatus",
        last_run_duration_ms AS "lastRunDurationMs",
        source_type AS "sourceType",
        source_funnel_id AS "sourceFunnelId",
        source_funnel_name AS "sourceFunnelName",
        source_funnel_updated_at AS "sourceFunnelUpdatedAt",
        source_funnel_step_count AS "sourceFunnelStepCount",
        source_replay_id AS "sourceReplayId",
        source_session_id AS "sourceSessionId",
        source_replay_started_at AS "sourceReplayStartedAt",
        created_by_user_id AS "createdByUserId",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM synthetic_monitors
      WHERE source_funnel_id = $1 AND project_id = $2 AND status != 'archived'
      ORDER BY created_at DESC
    `;

    const result = await this.database.query<SyntheticMonitor>(query, [funnelId, project.id]);
    return { monitors: result.rows };
  }

  async getReplayDraft(user: DashboardUser, replayId: string, projectId?: string): Promise<ReplaySyntheticDraft> {
    const startTime = Date.now();
    const { replay, events } = await this.replayService.getEventsForExtraction(user, replayId, projectId);
    const draft = this.replayExtractor.extractDraft(replay, events);
    const durationMs = Date.now() - startTime;

    this.logger.log(
      `replay_synthetic_draft_extracted replayId=${replay.id} rawEvents=${events.length} extractedSteps=${draft.initialSteps.length} durationMs=${durationMs}`
    );

    return draft;
  }

  async create(user: DashboardUser, dto: CreateSyntheticMonitorDto): Promise<SyntheticMonitor> {
    const project = await this.projects.requireWritableProject(user, dto.projectId);

    if (!dto.name || dto.name.trim().length === 0) {
      throw new BadRequestException('Monitor name is required.');
    }

    if (!dto.baseUrl) {
      throw new BadRequestException('Base URL is required.');
    }

    // Static SSRF validation
    SyntheticSsrfValidator.validateUrl(dto.baseUrl);

    // Validate steps
    this.validateSteps(dto.steps || []);

    const id = `sym_${randomUUID().replace(/-/g, '')}`;
    const schedule: SyntheticSchedule = dto.schedule || '15m';
    const browser: SyntheticBrowser = dto.browser || 'chromium';
    const viewportWidth = dto.viewportWidth || 1280;
    const viewportHeight = dto.viewportHeight || 720;
    const timeoutMs = Math.min(Math.max(dto.timeoutMs || 30000, 1000), 60000);
    const environment = dto.environment || 'production';
    const stepsJson = JSON.stringify(dto.steps || []);
    const nextRunAt = this.calculateNextRun(schedule);
    const sourceType = dto.sourceType || 'manual';
    const sourceFunnelId = dto.sourceFunnelId || null;
    const sourceFunnelName = dto.sourceFunnelName || null;
    const sourceFunnelUpdatedAt = dto.sourceFunnelUpdatedAt ? new Date(dto.sourceFunnelUpdatedAt) : null;
    const sourceFunnelStepCount = dto.sourceFunnelStepCount || null;
    const sourceReplayId = dto.sourceReplayId || null;
    const sourceSessionId = dto.sourceSessionId || null;
    const sourceReplayStartedAt = dto.sourceReplayStartedAt ? new Date(dto.sourceReplayStartedAt) : null;

    const insertQuery = `
      INSERT INTO synthetic_monitors (
        id, project_id, name, description, base_url, status, schedule,
        browser, viewport_width, viewport_height, timeout_ms, steps,
        environment, next_run_at, source_type, source_funnel_id,
        source_funnel_name, source_funnel_updated_at, source_funnel_step_count,
        source_replay_id, source_session_id, source_replay_started_at,
        created_by_user_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW(), NOW())
      RETURNING
        id, project_id AS "projectId", name, description, base_url AS "baseUrl",
        status, schedule, browser, viewport_width AS "viewportWidth",
        viewport_height AS "viewportHeight", timeout_ms AS "timeoutMs",
        steps, environment, next_run_at AS "nextRunAt", last_run_at AS "lastRunAt",
        last_run_status AS "lastRunStatus", last_run_duration_ms AS "lastRunDurationMs",
        source_type AS "sourceType", source_funnel_id AS "sourceFunnelId",
        source_funnel_name AS "sourceFunnelName", source_funnel_updated_at AS "sourceFunnelUpdatedAt",
        source_funnel_step_count AS "sourceFunnelStepCount",
        source_replay_id AS "sourceReplayId", source_session_id AS "sourceSessionId",
        source_replay_started_at AS "sourceReplayStartedAt",
        created_by_user_id AS "createdByUserId", created_at AS "createdAt", updated_at AS "updatedAt"
    `;

    const result = await this.database.query<SyntheticMonitor>(insertQuery, [
      id,
      project.id,
      dto.name.trim(),
      dto.description || null,
      dto.baseUrl.trim(),
      schedule,
      browser,
      viewportWidth,
      viewportHeight,
      timeoutMs,
      stepsJson,
      environment,
      nextRunAt,
      sourceType,
      sourceFunnelId,
      sourceFunnelName,
      sourceFunnelUpdatedAt,
      sourceFunnelStepCount,
      sourceReplayId,
      sourceSessionId,
      sourceReplayStartedAt,
      user.id
    ]);

    return result.rows[0];
  }

  async update(
    user: DashboardUser,
    id: string,
    dto: UpdateSyntheticMonitorDto,
    projectId?: string
  ): Promise<SyntheticMonitor> {
    const project = await this.projects.requireWritableProject(user, projectId);
    const existing = await this.get(user, id, project.id);

    if (dto.baseUrl) {
      SyntheticSsrfValidator.validateUrl(dto.baseUrl);
    }

    if (dto.steps) {
      this.validateSteps(dto.steps);
    }

    const name = dto.name !== undefined ? dto.name.trim() : existing.name;
    const description = dto.description !== undefined ? dto.description : existing.description;
    const baseUrl = dto.baseUrl !== undefined ? dto.baseUrl.trim() : existing.baseUrl;
    const schedule = dto.schedule !== undefined ? dto.schedule : existing.schedule;
    const browser = dto.browser !== undefined ? dto.browser : existing.browser;
    const viewportWidth = dto.viewportWidth !== undefined ? dto.viewportWidth : existing.viewportWidth;
    const viewportHeight = dto.viewportHeight !== undefined ? dto.viewportHeight : existing.viewportHeight;
    const timeoutMs = dto.timeoutMs !== undefined ? Math.min(Math.max(dto.timeoutMs, 1000), 60000) : existing.timeoutMs;
    const steps = dto.steps !== undefined ? JSON.stringify(dto.steps) : JSON.stringify(existing.steps);
    const environment = dto.environment !== undefined ? dto.environment : existing.environment;
    const status = dto.status !== undefined ? dto.status : existing.status;

    const query = `
      UPDATE synthetic_monitors
      SET
        name = $1,
        description = $2,
        base_url = $3,
        schedule = $4,
        browser = $5,
        viewport_width = $6,
        viewport_height = $7,
        timeout_ms = $8,
        steps = $9,
        environment = $10,
        status = $11,
        updated_at = NOW()
      WHERE id = $12 AND project_id = $13
      RETURNING
        id, project_id AS "projectId", name, description, base_url AS "baseUrl",
        status, schedule, browser, viewport_width AS "viewportWidth",
        viewport_height AS "viewportHeight", timeout_ms AS "timeoutMs",
        steps, environment, next_run_at AS "nextRunAt", last_run_at AS "lastRunAt",
        last_run_status AS "lastRunStatus", last_run_duration_ms AS "lastRunDurationMs",
        created_by_user_id AS "createdByUserId", created_at AS "createdAt", updated_at AS "updatedAt"
    `;

    const result = await this.database.query<SyntheticMonitor>(query, [
      name,
      description,
      baseUrl,
      schedule,
      browser,
      viewportWidth,
      viewportHeight,
      timeoutMs,
      steps,
      environment,
      status,
      id,
      project.id
    ]);

    return result.rows[0];
  }

  async pause(user: DashboardUser, id: string, projectId?: string): Promise<SyntheticMonitor> {
    return this.update(user, id, { status: 'paused' }, projectId);
  }

  async resume(user: DashboardUser, id: string, projectId?: string): Promise<SyntheticMonitor> {
    return this.update(user, id, { status: 'active' }, projectId);
  }

  async delete(user: DashboardUser, id: string, projectId?: string): Promise<{ success: boolean }> {
    const project = await this.projects.requireWritableProject(user, projectId);
    await this.database.query(`DELETE FROM synthetic_monitors WHERE id = $1 AND project_id = $2`, [id, project.id]);
    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // SECRETS MANAGEMENT
  // ---------------------------------------------------------------------------

  async listSecrets(user: DashboardUser, projectId?: string): Promise<{ secrets: SecretSummary[] }> {
    const project = await this.projects.requireActiveProject(user, projectId);
    const query = `
      SELECT id, name, description, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM synthetic_secrets
      WHERE project_id = $1
      ORDER BY name ASC
    `;
    const result = await this.database.query<SecretSummary>(query, [project.id]);
    return { secrets: result.rows };
  }

  async createSecret(user: DashboardUser, dto: CreateSecretDto): Promise<SecretSummary> {
    const project = await this.projects.requireWritableProject(user, dto.projectId);
    const name = dto.name.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');

    if (!name || name.length < 2) {
      throw new BadRequestException('Secret name must contain at least 2 alphanumeric characters.');
    }
    if (!dto.value) {
      throw new BadRequestException('Secret value is required.');
    }

    const { encryptedValue, iv, tag } = this.crypto.encrypt(dto.value);
    const id = `sec_${randomUUID().replace(/-/g, '')}`;

    const query = `
      INSERT INTO synthetic_secrets (
        id, project_id, name, description, encrypted_value, iv, tag,
        created_by_user_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      ON CONFLICT (project_id, name) DO UPDATE SET
        description = EXCLUDED.description,
        encrypted_value = EXCLUDED.encrypted_value,
        iv = EXCLUDED.iv,
        tag = EXCLUDED.tag,
        updated_at = NOW()
      RETURNING id, name, description, created_at AS "createdAt", updated_at AS "updatedAt"
    `;

    const result = await this.database.query<SecretSummary>(query, [
      id,
      project.id,
      name,
      dto.description || null,
      encryptedValue,
      iv,
      tag,
      user.id
    ]);

    return result.rows[0];
  }

  async deleteSecret(user: DashboardUser, name: string, projectId?: string): Promise<{ success: boolean }> {
    const project = await this.projects.requireWritableProject(user, projectId);
    await this.database.query(
      `DELETE FROM synthetic_secrets WHERE project_id = $1 AND name = $2`,
      [project.id, name.toUpperCase()]
    );
    return { success: true };
  }

  async loadDecryptedSecrets(projectId: string): Promise<Record<string, string>> {
    const query = `
      SELECT name, encrypted_value, iv, tag
      FROM synthetic_secrets
      WHERE project_id = $1
    `;
    const result = await this.database.query<{
      name: string;
      encrypted_value: string;
      iv: string;
      tag: string;
    }>(query, [projectId]);

    const secrets: Record<string, string> = {};
    for (const row of result.rows) {
      try {
        secrets[row.name] = this.crypto.decrypt(row.encrypted_value, row.iv, row.tag);
      } catch (err) {
        this.logger.error(`Failed to decrypt synthetic secret ${row.name}: ${err}`);
      }
    }
    return secrets;
  }

  // ---------------------------------------------------------------------------
  // RUNS & TRULY ASYNCHRONOUS EXECUTION
  // ---------------------------------------------------------------------------

  async listRuns(
    user: DashboardUser,
    monitorId: string,
    limit: number = 30,
    projectId?: string
  ): Promise<{ runs: SyntheticRun[] }> {
    const project = await this.projects.requireActiveProject(user, projectId);
    await this.get(user, monitorId, project.id);

    const query = `
      SELECT
        id,
        project_id AS "projectId",
        monitor_id AS "monitorId",
        status,
        trigger,
        target_url AS "targetUrl",
        browser,
        viewport,
        started_at AS "startedAt",
        completed_at AS "completedAt",
        duration_ms AS "durationMs",
        failed_step_index AS "failedStepIndex",
        failure_reason AS "failureReason",
        final_url AS "finalUrl",
        step_results AS "stepResults",
        console_logs AS "consoleLogs",
        network_requests AS "networkRequests",
        http_errors AS "httpErrors",
        screenshot_base64 AS "screenshotBase64",
        run_group_id AS "runGroupId",
        environment,
        git_provider AS "gitProvider",
        repository,
        commit_sha AS "commitSha",
        branch,
        pull_request_number AS "pullRequestNumber",
        check_run_id AS "checkRunId",
        created_at AS "createdAt"
      FROM synthetic_runs
      WHERE monitor_id = $1 AND project_id = $2
      ORDER BY created_at DESC
      LIMIT $3
    `;

    const result = await this.database.query<SyntheticRun>(query, [monitorId, project.id, limit]);
    return { runs: result.rows };
  }

  async getRun(user: DashboardUser, runId: string, projectId?: string): Promise<SyntheticRun> {
    const project = await this.projects.requireActiveProject(user, projectId);

    const query = `
      SELECT
        id,
        project_id AS "projectId",
        monitor_id AS "monitorId",
        status,
        trigger,
        target_url AS "targetUrl",
        browser,
        viewport,
        started_at AS "startedAt",
        completed_at AS "completedAt",
        duration_ms AS "durationMs",
        failed_step_index AS "failedStepIndex",
        failure_reason AS "failureReason",
        final_url AS "finalUrl",
        step_results AS "stepResults",
        console_logs AS "consoleLogs",
        network_requests AS "networkRequests",
        http_errors AS "httpErrors",
        screenshot_base64 AS "screenshotBase64",
        run_group_id AS "runGroupId",
        environment,
        git_provider AS "gitProvider",
        repository,
        commit_sha AS "commitSha",
        branch,
        pull_request_number AS "pullRequestNumber",
        check_run_id AS "checkRunId",
        created_at AS "createdAt"
      FROM synthetic_runs
      WHERE id = $1 AND project_id = $2
    `;

    const result = await this.database.query<SyntheticRun>(query, [runId, project.id]);
    const run = result.rows[0];

    if (!run) {
      throw new NotFoundException('Synthetic run not found.');
    }

    return run;
  }

  /**
   * Inserts the `queued` run row that {@link executeRunPipeline} updates as the
   * run progresses. Every trigger must call this first: the pipeline only
   * updates an existing row, so without it a run executes but records nothing.
   */
  async createQueuedRun(
    monitor: SyntheticMonitor,
    runId: string,
    trigger: 'scheduled' | 'manual' | 'api' | 'ci'
  ): Promise<void> {
    await this.database.query(
      `
        INSERT INTO synthetic_runs (
          id, project_id, monitor_id, status, trigger, target_url, browser,
          viewport, created_at
        ) VALUES ($1, $2, $3, 'queued', $4, $5, $6, $7, NOW())
      `,
      [
        runId,
        monitor.projectId,
        monitor.id,
        trigger,
        monitor.baseUrl,
        monitor.browser,
        JSON.stringify({ width: monitor.viewportWidth, height: monitor.viewportHeight })
      ]
    );
  }

  /**
   * Triggers a manual run asynchronously: creates queued run and dispatches worker in background.
   * Returns immediately without blocking the HTTP request.
   */
  async triggerManualRun(
    user: DashboardUser,
    monitorId: string,
    projectId?: string
  ): Promise<{ runId: string; status: 'queued'; message: string }> {
    const project = await this.projects.requireWritableProject(user, projectId);
    const monitor = await this.get(user, monitorId, project.id);

    const runId = `srun_${randomUUID().replace(/-/g, '')}`;
    await this.createQueuedRun(monitor, runId, 'manual');

    // Dispatch asynchronous execution without blocking HTTP lifecycle
    setImmediate(() => {
      this.executeRunPipeline(monitor, runId, 'manual').catch((err) => {
        this.logger.error(`Asynchronous run pipeline failed for ${runId}: ${err.message}`, err.stack);
      });
    });

    return {
      runId,
      status: 'queued',
      message: 'Synthetic journey queued for asynchronous browser execution.'
    };
  }

  // ---------------------------------------------------------------------------
  // CI RUN GROUPS & PREVIEW DEPLOYMENT TRIGGERING
  // ---------------------------------------------------------------------------

  /**
   * Authenticates caller for CI endpoints using PAT, Project Write Key, or active user session.
   */
  async authenticateCiCaller(
    authHeader?: string,
    apiKeyHeader?: string,
    writeKeyHeader?: string,
    projectId?: string
  ): Promise<{ projectId: string }> {
    if (!projectId) {
      throw new BadRequestException('projectId is required.');
    }

    const rawKey =
      apiKeyHeader ||
      writeKeyHeader ||
      (authHeader?.startsWith('Bearer ') ? authHeader.replace(/^Bearer\s+/i, '').trim() : authHeader?.trim());

    if (!rawKey) {
      throw new UnauthorizedException('Authentication credentials (API key or Bearer token) required for CI runs.');
    }

    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    // 1. Check Personal Access Token
    if (rawKey.startsWith('tiq_pat_')) {
      const patQuery = `
        SELECT pat.user_id, p.id AS project_id
        FROM personal_access_tokens pat
        JOIN organization_members om ON om.user_id = pat.user_id
        JOIN projects p ON p.organization_id = om.organization_id
        WHERE pat.token_hash = $1
          AND p.id = $2
          AND pat.revoked_at IS NULL
          AND (pat.expires_at IS NULL OR pat.expires_at > NOW())
        LIMIT 1
      `;
      const patRes = await this.database.query(patQuery, [keyHash, projectId]);
      if (patRes.rows.length > 0) {
        return { projectId };
      }
    }

    // 2. Check Project Write Key
    const writeKeyQuery = `
      SELECT pwk.project_id
      FROM project_write_keys pwk
      WHERE pwk.key_hash = $1
        AND pwk.project_id = $2
        AND pwk.revoked_at IS NULL
      LIMIT 1
    `;
    const writeKeyRes = await this.database.query(writeKeyQuery, [keyHash, projectId]);
    if (writeKeyRes.rows.length > 0) {
      return { projectId };
    }

    // 3. Fallback to Dashboard User session if valid
    try {
      const user = await this.projects['database'] ? await (this as any).authService?.getDashboardUser(authHeader) : null;
      if (user) {
        const project = await this.projects.requireWritableProject(user, projectId);
        return { projectId: project.id };
      }
    } catch {
      // Ignored, proceed to throw
    }

    throw new UnauthorizedException('Invalid API key or insufficient permissions for the specified project.');
  }

  /**
   * Triggers a batch of synthetic monitors against a pull-request preview URL in CI.
   */
  async triggerCiRuns(
    caller: { projectId: string },
    dto: SyntheticCiTriggerRequest
  ): Promise<SyntheticCiTriggerResponse> {
    const projectId = caller.projectId;

    if (!dto.baseUrl || dto.baseUrl.trim().length === 0) {
      throw new BadRequestException('baseUrl is required for CI preview run.');
    }

    // Enforce SSRF validation on the preview baseUrl override
    SyntheticSsrfValidator.validateUrl(dto.baseUrl);

    if (!Array.isArray(dto.monitorIds) || dto.monitorIds.length === 0) {
      throw new BadRequestException('monitorIds must be a non-empty array of monitor IDs.');
    }

    // Idempotency check
    if (dto.idempotencyKey) {
      const existingGroupRes = await this.database.query<SyntheticCiRunGroup>(
        `SELECT id, project_id AS "projectId", status, base_url AS "baseUrl",
                total_monitors AS "totalMonitors", passed_monitors AS "passedMonitors",
                failed_monitors AS "failedMonitors", created_at AS "createdAt"
         FROM synthetic_ci_run_groups
         WHERE project_id = $1 AND idempotency_key = $2
         LIMIT 1`,
        [projectId, dto.idempotencyKey]
      );
      if (existingGroupRes.rows.length > 0) {
        const existing = existingGroupRes.rows[0];
        const runsRes = await this.database.query<{ monitor_id: string; monitor_name: string; id: string }>(
          `SELECT sr.monitor_id, sm.name AS monitor_name, sr.id
           FROM synthetic_runs sr
           JOIN synthetic_monitors sm ON sm.id = sr.monitor_id
           WHERE sr.run_group_id = $1`,
          [existing.id]
        );
        return {
          runGroupId: existing.id,
          status: existing.status,
          totalMonitors: existing.totalMonitors,
          runs: runsRes.rows.map((r) => ({
            monitorId: r.monitor_id,
            monitorName: r.monitor_name,
            runId: r.id
          }))
        };
      }
    }

    // Load and validate all requested monitors for this project
    const monitorsRes = await this.database.query<SyntheticMonitor>(
      `SELECT
         id, project_id AS "projectId", name, description, base_url AS "baseUrl",
         status, schedule, browser, viewport_width AS "viewportWidth",
         viewport_height AS "viewportHeight", timeout_ms AS "timeoutMs",
         steps, environment
       FROM synthetic_monitors
       WHERE id = ANY($1::text[]) AND project_id = $2 AND status != 'archived'`,
      [dto.monitorIds, projectId]
    );

    if (monitorsRes.rows.length !== dto.monitorIds.length) {
      const foundIds = new Set(monitorsRes.rows.map((m) => m.id));
      const missing = dto.monitorIds.filter((id) => !foundIds.has(id));
      throw new NotFoundException(
        `One or more monitors not found in this project: ${missing.join(', ')}`
      );
    }

    const monitors = monitorsRes.rows;
    const runGroupId = `srg_${randomUUID().replace(/-/g, '')}`;
    const environment = dto.environment || 'preview';
    const gitProvider = dto.git?.provider || 'github';
    const repository = dto.git?.repository || null;
    const commitSha = dto.git?.commitSha || null;
    const branch = dto.git?.branch || null;
    const pullRequestNumber = dto.git?.pullRequest || null;
    const idempotencyKey = dto.idempotencyKey || null;

    // 1. Create CI run group
    await this.database.query(
      `INSERT INTO synthetic_ci_run_groups (
         id, project_id, status, base_url, environment, git_provider,
         repository, commit_sha, branch, pull_request_number, idempotency_key,
         total_monitors, passed_monitors, failed_monitors, created_at, updated_at
       ) VALUES ($1, $2, 'queued', $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, 0, NOW(), NOW())`,
      [
        runGroupId,
        projectId,
        dto.baseUrl.trim(),
        environment,
        gitProvider,
        repository,
        commitSha,
        branch,
        pullRequestNumber,
        idempotencyKey,
        monitors.length
      ]
    );

    // 2. Create individual synthetic runs for each monitor
    const createdRuns: Array<{ monitorId: string; monitorName: string; runId: string }> = [];

    for (const monitor of monitors) {
      const runId = `srun_${randomUUID().replace(/-/g, '')}`;
      await this.database.query(
        `INSERT INTO synthetic_runs (
           id, project_id, monitor_id, status, trigger, target_url, browser,
           viewport, run_group_id, environment, git_provider, repository,
           commit_sha, branch, pull_request_number, created_at
         ) VALUES (
           $1, $2, $3, 'queued', 'ci', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW()
         )`,
        [
          runId,
          projectId,
          monitor.id,
          dto.baseUrl.trim(), // Preview override
          monitor.browser,
          JSON.stringify({ width: monitor.viewportWidth, height: monitor.viewportHeight }),
          runGroupId,
          environment,
          gitProvider,
          repository,
          commitSha,
          branch,
          pullRequestNumber
        ]
      );

      createdRuns.push({
        monitorId: monitor.id,
        monitorName: monitor.name,
        runId
      });
    }

    // 3. Dispatch asynchronous execution for all monitors in group
    setImmediate(async () => {
      await this.database.query(
        `UPDATE synthetic_ci_run_groups SET status = 'running', updated_at = NOW() WHERE id = $1`,
        [runGroupId]
      );

      for (const item of createdRuns) {
        const mon = monitors.find((m) => m.id === item.monitorId)!;
        this.executeRunPipeline(mon, item.runId, 'ci', {
          baseUrlOverride: dto.baseUrl.trim(),
          runGroupId
        }).catch((err) => {
          this.logger.error(`CI run execution failed for ${item.runId}: ${err.message}`, err.stack);
        });
      }
    });

    return {
      runGroupId,
      status: 'queued',
      totalMonitors: monitors.length,
      runs: createdRuns
    };
  }

  /**
   * Retrieves detail and aggregated progress of a CI run group.
   */
  async getCiRunGroup(caller: { projectId: string }, runGroupId: string): Promise<SyntheticCiGroupDetail> {
    const groupRes = await this.database.query<SyntheticCiRunGroup>(
      `SELECT
         id,
         project_id AS "projectId",
         status,
         base_url AS "baseUrl",
         environment,
         git_provider AS "gitProvider",
         repository,
         commit_sha AS "commitSha",
         branch,
         pull_request_number AS "pullRequestNumber",
         idempotency_key AS "idempotencyKey",
         total_monitors AS "totalMonitors",
         passed_monitors AS "passedMonitors",
         failed_monitors AS "failedMonitors",
         created_at AS "createdAt",
         updated_at AS "updatedAt",
         completed_at AS "completedAt"
       FROM synthetic_ci_run_groups
       WHERE id = $1 AND project_id = $2`,
      [runGroupId, caller.projectId]
    );

    const group = groupRes.rows[0];
    if (!group) {
      throw new NotFoundException('Synthetic CI run group not found.');
    }

    const runsRes = await this.database.query<SyntheticRun>(
      `SELECT
         id,
         project_id AS "projectId",
         monitor_id AS "monitorId",
         status,
         trigger,
         target_url AS "targetUrl",
         browser,
         viewport,
         started_at AS "startedAt",
         completed_at AS "completedAt",
         duration_ms AS "durationMs",
         failed_step_index AS "failedStepIndex",
         failure_reason AS "failureReason",
         final_url AS "finalUrl",
         step_results AS "stepResults",
         console_logs AS "consoleLogs",
         network_requests AS "networkRequests",
         http_errors AS "httpErrors",
         screenshot_base64 AS "screenshotBase64",
         run_group_id AS "runGroupId",
         environment,
         git_provider AS "gitProvider",
         repository,
         commit_sha AS "commitSha",
         branch,
         pull_request_number AS "pullRequestNumber",
         check_run_id AS "checkRunId",
         created_at AS "createdAt"
       FROM synthetic_runs
       WHERE run_group_id = $1 AND project_id = $2
       ORDER BY created_at ASC`,
      [runGroupId, caller.projectId]
    );

    return {
      group,
      runs: runsRes.rows
    };
  }

  /**
   * Lists CI run groups for a project in dashboard.
   */
  async listCiRunGroups(
    user: DashboardUser,
    projectId?: string,
    limit: number = 20
  ): Promise<{ groups: SyntheticCiRunGroup[] }> {
    const project = await this.projects.requireActiveProject(user, projectId);

    const query = `
      SELECT
        id,
        project_id AS "projectId",
        status,
        base_url AS "baseUrl",
        environment,
        git_provider AS "gitProvider",
        repository,
        commit_sha AS "commitSha",
        branch,
        pull_request_number AS "pullRequestNumber",
        idempotency_key AS "idempotencyKey",
        total_monitors AS "totalMonitors",
        passed_monitors AS "passedMonitors",
        failed_monitors AS "failedMonitors",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        completed_at AS "completedAt"
      FROM synthetic_ci_run_groups
      WHERE project_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await this.database.query<SyntheticCiRunGroup>(query, [project.id, limit]);
    return { groups: result.rows };
  }

  /**
   * Internal helper to recalculate and update a run group's aggregated progress.
   */
  private async updateRunGroupProgress(runGroupId: string): Promise<void> {
    const statsRes = await this.database.query<{
      total: string;
      passed: string;
      failed: string;
      timed_out: string;
      pending: string;
    }>(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'passed') AS passed,
         COUNT(*) FILTER (WHERE status = 'failed') AS failed,
         COUNT(*) FILTER (WHERE status = 'timed_out') AS timed_out,
         COUNT(*) FILTER (WHERE status IN ('queued', 'running')) AS pending
       FROM synthetic_runs
       WHERE run_group_id = $1`,
      [runGroupId]
    );

    const total = parseInt(statsRes.rows[0]?.total || '0', 10);
    const passed = parseInt(statsRes.rows[0]?.passed || '0', 10);
    const failed = parseInt(statsRes.rows[0]?.failed || '0', 10);
    const timedOut = parseInt(statsRes.rows[0]?.timed_out || '0', 10);
    const pending = parseInt(statsRes.rows[0]?.pending || '0', 10);

    let groupStatus: SyntheticRunStatus = 'running';
    let isComplete = false;

    if (pending === 0 && total > 0) {
      isComplete = true;
      if (failed > 0) {
        groupStatus = 'failed';
      } else if (timedOut > 0) {
        groupStatus = 'timed_out';
      } else {
        groupStatus = 'passed';
      }
    }

    await this.database.query(
      `UPDATE synthetic_ci_run_groups
       SET
         status = $1,
         passed_monitors = $2,
         failed_monitors = $3,
         completed_at = CASE WHEN $4::boolean THEN NOW() ELSE completed_at END,
         updated_at = NOW()
       WHERE id = $5`,
      [groupStatus, passed, failed + timedOut, isComplete, runGroupId]
    );
  }

  /**
   * Atomic Claiming for Multi-Instance Deployments.
   * Uses FOR UPDATE SKIP LOCKED to lease due monitors without concurrency collisions.
   */
  async claimDueMonitors(replicaId: string, limit: number = 3): Promise<SyntheticMonitor[]> {
    return this.database.transaction(async (client) => {
      const selectQuery = `
        SELECT id
        FROM synthetic_monitors
        WHERE status = 'active'
          AND schedule != 'manual'
          AND (lease_expires_at IS NULL OR lease_expires_at <= NOW())
          AND next_run_at <= NOW()
        ORDER BY next_run_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      `;

      const selectRes = await client.query<{ id: string }>(selectQuery, [limit]);
      if (selectRes.rows.length === 0) return [];

      const ids = selectRes.rows.map((r) => r.id);
      const leaseExpiresAt = new Date(Date.now() + 90000); // 90s lease

      const updateQuery = `
        UPDATE synthetic_monitors
        SET
          claimed_by = $1,
          lease_expires_at = $2,
          updated_at = NOW()
        WHERE id = ANY($3::text[])
        RETURNING
          id, project_id AS "projectId", name, description, base_url AS "baseUrl",
          status, schedule, browser, viewport_width AS "viewportWidth",
          viewport_height AS "viewportHeight", timeout_ms AS "timeoutMs",
          steps, environment, next_run_at AS "nextRunAt", last_run_at AS "lastRunAt",
          last_run_status AS "lastRunStatus", last_run_duration_ms AS "lastRunDurationMs",
          created_by_user_id AS "createdByUserId", created_at AS "createdAt", updated_at AS "updatedAt"
      `;

      const updateRes = await client.query<SyntheticMonitor>(updateQuery, [replicaId, leaseExpiresAt, ids]);
      return updateRes.rows;
    });
  }

  /**
   * Sweeps orphaned/stale runs stuck in 'running' state (e.g. following a worker restart).
   */
  async sweepStaleRuns(): Promise<number> {
    const staleThreshold = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago

    const query = `
      UPDATE synthetic_runs
      SET
        status = 'timed_out',
        completed_at = NOW(),
        failure_reason = 'Execution timed out: Worker process terminated unexpectedly or abandoned.'
      WHERE status = 'running' AND started_at <= $1
      RETURNING id
    `;

    const res = await this.database.query(query, [staleThreshold]);
    if (res.rowCount && res.rowCount > 0) {
      this.logger.warn(`Swept ${res.rowCount} stale running synthetic runs.`);
    }
    return res.rowCount || 0;
  }

  /**
   * Full asynchronous run execution pipeline.
   */
  async executeRunPipeline(
    monitor: SyntheticMonitor,
    runId: string,
    trigger: 'scheduled' | 'manual' | 'api' | 'ci' = 'scheduled',
    options?: { baseUrlOverride?: string; runGroupId?: string }
  ): Promise<SyntheticRun> {
    // 1. Mark run as running
    const startedAt = new Date().toISOString();
    await this.database.query(
      `UPDATE synthetic_runs SET status = 'running', started_at = $1 WHERE id = $2 AND status = 'queued'`,
      [startedAt, runId]
    );

    // 2. Load decrypted secrets for project
    const secrets = await this.loadDecryptedSecrets(monitor.projectId);

    // 3. Execute via Playwright Runner with Route Interception and Redaction
    const targetBaseUrl = options?.baseUrlOverride || monitor.baseUrl;
    const execResult = await this.runner.execute({
      runId,
      projectId: monitor.projectId,
      baseUrl: targetBaseUrl,
      browserType: monitor.browser,
      viewportWidth: monitor.viewportWidth,
      viewportHeight: monitor.viewportHeight,
      timeoutMs: monitor.timeoutMs,
      steps: monitor.steps,
      secrets,
      allowLocal: process.env.ALLOW_LOCAL_SYNTHETIC_TARGETS === 'true'
    });

    if (!execResult) {
      return null as any;
    }

    // 4. Update run record with results (enforce state machine)
    const updateRunQuery = `
      UPDATE synthetic_runs
      SET
        status = $1,
        started_at = COALESCE(started_at, $2),
        completed_at = $3,
        duration_ms = $4,
        failed_step_index = $5,
        failure_reason = $6,
        final_url = $7,
        step_results = $8,
        console_logs = $9,
        network_requests = $10,
        http_errors = $11,
        screenshot_base64 = $12
      WHERE id = $13
      RETURNING
        id, project_id AS "projectId", monitor_id AS "monitorId", status, trigger,
        target_url AS "targetUrl", browser, viewport, started_at AS "startedAt",
        completed_at AS "completedAt", duration_ms AS "durationMs",
        failed_step_index AS "failedStepIndex", failure_reason AS "failureReason",
        final_url AS "finalUrl", step_results AS "stepResults",
        console_logs AS "consoleLogs", network_requests AS "networkRequests",
        http_errors AS "httpErrors", screenshot_base64 AS "screenshotBase64",
        run_group_id AS "runGroupId", environment, git_provider AS "gitProvider",
        repository, commit_sha AS "commitSha", branch, pull_request_number AS "pullRequestNumber",
        check_run_id AS "checkRunId", created_at AS "createdAt"
    `;

    const updatedRunRes = await this.database.query<SyntheticRun>(updateRunQuery, [
      execResult.status,
      execResult.startedAt,
      execResult.completedAt,
      execResult.durationMs,
      execResult.failedStepIndex,
      execResult.failureReason,
      execResult.finalUrl,
      JSON.stringify(execResult.stepResults),
      JSON.stringify(execResult.consoleLogs),
      JSON.stringify(execResult.networkRequests),
      JSON.stringify(execResult.httpErrors),
      execResult.screenshotBase64,
      runId
    ]);

    // 5. If triggered by CI, update run group progress and DO NOT mutate production monitor stats
    if (trigger === 'ci') {
      if (options?.runGroupId) {
        await this.updateRunGroupProgress(options.runGroupId);
      }
    } else {
      // Calculate next run time and clear lease for scheduled/manual runs
      const nextRun = this.calculateNextRun(monitor.schedule);
      await this.database.query(
        `
          UPDATE synthetic_monitors
          SET
            last_run_at = NOW(),
            last_run_status = $1,
            last_run_duration_ms = $2,
            next_run_at = $3,
            claimed_by = NULL,
            lease_expires_at = NULL,
            updated_at = NOW()
          WHERE id = $4
        `,
        [execResult.status, execResult.durationMs, nextRun, monitor.id]
      );
    }

    // 6. Record to TraceIQ Observability
    try {
      await this.observability.recordLog({
        id: randomUUID(),
        projectId: monitor.projectId,
        timestamp: execResult.completedAt,
        level: execResult.status === 'passed' ? 'info' : 'error',
        source: 'synthetic_monitor',
        service: 'synthetic-runner',
        status: execResult.status === 'passed' ? 'success' : 'error',
        message: `Synthetic journey "${monitor.name}" ${execResult.status}: ${execResult.failureReason || `${execResult.stepResults.length} steps passed`}`,
        durationMs: execResult.durationMs,
        route: targetBaseUrl,
        environment: trigger === 'ci' ? 'preview' : monitor.environment,
        metadata: {
          monitorId: monitor.id,
          monitorName: monitor.name,
          runId,
          browser: monitor.browser,
          trigger,
          totalSteps: monitor.steps.length,
          failedStepIndex: execResult.failedStepIndex,
          runGroupId: options?.runGroupId
        },
        errorDetails: execResult.failureReason
          ? {
              reason: execResult.failureReason,
              failedStep: execResult.failedStepIndex !== null ? monitor.steps[execResult.failedStepIndex] : null,
              httpErrors: execResult.httpErrors
            }
          : undefined
      });
    } catch (obsErr) {
      this.logger.warn(`Failed to push synthetic run into observability log: ${obsErr}`);
    }

    return updatedRunRes?.rows?.[0] as SyntheticRun;
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  private validateSteps(steps: SyntheticStep[]): void {
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new BadRequestException('At least one step is required for a synthetic monitor.');
    }

    if (steps.length > 50) {
      throw new BadRequestException('A synthetic monitor cannot exceed 50 steps.');
    }

    const validTypes = new Set([
      'navigate',
      'click',
      'fill',
      'wait_for',
      'assert_text',
      'assert_visible',
      'assert_url',
      'wait_for_response'
    ]);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step.type || !validTypes.has(step.type)) {
        throw new BadRequestException(`Step #${i + 1} has invalid type "${step.type}".`);
      }

      if (step.type === 'navigate' && !step.url) {
        throw new BadRequestException(`Step #${i + 1} (navigate) requires a "url".`);
      }

      if (['click', 'fill', 'assert_text', 'assert_visible'].includes(step.type) && !step.selector) {
        throw new BadRequestException(`Step #${i + 1} (${step.type}) requires a "selector".`);
      }

      if (step.type === 'assert_url' && !step.value) {
        throw new BadRequestException(`Step #${i + 1} (assert_url) requires a "value".`);
      }
    }
  }

  calculateNextRun(schedule: SyntheticSchedule): Date {
    const now = new Date();
    switch (schedule) {
      case '5m':
        return new Date(now.getTime() + 5 * 60 * 1000);
      case '15m':
        return new Date(now.getTime() + 15 * 60 * 1000);
      case '30m':
        return new Date(now.getTime() + 30 * 60 * 1000);
      case '1h':
        return new Date(now.getTime() + 60 * 60 * 1000);
      case '6h':
        return new Date(now.getTime() + 6 * 60 * 60 * 1000);
      case '24h':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      case 'manual':
      default:
        return new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    }
  }
}
