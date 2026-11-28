import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { EmailService, isValidEmail, type BatchEmail } from '../emails/email.service';
import {
  confirmationEmail,
  notificationHtml,
  notificationSubject,
  readSubscriberToken,
  statusFrom,
  subscriberSecret,
  subscriberToken,
  subscriberUnsubscribeHeaders,
  subscriptionPageUrl,
  type NotificationContent
} from './status-subscribers.email';

/** Keeps one page's list, and one notification's sending time, bounded. */
export const MAX_SUBSCRIBERS_PER_PAGE = 10_000;
/** A repeat sign-up within this window doesn't send another confirmation email. */
const RESEND_CONFIRMATION_AFTER_MS = 10 * 60 * 1000;
const BATCH_SIZE = 100;
/** Resend allows 2 requests a second by default. */
const BATCH_PAUSE_MS = 600;

interface PageLookup {
  [column: string]: unknown;
  id: string;
  slug: string;
  title: string;
}

/**
 * Email subscriptions for public status pages: double opt-in sign-up, confirm and
 * unsubscribe links, and the emails sent when a page posts an incident, a maintenance
 * window or an update.
 */
@Injectable()
export class StatusSubscribersService {
  private readonly logger = new Logger(StatusSubscribersService.name);
  /** Overridable in tests. */
  sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  constructor(
    private readonly database: DatabaseService,
    private readonly email: EmailService
  ) {}

  /** Subscriptions need Resend and the secret that signs their links. */
  private requireReady(): string {
    const secret = subscriberSecret();
    if (!this.email.configured || !secret) {
      throw new ServiceUnavailableException('Email updates are not available for this status page right now.');
    }
    return secret;
  }

  /**
   * Starts a subscription and emails a confirmation link. The answer is the same whether
   * the address is new, waiting for confirmation or already subscribed, so the form can't
   * be used to find out who is subscribed.
   */
  async subscribe(slugInput: string, emailInput: unknown): Promise<{ ok: true }> {
    const secret = this.requireReady();
    const email = typeof emailInput === 'string' ? emailInput.trim().toLowerCase() : '';
    if (!email || email.length > 254 || !isValidEmail(email)) throw new BadRequestException('Enter a valid email address.');
    const page = await this.publishedPage(slugInput);
    if (!page) throw new BadRequestException('This status page is not available.');

    const count = await this.database.query<{ count: string }>(`SELECT COUNT(*) AS count FROM status_page_subscribers WHERE status_page_id = $1`, [page.id]);
    const existing = await this.database.query<{ id: string; confirmed_at: Date | null; confirmation_sent_at: Date | null }>(
      `SELECT id, confirmed_at, confirmation_sent_at FROM status_page_subscribers WHERE status_page_id = $1 AND email = $2`,
      [page.id, email]
    );
    let row = existing.rows[0];
    if (!row) {
      if (Number(count.rows[0]?.count ?? 0) >= MAX_SUBSCRIBERS_PER_PAGE) {
        throw new BadRequestException('This status page has reached its subscriber limit.');
      }
      const inserted = await this.database.query<{ id: string; confirmed_at: Date | null; confirmation_sent_at: Date | null }>(
        `
          INSERT INTO status_page_subscribers (id, status_page_id, email) VALUES ($1, $2, $3)
          ON CONFLICT (status_page_id, email) DO UPDATE SET email = EXCLUDED.email
          RETURNING id, confirmed_at, confirmation_sent_at
        `,
        [`sts_${randomUUID()}`, page.id, email]
      );
      row = inserted.rows[0];
    }
    if (!row || row.confirmed_at) return { ok: true };
    if (row.confirmation_sent_at && Date.now() - new Date(row.confirmation_sent_at).getTime() < RESEND_CONFIRMATION_AFTER_MS) return { ok: true };

    const message = confirmationEmail(page.title, subscriptionPageUrl(page.slug, 'confirm', subscriberToken(secret, row.id, 'confirm')));
    const result = await this.email.sendBatch([{ to: email, ...message }], { from: statusFrom(page.title) });
    if (!result.ok) {
      this.logger.warn(`Status page confirmation email failed: ${result.failure}`);
      throw new ServiceUnavailableException('We couldn’t send the confirmation email. Please try again later.');
    }
    await this.database.query(`UPDATE status_page_subscribers SET confirmation_sent_at = now() WHERE id = $1`, [row.id]);
    return { ok: true };
  }

  async confirm(token: unknown): Promise<{ confirmed: true; page: { slug: string; title: string } }> {
    const secret = this.requireReady();
    const id = readSubscriberToken(secret, token, 'confirm');
    if (!id) throw new BadRequestException('This confirmation link is not valid.');
    const result = await this.database.query<{ slug: string; title: string }>(
      `
        UPDATE status_page_subscribers s SET confirmed_at = COALESCE(s.confirmed_at, now())
        FROM status_pages p WHERE s.id = $1 AND p.id = s.status_page_id
        RETURNING p.slug, p.title
      `,
      [id]
    );
    const page = result.rows[0];
    if (!page) throw new BadRequestException('This subscription no longer exists. Subscribe again from the status page.');
    return { confirmed: true, page };
  }

  /** Removes the subscription. Using a link again after that still succeeds. */
  async unsubscribe(token: unknown): Promise<{ unsubscribed: true; page: { slug: string; title: string } | null }> {
    const secret = this.requireReady();
    const id = readSubscriberToken(secret, token, 'unsubscribe');
    if (!id) throw new BadRequestException('This unsubscribe link is not valid.');
    const result = await this.database.query<{ slug: string; title: string }>(
      `
        DELETE FROM status_page_subscribers s USING status_pages p
        WHERE s.id = $1 AND p.id = s.status_page_id
        RETURNING p.slug, p.title
      `,
      [id]
    );
    return { unsubscribed: true, page: result.rows[0] ?? null };
  }

  async confirmedCount(pageId: string): Promise<number> {
    const result = await this.database.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM status_page_subscribers WHERE status_page_id = $1 AND confirmed_at IS NOT NULL`,
      [pageId]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  /** Whether notifications can be sent at all (Resend and the signing secret are set). */
  get available(): boolean {
    return this.email.configured && subscriberSecret() !== null;
  }

  /**
   * Emails every confirmed subscriber of the page. Runs after the incident is saved and
   * never throws: a failed batch is logged, and the incident stays posted.
   */
  async notify(pageId: string, content: Omit<NotificationContent, 'pageTitle' | 'slug'>): Promise<{ sent: number; failed: number }> {
    const secret = subscriberSecret();
    if (!this.email.configured || !secret) return { sent: 0, failed: 0 };
    try {
      const page = await this.database.query<PageLookup>(`SELECT id, slug, title FROM status_pages WHERE id = $1 AND enabled`, [pageId]);
      const info = page.rows[0];
      if (!info) return { sent: 0, failed: 0 };
      const subscribers = await this.database.query<{ id: string; email: string }>(
        `SELECT id, email FROM status_page_subscribers WHERE status_page_id = $1 AND confirmed_at IS NOT NULL ORDER BY created_at LIMIT $2`,
        [pageId, MAX_SUBSCRIBERS_PER_PAGE]
      );
      const full: NotificationContent = { ...content, pageTitle: info.title, slug: info.slug };
      const subject = notificationSubject(full);
      const messages: BatchEmail[] = subscribers.rows.map((subscriber) => {
        const token = subscriberToken(secret, subscriber.id, 'unsubscribe');
        return {
          to: subscriber.email,
          subject,
          html: notificationHtml(full, subscriptionPageUrl(info.slug, 'unsubscribe', token)),
          headers: subscriberUnsubscribeHeaders(token)
        };
      });
      let sent = 0;
      let failed = 0;
      for (let i = 0; i < messages.length; i += BATCH_SIZE) {
        if (i > 0) await this.sleep(BATCH_PAUSE_MS);
        const batch = messages.slice(i, i + BATCH_SIZE);
        const result = await this.email.sendBatch(batch, { from: statusFrom(info.title) });
        if (result.ok) sent += batch.length;
        else {
          failed += batch.length;
          this.logger.warn(`Status page notification batch failed: ${result.failure}`);
        }
      }
      return { sent, failed };
    } catch (error) {
      this.logger.error(`Status page notification failed: ${error instanceof Error ? error.message : String(error)}`);
      return { sent: 0, failed: 0 };
    }
  }

  private async publishedPage(slugInput: string): Promise<PageLookup | undefined> {
    const slug = String(slugInput ?? '').toLowerCase();
    if (!/^[a-z0-9-]{3,48}$/.test(slug)) return undefined;
    const result = await this.database.query<PageLookup>(`SELECT id, slug, title FROM status_pages WHERE slug = $1 AND enabled`, [slug]);
    return result.rows[0];
  }
}
