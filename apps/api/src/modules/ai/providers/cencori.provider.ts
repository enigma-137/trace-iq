import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Cencori } from 'cencori';
import {
  AiChatOptions,
  AiChatResponse,
  AiCompletionOptions,
  AiCompletionResponse,
  AiProvider,
  AiToolCall
} from './ai-provider.interface';

export type AiErrorClassification =
  | 'missing_model'
  | 'unsupported_model'
  | 'provider_not_configured'
  | 'upstream_5xx'
  | 'rate_limited'
  | 'timeout'
  | 'invalid_response';

export interface ClassifiedAiError {
  classification: AiErrorClassification;
  statusCode?: number;
  providerError: string;
  isTransient: boolean;
}

export function classifyCencoriError(err: any, model?: string): ClassifiedAiError {
  if (!model || !model.trim() || model === 'unknown') {
    return {
      classification: 'missing_model',
      statusCode: 400,
      providerError: 'No valid AI model specified in request payload.',
      isTransient: false
    };
  }

  const rawStatus = err?.statusCode || err?.status;
  const statusCode = typeof rawStatus === 'number' ? rawStatus : undefined;
  const msg = (err?.message || '').toLowerCase();
  const errorCode = (err?.code || '').toLowerCase();

  // Credit exhausted, quota exceeded, or 429 rate limit
  if (
    statusCode === 429 ||
    statusCode === 403 ||
    msg.includes('credit balance exhausted') ||
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    errorCode.includes('credit_balance_exhausted') ||
    errorCode.includes('rate_limit')
  ) {
    return {
      classification: 'rate_limited',
      statusCode: statusCode || 429,
      providerError: err?.message || 'Rate limit or AI credit balance reached.',
      isTransient: statusCode === 429
    };
  }

  // Unsupported or unknown model
  if (
    statusCode === 404 ||
    (statusCode === 400 && (msg.includes('model') || msg.includes('not found') || msg.includes('unsupported')))
  ) {
    return {
      classification: 'unsupported_model',
      statusCode: statusCode || 400,
      providerError: err?.message || `Model '${model}' is unsupported or unavailable on provider.`,
      isTransient: false
    };
  }

  // Timeout
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return {
      classification: 'timeout',
      statusCode: 504,
      providerError: 'AI provider request timed out.',
      isTransient: true
    };
  }

  // Upstream 5xx
  if (statusCode && statusCode >= 500 && statusCode < 600) {
    return {
      classification: 'upstream_5xx',
      statusCode,
      providerError: err?.message || 'AI provider upstream error.',
      isTransient: true
    };
  }

  return {
    classification: 'upstream_5xx',
    statusCode: statusCode || 500,
    providerError: err?.message || 'Unknown provider error',
    isTransient: false
  };
}

@Injectable()
export class CencoriProvider implements AiProvider {
  readonly name = 'cencori';
  private readonly logger = new Logger(CencoriProvider.name);
  private client: Cencori | null = null;
  private initializedKey: string | null = null;

  isConfigured(): boolean {
    return Boolean(process.env.CENCORI_API_KEY?.trim());
  }

  private getClient(): Cencori {
    const currentKey = process.env.CENCORI_API_KEY?.trim() || null;
    if (!currentKey) {
      this.logger.error('[AI_ERROR:provider_not_configured] CENCORI_API_KEY is not configured on the API service.');
      throw new ServiceUnavailableException('AI gateway is not configured. Set CENCORI_API_KEY on the API service.');
    }

    if (!this.client || this.initializedKey !== currentKey) {
      this.client = new Cencori({ apiKey: currentKey });
      this.initializedKey = currentKey;
    }

    return this.client;
  }

  async complete(options: AiCompletionOptions): Promise<AiCompletionResponse> {
    const effectiveModel = options.model?.trim() || 'gemini-2.5-flash-lite';
    if (!effectiveModel || effectiveModel === 'unknown') {
      this.logger.error('[AI_ERROR:missing_model] Outbound completion payload missing valid model identifier.');
      throw new ServiceUnavailableException('AI analysis is temporarily unavailable. Try again shortly.');
    }

    const client = this.getClient();
    const timeoutMs = options.timeoutMs ?? 15_000;
    const maxRetries = 2;

    let lastError: unknown = null;
    const overallStart = Date.now();

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (attempt > 0) {
        const backoffMs = attempt * 1000;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }

      try {
        const start = Date.now();
        const completionPromise = client.chat.completions.create({
          model: effectiveModel,
          temperature: options.temperature ?? 0.3,
          max_tokens: options.maxTokens ?? 300,
          messages: [
            { role: 'system', content: options.systemPrompt },
            { role: 'user', content: options.userPrompt }
          ]
        });

        const response: any = await this.withTimeout(completionPromise, timeoutMs);
        const latencyMs = Date.now() - start;

        const content = response.choices?.[0]?.message?.content?.trim();
        if (!content) {
          throw new Error('AI gateway returned an empty completion response.');
        }

        const routedModel = response.model || effectiveModel;

        return {
          content,
          requestedModel: effectiveModel,
          routedModel,
          inputTokens: response.usage?.prompt_tokens ?? response.usage?.promptTokens,
          outputTokens: response.usage?.completion_tokens ?? response.usage?.completionTokens,
          providerRequestId: response.id,
          latencyMs
        };
      } catch (err: any) {
        lastError = err;
        const classified = classifyCencoriError(err, effectiveModel);
        this.logger.warn(
          `Cencori completion attempt ${attempt + 1}/${maxRetries + 1} failed [${classified.classification}] (status=${classified.statusCode}): ${err?.message || err}`
        );

        if (!classified.isTransient || attempt === maxRetries) {
          break;
        }
      }
    }

    const finalClassified = classifyCencoriError(lastError, effectiveModel);
    const elapsed = Date.now() - overallStart;
    this.logger.error(
      `All Cencori completion attempts failed after ${elapsed}ms [${finalClassified.classification}] (status=${finalClassified.statusCode}): ${lastError instanceof Error ? lastError.stack : lastError}`
    );
    throw new ServiceUnavailableException('AI analysis is temporarily unavailable. Try again shortly.');
  }

  async chat(options: AiChatOptions): Promise<AiChatResponse> {
    const effectiveModel = options.model?.trim() || 'gemini-2.5-flash-lite';
    if (!effectiveModel || effectiveModel === 'unknown') {
      this.logger.error('[AI_ERROR:missing_model] Outbound chat payload missing valid model identifier.');
      throw new ServiceUnavailableException('Ask TraceIQ is temporarily unavailable. Try again shortly.');
    }

    const client = this.getClient();
    const timeoutMs = options.timeoutMs ?? 25_000;
    const maxRetries = 2;

    let lastError: unknown = null;
    const overallStart = Date.now();

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (attempt > 0) {
        const backoffMs = attempt * 1000;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }

      try {
        const start = Date.now();
        const requestPayload: any = {
          model: effectiveModel,
          temperature: options.temperature ?? 0.3,
          max_tokens: options.maxTokens ?? 1000,
          messages: options.messages.map((msg) => {
            const raw: any = { role: msg.role, content: msg.content ?? '' };
            if (msg.tool_call_id) raw.tool_call_id = msg.tool_call_id;
            if (msg.tool_calls) raw.tool_calls = msg.tool_calls;
            return raw;
          })
        };

        if (options.tools && options.tools.length > 0) {
          requestPayload.tools = options.tools;
        }

        const completionPromise = client.chat.completions.create(requestPayload);
        const response: any = await this.withTimeout(completionPromise, timeoutMs);
        const latencyMs = Date.now() - start;

        const choice = response.choices?.[0];
        const message = choice?.message;
        const rawContent = message?.content ?? response.content ?? '';
        const content = typeof rawContent === 'string' ? rawContent.trim() : JSON.stringify(rawContent);

        // Normalize tool calls from either choice message or top-level
        const rawToolCalls = message?.tool_calls ?? response.toolCalls ?? [];
        const toolCalls: AiToolCall[] = rawToolCalls.map((tc: any) => ({
          id: tc.id || `call_${Math.random().toString(36).slice(2, 9)}`,
          type: 'function',
          function: {
            name: tc.function?.name || tc.name,
            arguments: typeof tc.function?.arguments === 'string'
              ? tc.function.arguments
              : JSON.stringify(tc.function?.arguments ?? tc.arguments ?? {})
          }
        }));

        const routedModel = response.model || effectiveModel;
        const finishReason = choice?.finish_reason || response.finishReason || (toolCalls.length > 0 ? 'tool_calls' : 'stop');

        return {
          content,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          finishReason,
          requestedModel: effectiveModel,
          routedModel,
          inputTokens: response.usage?.prompt_tokens ?? response.usage?.promptTokens,
          outputTokens: response.usage?.completion_tokens ?? response.usage?.completionTokens,
          providerRequestId: response.id,
          latencyMs
        };
      } catch (err: any) {
        lastError = err;
        const classified = classifyCencoriError(err, effectiveModel);
        this.logger.warn(
          `Cencori chat attempt ${attempt + 1}/${maxRetries + 1} failed [${classified.classification}] (status=${classified.statusCode}): ${err?.message || err}`
        );

        if (!classified.isTransient || attempt === maxRetries) {
          break;
        }
      }
    }

    const finalClassified = classifyCencoriError(lastError, effectiveModel);
    const elapsed = Date.now() - overallStart;
    this.logger.error(
      `All Cencori chat attempts failed after ${elapsed}ms [${finalClassified.classification}] (status=${finalClassified.statusCode}): ${lastError instanceof Error ? lastError.stack : lastError}`
    );
    throw new ServiceUnavailableException('Ask TraceIQ is temporarily unavailable. Try again shortly.');
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`AI completion request timed out after ${ms}ms`)), ms);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timer!);
    }
  }
}
