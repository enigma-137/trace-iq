export interface StoryAnalysisResult {
  narrative: string;
  model: string;
  generatedAt: string;
  promptVersion: string;
  cached?: boolean;
}

/**
 * Runtime validator for Story AI narrative output.
 * Guarantees that the narrative is a non-empty string and conforms to the expected contract.
 */
export function validateStoryAnalysisResult(input: unknown): { ok: true; data: StoryAnalysisResult } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Story analysis result must be an object.' };
  }

  const candidate = input as Record<string, unknown>;

  if (typeof candidate.narrative !== 'string' || candidate.narrative.trim().length === 0) {
    return { ok: false, error: 'Story analysis result must include a non-empty narrative string.' };
  }

  if (typeof candidate.model !== 'string' || candidate.model.trim().length === 0) {
    return { ok: false, error: 'Story analysis result must include a valid model string.' };
  }

  if (typeof candidate.generatedAt !== 'string' || isNaN(Date.parse(candidate.generatedAt))) {
    return { ok: false, error: 'Story analysis result must include a valid ISO date string.' };
  }

  if (typeof candidate.promptVersion !== 'string' || candidate.promptVersion.trim().length === 0) {
    return { ok: false, error: 'Story analysis result must include a valid promptVersion.' };
  }

  return {
    ok: true,
    data: {
      narrative: candidate.narrative.trim(),
      model: candidate.model.trim(),
      generatedAt: candidate.generatedAt,
      promptVersion: candidate.promptVersion.trim(),
      cached: typeof candidate.cached === 'boolean' ? candidate.cached : undefined
    }
  };
}
