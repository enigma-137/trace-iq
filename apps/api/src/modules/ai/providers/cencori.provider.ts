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
      throw new ServiceUnavailableException('AI gateway is not configured. Set CENCORI_API_KEY on the API service.');
    }

    if (!this.client || this.initializedKey !== currentKey) {
      this.client = new Cencori({ apiKey: currentKey });
      this.initializedKey = currentKey;
    }

    return this.client;
  }

  async complete(options: AiCompletionOptions): Promise<AiCompletionResponse> {
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
          model: options.model,
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

        const routedModel = response.model || options.model;

        return {
          content,
          requestedModel: options.model,
          routedModel,
          inputTokens: response.usage?.prompt_tokens ?? response.usage?.promptTokens,
          outputTokens: response.usage?.completion_tokens ?? response.usage?.completionTokens,
          providerRequestId: response.id,
          latencyMs
        };
      } catch (err: any) {
        lastError = err;
        const statusCode = err?.statusCode || err?.status;
        const isTransient = statusCode === 429 || (statusCode >= 500 && statusCode < 600) || err?.message?.includes('timeout');

        this.logger.warn(`Cencori completion attempt ${attempt + 1}/${maxRetries + 1} failed: ${err?.message || err}`);

        if (!isTransient || attempt === maxRetries) {
          break;
        }
      }
    }

    const elapsed = Date.now() - overallStart;
    this.logger.error(`All Cencori completion attempts failed after ${elapsed}ms: ${lastError instanceof Error ? lastError.stack : lastError}`);
    throw new ServiceUnavailableException('AI analysis is temporarily unavailable. Try again shortly.');
  }

  async chat(options: AiChatOptions): Promise<AiChatResponse> {
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
          model: options.model,
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

        const routedModel = response.model || options.model;
        const finishReason = choice?.finish_reason || response.finishReason || (toolCalls.length > 0 ? 'tool_calls' : 'stop');

        return {
          content,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          finishReason,
          requestedModel: options.model,
          routedModel,
          inputTokens: response.usage?.prompt_tokens ?? response.usage?.promptTokens,
          outputTokens: response.usage?.completion_tokens ?? response.usage?.completionTokens,
          providerRequestId: response.id,
          latencyMs
        };
      } catch (err: any) {
        lastError = err;
        const statusCode = err?.statusCode || err?.status;
        const isTransient = statusCode === 429 || (statusCode >= 500 && statusCode < 600) || err?.message?.includes('timeout');

        this.logger.warn(`Cencori chat attempt ${attempt + 1}/${maxRetries + 1} failed: ${err?.message || err}`);

        if (!isTransient || attempt === maxRetries) {
          break;
        }
      }
    }

    const elapsed = Date.now() - overallStart;
    this.logger.error(`All Cencori chat attempts failed after ${elapsed}ms: ${lastError instanceof Error ? lastError.stack : lastError}`);
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
