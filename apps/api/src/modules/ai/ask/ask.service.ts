import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException
} from '@nestjs/common';
import { DashboardUser } from '../../auth/auth.service';
import { ProjectsService } from '../../projects/projects.service';
import { EntitlementService } from '../../billing/entitlement.service';
import { UsageService } from '../../billing/usage.service';
import { DatabaseService } from '../../../database/database.service';
import { appConfig } from '../../../config/app.config';
import { AskOrchestratorService } from './ask-orchestrator.service';
import { ConversationService, FindingItem } from './conversation.service';
import { EvidenceItem } from '../tools/tool.interface';
import { AiModelPolicyService } from '../models/ai-model-policy.service';

export interface AskTraceIQRequest {
  question: string;
  conversationId?: string;
  investigationId?: string;
  idempotencyKey?: string;
  clientRequestId?: string;
  projectId?: string;
  surface?: string;
  contextType?: string;
  contextId?: string;
  filters?: Record<string, unknown>;
  source?: string;
}

export interface AskTraceIQResponse {
  conversationId: string;
  investigationId: string;
  answer: string;
  evidence: EvidenceItem[];
  findings?: FindingItem[];
  suggestedFollowups: string[];
  usageCharged: boolean;
  model: string;
}

export interface QuotaStatus {
  plan: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  isExhausted: boolean;
}

@Injectable()
export class AskService {
  private readonly logger = new Logger(AskService.name);

  constructor(
    private readonly orchestrator: AskOrchestratorService,
    private readonly conversations: ConversationService,
    private readonly modelPolicy: AiModelPolicyService,
    @Optional() private readonly projects?: ProjectsService,
    @Optional() private readonly entitlements?: EntitlementService,
    @Optional() private readonly usage?: UsageService,
    @Optional() private readonly database?: DatabaseService
  ) {}

  async ask(
    user: DashboardUser,
    request: AskTraceIQRequest,
    onProgress?: (event: { step: string; tool?: string; status: 'running' | 'completed' | 'failed' }) => void
  ): Promise<AskTraceIQResponse> {
    const question = request.question?.trim();
    if (!question) {
      throw new BadRequestException('Question is required.');
    }

    if (!this.modelPolicy.isAiEnabled()) {
      throw new ServiceUnavailableException('Ask TraceIQ is not configured. Set CENCORI_API_KEY on the API service.');
    }

    let organizationId = 'default_org';
    let projectId = request.projectId || 'default_project';

    if (this.projects) {
      const project = await this.projects.requireActiveProject(user, request.projectId);
      organizationId = project.organizationId;
      projectId = project.id;
    }

    // 1. Idempotency Replay Check (prevent duplicate model runs and duplicate billing)
    const idempotencyKey = request.idempotencyKey || request.clientRequestId;
    if (idempotencyKey) {
      const existing = await this.conversations.getInvestigationByIdempotencyKey(organizationId, projectId, idempotencyKey);
      if (existing && existing.status === 'completed') {
        const messages = await this.conversations.getConversationMessages(existing.conversationId || '', organizationId, projectId);
        const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');
        return {
          conversationId: existing.conversationId || '',
          investigationId: existing.id,
          answer: lastAssistantMsg?.content || 'Completed investigation.',
          evidence: existing.evidence,
          findings: existing.findings,
          suggestedFollowups: existing.suggestedFollowups,
          usageCharged: existing.usageCharged,
          model: 'cached'
        };
      }
    }

    // 2. Resolve / Create Conversation (strictly scoped to user, org, and project)
    const conversation = await this.conversations.getOrCreateConversation({
      conversationId: request.conversationId,
      organizationId,
      projectId,
      userId: user.id,
      title: question.slice(0, 60),
      source: request.source || 'dashboard'
    });

    // 3. Pin Usage Period (e.g. '2026-09') to prevent month-boundary double/free charges
    const usagePeriod = new Date().toISOString().slice(0, 7);

    // 4. Create Logical Investigation Record
    const investigation = await this.conversations.createInvestigation({
      investigationId: request.investigationId,
      organizationId,
      projectId,
      conversationId: conversation.id,
      actorUserId: user.id,
      surface: request.surface || 'global',
      contextType: request.contextType,
      contextId: request.contextId,
      question,
      usagePeriod,
      idempotencyKey
    });

    // If another concurrent request with the same idempotency key already created/claimed this investigation
    if (investigation.quotaReserved || investigation.usageCharged || investigation.status === 'completed' || (idempotencyKey && investigation.actorUserId !== user.id)) {
      let attempts = 0;
      while (attempts < 60) {
        const current = await this.conversations.getInvestigation(investigation.id, organizationId, projectId);
        if (current && current.status !== 'running') {
          const messages = await this.conversations.getConversationMessages(current.conversationId || '', organizationId, projectId);
          const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');
          return {
            conversationId: current.conversationId || '',
            investigationId: current.id,
            answer: lastAssistantMsg?.content || 'Completed investigation.',
            evidence: current.evidence,
            findings: current.findings,
            suggestedFollowups: current.suggestedFollowups,
            usageCharged: current.usageCharged,
            model: 'cached'
          };
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        attempts++;
      }
    }

    // 5. Atomic Quota Reservation (Before Expensive AI Generation)
    if (this.database && this.usage) {
      await this.database.transaction(async (client) => {
        await this.usage!.reserveAskInvestigation(client, organizationId, investigation.id, usagePeriod, 1);
      });
    }

    // 6. Record User Message
    await this.conversations.recordMessage({
      conversationId: conversation.id,
      investigationId: investigation.id,
      role: 'user',
      content: question
    });

    // 7. Validate & Sanitize Context Entity Authorization (prevent foreign context injection)
    const sanitizedAttachedContext = await this.validateAttachedContext(
      projectId,
      request.surface,
      request.contextId,
      request.filters
    );

    // 8. Load Recent Conversation History for Context (bounded to recent 6 messages)
    const existingMessages = await this.conversations.getConversationMessages(conversation.id, organizationId, projectId);
    const history = existingMessages
      .filter((m) => m.id !== undefined && m.content)
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));

    const toolContext = {
      user,
      organizationId,
      projectId
    };

    // 9. Execute Investigation via Orchestrator (Outside Database Transaction)
    let result;
    try {
      result = await this.orchestrator.runInvestigation({
        investigationId: investigation.id,
        context: toolContext,
        question,
        conversationHistory: history,
        attachedContext: sanitizedAttachedContext,
        onProgress
      });
    } catch (err: any) {
      // Release reservation on failure/timeout — ZERO QUOTA CHARGE
      if (this.database && this.usage) {
        try {
          await this.database.transaction(async (client) => {
            await this.usage!.releaseAskInvestigation(client, organizationId, investigation.id);
          });
        } catch (releaseErr) {
          this.logger.error(`Failed to release quota reservation for ${investigation.id}: ${releaseErr}`);
        }
      }

      await this.conversations.updateInvestigation(investigation.id, {
        status: err?.name === 'RequestTimeoutException' ? 'timed_out' : 'failed',
        usageCharged: false,
        quotaReserved: false,
        completedAt: new Date()
      });
      throw err;
    }

    // 10. Atomic Quota Conversion to Consumed (Exactly-Once Charge on Success)
    let usageCharged = false;
    if (this.database && this.usage) {
      try {
        await this.database.transaction(async (client) => {
          await this.usage!.chargeAskInvestigation(client, organizationId, investigation.id, usagePeriod, 1);
        });
        usageCharged = true;
      } catch (err: any) {
        this.logger.error(`Quota conversion to consumed failed for ${investigation.id}: ${err?.message || err}`);
      }
    } else {
      usageCharged = true;
    }

    // 11. Update Investigation as Completed
    await this.conversations.updateInvestigation(investigation.id, {
      status: 'completed',
      usageCharged,
      quotaReserved: false,
      toolCallsCount: result.toolCallsCount,
      evidence: result.evidence,
      findings: result.findings,
      suggestedFollowups: result.suggestedFollowups,
      completedAt: new Date()
    });

    // 12. Record Assistant Message in DB (Persisting sanitized evidence)
    await this.conversations.recordMessage({
      conversationId: conversation.id,
      investigationId: investigation.id,
      role: 'assistant',
      content: result.answer,
      evidence: result.evidence,
      suggestedFollowups: result.suggestedFollowups
    });

    return {
      conversationId: conversation.id,
      investigationId: investigation.id,
      answer: result.answer,
      evidence: result.evidence,
      findings: result.findings,
      suggestedFollowups: result.suggestedFollowups,
      usageCharged,
      model: result.model
    };
  }

  /**
   * Validates that context supplied by client actually exists in the active project.
   */
  private async validateAttachedContext(
    projectId: string,
    surface?: string,
    contextId?: string,
    filters?: Record<string, unknown>
  ): Promise<{ surface?: string; entityId?: string; filters?: Record<string, unknown> } | undefined> {
    if (!surface && !contextId) return undefined;

    let validEntityId = contextId;
    if (contextId && this.database) {
      try {
        if (surface === 'funnels') {
          const res = await this.database.query(`SELECT id FROM funnels WHERE id = $1 AND project_id = $2`, [contextId, projectId]);
          if (res.rows.length === 0) validEntityId = undefined;
        } else if (surface === 'flags') {
          const res = await this.database.query(`SELECT id FROM feature_flags WHERE (id = $1 OR key = $1) AND project_id = $2`, [contextId, projectId]);
          if (res.rows.length === 0) validEntityId = undefined;
        } else if (surface === 'webhooks') {
          const res = await this.database.query(`SELECT id FROM webhook_endpoints WHERE id = $1 AND project_id = $2`, [contextId, projectId]);
          if (res.rows.length === 0) validEntityId = undefined;
        }
      } catch {
        // In case of non-blocking check error, keep surface only
      }
    }

    return {
      surface: surface || 'dashboard',
      entityId: validEntityId,
      filters: filters || {}
    };
  }

  async getQuotaStatus(user: DashboardUser, projectId?: string): Promise<QuotaStatus> {
    if (appConfig.deploymentMode === 'self_hosted' || !this.entitlements) {
      return {
        plan: 'self_hosted',
        used: 0,
        limit: null,
        remaining: null,
        isExhausted: false
      };
    }

    let organizationId = 'default_org';
    if (this.projects) {
      const project = await this.projects.requireActiveProject(user, projectId);
      organizationId = project.organizationId;
    }

    const snapshot = await this.entitlements.getSnapshot(organizationId);
    const limit = snapshot.limits.aiInsights;
    const used = snapshot.usage.aiInsights;
    const remaining = limit !== null ? Math.max(0, limit - used) : null;
    const isExhausted = limit !== null && used >= limit;

    return {
      plan: snapshot.plan,
      used,
      limit,
      remaining,
      isExhausted
    };
  }

  async listConversations(user: DashboardUser, projectId?: string) {
    let resolvedProjectId = projectId || 'default_project';
    let organizationId = 'default_org';
    if (this.projects) {
      const project = await this.projects.requireActiveProject(user, projectId);
      resolvedProjectId = project.id;
      organizationId = project.organizationId;
    }
    return this.conversations.listConversations(organizationId, resolvedProjectId);
  }

  async getConversation(user: DashboardUser, conversationId: string, projectId?: string) {
    let resolvedProjectId = projectId || 'default_project';
    let organizationId = 'default_org';
    if (this.projects) {
      const project = await this.projects.requireActiveProject(user, projectId);
      resolvedProjectId = project.id;
      organizationId = project.organizationId;
    }
    return this.conversations.getConversationMessages(conversationId, organizationId, resolvedProjectId);
  }
}

