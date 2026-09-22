export interface FunnelPromptStepData {
  index: number;
  label: string;
  count: number;
  conversionFromStartPct: string;
  droppedFromPrevious: number;
}

export interface FunnelPromptData {
  funnelName: string;
  days: number | string;
  steps: FunnelPromptStepData[];
  worstDrop: {
    index: number;
    label: string;
    dropCount: number;
    dropRatePct: number;
  } | null;
}

export const FUNNEL_ANALYSIS_PROMPT_V1 = {
  version: 'funnel_analysis_v1',
  systemPrompt:
    'You are a product analytics assistant embedded in the TraceIQ dashboard. ' +
    'You explain funnel and event drop-offs factually, distinguishing directly observed metrics from possible interpretations. ' +
    'Never invent numbers or claim unproven causes. Do not mention that you are an AI model.',

  buildUserPrompt(data: FunnelPromptData): string {
    const stepLines = data.steps.map((step) => {
      if (step.index === 0) {
        return `${step.index + 1}. "${step.label}" — ${step.count} entrants.`;
      }
      return `${step.index + 1}. "${step.label}" — ${step.count} reached (${step.conversionFromStartPct}% of start), ${step.droppedFromPrevious} dropped off from the previous step.`;
    });

    const dropLine = data.worstDrop
      ? `Biggest drop-off: Step ${data.worstDrop.index + 1} ("${data.worstDrop.label}") lost ${data.worstDrop.dropCount} people (${data.worstDrop.dropRatePct}% of those who reached the previous step).`
      : 'No single step stands out as the biggest drop-off.';

    return [
      `Funnel "${data.funnelName}" over the last ${data.days} days:`,
      ...stepLines,
      dropLine,
      '',
      "Explain what's happening in 2-3 short, clear sentences using only the numbers above.",
      'State what was observed, and suggest one concrete, fact-based place worth inspecting next (without asserting causes not visible in the data).'
    ].join('\n');
  }
};
