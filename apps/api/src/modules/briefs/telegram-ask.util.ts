import { escapeHtml } from './briefs.util';

/** Telegram allows 4096 characters; the HTML tags we add count too, so clip the source shorter. */
export const TELEGRAM_ANSWER_LIMIT = 3300;
export const MAX_QUESTION_LENGTH = 500;

/** Cuts at a line break near the limit so a bullet is never split in half. */
export function clipAnswer(markdown: string, limit = TELEGRAM_ANSWER_LIMIT): { text: string; clipped: boolean } {
  const text = markdown.trim();
  if (text.length <= limit) return { text, clipped: false };
  const cut = text.slice(0, limit);
  const lineBreak = cut.lastIndexOf('\n');
  return { text: (lineBreak > limit * 0.6 ? cut.slice(0, lineBreak) : cut).trimEnd(), clipped: true };
}

const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isTableDivider = (line: string) => /^[\s|:\-—–]+$/.test(line) && /[-—–]/.test(line);

/**
 * Telegram cannot draw a Markdown table, so it shows as raw pipes. Each data row becomes a
 * bullet: the first cell is the label and the rest read as "heading value" pairs.
 */
export function flattenTables(markdown: string): string {
  const lines = markdown.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!isTableRow(lines[i])) {
      out.push(lines[i]);
      continue;
    }
    const block: string[] = [];
    while (i < lines.length && isTableRow(lines[i])) {
      block.push(lines[i]);
      i += 1;
    }
    i -= 1;
    const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
    const header = cells(block[0]);
    for (const row of block.slice(1)) {
      if (isTableDivider(row)) continue;
      const values = cells(row);
      if (values.every((value) => !value)) continue;
      const rest = values
        .slice(1)
        .map((value, index) => (header[index + 1] ? `${header[index + 1]} ${value}` : value))
        .filter((part) => part.trim())
        .join(', ');
      out.push(`- **${values[0]}**${rest ? `: ${rest}` : ''}`);
    }
  }
  return out.join('\n');
}

/**
 * Turns the Markdown an Ask answer comes in into the small HTML subset Telegram accepts.
 * Everything is escaped first, so nothing in the answer (which can quote event names and
 * error text from customer data) can inject a tag. Relative links get the dashboard origin.
 */
export function markdownToTelegramHtml(markdown: string, dashboardUrl: string): string {
  const base = dashboardUrl.replace(/\/+$/, '');
  const lines = escapeHtml(flattenTables(markdown)).split('\n');

  const converted = lines.map((line) => {
    let out = line;

    const heading = /^#{1,6}\s+(.*)$/.exec(out);
    if (heading) out = `**${heading[1].replace(/\*\*/g, '')}**`;

    out = out.replace(/^(\s*)[-*]\s+/, '$1• ');

    out = out.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_match, label: string, url: string) => {
      const href = url.startsWith('/') ? `${base}${url}` : url;
      // Only web links, and nothing that could break out of the attribute.
      if (!/^https?:\/\/[^"'<>]+$/i.test(href)) return label;
      return `<a href="${href}">${label}</a>`;
    });

    out = out.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
    out = out.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    return out;
  });

  return converted.join('\n').replace(/\n{3,}/g, '\n\n');
}

/** Short, plain wording for the ways an Ask can fail, so a chat never sees a stack trace. */
export function askFailureMessage(error: unknown, upgradeUrl: string): string {
  const response = (error as { getResponse?: () => unknown })?.getResponse?.();
  const body = response && typeof response === 'object' ? (response as { code?: string; classification?: string; message?: unknown }) : undefined;
  const code = body?.code;
  const status = (error as { getStatus?: () => number })?.getStatus?.();

  if (code === 'MONTHLY_AI_INSIGHTS_LIMIT_REACHED') {
    return `You've used this month's Ask TraceIQ allowance. It resets next month, or you can <a href="${upgradeUrl}">upgrade for more</a>.`;
  }
  if (code === 'AI_GATEWAY_FAILED') {
    switch (body?.classification) {
      case 'unsupported_model':
      case 'missing_model':
        return "The AI model this server is set to isn't available. Whoever runs the server needs to pick another one.";
      case 'rate_limited':
        return 'The AI provider is limiting requests right now. Try again in a minute.';
      case 'timeout':
        return 'The AI took too long to answer. Try a narrower question, like one metric or one page.';
      default:
        return "The AI service had a problem and couldn't answer. Try again in a minute.";
    }
  }
  if (status === 503) {
    return typeof body?.message === 'string' && /not configured/i.test(body.message)
      ? "Ask TraceIQ isn't set up on this server yet."
      : "The AI service isn't available right now. Try again in a minute.";
  }
  if (status === 403 || status === 404) {
    return "I couldn't open this project with the account that connected the chat. Reconnect it from TraceIQ → Alerts → Daily brief.";
  }
  if (status === 408) return 'That took too long. Try a narrower question, like one metric or one page.';
  return 'Something went wrong while looking into that. Try again in a moment.';
}
