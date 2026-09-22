import { Injectable, Logger, Optional } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { AiCapability } from '../models/ai-model-policy.service';
import { AiSanitizerService } from '../context/ai-sanitizer.service';
import { randomUUID } from 'crypto';

export type AiRunStatus = 'success' | 'failed' | 'fallback' | 'timeout' | 'blocked';

export interface RecordAiRunParams {
  organizationId: string;
  projectId: string;
  actorUserId: string;
  capability: AiCapability;
  promptVersion: string;
  requestedModel: string;
  routedModel?: string | null;
  status: AiRunStatus;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  providerRequestId?: string;
  errorMessage?: string | null;
}

export interface AiRunRecord {
  id: string;
  organizationId: string;
  projectId: string;
  actorUserId: string;
  capability: string;
  promptVersion: string;
  requestedModel: string;
  routedModel: string | null;
  status: AiRunStatus;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  providerRequestId: string | null;
  errorMessage: string | null;
  createdAt: string;
}

@Injectable()
export class AiRunsService {
  private readonly logger = new Logger(AiRunsService.name);

  constructor(
    @Optional() private readonly database?: DatabaseService,
    @Optional() private readonly sanitizer?: AiSanitizerService
  ) {}

  async recordRun(params: RecordAiRunParams): Promise<void> {
    if (!this.database) {
      return;
    }

    try {
      const id = randomUUID();
      let boundedError: string | null = null;
      if (params.errorMessage) {
        const sanitized = this.sanitizer ? this.sanitizer.sanitizeText(params.errorMessage) : params.errorMessage;
        boundedError = sanitized.slice(0, 500);
      }

      await this.database.query(
        `
          INSERT INTO ai_runs (
            id,
            organization_id,
            project_id,
            actor_user_id,
            capability,
            prompt_version,
            requested_model,
            routed_model,
            status,
            input_tokens,
            output_tokens,
            latency_ms,
            provider_request_id,
            error_message
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `,
        [
          id,
          params.organizationId,
          params.projectId,
          params.actorUserId,
          params.capability,
          params.promptVersion,
          params.requestedModel,
          params.routedModel ?? null,
          params.status,
          params.inputTokens ?? null,
          params.outputTokens ?? null,
          Math.max(0, Math.round(params.latencyMs)),
          params.providerRequestId ?? null,
          boundedError
        ]
      );
    } catch (err) {
      this.logger.warn(`Failed to record ai_run audit row: ${err instanceof Error ? err.message : err}`);
    }
  }

  async listProjectRuns(projectId: string, limit = 50): Promise<AiRunRecord[]> {
    if (!this.database) return [];
    const clampedLimit = Math.min(Math.max(limit, 1), 100);
    const result = await this.database.query<any>(
      `
        SELECT
          id,
          organization_id AS "organizationId",
          project_id AS "projectId",
          actor_user_id AS "actorUserId",
          capability,
          prompt_version AS "promptVersion",
          requested_model AS "requestedModel",
          routed_model AS "routedModel",
          status,
          input_tokens AS "inputTokens",
          output_tokens AS "outputTokens",
          latency_ms AS "latencyMs",
          provider_request_id AS "providerRequestId",
          error_message AS "errorMessage",
          created_at AS "createdAt"
        FROM ai_runs
        WHERE project_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [projectId, clampedLimit]
    );
    return result.rows;
  }
}
