import { Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { DashboardUser } from '../auth/auth.service';
import { FunnelResults, FunnelsService } from '../funnels/funnels.service';
import { appConfig } from '../../config/app.config';
import { DatabaseService } from '../../database/database.service';
import { EntitlementService } from '../billing/entitlement.service';
import { UsageService } from '../billing/usage.service';
import { ProjectsService } from '../projects/projects.service';
import { CencoriProvider } from './providers/cencori.provider';
import { AiModelPolicyService } from './models/ai-model-policy.service';
import { AiSanitizerService } from './context/ai-sanitizer.service';
import { AiContextService } from './context/ai-context.service';
import { AiRunsService } from './usage/ai-runs.service';
import { PROMPT_REGISTRY } from './prompts/prompt-registry';
import { TodayStoryFacts } from '../insights/insights.service';
import { validateFunnelAnalysisResult } from './schemas/funnel-analysis.schema';
import { validateStoryAnalysisResult } from './schemas/story-analysis.schema';

export interface AiSummary {
  summary: string;
  model: string;
  generatedAt: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly funnels: FunnelsService,
    private readonly provider: CencoriProvider,
    private readonly modelPolicy: AiModelPolicyService,
    private readonly sanitizer: AiSanitizerService,
    private readonly contextService: AiContextService,
    private readonly aiRuns: AiRunsService,
    @Optional() private readonly projects?: ProjectsService,
    @Optional() private readonly entitlements?: EntitlementService,
    @Optional() private readonly usage?: UsageService,
    @Optional() private readonly database?: DatabaseService
  ) {}

  /**
   * Summarizes funnel drop-offs factually.
   */
  async summarizeFunnelDropOff(
    user: DashboardUser,
    funnelId: string,
    daysParam: string | undefined,
    projectId: string | undefined
  ): Promise<AiSummary> {
    let organizationId: string | null = null;
    let resolvedProjectId = projectId;

    if (this.projects) {
      const project = await this.projects.requireActiveProject(user, projectId);
      organizationId = project.organizationId;
      resolvedProjectId = project.id;
    }

    if (appConfig.deploymentMode === 'cloud') {
      if (!this.projects || !this.entitlements || !this.usage || !this.database) {
        throw new ServiceUnavailableException('Cloud AI entitlements are not configured.');
      }
    }

    const results = await this.funnels.getResults(user, funnelId, daysParam, projectId);

    const insufficientData = results.steps.length < 2 || (results.steps[0]?.count ?? 0) < 5;
    if (insufficientData) {
      return {
        summary:
          'Not enough traffic through this funnel yet for a reliable explanation — come back once more people have started it.',
        model: 'none',
        generatedAt: new Date().toISOString()
      };
    }

    const funnelData = this.contextService.buildFunnelData(results);
    const promptDef = PROMPT_REGISTRY.funnelAnalysis;
    const model = this.modelPolicy.getModelForCapability('funnel_analysis');
    const promptVersion = promptDef.version;

    // Check deterministic cache
    const cacheKey = this.contextService.computeCacheKey(
      resolvedProjectId || 'unknown',
      'funnel_analysis',
      promptVersion,
      model,
      funnelData
    );

    const cached = this.contextService.getCached(cacheKey);
    if (cached) {
      return {
        summary: cached.content,
        model: cached.model,
        generatedAt: new Date().toISOString()
      };
    }

    if (!this.modelPolicy.isAiEnabled()) {
      throw new ServiceUnavailableException('AI analysis is not configured. Set CENCORI_API_KEY on the API service.');
    }

    // Reserve cloud billing unit before model call
    if (organizationId && this.database && this.usage) {
      await this.database.transaction((client) => this.usage!.consume(client, organizationId!, 'aiInsights', 1));
    }

    const userPrompt = promptDef.buildUserPrompt(funnelData);
    const startTime = Date.now();

    try {
      const response = await this.provider.complete({
        model,
        systemPrompt: promptDef.systemPrompt,
        userPrompt,
        timeoutMs: this.modelPolicy.getTimeoutMs(),
        temperature: 0.3,
        maxTokens: 300
      });

      const generatedAt = new Date().toISOString();
      const validation = validateFunnelAnalysisResult({
        summary: response.content,
        model: response.routedModel,
        generatedAt,
        promptVersion
      });

      if (!validation.ok) {
        throw new Error(`AI generated invalid funnel analysis output: ${validation.error}`);
      }

      const summary = validation.data.summary;

      // Cache result
      this.contextService.setCached(cacheKey, summary, model, promptVersion);

      // Record audit log
      if (organizationId && resolvedProjectId) {
        await this.aiRuns.recordRun({
          organizationId,
          projectId: resolvedProjectId,
          actorUserId: user.id,
          capability: 'funnel_analysis',
          promptVersion,
          requestedModel: model,
          routedModel: response.routedModel,
          status: 'success',
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          latencyMs: response.latencyMs,
          providerRequestId: response.providerRequestId
        });
      }

      return { summary, model: response.routedModel, generatedAt };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      if (organizationId && resolvedProjectId) {
        await this.aiRuns.recordRun({
          organizationId,
          projectId: resolvedProjectId,
          actorUserId: user.id,
          capability: 'funnel_analysis',
          promptVersion,
          requestedModel: model,
          routedModel: null,
          status: 'failed',
          latencyMs,
          errorMessage: err?.message || String(err)
        });
      }
      throw err;
    }
  }

  /**
   * Generates a narrative for Today's Story based on deterministic computed facts.
   * Returns null on failure so the caller uses the deterministic template.
   */
  async generateStoryNarrative(
    project: { id: string; name: string; organizationId: string },
    facts: TodayStoryFacts,
    actorUserId = 'system'
  ): Promise<string | null> {
    if (!this.modelPolicy.isAiEnabled()) {
      return null;
    }

    const storyData = this.contextService.buildStoryData(project.name, facts);
    const promptDef = PROMPT_REGISTRY.storySummary;
    const model = this.modelPolicy.getModelForCapability('story_analysis');
    const promptVersion = promptDef.version;

    const cacheKey = this.contextService.computeCacheKey(
      project.id,
      'story_analysis',
      promptVersion,
      model,
      storyData
    );

    const cached = this.contextService.getCached(cacheKey);
    if (cached) {
      return cached.content;
    }

    const userPrompt = promptDef.buildUserPrompt(storyData);
    const startTime = Date.now();

    try {
      const response = await this.provider.complete({
        model,
        systemPrompt: promptDef.systemPrompt,
        userPrompt,
        timeoutMs: this.modelPolicy.getTimeoutMs(),
        temperature: 0.3,
        maxTokens: 250
      });

      const generatedAt = new Date().toISOString();
      const validation = validateStoryAnalysisResult({
        narrative: response.content,
        model: response.routedModel,
        generatedAt,
        promptVersion
      });

      if (!validation.ok) {
        throw new Error(`AI generated invalid story narrative output: ${validation.error}`);
      }

      const narrative = validation.data.narrative;
      this.contextService.setCached(cacheKey, narrative, model, promptVersion);

      await this.aiRuns.recordRun({
        organizationId: project.organizationId,
        projectId: project.id,
        actorUserId,
        capability: 'story_analysis',
        promptVersion,
        requestedModel: model,
        routedModel: response.routedModel,
        status: 'success',
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        latencyMs: response.latencyMs,
        providerRequestId: response.providerRequestId
      });

      return narrative;
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      this.logger.warn(`Story AI completion failed; using template fallback: ${err?.message || err}`);

      await this.aiRuns.recordRun({
        organizationId: project.organizationId,
        projectId: project.id,
        actorUserId,
        capability: 'story_analysis',
        promptVersion,
        requestedModel: model,
        routedModel: null,
        status: 'fallback',
        latencyMs,
        errorMessage: err?.message || String(err)
      });

      return null;
    }
  }

  /**
   * Safe completion wrapper for legacy/ad-hoc callers.
   */
  async completeSafely(userPrompt: string): Promise<string | null> {
    if (!this.modelPolicy.isAiEnabled()) {
      return null;
    }

    const model = this.modelPolicy.getFastModel();
    try {
      const response = await this.provider.complete({
        model,
        systemPrompt: 'You are a product analytics assistant embedded in the TraceIQ dashboard. Be concise and factual.',
        userPrompt: this.sanitizer.sanitizeText(userPrompt),
        timeoutMs: this.modelPolicy.getTimeoutMs(),
        temperature: 0.3,
        maxTokens: 250
      });
      return response.content;
    } catch (err: any) {
      this.logger.warn(`AI completion unavailable: ${err?.message || err}`);
      return null;
    }
  }
}
