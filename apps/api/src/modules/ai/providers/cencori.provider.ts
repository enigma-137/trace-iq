import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Cencori } from 'cencori';
import { AiCompletionOptions, AiCompletionResponse, AiProvider } from './ai-provider.interface';

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

        const response = await this.withTimeout(completionPromise, timeoutMs);
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
          inputTokens: response.usage?.prompt_tokens,
          outputTokens: response.usage?.completion_tokens,
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
