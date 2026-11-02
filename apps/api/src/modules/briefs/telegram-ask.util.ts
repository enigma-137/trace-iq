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

/**
 * Turns the Markdown an Ask answer comes in into the small HTML subset Telegram accepts.
 * Everything is escaped first, so nothing in the answer (which can quote event names and
 * error text from customer data) can inject a tag. Relative links get the dashboard origin.
 */
export function markdownToTelegramHtml(markdown: string, dashboardUrl: string): string {
  const base = dashboardUrl.replace(/\/+$/, '');
  const lines = escapeHtml(markdown).split('\n');

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
  const code = response && typeof response === 'object' ? (response as { code?: string }).code : undefined;
  const status = (error as { getStatus?: () => number })?.getStatus?.();

  if (code === 'MONTHLY_AI_INSIGHTS_LIMIT_REACHED') {
    return `You've used this month's Ask TraceIQ allowance. It resets next month, or you can <a href="${upgradeUrl}">upgrade for more</a>.`;
  }
  if (status === 503) return "I'm getting a lot of requests right now and couldn't finish that. Give me a minute, then ask again.";
  if (status === 403 || status === 404) {
    return "I couldn't open this project with the account that connected the chat. Reconnect it from TraceIQ → Alerts → Daily brief.";
  }
  if (status === 408) return 'That took too long. Try a narrower question, like one metric or one page.';
  return 'Something went wrong while looking into that. Try again in a moment.';
}
