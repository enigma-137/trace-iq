import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailService } from '../src/modules/emails/email.service';
import {
  buildDigestEmail,
  digestSubject,
  personalize,
  productUpdatesFrom,
  unsubscribeHeaders,
  unsubscribePageUrl,
  unsubscribeSecret,
  unsubscribeToken,
  verifyUnsubscribeToken,
  type DigestEntry
} from '../src/modules/product-updates/product-updates.email';
import { parseEntries, ProductUpdatesService } from '../src/modules/product-updates/product-updates.service';
import { mockDatabase } from './helpers/mock-db';

const entry = (overrides: Partial<DigestEntry> = {}): DigestEntry => ({
  title: 'Linear and GitHub integrations',
  date: '2026-11-15',
  areas: ['Integrations'],
  url: 'https://traceiq.run/changelog#2026-11-15-linear-and-github',
  html: '<p>Errors now connect to <a href="https://traceiq.run/docs">your tools</a>.</p>',
  ...overrides
});

const ENV = ['TRACEIQ_SECRET_ENCRYPTION_KEY', 'TRACEIQ_PUBLIC_API_URL', 'DASHBOARD_URL', 'RESEND_FROM', 'PRODUCT_UPDATES_FROM'];
beforeEach(() => {
  process.env.TRACEIQ_SECRET_ENCRYPTION_KEY = 'test-root-secret';
  process.env.TRACEIQ_PUBLIC_API_URL = 'https://api.traceiq.run';
});
afterEach(() => {
  for (const key of ENV) delete process.env[key];
  vi.useRealTimers();
});

describe('unsubscribe tokens', () => {
  it('verify for the same address in any case, and not for another address', () => {
    const secret = unsubscribeSecret()!;
    const token = unsubscribeToken(secret, 'Ada@Example.com');
    expect(verifyUnsubscribeToken(secret, 'ada@example.com', token)).toBe(true);
    expect(verifyUnsubscribeToken(secret, 'eve@example.com', token)).toBe(false);
    expect(verifyUnsubscribeToken(secret, 'ada@example.com', 'forged')).toBe(false);
  });

  it('depend on the deployment secret', () => {
    const first = unsubscribeToken(unsubscribeSecret()!, 'ada@example.com');
    process.env.TRACEIQ_SECRET_ENCRYPTION_KEY = 'another-secret';
    expect(unsubscribeToken(unsubscribeSecret()!, 'ada@example.com')).not.toBe(first);
  });

  it('are unavailable without a secret', () => {
    delete process.env.TRACEIQ_SECRET_ENCRYPTION_KEY;
    expect(unsubscribeSecret()).toBeNull();
  });

  it('build a confirm-page link and one-click headers', () => {
    const secret = unsubscribeSecret()!;
    expect(unsubscribePageUrl(secret, 'ada@example.com')).toMatch(/^https:\/\/traceiq\.run\/email\/unsubscribe\?e=ada%40example\.com&t=/);
    const headers = unsubscribeHeaders(secret, 'ada@example.com');
    expect(headers['List-Unsubscribe']).toMatch(/^<https:\/\/api\.traceiq\.run\/v1\/email\/unsubscribe\?e=/);
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    delete process.env.TRACEIQ_PUBLIC_API_URL;
    expect(unsubscribeHeaders(secret, 'ada@example.com')).toEqual({});
  });
});

describe('digest email', () => {
  it('names the month, lists each entry and leaves room for a personal unsubscribe link', () => {
    expect(digestSubject('2026-11')).toBe("What's new in TraceIQ: November 2026");
    const html = buildDigestEmail('2026-11', [entry(), entry({ title: 'Ask <TraceIQ> in Telegram', areas: ['Ask TraceIQ', 'Integrations'] })]);
    expect(html).toContain("What's new in November 2026");
    expect(html).toContain('Linear and GitHub integrations');
    expect(html).toContain('Ask &lt;TraceIQ&gt; in Telegram');
    expect(html).toContain('Ask TraceIQ · Integrations');
    expect(html).toContain('<a style="color:#245beb;" href="https://traceiq.run/docs">');
    const personal = personalize(html, 'https://traceiq.run/email/unsubscribe?e=a&t=b');
    expect(personal).toContain('href="https://traceiq.run/email/unsubscribe?e=a&amp;t=b"');
    expect(personal).not.toContain('%%UNSUBSCRIBE_URL%%');
  });

  it('sends as "TraceIQ", not as the alerts sender', () => {
    process.env.RESEND_FROM = 'TraceIQ Alerts <alerts@traceiq.run>';
    expect(productUpdatesFrom()).toBe('TraceIQ <alerts@traceiq.run>');
    process.env.PRODUCT_UPDATES_FROM = 'TraceIQ Team <news@traceiq.run>';
    expect(productUpdatesFrom()).toBe('TraceIQ Team <news@traceiq.run>');
  });
});

describe('parseEntries', () => {
  it('rejects an empty month, missing fields and non-https links', () => {
    expect(() => parseEntries([])).toThrow(BadRequestException);
    expect(() => parseEntries([{ ...entry(), title: '' }])).toThrow(/title/);
    expect(() => parseEntries([{ ...entry(), url: 'javascript:alert(1)' }])).toThrow(/https/);
    expect(parseEntries([entry()])).toEqual([entry()]);
  });
});

function setup(options: { recipients?: string[]; claimed?: boolean; batchOk?: boolean; configured?: boolean } = {}) {
  const db = mockDatabase((text) => {
    if (text.includes('FROM organization_members')) {
      const rows = (options.recipients ?? ['ada@example.com']).map((email) => ({ email }));
      return { rows, rowCount: rows.length };
    }
    if (text.includes('INSERT INTO changelog_digest_sends')) {
      return options.claimed ? { rows: [], rowCount: 0 } : { rows: [{ period: '2026-11' }], rowCount: 1 };
    }
    if (text.includes('SELECT * FROM changelog_digest_sends')) {
      const row = {
        period: '2026-11', subject: 's', status: 'sending', recipient_count: 1, sent_count: 0, failed_count: 0,
        last_error: null, sent_by: 'admin@traceiq.run', started_at: '2026-11-30T10:00:00Z', finished_at: null
      };
      return { rows: [row], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  const sendBatch = vi.fn(async () => ({ ok: options.batchOk ?? true, failure: options.batchOk === false ? 'Resend 500' : undefined }));
  const email = { configured: options.configured ?? true, sendBatch } as unknown as EmailService;
  return { db, sendBatch, service: new ProductUpdatesService(db as never, email) };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ProductUpdatesService', () => {
  it('leaves out opted-out addresses and accounts waiting to be deleted', async () => {
    const { db, service } = setup();
    await service.recipients();
    const sql = db.calls[0].text;
    expect(sql).toContain('FROM email_unsubscribes');
    expect(sql).toContain('account_lifecycle_requests');
    expect(db.calls[0].values).toEqual(['product_updates']);
  });

  it('stores opt-outs in lowercase and removes them on resubscribe', async () => {
    const { db, service } = setup();
    await service.setSubscribed(' Ada@Example.com ', false);
    await service.setSubscribed('ada@example.com', true);
    expect(db.calls[0].text).toContain('INSERT INTO email_unsubscribes');
    expect(db.calls[0].values).toEqual(['ada@example.com', 'product_updates']);
    expect(db.calls[1].text).toContain('DELETE FROM email_unsubscribes');
  });

  it('unsubscribes from a valid link and refuses a forged one', async () => {
    const { db, service } = setup();
    const token = unsubscribeToken(unsubscribeSecret()!, 'ada@example.com');
    await service.unsubscribeWithToken('ada@example.com', token);
    expect(db.calls[0].text).toContain('INSERT INTO email_unsubscribes');
    await expect(service.unsubscribeWithToken('eve@example.com', token)).rejects.toThrow(BadRequestException);
    await expect(service.unsubscribeWithToken('not-an-email', token)).rejects.toThrow(BadRequestException);
  });

  it('sends each recipient their own unsubscribe link in batches of 100', async () => {
    const recipients = Array.from({ length: 150 }, (_, i) => `user${i}@example.com`);
    const { db, sendBatch, service } = setup({ recipients });
    await service.startSend('2026-11', [entry()], 'admin@traceiq.run');
    for (let i = 0; i < 20 && sendBatch.mock.calls.length < 2; i++) await new Promise((resolve) => setTimeout(resolve, 100));
    await flush();

    expect(sendBatch).toHaveBeenCalledTimes(2);
    const [first, firstOptions] = sendBatch.mock.calls[0] as unknown as [Array<{ to: string; html: string; headers: Record<string, string> }>, { idempotencyKey: string; from: string }];
    expect(first).toHaveLength(100);
    expect((sendBatch.mock.calls[1] as unknown as [unknown[]])[0]).toHaveLength(50);
    expect(first[0].to).toBe('user0@example.com');
    expect(first[0].html).toContain('e=user0%40example.com');
    expect(first[1].html).toContain('e=user1%40example.com');
    expect(first[0].headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(firstOptions.idempotencyKey).toBe('changelog-digest/2026-11/0');
    expect(firstOptions.from).toMatch(/^TraceIQ </);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(db.queryCalls(/SET status = \$2/)[0]?.values).toEqual(['2026-11', 'sent']);
  });

  it('refuses to send a month twice', async () => {
    const { sendBatch, service } = setup({ claimed: true });
    await expect(service.startSend('2026-11', [entry()], 'admin@traceiq.run')).rejects.toThrow(ConflictException);
    expect(sendBatch).not.toHaveBeenCalled();
  });

  it('sends nothing without Resend or the unsubscribe secret', async () => {
    await expect(setup({ configured: false }).service.startSend('2026-11', [entry()], 'a')).rejects.toThrow(ServiceUnavailableException);
    delete process.env.TRACEIQ_SECRET_ENCRYPTION_KEY;
    const { db, sendBatch, service } = setup();
    await expect(service.startSend('2026-11', [entry()], 'a')).rejects.toThrow(/TRACEIQ_SECRET_ENCRYPTION_KEY/);
    expect(sendBatch).not.toHaveBeenCalled();
    expect(db.queryCalls('INSERT INTO changelog_digest_sends')).toHaveLength(0);
  });

  it('rejects a malformed month', async () => {
    const { service } = setup();
    await expect(service.status('2026-13')).rejects.toThrow(BadRequestException);
    expect(() => service.preview('Nov 2026', [entry()])).toThrow(BadRequestException);
  });

  it('marks the send failed when every batch fails', async () => {
    const { db, service } = setup({ batchOk: false });
    await service.startSend('2026-11', [entry()], 'admin@traceiq.run');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(db.queryCalls(/SET sent_count/)[0]?.values).toEqual(['2026-11', 0, 1, 'Resend 500']);
    expect(db.queryCalls(/SET status = \$2/)[0]?.values).toEqual(['2026-11', 'failed']);
  });
});
