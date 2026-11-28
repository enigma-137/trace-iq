import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusPagesService } from '../src/modules/status-pages/status-pages.service';
import {
  confirmationEmail,
  notificationHtml,
  notificationSubject,
  readSubscriberToken,
  subscriberSecret,
  subscriberToken
} from '../src/modules/status-pages/status-subscribers.email';
import { StatusSubscribersService } from '../src/modules/status-pages/status-subscribers.service';
import { affected, mockDatabase, rows } from './helpers/mock-db';

const ID = 'sts_0b4e7e1a-1111-4222-8333-944455556666';
const PAGE = { id: 'stp_1', slug: 'acme', title: 'Acme' };

beforeEach(() => {
  vi.stubEnv('TRACEIQ_SECRET_ENCRYPTION_KEY', 'test-root-secret');
  vi.stubEnv('DASHBOARD_URL', 'https://traceiq.run');
  vi.stubEnv('TRACEIQ_PUBLIC_API_URL', 'https://api.traceiq.run');
});
afterEach(() => vi.unstubAllEnvs());

function emailService(ok = true) {
  return { configured: true, sendBatch: vi.fn(async () => (ok ? { ok: true } : { ok: false, failure: 'Resend 500' })) };
}

describe('subscriber links', () => {
  it('signs the purpose in, so a confirm link cannot unsubscribe', () => {
    const secret = subscriberSecret() as string;
    const confirm = subscriberToken(secret, ID, 'confirm');
    expect(readSubscriberToken(secret, confirm, 'confirm')).toBe(ID);
    expect(readSubscriberToken(secret, confirm, 'unsubscribe')).toBeNull();
    expect(readSubscriberToken(secret, `${confirm}x`, 'confirm')).toBeNull();
    expect(readSubscriberToken(secret, confirm.replace(ID, ID.replace('0b4e', '0b4f')), 'confirm')).toBeNull();
    expect(readSubscriberToken(secret, 'nonsense', 'confirm')).toBeNull();
    expect(readSubscriberToken('other-secret', confirm, 'confirm')).toBeNull();
  });

  it('has no secret without the deployment key', () => {
    vi.stubEnv('TRACEIQ_SECRET_ENCRYPTION_KEY', '');
    expect(subscriberSecret()).toBeNull();
  });
});

describe('emails', () => {
  const content = {
    pageTitle: 'Acme',
    slug: 'acme',
    incidentTitle: 'Checkout <errors>',
    kind: 'incident' as const,
    status: 'investigating',
    body: 'We are looking.\nMore soon & thanks.',
    isNew: true,
    scheduledStart: null,
    scheduledEnd: null,
    affected: ['API']
  };

  it('names the page and what happened in the subject', () => {
    expect(notificationSubject(content)).toBe('[Acme] New incident: Checkout <errors>');
    expect(notificationSubject({ ...content, isNew: false, status: 'resolved' })).toBe('[Acme] Resolved: Checkout <errors>');
    expect(notificationSubject({ ...content, kind: 'maintenance', status: 'scheduled' })).toBe('[Acme] Scheduled maintenance: Checkout <errors>');
  });

  it('escapes what the team wrote and links to the page and the unsubscribe page', () => {
    const html = notificationHtml(content, 'https://traceiq.run/status/acme/subscription?action=unsubscribe&token=t');
    expect(html).toContain('Checkout &lt;errors&gt;');
    expect(html).not.toContain('<errors>');
    expect(html).toContain('We are looking.<br>More soon &amp; thanks.');
    expect(html).toContain('https://traceiq.run/status/acme"');
    expect(html).toContain('action=unsubscribe&amp;token=t');
    expect(html).toContain('<strong>Affected:</strong> API');
  });

  it('sends a confirmation link and says what to do if it was not you', () => {
    const { subject, html } = confirmationEmail('Acme', 'https://traceiq.run/status/acme/subscription?action=confirm&token=x');
    expect(subject).toBe('Confirm status updates from Acme');
    expect(html).toContain('action=confirm&amp;token=x');
    expect(html).toContain("If you didn't ask for this");
  });
});

describe('StatusSubscribersService.subscribe', () => {
  function setup(existing: Record<string, unknown> | null, options: { page?: boolean; count?: number } = {}) {
    const db = mockDatabase((text) => {
      if (text.includes('FROM status_pages WHERE slug')) return options.page === false ? rows([]) : rows([PAGE]);
      if (text.includes('COUNT(*) AS count FROM status_page_subscribers')) return rows([{ count: String(options.count ?? 0) }]);
      if (text.includes('SELECT id, confirmed_at, confirmation_sent_at')) return existing ? rows([existing]) : rows([]);
      if (text.includes('INSERT INTO status_page_subscribers')) return rows([{ id: ID, confirmed_at: null, confirmation_sent_at: null }]);
      return affected(1);
    });
    const email = emailService();
    return { db, email, service: new StatusSubscribersService(db as never, email as never) };
  }

  it('adds a new address and emails a confirmation link from the page', async () => {
    const { service, db, email } = setup(null);
    await expect(service.subscribe('Acme', '  Person@Example.com ')).resolves.toEqual({ ok: true });
    expect(db.queryCalls('INSERT INTO status_page_subscribers')[0].values.slice(1)).toEqual(['stp_1', 'person@example.com']);
    const [messages, options] = email.sendBatch.mock.calls[0] as unknown as [Array<{ to: string; html: string }>, { from: string }];
    expect(messages[0].to).toBe('person@example.com');
    expect(messages[0].html).toContain('https://traceiq.run/status/acme/subscription?action=confirm&amp;token=sts_');
    expect(options.from).toBe('"Acme Status" <alerts@traceiq.run>');
    expect(db.queryCalls('SET confirmation_sent_at = now()')).toHaveLength(1);
  });

  it('answers the same for an address that is already subscribed, without emailing it', async () => {
    const { service, email } = setup({ id: ID, confirmed_at: new Date(), confirmation_sent_at: new Date() });
    await expect(service.subscribe('acme', 'person@example.com')).resolves.toEqual({ ok: true });
    expect(email.sendBatch).not.toHaveBeenCalled();
  });

  it('does not send another confirmation within 10 minutes', async () => {
    const { service, email } = setup({ id: ID, confirmed_at: null, confirmation_sent_at: new Date(Date.now() - 60_000) });
    await service.subscribe('acme', 'person@example.com');
    expect(email.sendBatch).not.toHaveBeenCalled();
  });

  it('refuses bad addresses, unpublished pages and full lists', async () => {
    await expect(setup(null).service.subscribe('acme', 'not-an-email')).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup(null, { page: false }).service.subscribe('acme', 'a@b.co')).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup(null, { count: 10_000 }).service.subscribe('acme', 'a@b.co')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('is unavailable without email or the signing key', async () => {
    vi.stubEnv('TRACEIQ_SECRET_ENCRYPTION_KEY', '');
    await expect(setup(null).service.subscribe('acme', 'a@b.co')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('StatusSubscribersService confirm and unsubscribe', () => {
  function setup(found = true) {
    const db = mockDatabase((text) => (text.includes('RETURNING p.slug, p.title') ? (found ? rows([{ slug: 'acme', title: 'Acme' }]) : rows([])) : affected(1)));
    return { db, service: new StatusSubscribersService(db as never, emailService() as never) };
  }
  const secret = () => subscriberSecret() as string;

  it('confirms with a confirm link only', async () => {
    const { service, db } = setup();
    await expect(service.confirm(subscriberToken(secret(), ID, 'confirm'))).resolves.toMatchObject({ confirmed: true, page: { slug: 'acme' } });
    expect(db.queryCalls('SET confirmed_at = COALESCE')[0].values).toEqual([ID]);
    await expect(service.confirm(subscriberToken(secret(), ID, 'unsubscribe'))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('unsubscribes, and a second click still succeeds', async () => {
    const token = subscriberToken(secret(), ID, 'unsubscribe');
    await expect(setup().service.unsubscribe(token)).resolves.toMatchObject({ unsubscribed: true, page: { slug: 'acme' } });
    await expect(setup(false).service.unsubscribe(token)).resolves.toEqual({ unsubscribed: true, page: null });
    await expect(setup().service.unsubscribe('sts_x.bad')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('StatusSubscribersService.notify', () => {
  it('emails confirmed subscribers in batches of 100, each with its own unsubscribe link', async () => {
    const subscribers = Array.from({ length: 150 }, (_, i) => ({ id: `sts_0b4e7e1a-1111-4222-8333-${String(i).padStart(12, '0')}`, email: `p${i}@example.com` }));
    const db = mockDatabase((text) => {
      if (text.includes('FROM status_pages WHERE id = $1 AND enabled')) return rows([PAGE]);
      if (text.includes('confirmed_at IS NOT NULL ORDER BY')) return rows(subscribers);
      return affected(1);
    });
    const email = emailService();
    const service = new StatusSubscribersService(db as never, email as never);
    service.sleep = async () => undefined;
    const result = await service.notify('stp_1', {
      incidentTitle: 'Slow API', kind: 'incident', status: 'identified', body: 'Found it.', isNew: false,
      scheduledStart: null, scheduledEnd: null, affected: []
    });
    expect(result).toEqual({ sent: 150, failed: 0 });
    const batches = email.sendBatch.mock.calls.map((call) => (call as unknown as [Array<{ to: string; subject: string; html: string; headers: Record<string, string> }>])[0]);
    expect(batches.map((batch) => batch.length)).toEqual([100, 50]);
    const first = batches[0][0];
    expect(first.subject).toBe('[Acme] Identified: Slow API');
    expect(first.html).toContain('action=unsubscribe&amp;token=sts_0b4e7e1a-1111-4222-8333-000000000000.');
    expect(first.headers['List-Unsubscribe']).toContain('https://api.traceiq.run/v1/status/subscribers/unsubscribe?token=sts_');
    expect(batches[0][1].html).not.toContain('000000000000.');
  });

  it('never throws, and sends nothing without email set up', async () => {
    const db = mockDatabase(() => {
      throw new Error('db down');
    });
    const service = new StatusSubscribersService(db as never, emailService() as never);
    const content = { incidentTitle: 'x', kind: 'incident' as const, status: 'investigating', body: 'y', isNew: true, scheduledStart: null, scheduledEnd: null, affected: [] };
    await expect(service.notify('stp_1', content)).resolves.toEqual({ sent: 0, failed: 0 });
    const off = new StatusSubscribersService(db as never, { configured: false, sendBatch: vi.fn() } as never);
    await expect(off.notify('stp_1', content)).resolves.toEqual({ sent: 0, failed: 0 });
  });
});

describe('Posting an incident', () => {
  function setup() {
    const db = mockDatabase((text) => {
      if (text.includes('FROM status_pages WHERE project_id')) return rows([{ id: 'stp_1', project_id: 'proj_1', slug: 'acme', title: 'Acme', description: null, enabled: true, updated_at: new Date() }]);
      return affected(1);
    });
    const project = { id: 'proj_1', organizationId: 'org_1', name: 'Acme', slug: 'acme', organizationName: 'Acme', role: 'owner' };
    const projects = { requireWritableProject: vi.fn().mockResolvedValue(project), requireActiveProject: vi.fn().mockResolvedValue(project) };
    const subscribers = { notify: vi.fn().mockResolvedValue({ sent: 1, failed: 0 }), confirmedCount: vi.fn().mockResolvedValue(3), available: true };
    return { subscribers, service: new StatusPagesService(db as never, projects as never, subscribers as never) };
  }
  const user = { id: 'user_1', authMethod: 'supabase' } as never;

  it('emails subscribers unless the editor turns it off', async () => {
    const { service, subscribers } = setup();
    const settings = await service.createIncident(user, { title: 'Slow API', body: 'Looking.', impact: 'minor' });
    expect(subscribers.notify).toHaveBeenCalledWith('stp_1', expect.objectContaining({ incidentTitle: 'Slow API', isNew: true, status: 'investigating' }));
    expect(settings.subscribers).toEqual({ count: 3, emailAvailable: true });

    subscribers.notify.mockClear();
    await service.createIncident(user, { title: 'Quiet fix', body: 'Done.', notify: false });
    expect(subscribers.notify).not.toHaveBeenCalled();
  });
});
