import { BadRequestException, ConflictException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { EmailService, isValidEmail, type BatchEmail } from '../emails/email.service';
import {
  buildDigestEmail,
  digestSubject,
  personalize,
  productUpdatesFrom,
  PRODUCT_UPDATES_LIST,
  unsubscribeHeaders,
  unsubscribePageUrl,
  unsubscribeSecret,
  verifyUnsubscribeToken,
  type DigestEntry
} from './product-updates.email';

export interface DigestSend {
  period: string;
  subject: string;
  status: 'sending' | 'sent' | 'failed';
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  lastError: string | null;
  sentBy: string;
  startedAt: string;
  finishedAt: string | null;
}

const BATCH_SIZE = 100;
/** Resend allows 2 requests a second by default. */
const BATCH_PAUSE_MS = 600;
const MAX_ENTRIES = 40;

@Injectable()
export class ProductUpdatesService {
  private readonly logger = new Logger(ProductUpdatesService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly email: EmailService
  ) {}

  // -- Preferences ----------------------------------------------------------

  async isSubscribed(email: string): Promise<boolean> {
    const result = await this.database.query(`SELECT 1 FROM email_unsubscribes WHERE email = $1 AND list = $2`, [
      normalize(email),
      PRODUCT_UPDATES_LIST
    ]);
    return result.rowCount === 0;
  }

  async setSubscribed(email: string, subscribed: boolean): Promise<void> {
    if (subscribed) {
      await this.database.query(`DELETE FROM email_unsubscribes WHERE email = $1 AND list = $2`, [normalize(email), PRODUCT_UPDATES_LIST]);
    } else {
      await this.database.query(
        `INSERT INTO email_unsubscribes (email, list) VALUES ($1, $2) ON CONFLICT (email, list) DO NOTHING`,
        [normalize(email), PRODUCT_UPDATES_LIST]
      );
    }
  }

  /** From an emailed link: no session, so the signed token proves the address is theirs. */
  async unsubscribeWithToken(email: unknown, token: unknown): Promise<void> {
    const secret = unsubscribeSecret();
    if (typeof email !== 'string' || typeof token !== 'string' || !isValidEmail(email.trim())) {
      throw new BadRequestException('This unsubscribe link is incomplete.');
    }
    if (!secret || !verifyUnsubscribeToken(secret, email, token)) {
      throw new BadRequestException('This unsubscribe link is not valid. You can turn off product updates in Settings instead.');
    }
    await this.setSubscribed(email, false);
  }

  // -- Digest -----------------------------------------------------------------

  /**
   * Every account email that hasn't opted out, once each. Accounts waiting to be deleted
   * are left out.
   */
  async recipients(): Promise<string[]> {
    const result = await this.database.query<{ email: string }>(
      `
        SELECT DISTINCT lower(trim(m.email)) AS email
        FROM organization_members m
        WHERE m.email IS NOT NULL AND trim(m.email) <> ''
          AND NOT EXISTS (
            SELECT 1 FROM email_unsubscribes u WHERE u.email = lower(trim(m.email)) AND u.list = $1
          )
          AND NOT EXISTS (
            SELECT 1 FROM account_lifecycle_requests r
            WHERE r.target_type = 'account' AND r.target_id = m.user_id AND r.status = 'pending'
          )
        ORDER BY 1
      `,
      [PRODUCT_UPDATES_LIST]
    );
    return result.rows.map((row) => row.email).filter(isValidEmail);
  }

  async status(period: string): Promise<{ period: string; subject: string; recipientCount: number; send: DigestSend | null }> {
    assertPeriod(period);
    const [recipients, send] = await Promise.all([this.recipients(), this.findSend(period)]);
    return { period, subject: digestSubject(period), recipientCount: recipients.length, send };
  }

  preview(period: string, entries: unknown): { subject: string; html: string } {
    assertPeriod(period);
    const list = parseEntries(entries);
    return { subject: digestSubject(period), html: personalize(buildDigestEmail(period, list), '#unsubscribe-preview') };
  }

  /** Sends the digest to the admin alone, with a working unsubscribe link, so they can check it in a real inbox. */
  async sendTest(period: string, entries: unknown, to: string | undefined): Promise<{ sentTo: string }> {
    assertPeriod(period);
    const list = parseEntries(entries);
    const secret = this.requireReady();
    if (!to || !isValidEmail(to)) throw new BadRequestException('Your account has no email address to send a test to.');
    const result = await this.email.sendBatch(
      [this.message(secret, normalize(to), `[Test] ${digestSubject(period)}`, buildDigestEmail(period, list))],
      { from: productUpdatesFrom() }
    );
    if (!result.ok) throw new ServiceUnavailableException(`The test email was not sent: ${result.failure}`);
    return { sentTo: normalize(to) };
  }

  /**
   * Claims the month, then sends in the background. A month can only be claimed once, so
   * pressing Send twice, or from two tabs, never emails anyone twice.
   */
  async startSend(period: string, entries: unknown, sentBy: string): Promise<DigestSend> {
    assertPeriod(period);
    const list = parseEntries(entries);
    const secret = this.requireReady();
    const recipients = await this.recipients();
    if (recipients.length === 0) throw new BadRequestException('Nobody is subscribed to product updates.');

    const subject = digestSubject(period);
    const claim = await this.database.query(
      `
        INSERT INTO changelog_digest_sends (period, subject, recipient_count, sent_by)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (period) DO NOTHING
        RETURNING period
      `,
      [period, subject, recipients.length, sentBy]
    );
    if (claim.rowCount === 0) throw new ConflictException(`The ${period} digest has already been sent.`);

    void this.deliver(period, subject, buildDigestEmail(period, list), recipients, secret).catch((error) =>
      this.logger.error(`Changelog digest ${period} stopped: ${error instanceof Error ? error.message : String(error)}`)
    );
    return (await this.findSend(period))!;
  }

  private async deliver(period: string, subject: string, html: string, recipients: string[], secret: string) {
    let sent = 0;
    let failed = 0;
    let lastError: string | null = null;
    for (let start = 0; start < recipients.length; start += BATCH_SIZE) {
      const batch = recipients.slice(start, start + BATCH_SIZE);
      const result = await this.email.sendBatch(
        batch.map((to) => this.message(secret, to, subject, html)),
        { from: productUpdatesFrom(), idempotencyKey: `changelog-digest/${period}/${start / BATCH_SIZE}` }
      );
      if (result.ok) sent += batch.length;
      else {
        failed += batch.length;
        lastError = result.failure ?? 'Unknown error';
      }
      await this.database.query(
        `UPDATE changelog_digest_sends SET sent_count = $2, failed_count = $3, last_error = $4 WHERE period = $1`,
        [period, sent, failed, lastError]
      );
      if (start + BATCH_SIZE < recipients.length) await new Promise((resolve) => setTimeout(resolve, BATCH_PAUSE_MS));
    }
    await this.database.query(
      `UPDATE changelog_digest_sends SET status = $2, finished_at = now() WHERE period = $1`,
      [period, sent > 0 || failed === 0 ? 'sent' : 'failed']
    );
    this.logger.log(`Changelog digest ${period}: ${sent} sent, ${failed} failed.`);
  }

  private message(secret: string, to: string, subject: string, html: string): BatchEmail {
    return { to, subject, html: personalize(html, unsubscribePageUrl(secret, to)), headers: unsubscribeHeaders(secret, to) };
  }

  /** Sending needs Resend, and the secret that signs unsubscribe links. */
  private requireReady(): string {
    if (!this.email.configured) throw new ServiceUnavailableException('Email is not set up: RESEND_API_KEY is missing.');
    const secret = unsubscribeSecret();
    if (!secret) {
      throw new ServiceUnavailableException('Unsubscribe links need TRACEIQ_SECRET_ENCRYPTION_KEY to be set, so nothing was sent.');
    }
    return secret;
  }

  private async findSend(period: string): Promise<DigestSend | null> {
    const result = await this.database.query<Record<string, unknown>>(`SELECT * FROM changelog_digest_sends WHERE period = $1`, [period]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      period: String(row.period),
      subject: String(row.subject),
      status: row.status as DigestSend['status'],
      recipientCount: Number(row.recipient_count),
      sentCount: Number(row.sent_count),
      failedCount: Number(row.failed_count),
      lastError: (row.last_error as string | null) ?? null,
      sentBy: String(row.sent_by),
      startedAt: new Date(row.started_at as string).toISOString(),
      finishedAt: row.finished_at ? new Date(row.finished_at as string).toISOString() : null
    };
  }
}

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

export function assertPeriod(period: string): void {
  if (typeof period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    throw new BadRequestException('period must be a month, YYYY-MM.');
  }
}

/** Validates the entries the admin console sends: the digest is built from them. */
export function parseEntries(input: unknown): DigestEntry[] {
  if (!Array.isArray(input) || input.length === 0) throw new BadRequestException('Pick a month with at least one changelog entry.');
  if (input.length > MAX_ENTRIES) throw new BadRequestException(`A digest holds at most ${MAX_ENTRIES} entries.`);
  return input.map((raw, index) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const text = (key: string, max: number) => {
      const value = item[key];
      if (typeof value !== 'string' || !value.trim() || value.length > max) {
        throw new BadRequestException(`Entry ${index + 1} needs a "${key}".`);
      }
      return value;
    };
    const url = text('url', 500);
    if (!/^https:\/\//.test(url)) throw new BadRequestException(`Entry ${index + 1} needs an https link.`);
    const areas = Array.isArray(item.areas) ? item.areas.filter((area): area is string => typeof area === 'string').slice(0, 3) : [];
    return { title: text('title', 200), date: text('date', 10), areas, url, html: text('html', 20_000) };
  });
}
