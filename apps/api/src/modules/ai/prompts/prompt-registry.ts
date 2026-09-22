import { FUNNEL_ANALYSIS_PROMPT_V1 } from './funnel.prompt';
import { STORY_SUMMARY_PROMPT_V1 } from './story.prompt';
import { ASK_TRACEIQ_PROMPT_V1 } from './ask-traceiq.prompt';

export const PROMPT_REGISTRY = {
  funnelAnalysis: FUNNEL_ANALYSIS_PROMPT_V1,
  storySummary: STORY_SUMMARY_PROMPT_V1,
  askTraceIq: ASK_TRACEIQ_PROMPT_V1
} as const;

export type PromptRegistryKey = keyof typeof PROMPT_REGISTRY;
