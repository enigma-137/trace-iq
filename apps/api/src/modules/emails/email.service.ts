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

  /**
   * Send an HTML email to one or more recipients via Resend.
   * Returns a normalized { ok, recipient? } so the caller can record delivery status.
   */
  async send(args: {
    to: string[];
    subject: string;
    html: string;
    idempotencyKey?: string;
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
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          from: this.from,
          to,
          subject: args.subject,
          html: args.html
        }),
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
