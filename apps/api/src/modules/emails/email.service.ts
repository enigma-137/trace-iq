import { Injectable } from '@nestjs/common';

// Lightweight Resend client using the REST API (no extra dependency).
// Resend envelopes: POST https://api.resend.com/emails
@Injectable()
export class EmailService {
  private readonly apiKey = process.env.RESEND_API_KEY ?? '';
  private readonly from = process.env.RESEND_FROM ?? 'TraceIQ Alerts <alerts@traceiq.run>';

  get configured(): boolean {
    return this.apiKey.length > 0;
  }

  /** Sends personalised messages in one Resend batch request; see sendResendBatch. */
  sendBatch(messages: BatchEmail[], options: { from?: string; idempotencyKey?: string } = {}) {
    const to = messages.filter((message) => isValidEmail(message.to));
    return sendResendBatch(this.apiKey, options.from ?? this.from, to, options.idempotencyKey);
  }

  /**
   * Send an HTML email to one or more recipients via Resend.
   * Returns a normalized { ok, recipient? } so the caller can record delivery status.
   */
  async send(args: {
    to: string[];
    subject: string;
    html: string;
    attachments?: Array<{
      filename: string;
      content: string | Buffer;
      contentType?: string;
    }>;
    idempotencyKey?: string;
    /** Extra headers, e.g. List-Unsubscribe. */
    headers?: Record<string, string>;
  }): Promise<{ ok: boolean; failure?: string }> {
    if (!this.configured) {
      return { ok: false, failure: 'RESEND_API_KEY not configured' };
    }
    const to = args.to.filter((email) => typeof email === 'string' && isValidEmail(email));
    if (to.length === 0) {
      return { ok: false, failure: 'No valid recipients' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json'
      };
      if (args.idempotencyKey) headers['Idempotency-Key'] = args.idempotencyKey;

      const payload: Record<string, unknown> = {
        from: this.from,
        to,
        subject: args.subject,
        html: args.html
      };
      if (args.headers && Object.keys(args.headers).length > 0) payload.headers = args.headers;

      if (args.attachments && args.attachments.length > 0) {
        payload.attachments = args.attachments.map((att) => ({
          filename: att.filename,
          content: Buffer.isBuffer(att.content)
            ? att.content.toString('base64')
            : Buffer.from(att.content).toString('base64'),
          contentType: att.contentType
        }));
      }

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { ok: false, failure: `Resend ${res.status}: ${body.slice(0, 200)}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, failure: err instanceof Error ? err.message : String(err) };
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** One message in a Resend batch. */
export interface BatchEmail {
  to: string;
  subject: string;
  html: string;
  headers?: Record<string, string>;
}

/**
 * Sends up to 100 messages, each with its own body and headers, in one Resend request
 * (POST /emails/batch). Used where every recipient needs a personal link, such as an
 * unsubscribe link. Resend accepts or rejects the batch as a whole.
 */
export async function sendResendBatch(
  apiKey: string,
  from: string,
  messages: BatchEmail[],
  idempotencyKey?: string
): Promise<{ ok: boolean; failure?: string }> {
  if (!apiKey) return { ok: false, failure: 'RESEND_API_KEY not configured' };
  if (messages.length === 0) return { ok: true };
  if (messages.length > 100) return { ok: false, failure: 'A Resend batch holds at most 100 messages' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers,
      body: JSON.stringify(
        messages.map((message) => ({
          from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          ...(message.headers ? { headers: message.headers } : {})
        }))
      ),
      signal: controller.signal
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, failure: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, failure: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timeout);
  }
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function toUniqueEmails(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list ?? []) {
    const email = String(raw).trim().toLowerCase();
    if (email && isValidEmail(email) && !seen.has(email)) {
      seen.add(email);
      out.push(email);
    }
  }
  return out;
}
