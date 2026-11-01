// The prompt behind "Copy fix prompt" on an error issue: everything a coding assistant
// (Claude Code, Cursor, Codex) needs to find and fix the bug, from what TraceIQ captured.
// Pure text building, so it can be tested without a browser.

const MAX_MESSAGE_CHARS = 500;
const MAX_STACK_LINES = 30;
const MAX_CONTEXT_LINES = 11;
const MAX_LIST_ITEMS = 3;

export interface ErrorFixPromptInput {
  type: string;
  message: string;
  occurrences: number;
  users: number;
  sessions: number;
  firstSeen: string;
  lastSeen: string;
  firstRelease?: string | null;
  lastRelease?: string | null;
  /** Set when the issue was resolved and came back, with the release it came back in. */
  regressedInRelease?: string | null;
  /** The stack to show, already source-mapped when the release's source maps matched. */
  stack?: string | null;
  /** True when `stack` is the original (un-minified) source. */
  stackIsSourceMapped?: boolean;
  sourceContext?: { file: string; line: number; lines: Array<{ line: number; code: string }> } | null;
  pages?: string[];
  browsers?: string[];
  issueUrl?: string | null;
}

/**
 * Removes things that should not travel to another tool: email addresses, bearer tokens, and
 * values of keys that look like secrets. Errors often carry the request that failed.
 */
export function redactSensitive(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [token]')
    .replace(
      // `(?!Bearer\b)` leaves "Authorization: Bearer [token]" to the rule above.
      /\b((?:api[_-]?key|access[_-]?token|auth(?:orization)?|password|passwd|secret|token|write[_-]?key)["']?\s*[:=]\s*["']?)(?!Bearer\b)([^\s"'&,;)}]{4,})/gi,
      '$1[redacted]'
    );
}

const day = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toISOString().slice(0, 10);
};

const plural = (count: number, word: string) => `${count.toLocaleString('en')} ${word}${count === 1 ? '' : 's'}`;

function limitLines(text: string, max: number): string {
  const lines = text.split('\n');
  return lines.length <= max ? text : `${lines.slice(0, max).join('\n')}\n… (${lines.length - max} more lines)`;
}

export function buildErrorFixPrompt(input: ErrorFixPromptInput): string {
  const message = redactSensitive(input.message).slice(0, MAX_MESSAGE_CHARS);
  const lines: string[] = [
    'Fix this production error in this codebase. TraceIQ captured it from real users.',
    '',
    'ERROR',
    `${redactSensitive(input.type)}: ${message}`,
    `Seen ${plural(input.occurrences, 'time')} by ${plural(input.users, 'user')} across ${plural(input.sessions, 'session')}, from ${day(input.firstSeen)} to ${day(input.lastSeen)}.`
  ];

  const releases = [
    input.firstRelease ? `first seen in ${input.firstRelease}` : null,
    input.lastRelease ? `latest in ${input.lastRelease}` : null
  ].filter(Boolean);
  if (releases.length > 0) lines.push(`Releases: ${releases.join(', ')}.`);
  if (input.regressedInRelease) {
    lines.push(`It had been marked resolved and came back in ${input.regressedInRelease}, so the earlier fix did not hold or was undone.`);
  }

  const pages = (input.pages ?? []).filter(Boolean).slice(0, MAX_LIST_ITEMS);
  if (pages.length > 0) lines.push(`Most often on: ${pages.join(', ')}.`);
  const browsers = (input.browsers ?? []).filter(Boolean).slice(0, MAX_LIST_ITEMS);
  if (browsers.length > 0) lines.push(`Browsers: ${browsers.join(', ')}.`);

  const stack = input.stack?.trim();
  if (stack) {
    lines.push(
      '',
      input.stackIsSourceMapped ? 'STACK TRACE (mapped back to the original source)' : 'STACK TRACE (file names may be minified)',
      limitLines(redactSensitive(stack), MAX_STACK_LINES)
    );
  }

  const context = input.sourceContext;
  if (context && context.lines.length > 0) {
    const shown = context.lines.slice(0, MAX_CONTEXT_LINES);
    const width = String(Math.max(...shown.map((entry) => entry.line))).length;
    lines.push(
      '',
      `SOURCE AROUND THE FAILING LINE (${context.file}:${context.line})`,
      ...shown.map((entry) => `${entry.line === context.line ? '>' : ' '} ${String(entry.line).padStart(width)} | ${redactSensitive(entry.code)}`)
    );
  }

  lines.push(
    '',
    'WHAT TO DO',
    stack
      ? '1. Find this code in the repository from the stack trace. If the file names are minified, search for the error message and the function names instead.'
      : '1. Find the code that can throw this error by searching the repository for the message and the likely functions. There is no stack trace for this issue.',
    '2. Before changing anything, say in one or two sentences what the root cause is. If you cannot confirm it from the code, say what you are assuming.',
    '3. Fix the cause, not the symptom. Do not hide it with an empty try/catch or by swallowing the error; handle the bad input where it comes from.',
    '4. Add or update a test that fails without your fix and passes with it.',
    '5. Keep the change small, and list the files you changed.'
  );

  if (input.issueUrl) lines.push('', `TraceIQ issue: ${input.issueUrl}`);
  return lines.join('\n');
}
