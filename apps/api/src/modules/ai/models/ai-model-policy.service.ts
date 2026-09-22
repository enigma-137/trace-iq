import { Injectable } from '@nestjs/common';

export type AiCapability = 'funnel_analysis' | 'story_analysis' | 'assistant' | 'alert_investigation';

@Injectable()
export class AiModelPolicyService {
  private readonly defaultFastModel = 'gpt-4o-mini';
  private readonly defaultReasoningModel = 'gpt-4o';
  private readonly defaultTimeoutMs = 15_000;

  isAiEnabled(): boolean {
    if (process.env.TRACEIQ_AI_ENABLED === 'false') {
      return false;
    }
    return Boolean(process.env.CENCORI_API_KEY?.trim());
  }

  getFastModel(): string {
    const configured = process.env.TRACEIQ_AI_FAST_MODEL?.trim();
    return configured || this.defaultFastModel;
  }

  getReasoningModel(): string {
    const configured = process.env.TRACEIQ_AI_REASONING_MODEL?.trim();
    return configured || this.defaultReasoningModel;
  }

  getModelForCapability(capability: AiCapability): string {
    switch (capability) {
      case 'funnel_analysis':
      case 'story_analysis':
        return this.getFastModel();
      case 'assistant':
      case 'alert_investigation':
        return this.getReasoningModel();
      default:
        return this.getFastModel();
    }
  }

  getTimeoutMs(): number {
    const parsed = Number(process.env.TRACEIQ_AI_TIMEOUT_MS);
    if (Number.isFinite(parsed) && parsed >= 1_000 && parsed <= 120_000) {
      return parsed;
    }
    return this.defaultTimeoutMs;
  }
}
