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
  /** The backend is answering again: the failures are history, not an ongoing outage. */
  failuresResolved?: boolean;
  /** How prominently to report `failures`. Older callers omit it and get 'serious'. */
  failureSeverity?: 'none' | 'minor' | 'notable' | 'serious';
}

export const STORY_SUMMARY_PROMPT_V1 = {
  version: 'story_summary_v4',
  systemPrompt:
    'You are a product analytics assistant embedded in the TraceIQ dashboard. ' +
    'You explain daily user activity factually and concisely. ' +
    'Failures come labelled SERIOUS, NOTABLE or MINOR, and you match that weight exactly. ' +
    'SERIOUS failures come first: a team must never read a cheerful summary while users cannot use the product. ' +
    'NOTABLE failures get one factual, calm sentence after the activity. ' +
    'MINOR failures are the normal background of a working product (expired sessions, a device going offline, a validation error): mention them briefly at the end, keep the tone relaxed, and never call them an outage, incident, problem or concern. ' +
    'Only SERIOUS failures may be described as the product being down or users being unable to use it. ' +
    'When failures are marked resolved, report them in the past tense and never describe them as ongoing. ' +
    'Never invent numbers. Do not use bullet points or emojis. Do not say "In summary". Do not mention that you are an AI model.',

  buildUserPrompt(data: StoryPromptData): string {
    const country =
      data.topCountry && data.topCountry.name !== 'unknown'
        ? `${data.topCountry.name} (${data.topCountry.pct}% of visitors)`
        : 'no single dominant country';

    const deltaStr = data.deltaPct === null ? 'new' : `${data.deltaPct}%`;

    const severity = data.failures ? (data.failureSeverity ?? 'serious') : 'none';
    const failureLines =
      severity === 'none'
        ? []
        : data.failuresResolved
          ? [
              `- NOTABLE, RESOLVED FAILURES (the backend is responding again; one sentence after the activity, in the past tense, keeping the numbers and times, without calling it down now): ${data.failures}`
            ]
          : severity === 'serious'
            ? [`- SERIOUS FAILURES (open the story with these, keep every number, time and endpoint, and do not soften them): ${data.failures}`]
            : severity === 'notable'
              ? [`- NOTABLE FAILURES (one factual sentence after the activity, calm, no alarm words): ${data.failures}`]
              : [`- MINOR FAILURES (normal background noise; a short clause at the very end, relaxed, not a warning): ${data.failures}`];
    const serious = severity === 'serious';

    return [
      `Write "Today's story" for the TraceIQ project "${data.projectName}" in ${serious ? '3-4' : '2-3'} short sentences${serious ? '' : ', friendly in tone'}.`,
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
