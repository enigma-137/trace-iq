import { describe, expect, it, vi } from 'vitest';
import { FEEDBACK_PER_DAY, FeedbackService } from '../src/modules/feedback/feedback.service';
import { InsightsController } from '../src/modules/insights/insights.controller';
import { mockDatabase, rows, empty } from './helpers/mock-db';

const PROJECT = { id: 'proj_1', name: 'Nuwell', slug: 'n', organizationId: 'org_1', organizationName: 'Enigma', role: 'owner' };
const USER = { id: 'user_1', email: 'dev@example.com' };

function setup(options: { sentToday?: number; project?: typeof PROJECT | null; updated?: boolean } = {}) {
  const db = mockDatabase((text) => {
    if (/count\(\*\)::int AS count FROM feedback/.test(text)) return rows([{ count: options.sentToday ?? 0 }]);
    if (/INSERT INTO feedback/.test(text)) return rows([{ created_at: '2026-11-14T09:00:00.000Z' }]);
    if (/AS unread, count\(\*\)::int AS total/.test(text)) return rows([{ unread: 2, total: 5 }]);
    if (/AS unread FROM feedback/.test(text)) return rows([{ unread: 2 }]);
    if (/UPDATE feedback SET read_at = now\(\) WHERE read_at IS NULL/.test(text)) return { rows: [], rowCount: 2 };
    if (/UPDATE feedback SET/.test(text)) {
      return options.updated === false ? empty() : rows([{ id: 'fb_1', status: 'planned', read_at: '2026-11-14T10:00:00.000Z' }]);
    }
    return empty();
  });
  const projects = { resolveActiveProject: vi.fn(async () => (options.project === undefined ? PROJECT : options.project)) };
  const service = new FeedbackService(db as never, projects as never);
  return { db, projects, service };
}

describe('feedback', () => {
  it('stores feedback with its kind, project and page', async () => {
    const { db, service } = setup();
    const result = await service.create(USER, { kind: 'problem', message: '  Funnels page is slow  ', projectId: 'proj_1', page: '/dashboard/funnels' });

    expect(result).toEqual({ id: expect.stringMatching(/^fb_/), createdAt: '2026-11-14T09:00:00.000Z' });
    expect(db.queryCalls('INSERT INTO feedback')[0].values).toEqual([
      result.id, 'problem', 'user_1', 'dev@example.com', 'org_1', 'proj_1', 'Funnels page is slow', '/dashboard/funnels'
    ]);
  });

  it('falls back to "other" for an unknown kind and drops a page that is not a path', async () => {
    const { db, service } = setup({ project: null });
    await service.create(USER, { kind: 'spam', message: 'Hello there', page: 'https://evil.example' });
    const values = db.queryCalls('INSERT INTO feedback')[0].values;
    expect(values[1]).toBe('other');
    expect(values.slice(4)).toEqual([null, null, 'Hello there', null]);
  });

  it('rejects empty and oversized messages', async () => {
    const { db, service } = setup();
    await expect(service.create(USER, { kind: 'card_request', message: ' hi ' })).rejects.toThrow('Tell us a little about the card');
    await expect(service.create(USER, { kind: 'idea', message: 42 })).rejects.toThrow('Tell us a little more');
    await expect(service.create(USER, { kind: 'idea', message: 'x'.repeat(2001) })).rejects.toThrow('under 2000');
    expect(db.queryCalls('INSERT INTO feedback')).toHaveLength(0);
  });

  it(`limits each person to ${FEEDBACK_PER_DAY} messages a day`, async () => {
    const { db, service } = setup({ sentToday: FEEDBACK_PER_DAY });
    await expect(service.create(USER, { kind: 'idea', message: 'One more idea' })).rejects.toMatchObject({ status: 429 });
    expect(db.queryCalls('INSERT INTO feedback')).toHaveLength(0);
  });

  it('keeps the old card-request route working', async () => {
    const { db, service } = setup();
    const auth = { getDashboardUser: vi.fn(async () => USER), requireScope: vi.fn() };
    const controller = new InsightsController(auth as never, {} as never, {} as never, service);

    await controller.requestCard({ request: 'Revenue by country', projectId: 'proj_1' }, 'Bearer t');

    const values = db.queryCalls('INSERT INTO feedback')[0].values;
    expect(values[1]).toBe('card_request');
    expect(values[6]).toBe('Revenue by country');
  });

  it('lists the inbox with filters and counts', async () => {
    const { db, service } = setup();
    const inbox = await service.inbox({ unread: true, kind: 'idea', limit: 999 });
    const query = db.calls.find((call) => call.text.includes('FROM feedback f'))!;
    expect(query.text).toContain('f.read_at IS NULL AND f.kind = $1');
    expect(query.text).toContain('LIMIT 200');
    expect(query.values).toEqual(['idea']);
    expect(inbox).toMatchObject({ unread: 2, total: 5 });

    await service.inbox({ kind: "idea' OR 1=1 --" });
    const unfiltered = db.calls.filter((call) => call.text.includes('FROM feedback f')).pop()!;
    expect(unfiltered.text).not.toContain('WHERE');
  });

  it('triages an item: a status change also marks it read', async () => {
    const { db, service } = setup();
    const result = await service.update('fb_1', { status: 'planned' });
    expect(result).toEqual({ id: 'fb_1', status: 'planned', readAt: '2026-11-14T10:00:00.000Z' });
    expect(db.queryCalls('UPDATE feedback SET')[0].text).toContain('status = $2, read_at = COALESCE(read_at, now())');

    await service.update('fb_1', { read: false });
    expect(db.queryCalls('UPDATE feedback SET')[1].text).toContain('read_at = NULL');
  });

  it('rejects bad updates and unknown items', async () => {
    await expect(setup().service.update('fb_1', {})).rejects.toThrow('Nothing to update');
    await expect(setup().service.update('fb_1', { status: 'shipped' })).rejects.toThrow('Status must be one of');
    await expect(setup({ updated: false }).service.update('fb_x', { read: true })).rejects.toThrow('Feedback not found');
  });

  it('counts unread and marks everything read', async () => {
    const { service } = setup();
    await expect(service.unreadCount()).resolves.toEqual({ unread: 2 });
    await expect(service.markAllRead()).resolves.toEqual({ updated: 2 });
  });
});
