import { createHmac, timingSafeEqual } from 'node:crypto';
import { dashboardBaseUrl } from '../product-updates/product-updates.email';

export type SubscriberTokenPurpose = 'confirm' | 'unsubscribe';

const publicApiUrl = () => (process.env.TRACEIQ_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');

/**
 * The secret behind confirm and unsubscribe links. Like the product-update links, they're
 * signed with the deployment's long-lived secret rather than stored per subscriber.
 */
export function subscriberSecret(): string | null {
  const root = (process.env.TRACEIQ_SECRET_ENCRYPTION_KEY ?? '').trim();
  return root ? createHmac('sha256', root).update('traceiq:status-page-subscribers').digest('base64url') : null;
}

/** `<subscriber id>.<signature>`; the purpose is signed in, so a confirm link can't unsubscribe. */
export function subscriberToken(secret: string, subscriberId: string, purpose: SubscriberTokenPurpose): string {
  const signature = createHmac('sha256', secret).update(`${purpose}:${subscriberId}`).digest('base64url');
  return `${subscriberId}.${signature}`;
}

/** The subscriber id a valid token was issued for, or null. */
export function readSubscriberToken(secret: string, token: unknown, purpose: SubscriberTokenPurpose): string | null {
  if (typeof token !== 'string' || token.length > 300) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  if (!/^sts_[0-9a-f-]{36}$/.test(id)) return null;
  const expected = Buffer.from(subscriberToken(secret, id, purpose));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}

/** The page people land on from an email; it asks for a click before changing anything. */
export function subscriptionPageUrl(slug: string, purpose: SubscriberTokenPurpose, token: string): string {
  const query = new URLSearchParams({ action: purpose, token });
  return `${dashboardBaseUrl()}/status/${encodeURIComponent(slug)}/subscription?${query}`;
}

export function statusPageUrl(slug: string): string {
  return `${dashboardBaseUrl()}/status/${encodeURIComponent(slug)}`;
}

/** RFC 8058 one-click unsubscribe, when the API's public URL is known. */
export function subscriberUnsubscribeHeaders(token: string): Record<string, string> {
  const api = publicApiUrl();
  if (!api) return {};
  return {
    'List-Unsubscribe': `<${api}/v1/status/subscribers/unsubscribe?${new URLSearchParams({ token })}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
  };
}

/** "TraceIQ Alerts <alerts@x>" → "Acme Status <alerts@x>". */
export function statusFrom(pageTitle: string): string {
  const from = process.env.RESEND_FROM ?? 'TraceIQ Alerts <alerts@traceiq.run>';
  const address = from.match(/<([^>]+)>/)?.[1] ?? from.trim();
  const name = `${pageTitle} Status`.replace(/["<>\r\n]/g, '').slice(0, 70);
  return `"${name}" <${address}>`;
}

const STATUS_LABELS: Record<string, string> = {
  investigating: 'Investigating',
  identified: 'Identified',
  monitoring: 'Monitoring',
  resolved: 'Resolved',
  scheduled: 'Scheduled maintenance',
  in_progress: 'Maintenance in progress',
  completed: 'Maintenance completed'
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export interface NotificationContent {
  pageTitle: string;
  slug: string;
  incidentTitle: string;
  kind: 'incident' | 'maintenance';
  status: string;
  body: string;
  isNew: boolean;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  affected: string[];
}

export function notificationSubject(content: NotificationContent): string {
  const prefix = content.isNew ? (content.kind === 'maintenance' ? 'Scheduled maintenance' : 'New incident') : statusLabel(content.status);
  return `[${content.pageTitle}] ${prefix}: ${content.incidentTitle}`.slice(0, 200);
}

export function confirmationEmail(pageTitle: string, confirmUrl: string): { subject: string; html: string } {
  const title = escapeHtml(pageTitle);
  return {
    subject: `Confirm status updates from ${pageTitle}`.slice(0, 200),
    html: layout(
      `<h1 style="margin:0 0 12px;font-size:20px;color:#0a0a0a">Confirm your subscription</h1>
       <p style="margin:0 0 20px">Someone, hopefully you, asked to get an email when <strong>${title}</strong> posts an incident or scheduled maintenance on its status page.</p>
       <p style="margin:0 0 24px"><a href="${escapeAttr(confirmUrl)}" style="${BUTTON}">Confirm subscription</a></p>
       <p style="margin:0;color:#737373;font-size:13px">If you didn't ask for this, ignore this email. You won't be subscribed.</p>`,
      null
    )
  };
}

export function notificationHtml(content: NotificationContent, unsubscribeUrl: string): string {
  const when =
    content.kind === 'maintenance' && content.scheduledStart && content.scheduledEnd
      ? `<p style="margin:0 0 12px;color:#404040"><strong>When:</strong> ${escapeHtml(formatUtc(content.scheduledStart))} to ${escapeHtml(formatUtc(content.scheduledEnd))} (UTC)</p>`
      : '';
  const affected = content.affected.length
    ? `<p style="margin:0 0 12px;color:#404040"><strong>Affected:</strong> ${escapeHtml(content.affected.join(', '))}</p>`
    : '';
  const body = escapeHtml(content.body).replace(/\r?\n/g, '<br>');
  return layout(
    `<p style="margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#2563eb">${escapeHtml(statusLabel(content.status))}</p>
     <h1 style="margin:0 0 16px;font-size:20px;color:#0a0a0a">${escapeHtml(content.incidentTitle)}</h1>
     ${when}${affected}
     <p style="margin:0 0 24px;color:#262626">${body}</p>
     <p style="margin:0"><a href="${escapeAttr(statusPageUrl(content.slug))}" style="${BUTTON}">View ${escapeHtml(content.pageTitle)} status</a></p>`,
    unsubscribeUrl,
    content.pageTitle
  );
}

const BUTTON = 'display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px';

function layout(inner: string, unsubscribeUrl: string | null, pageTitle?: string): string {
  const footer = unsubscribeUrl
    ? `You're getting this because you subscribed to ${escapeHtml(pageTitle ?? 'this')} status updates. <a href="${escapeAttr(unsubscribeUrl)}" style="color:#737373">Unsubscribe</a>.`
    : 'Status pages by TraceIQ.';
  return `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.55;color:#262626">
<div style="max-width:560px;margin:0 auto;padding:32px 16px">
<div style="background:#ffffff;border:1px solid #e5e5e5;border-radius:14px;padding:28px">${inner}</div>
<p style="margin:16px 4px 0;font-size:12px;color:#737373">${footer}</p>
</div></body></html>`;
}

function formatUtc(date: Date): string {
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
