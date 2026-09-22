export interface FunnelObservation {
  title: string;
  description: string;
  severity: 'info' | 'notable' | 'warning';
  evidenceStepIndex?: number;
}

export interface FunnelAnalysisResult {
  summary: string;
  model: string;
  generatedAt: string;
  promptVersion: string;
  cached?: boolean;
}

/**
 * Runtime validator for Funnel AI output.
 * Guarantees that the summary is a non-empty string and conforms to the expected contract.
 */
export function validateFunnelAnalysisResult(input: unknown): { ok: true; data: FunnelAnalysisResult } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Funnel analysis result must be an object.' };
  }

  const candidate = input as Record<string, unknown>;

  if (typeof candidate.summary !== 'string' || candidate.summary.trim().length === 0) {
    return { ok: false, error: 'Funnel analysis result must include a non-empty summary string.' };
  }

  if (typeof candidate.model !== 'string' || candidate.model.trim().length === 0) {
    return { ok: false, error: 'Funnel analysis result must include a valid model string.' };
  }

  if (typeof candidate.generatedAt !== 'string' || isNaN(Date.parse(candidate.generatedAt))) {
    return { ok: false, error: 'Funnel analysis result must include a valid ISO date string.' };
  }

  if (typeof candidate.promptVersion !== 'string' || candidate.promptVersion.trim().length === 0) {
    return { ok: false, error: 'Funnel analysis result must include a valid promptVersion.' };
  }

  return {
    ok: true,
    data: {
      summary: candidate.summary.trim(),
      model: candidate.model.trim(),
      generatedAt: candidate.generatedAt,
      promptVersion: candidate.promptVersion.trim(),
      cached: typeof candidate.cached === 'boolean' ? candidate.cached : undefined
    }
  };
}
