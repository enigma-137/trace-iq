import { createHmac, timingSafeEqual } from 'node:crypto';

/** The only email list so far: the monthly changelog digest. */
export const PRODUCT_UPDATES_LIST = 'product_updates';

/** One changelog entry as the admin console sends it: its body is already HTML. */
export interface DigestEntry {
  title: string;
  date: string;
  areas: string[];
  url: string;
  html: string;
}

export const dashboardBaseUrl = () =>
  (process.env.DASHBOARD_URL ?? 'https://traceiq.run').trim().replace(/\/+$/, '').replace(/\/dashboard$/, '');

const publicApiUrl = () => (process.env.TRACEIQ_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');

/** "TraceIQ Alerts <alerts@x>" → "TraceIQ <alerts@x>": product news shouldn't look like an alert. */
export function productUpdatesFrom(): string {
  const configured = process.env.PRODUCT_UPDATES_FROM?.trim();
  if (configured) return configured;
  const from = process.env.RESEND_FROM ?? 'TraceIQ Alerts <alerts@traceiq.run>';
  const address = from.match(/<([^>]+)>/)?.[1] ?? from.trim();
  return `TraceIQ <${address}>`;
}

/**
 * The secret behind unsubscribe links. Links must keep working for months, so they're
 * signed with the deployment's long-lived secret rather than stored per recipient.
 */
export function unsubscribeSecret(): string | null {
  const root = (process.env.TRACEIQ_SECRET_ENCRYPTION_KEY ?? '').trim();
  return root ? createHmac('sha256', root).update('traceiq:email-unsubscribe').digest('base64url') : null;
}

export function unsubscribeToken(secret: string, email: string, list = PRODUCT_UPDATES_LIST): string {
  return createHmac('sha256', secret).update(`${list}:${email.trim().toLowerCase()}`).digest('base64url');
}

export function verifyUnsubscribeToken(secret: string, email: string, token: string, list = PRODUCT_UPDATES_LIST): boolean {
  const expected = Buffer.from(unsubscribeToken(secret, email, list));
  const given = Buffer.from(String(token));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** The page link people click in the email: it asks them to confirm before unsubscribing. */
export function unsubscribePageUrl(secret: string, email: string): string {
  const query = new URLSearchParams({ e: email, t: unsubscribeToken(secret, email) });
  return `${dashboardBaseUrl()}/email/unsubscribe?${query}`;
}

/**
 * List-Unsubscribe headers (RFC 8058), so Gmail and others show their own one-click
 * "Unsubscribe" button. They need the API's public URL; without it, only the link in
 * the email is offered.
 */
export function unsubscribeHeaders(secret: string, email: string): Record<string, string> {
  const api = publicApiUrl();
  if (!api) return {};
  const query = new URLSearchParams({ e: email, t: unsubscribeToken(secret, email) });
  return {
    'List-Unsubscribe': `<${api}/v1/email/unsubscribe?${query}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
  };
}

export function digestSubject(period: string): string {
  return `What's new in TraceIQ: ${monthName(period)}`;
}

export function monthName(period: string): string {
  return new Date(`${period}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const UNSUBSCRIBE_PLACEHOLDER = '%%UNSUBSCRIBE_URL%%';

/**
 * The digest's HTML with a placeholder where each recipient's unsubscribe link goes.
 * Entry bodies come from the admin console, which renders them from the changelog files.
 */
export function buildDigestEmail(period: string, entries: DigestEntry[]): string {
  const base = dashboardBaseUrl();
  const cards = entries
    .map(
      (entry) => `
      <div style="padding:20px 0;border-top:1px solid #e2e8f0;">
        <div style="font-size:11px;color:#245beb;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">${escapeHtml(entry.areas.join(' · '))}</div>
        <a href="${escapeAttr(entry.url)}" style="display:block;margin-top:6px;font-size:18px;font-weight:700;line-height:1.3;color:#101715;text-decoration:none;">${escapeHtml(entry.title)}</a>
        <div style="margin-top:8px;font-size:14px;line-height:1.6;color:#334155;">${styleEntryHtml(entry.html)}</div>
      </div>`
    )
    .join('');

  return `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#101715;">
      <div style="padding:20px 0 16px;">
        <div style="font-size:13px;color:#64706e;">TraceIQ · changelog</div>
        <div style="font-size:24px;font-weight:750;letter-spacing:-0.02em;margin-top:4px;">What's new in ${escapeHtml(monthName(period))}</div>
        <p style="font-size:15px;line-height:1.5;color:#334155;margin:10px 0 0;">Here's what we shipped this month.</p>
      </div>
      ${cards}
      <p style="margin:24px 0 0;">
        <a href="${base}/changelog" style="display:inline-block;background:#245beb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;">See the full changelog</a>
      </p>
      <p style="font-size:12px;line-height:1.6;color:#94a3b8;margin-top:28px;border-top:1px solid #e2e8f0;padding-top:16px;">
        You're getting this because you have a TraceIQ account. We send product updates about once a month.<br />
        <a href="${UNSUBSCRIBE_PLACEHOLDER}" style="color:#64706e;">Unsubscribe from product updates</a> · TraceIQ · traceiq.run
      </p>
    </div>`;
}

export function personalize(html: string, unsubscribeUrl: string): string {
  return html.split(UNSUBSCRIBE_PLACEHOLDER).join(escapeAttr(unsubscribeUrl));
}

/** Email clients ignore stylesheets, so give the Markdown output's tags inline styles. */
function styleEntryHtml(html: string): string {
  return html
    .replace(/<p>/g, '<p style="margin:0 0 10px;">')
    .replace(/<ul>/g, '<ul style="margin:0 0 10px;padding-left:20px;">')
    .replace(/<li>/g, '<li style="margin:4px 0;">')
    .replace(/<a /g, '<a style="color:#245beb;" ')
    .replace(/<code>/g, '<code style="font-family:Menlo,Consolas,monospace;font-size:12px;background:#f8fbfd;border:1px solid #d4e2f2;padding:1px 4px;">');
}

function escapeHtml(value: string): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const escapeAttr = escapeHtml;
