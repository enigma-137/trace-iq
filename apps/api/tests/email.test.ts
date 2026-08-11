import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmailService, isValidEmail, toUniqueEmails } from '../src/modules/emails/email.service';

describe('isValidEmail', () => {
  it('accepts well-formed addresses', () => {
    for (const email of [
      'a@b.co',
      'user+tag@example.com',
      'name.last@sub.domain.example',
      'hello@traceiq.run'
    ]) {
      expect(isValidEmail(email)).toBe(true);
    }
  });

  it('rejects malformed addresses', () => {
    for (const email of ['', 'a@b', '@x.com', 'a@.com', 'a b@c.com', 'a@', 'not-an-email', 'a@b.']) {
      expect(isValidEmail(email)).toBe(false);
    }
  });
});

describe('toUniqueEmails', () => {
  it('trims, lowercases, dedupes and drops invalid entries', () => {
    expect(toUniqueEmails([' A@B.co ', 'a@b.co', 'bad', 'a@b.co', '', 'c@d.co'])).toEqual([
      'a@b.co',
      'c@d.co'
    ]);
  });

  it('returns an empty array for empty or non-array input', () => {
    expect(toUniqueEmails([])).toEqual([]);
    expect(toUniqueEmails(undefined as unknown as string[])).toEqual([]);
  });
});

describe('EmailService.send', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
  });

  it('refuses to send when no API key is configured', async () => {
    delete process.env.RESEND_API_KEY;
    const service = new EmailService();
    const result = await service.send({ to: ['a@b.co'], subject: 'hi', html: '<p>hi</p>' });
    expect(result).toEqual({ ok: false, failure: 'RESEND_API_KEY not configured' });
  });

  it('filters invalid recipients before calling Resend', async () => {
    process.env.RESEND_API_KEY = 're_test';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const service = new EmailService();
    const result = await service.send({ to: ['good@b.co', 'not-an-email'], subject: 'hi', html: '<p>hi</p>' });
    expect(result.ok).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toEqual(['good@b.co']);
  });

  it('returns ok:false with a status when Resend rejects', async () => {
    process.env.RESEND_API_KEY = 're_test';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: () => Promise.resolve('unauthorized') })
    );

    const service = new EmailService();
    const result = await service.send({ to: ['a@b.co'], subject: 'hi', html: '<p>hi</p>' });
    expect(result.ok).toBe(false);
    expect(result.failure).toContain('401');
  });

  it('swallows network errors into a failure result', async () => {
    process.env.RESEND_API_KEY = 're_test';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));

    const service = new EmailService();
    const result = await service.send({ to: ['a@b.co'], subject: 'hi', html: '<p>hi</p>' });
    expect(result).toEqual({ ok: false, failure: 'ECONNRESET' });
  });

  it('reports failure when every recipient is invalid', async () => {
    process.env.RESEND_API_KEY = 're_test';
    vi.stubGlobal('fetch', vi.fn());

    const service = new EmailService();
    const result = await service.send({ to: ['nope'], subject: 'hi', html: '<p>hi</p>' });
    expect(result).toEqual({ ok: false, failure: 'No valid recipients' });
  });
});
