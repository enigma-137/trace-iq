/**
 * Builds the Linear issue for a TraceIQ error issue. Pure and deterministic.
 *
 * Error text comes from end users' browsers and apps, so it is untrusted: the
 * message and stack only ever appear inside code fences (no links, mentions or
 * markdown are rendered from them), and backtick runs that could close a fence
 * are neutralised.
 */
export interface LinearIssueSource {
  issueId: string;
  projectId: string;
  type: string;
  message: string;
  stack: string | null;
  occurrences: number;
  users: number;
  firstSeen: string | null;
  lastSeen: string | null;
  environment: string | null;
  release: string | null;
  /** Window the counts cover, in days. */
  days: number;
  dashboardBaseUrl: string;
}

export const MAX_TITLE_LENGTH = 200;
export const MAX_STACK_LINES = 30;
export const MAX_STACK_CHARS = 4_000;
const MAX_MESSAGE_CHARS = 1_000;

export function errorIssueLink(dashboardBaseUrl: string, projectId: string, issueId: string): string {
  const url = new URL(`${dashboardBaseUrl.replace(/\/+$/, '')}/dashboard/errors`);
  url.searchParams.set('issue', issueId);
  url.searchParams.set('projectId', projectId);
  return url.toString();
}

export function buildLinearIssueTitle(type: string, message: string): string {
  const title = `${oneLine(type) || 'Error'}: ${oneLine(message) || '(no message)'}`;
  return title.length > MAX_TITLE_LENGTH ? `${title.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…` : title;
}

export function truncateStack(stack: string | null): { text: string; truncated: boolean } | null {
  if (!stack?.trim()) return null;
  const lines = stack.replace(/\r\n?/g, '\n').trimEnd().split('\n');
  let text = lines.slice(0, MAX_STACK_LINES).join('\n');
  let truncated = lines.length > MAX_STACK_LINES;
  if (text.length > MAX_STACK_CHARS) {
    text = text.slice(0, MAX_STACK_CHARS);
    truncated = true;
  }
  return { text, truncated };
}

export function buildLinearIssueDescription(source: LinearIssueSource): string {
  const link = errorIssueLink(source.dashboardBaseUrl, source.projectId, source.issueId);
  const message = source.message.length > MAX_MESSAGE_CHARS ? `${source.message.slice(0, MAX_MESSAGE_CHARS)}…` : source.message;
  const rows: Array<[string, string]> = [
    ['Occurrences', `${source.occurrences.toLocaleString('en-US')} (last ${source.days} days)`],
    ['Affected users', source.users.toLocaleString('en-US')],
    ['First seen', formatTime(source.firstSeen)],
    ['Last seen', formatTime(source.lastSeen)]
  ];
  if (source.environment) rows.push(['Environment', inlineCode(source.environment)]);
  if (source.release) rows.push(['Release', inlineCode(source.release)]);

  const parts = [
    `**${escapeMarkdown(oneLine(source.type) || 'Error')}**`,
    fence(message),
    '| | |\n| --- | --- |\n' + rows.map(([label, value]) => `| ${label} | ${value} |`).join('\n')
  ];

  const stack = truncateStack(source.stack);
  if (stack) {
    parts.push(`**Stack trace**${stack.truncated ? ' (truncated)' : ''}`, fence(stack.text));
  }
  parts.push(`[Open in TraceIQ](${link})`);
  return parts.join('\n\n');
}

function fence(text: string): string {
  return '```text\n' + text.replace(/`{3,}/g, (run) => "'".repeat(run.length)) + '\n```';
}

function inlineCode(text: string): string {
  return '`' + oneLine(text).replace(/`/g, "'").replace(/\|/g, '/').slice(0, 120) + '`';
}

function oneLine(text: string): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/** For the type name, which is shown as bold text rather than in a fence. */
function escapeMarkdown(text: string): string {
  return text.slice(0, 200).replace(/([\\`*_{}[\]()<>#+!|~@-])/g, '\\$1');
}

function formatTime(value: string | null): string {
  if (!value) return 'unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'unknown' : `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
