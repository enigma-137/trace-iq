import { Injectable } from '@nestjs/common';

/**
 * Cencori model ids. Google's gemini-2.5 models are being retired, so the defaults are models
 * that answered Ask with tools end to end. Override with TRACEIQ_AI_*_MODEL.
 */
export const DEFAULT_FAST_MODEL = 'claude-haiku-5-5';
export const DEFAULT_REASONING_MODEL = 'claude-haiku-5-5';
export const DEFAULT_FALLBACK_MODEL = 'deepseek-v4.1-flash';

export type AiCapability = 'funnel_analysis' | 'story_analysis' | 'assistant' | 'alert_investigation';

@Injectable()
export class AiModelPolicyService {
  private readonly defaultFastModel = DEFAULT_FAST_MODEL;
  private readonly defaultReasoningModel = DEFAULT_REASONING_MODEL;
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
    return resolved || DEFAULT_FAST_MODEL;
  }

  getTimeoutMs(): number {
    const parsed = Number(process.env.TRACEIQ_AI_TIMEOUT_MS);
    if (Number.isFinite(parsed) && parsed >= 1_000 && parsed <= 120_000) {
      return parsed;
    }
    return this.defaultTimeoutMs;
  }
}
