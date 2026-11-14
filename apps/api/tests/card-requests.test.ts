import { describe, expect, it, vi } from 'vitest';
import { CardRequestsService, cardRequestEmail, CARD_REQUESTS_PER_DAY } from '../src/modules/insights/card-requests.service';
import { mockDatabase, rows, empty } from './helpers/mock-db';

const PROJECT = { id: 'proj_1', name: 'Nuwell', slug: 'n', organizationId: 'org_1', organizationName: 'Enigma', role: 'owner' };
const USER = { id: 'user_1', email: 'dev@example.com' };

function setup(options: { sentToday?: number; emailOk?: boolean; project?: typeof PROJECT | null } = {}) {
  const db = mockDatabase((text) => {
    if (/count\(\*\)::int AS count FROM card_requests/.test(text)) return rows([{ count: options.sentToday ?? 0 }]);
    if (/INSERT INTO card_requests/.test(text)) return rows([{ created_at: '2026-11-14T09:00:00.000Z' }]);
    return empty();
  });
  const projects = { resolveActiveProject: vi.fn(async () => (options.project === undefined ? PROJECT : options.project)) };
  const email = { send: vi.fn(async () => (options.emailOk === false ? { ok: false, failure: 'down' } : { ok: true })) };
  const service = new CardRequestsService(db as never, projects as never, email as never);
  return { db, projects, email, service };
}

describe('card requests', () => {
  it('stores the request with its project and emails the inbox', async () => {
    const { db, email, service } = setup();

    const result = await service.create(USER, { request: '  Revenue by country  \nfor the last 30 days', projectId: 'proj_1' });

    expect(result.id).toMatch(/^crq_/);
    expect(result.createdAt).toBe('2026-11-14T09:00:00.000Z');
    const insert = db.queryCalls('INSERT INTO card_requests')[0];
    expect(insert.values).toEqual([result.id, 'user_1', 'dev@example.com', 'org_1', 'proj_1', 'Revenue by country  \nfor the last 30 days']);
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['traceiq.run@gmail.com'],
        subject: 'Overview card request: Revenue by country  ',
        idempotencyKey: result.id
      })
    );
  });

  it('keeps the request when the email fails', async () => {
    const { db, service } = setup({ emailOk: false });
    await expect(service.create(USER, { request: 'Signups by plan' })).resolves.toMatchObject({ id: expect.stringMatching(/^crq_/) });
    expect(db.queryCalls('INSERT INTO card_requests')).toHaveLength(1);
  });

  it('accepts a request without a project', async () => {
    const { db, service } = setup({ project: null });
    await service.create(USER, { request: 'Signups by plan' });
    const insert = db.queryCalls('INSERT INTO card_requests')[0];
    expect(insert.values.slice(3, 5)).toEqual([null, null]);
  });

  it('rejects empty and oversized requests', async () => {
    const { db, service } = setup();
    await expect(service.create(USER, { request: '  hi ' })).rejects.toThrow('Tell us a little');
    await expect(service.create(USER, { request: 42 })).rejects.toThrow('Tell us a little');
    await expect(service.create(USER, { request: 'x'.repeat(1001) })).rejects.toThrow('under 1000');
    expect(db.queryCalls('INSERT INTO card_requests')).toHaveLength(0);
  });

  it(`limits each person to ${CARD_REQUESTS_PER_DAY} requests a day`, async () => {
    const { db, email, service } = setup({ sentToday: CARD_REQUESTS_PER_DAY });
    await expect(service.create(USER, { request: 'One more idea' })).rejects.toMatchObject({ status: 429 });
    expect(db.queryCalls('INSERT INTO card_requests')).toHaveLength(0);
    expect(email.send).not.toHaveBeenCalled();
  });

  it('escapes what people type before it goes into the email', () => {
    const html = cardRequestEmail({ request: '<img src=x onerror=alert(1)>', from: 'a@b.co', project: 'P & Co', id: 'crq_1' });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('P &amp; Co');
  });
});
