export interface StoryPromptData {
  projectName: string;
  eventsToday: number;
  eventsYesterday: number;
  deltaPct: number | null;
  uniquesToday: number;
  topEvent: { name: string; count: number } | null;
  topCountry: { name: string; count: number; pct: number } | null;
  topDevice: { name: string; count: number } | null;
  activeNow: number;
  /** Deterministic sentence about what failed today (outages, errors, failed actions), or null. */
  failures?: string | null;
}

export const STORY_SUMMARY_PROMPT_V1 = {
  version: 'story_summary_v2',
  systemPrompt:
    'You are a product analytics assistant embedded in the TraceIQ dashboard. ' +
    'You explain daily user activity factually and concisely. ' +
    'When failures are reported, they come first: a team must never read a cheerful summary while users could not use the product. ' +
    'Never invent numbers. Do not use bullet points or emojis. Do not say "In summary". Do not mention that you are an AI model.',

  buildUserPrompt(data: StoryPromptData): string {
    const country =
      data.topCountry && data.topCountry.name !== 'unknown'
        ? `${data.topCountry.name} (${data.topCountry.pct}% of activity)`
        : 'no single dominant country';

    const deltaStr = data.deltaPct === null ? 'new' : `${data.deltaPct}%`;

    const failureLines = data.failures
      ? [
          `- FAILURES (open the story with these, keep every number, time and endpoint, and do not soften them): ${data.failures}`
        ]
      : [];

    return [
      `Write "Today's story" for the TraceIQ project "${data.projectName}" in ${data.failures ? '3-4' : '2-3'} short sentences${data.failures ? '' : ', friendly in tone'}.`,
      `Use only these numbers:`,
      ...failureLines,
      `- events in the last 24h: ${data.eventsToday}, previous 24h: ${data.eventsYesterday}, delta: ${deltaStr}`,
      `- unique users today: ${data.uniquesToday}`,
      `- top event: ${data.topEvent ? `${data.topEvent.name} (${data.topEvent.count})` : 'none yet'}`,
      `- geography: ${country}`,
      `- active right now: ${data.activeNow}`,
      '',
      'Plain language, no bullet points, no emojis, no "In summary". Never invent numbers.'
    ].join('\n');
  }
};
