import { Injectable } from '@nestjs/common';

export type AiCapability = 'funnel_analysis' | 'story_analysis' | 'assistant' | 'alert_investigation';

@Injectable()
export class AiModelPolicyService {
  private readonly defaultFastModel = 'gemini-2.5-flash-lite';
  private readonly defaultReasoningModel = 'gemini-2.5-flash-lite';
  private readonly defaultTimeoutMs = 15_000;

  isAiEnabled(): boolean {
    if (process.env.TRACEIQ_AI_ENABLED === 'false') {
      return false;
    }
    return Boolean(process.env.CENCORI_API_KEY?.trim());
  }

  getFastModel(): string {
    const configured =
      process.env.TRACEIQ_AI_FAST_MODEL?.trim() ||
      process.env.AI_MODEL?.trim() ||
      process.env.CENCORI_MODEL?.trim();
    if (configured && configured !== 'unknown') {
      return configured;
    }
    return this.defaultFastModel;
  }

  getReasoningModel(): string {
    const configured =
      process.env.TRACEIQ_AI_REASONING_MODEL?.trim() ||
      process.env.AI_MODEL?.trim() ||
      process.env.CENCORI_MODEL?.trim();
    if (configured && configured !== 'unknown') {
      return configured;
    }
    return this.defaultReasoningModel;
  }

  getModelForCapability(capability: AiCapability): string {
    let resolved: string;
    switch (capability) {
      case 'funnel_analysis':
      case 'story_analysis':
        resolved = this.getFastModel();
        break;
      case 'assistant':
      case 'alert_investigation':
        resolved = this.getReasoningModel();
        break;
      default:
        resolved = this.getFastModel();
    }
    return resolved || 'gemini-2.5-flash-lite';
  }

  getTimeoutMs(): number {
    const parsed = Number(process.env.TRACEIQ_AI_TIMEOUT_MS);
    if (Number.isFinite(parsed) && parsed >= 1_000 && parsed <= 120_000) {
      return parsed;
    }
    return this.defaultTimeoutMs;
  }
}
