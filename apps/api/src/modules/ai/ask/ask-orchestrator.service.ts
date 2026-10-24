import { Injectable, Logger, RequestTimeoutException } from '@nestjs/common';
import { CencoriProvider } from '../providers/cencori.provider';
import { AiModelPolicyService } from '../models/ai-model-policy.service';
import { AiRunsService } from '../usage/ai-runs.service';
import { ToolRegistryService } from '../tools/tool-registry.service';
import { EvidenceItem, ToolExecutionContext } from '../tools/tool.interface';
import { PROMPT_REGISTRY } from '../prompts/prompt-registry';
import { AiChatMessage } from '../providers/ai-provider.interface';
import { FindingItem } from './conversation.service';

export interface OrchestrationOptions {
  investigationId: string;
  context: ToolExecutionContext;
  question: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  attachedContext?: {
    surface?: string;
    entityId?: string;
    filters?: Record<string, unknown>;
  };
  onProgress?: (event: { step: string; tool?: string; status: 'running' | 'completed' | 'failed' }) => void;
}

export interface OrchestrationResult {
  answer: string;
  evidence: EvidenceItem[];
  findings: FindingItem[];
  suggestedFollowups: string[];
  toolCallsCount: number;
  model: string;
}

const MAX_TOOL_CALLS = 8;
const MAX_TOOL_ROUNDS = 3;
const MAX_PER_TOOL_BYTES = 32_768; // 32 KB per tool result
const MAX_AGGREGATE_TOOL_BYTES = 65_536; // 64 KB total tool data across all rounds
const TOTAL_INVESTIGATION_TIMEOUT_MS = 60_000; // 60s total wall-clock timeout

@Injectable()
export class AskOrchestratorService {
  private readonly logger = new Logger(AskOrchestratorService.name);

  constructor(
    private readonly provider: CencoriProvider,
    private readonly modelPolicy: AiModelPolicyService,
    private readonly aiRuns: AiRunsService,
    private readonly toolRegistry: ToolRegistryService
  ) {}

  async runInvestigation(options: OrchestrationOptions): Promise<OrchestrationResult> {
    const deadlinePromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new RequestTimeoutException('Ask TraceIQ investigation timed out (exceeded 60s deadline).'));
      }, TOTAL_INVESTIGATION_TIMEOUT_MS);
    });

    return Promise.race([
      this.executeInvestigation(options),
      deadlinePromise
    ]);
  }

  private async executeInvestigation(options: OrchestrationOptions): Promise<OrchestrationResult> {
    const { investigationId, context, question, conversationHistory = [], attachedContext, onProgress } = options;
    const model = this.modelPolicy.getModelForCapability('assistant');
    const promptDef = PROMPT_REGISTRY.askTraceIq;
    const promptVersion = promptDef.version;

    const toolDefinitions = this.toolRegistry.getToolDefinitionsForAi();
    const collectedEvidence: EvidenceItem[] = [];
    let totalToolCalls = 0;
    let totalToolDataBytes = 0;

    // Construct message history
    const messages: AiChatMessage[] = [
      { role: 'system', content: promptDef.systemPrompt }
    ];

    // If there is contextual attachment, provide it as a system note
    if (attachedContext && (attachedContext.surface || attachedContext.entityId)) {
      messages.push({
        role: 'system',
        content: `User is currently viewing surface: "${attachedContext.surface || 'dashboard'}" with entityId: "${attachedContext.entityId || 'none'}" and filters: ${JSON.stringify(attachedContext.filters || {})}. Relevant tools should be used to inspect this context first if related to the question.`
      });
    }

    // Add previous conversation turns (bounded to recent 6 turns, max 8KB text)
    const recentHistory = conversationHistory.slice(-6);
    for (const msg of recentHistory) {
      const boundedContent = (msg.content || '').slice(0, 2000);
      messages.push({ role: msg.role, content: boundedContent });
    }

    // Add current user question (bounded to 2000 chars)
    messages.push({ role: 'user', content: question.slice(0, 2000) });

    let finalContent = '';
    let lastRoutedModel = model;

    // Bounded Tool Calling Loop
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      if (totalToolCalls >= MAX_TOOL_CALLS) {
        this.logger.warn(`Investigation ${investigationId} hit max tool calls limit (${MAX_TOOL_CALLS})`);
        break;
      }

      onProgress?.({
        step: round === 0 ? 'Analyzing query and selecting tools' : 'Synthesizing evidence',
        status: 'running'
      });

      const startTime = Date.now();
      let response;
      try {
        response = await this.provider.chat({
          model,
          messages,
          tools: totalToolCalls < MAX_TOOL_CALLS ? toolDefinitions : undefined,
          temperature: 0.2,
          maxTokens: 1000,
          timeoutMs: 25_000
        });
      } catch (err: any) {
        await this.aiRuns.recordRun({
          organizationId: context.organizationId,
          projectId: context.projectId,
          actorUserId: context.user.id,
          capability: 'assistant',
          promptVersion,
          requestedModel: model,
          routedModel: null,
          status: 'failed',
          latencyMs: Date.now() - startTime,
          errorMessage: err?.message || String(err),
          investigationId
        });
        throw err;
      }

      lastRoutedModel = response.routedModel;

      await this.aiRuns.recordRun({
        organizationId: context.organizationId,
        projectId: context.projectId,
        actorUserId: context.user.id,
        capability: 'assistant',
        promptVersion,
        requestedModel: model,
        routedModel: response.routedModel,
        status: 'success',
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        latencyMs: response.latencyMs,
        providerRequestId: response.providerRequestId,
        investigationId
      });

      // Check if model requested tool calls
      if (response.toolCalls && response.toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: response.content || '',
          tool_calls: response.toolCalls
        });

        for (const toolCall of response.toolCalls) {
          if (totalToolCalls >= MAX_TOOL_CALLS) break;
          totalToolCalls += 1;

          const toolName = toolCall.function.name;
          onProgress?.({
            step: `Inspecting ${toolName.replace(/^get_|^list_/, '').replace(/_/g, ' ')}`,
            tool: toolName,
            status: 'running'
          });

          // Always enforce authoritative tenancy context (ignoring hallucinated model arguments)
          const executionResult = await this.toolRegistry.executeTool(
            toolName,
            context,
            toolCall.function.arguments
          );

          if (executionResult.evidence && executionResult.evidence.length > 0) {
            collectedEvidence.push(...executionResult.evidence);
          }

          let stringifiedData = JSON.stringify(executionResult.data ?? { summary: executionResult.summary });

          // Per-tool truncation
          if (stringifiedData.length > MAX_PER_TOOL_BYTES) {
            stringifiedData = stringifiedData.slice(0, MAX_PER_TOOL_BYTES) + '… [Truncated]';
          }

          // Aggregate tool data budget check
          totalToolDataBytes += stringifiedData.length;
          if (totalToolDataBytes > MAX_AGGREGATE_TOOL_BYTES) {
            stringifiedData = stringifiedData.slice(0, 1000) + '… [Aggregate Context Budget Reached]';
          }

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: stringifiedData
          });

          onProgress?.({
            step: executionResult.summary,
            tool: toolName,
            status: executionResult.success ? 'completed' : 'failed'
          });
        }
      } else {
        // Final response achieved
        finalContent = response.content;
        break;
      }
    }

    // Final synthesis call if needed
    if (!finalContent) {
      onProgress?.({ step: 'Finalizing investigation findings', status: 'running' });
      const finalResponse = await this.provider.chat({
        model,
        messages,
        temperature: 0.2,
        maxTokens: 1000,
        timeoutMs: 20_000
      });

      lastRoutedModel = finalResponse.routedModel;
      finalContent = finalResponse.content;

      await this.aiRuns.recordRun({
        organizationId: context.organizationId,
        projectId: context.projectId,
        actorUserId: context.user.id,
        capability: 'assistant',
        promptVersion,
        requestedModel: model,
        routedModel: finalResponse.routedModel,
        status: 'success',
        inputTokens: finalResponse.inputTokens,
        outputTokens: finalResponse.outputTokens,
        latencyMs: finalResponse.latencyMs,
        providerRequestId: finalResponse.providerRequestId,
        investigationId
      });
    }

    // Parse suggested follow-up questions
    const { cleanAnswer, suggestedFollowups } = this.extractFollowups(finalContent);

    // Deduplicate collected evidence items by id and type
    const uniqueEvidence = this.deduplicateEvidence(collectedEvidence);

    // Extract structured findings for grounded evidence validation
    const findings = this.extractFindings(cleanAnswer, uniqueEvidence);

    return {
      answer: cleanAnswer,
      evidence: uniqueEvidence,
      findings,
      suggestedFollowups,
      toolCallsCount: totalToolCalls,
      model: lastRoutedModel
    };
  }

  private extractFollowups(content: string): { cleanAnswer: string; suggestedFollowups: string[] } {
    const followupsMatch = content.match(/SUGGESTED_QUESTIONS:\s*([\s\S]*)$/i);
    if (!followupsMatch) {
      return { cleanAnswer: content.trim(), suggestedFollowups: [] };
    }

    const cleanAnswer = content.replace(/SUGGESTED_QUESTIONS:\s*[\s\S]*$/i, '').trim();
    const rawList = followupsMatch[1] || '';
    const suggestedFollowups = rawList
      .split('\n')
      .map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim())
      .filter((line) => line.length > 3 && line.length < 150)
      .slice(0, 4);

    return { cleanAnswer, suggestedFollowups };
  }

  private extractFindings(answer: string, evidence: EvidenceItem[]): FindingItem[] {
    const findings: FindingItem[] = [];
    const lines = answer.split('\n');
    const evidenceIds = evidence.map((e) => e.id);

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^[-*•]?\s*OBSERVED[:\s]/i.test(trimmed)) {
        findings.push({
          classification: 'observed',
          statement: trimmed.replace(/^[-*•]?\s*OBSERVED[:\s]*/i, '').trim(),
          evidenceIds: evidenceIds.slice(0, 2)
        });
      } else if (/^[-*•]?\s*CORRELATED[:\s]/i.test(trimmed)) {
        findings.push({
          classification: 'correlated',
          statement: trimmed.replace(/^[-*•]?\s*CORRELATED[:\s]*/i, '').trim(),
          evidenceIds: evidenceIds.slice(0, 2)
        });
      } else if (/^[-*•]?\s*HYPOTHESIS[:\s]/i.test(trimmed)) {
        findings.push({
          classification: 'hypothesis',
          statement: trimmed.replace(/^[-*•]?\s*HYPOTHESIS[:\s]*/i, '').trim(),
          evidenceIds: []
        });
      }
    }

    return findings;
  }

  private deduplicateEvidence(evidence: EvidenceItem[]): EvidenceItem[] {
    const seen = new Set<string>();
    const result: EvidenceItem[] = [];
    for (const item of evidence) {
      const key = `${item.type}:${item.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    }
    return result.slice(0, 8);
  }
}

