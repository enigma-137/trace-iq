import { describe, expect, it, vi } from 'vitest';
import { EventsService } from '../src/modules/events/events.service';
import { AnalyticsService } from '../src/modules/analytics/analytics.service';
import { isPassiveEvent } from '../src/common/passive-events';
import { affected, empty, mockDatabase, rows } from './helpers/mock-db';

vi.mock('../src/common/geo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/common/geo')>()),
  resolveGeo: (ip?: string) => (ip ? { ipAddress: ip } : {})
}));

function eventsService() {
  const db = mockDatabase((text) => {
    if (text.includes('FROM project_write_keys pwk')) return rows([{ project_id: 'proj_1', organization_id: 'org_1' }]);
    if (text.includes('INSERT INTO users')) return rows([{ external_id: 'u1', id: 'usr_1' }]);
    return affected(1);
  });
  const service = new EventsService(
    db as never,
    { deliverForEvent: vi.fn().mockResolvedValue(undefined) } as never,
    { afterProjectIngest: vi.fn().mockResolvedValue(undefined) } as never
  );
  return { db, service };
}

const base = { writeKey: 'key_abc', projectId: 'proj_1' };

describe('passive events', () => {
  it('treats SDK-generated events as passive and everything else as activity', () => {
    expect(isPassiveEvent('$api_request')).toBe(true);
    expect(isPassiveEvent('$web_vital')).toBe(true);
    expect(isPassiveEvent('$exception')).toBe(true);
    expect(isPassiveEvent('$page')).toBe(false);
    expect(isPassiveEvent('campus_invite_sent')).toBe(false);
  });
});

describe('users.last_seen_at', () => {
  it('never uses now() to bump last seen on ingest', async () => {
    const { db, service } = eventsService();
    await service.ingest({ ...base, eventName: 'signup', userId: 'u1' });
    await service.ingestBatch('key_abc', 'proj_1', [{ eventName: 'signup', userId: 'u1' }]);
    for (const call of db.calls.filter((c) => /users/.test(c.text) && /last_seen_at/.test(c.text))) {
      expect(call.text).not.toMatch(/last_seen_at\s*=\s*now\(\)/);
    }
  });

  it('single ingest: a background request does not move last seen, a real event does', async () => {
    const { db, service } = eventsService();
    await service.ingest({ ...base, eventName: '$api_request', userId: 'u1', properties: { method: 'GET', path: '/invites', status: 200 } });
    await service.ingest({ ...base, eventName: 'match_started', userId: 'u1' });

    const upserts = db.queryCalls('INSERT INTO users');
    expect(upserts).toHaveLength(2);
    expect(upserts[0].values[5]).toBe(false);
    expect(upserts[1].values[5]).toBe(true);
  });

  it('single ingest: uses the event time, so a delayed event is not counted as "now"', async () => {
    const { db, service } = eventsService();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await service.ingest({ ...base, eventName: 'match_started', userId: 'u1', timestamp: yesterday });

    const [upsert] = db.queryCalls('INSERT INTO users');
    expect(upsert.values[4]).toBe(yesterday);
    expect(upsert.text).toContain('GREATEST(users.last_seen_at');
  });

  it('batch: only users with a real event get a last-seen update, at their latest real event', async () => {
    const { db, service } = eventsService();
    const t1 = '2026-11-20T10:00:00.000Z';
    const t2 = '2026-11-20T10:05:00.000Z';
    const t3 = '2026-11-20T10:30:00.000Z';
    await service.ingestBatch('key_abc', 'proj_1', [
      { eventName: 'match_started', userId: 'u1', timestamp: t1 },
      { eventName: 'match_ended', userId: 'u1', timestamp: t2 },
      { eventName: '$api_request', userId: 'u1', timestamp: t3, properties: { method: 'GET', path: '/invites', status: 200 } },
      { eventName: '$api_request', userId: 'u2', timestamp: t3, properties: { method: 'GET', path: '/invites', status: 200 } }
    ]);

    const [upsert] = db.queryCalls('INSERT INTO users');
    expect(upsert.text).not.toMatch(/DO UPDATE[\s\S]*last_seen_at/);

    const updates = db.queryCalls(/UPDATE users u\s+SET last_seen_at/);
    expect(updates).toHaveLength(1);
    // u2 only made a background request, so it is not in the update; u1's latest real event is t2.
    expect(updates[0].values).toEqual(['proj_1', 'u1', t2]);
  });

  it('batch: skips the last-seen update entirely when every event is passive', async () => {
    const { db, service } = eventsService();
    await service.ingestBatch('key_abc', 'proj_1', [
      { eventName: '$web_vital', userId: 'u1', properties: { name: 'LCP', value: 1200 } }
    ]);
    expect(db.queryCalls(/UPDATE users u\s+SET last_seen_at/)).toHaveLength(0);
  });
});

describe('event timestamps', () => {
  it('clamps a timestamp from a client clock running ahead to now', async () => {
    const { db, service } = eventsService();
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const before = Date.now();
    await service.ingest({ ...base, eventName: 'match_started', timestamp: future });

    const [insert] = db.queryCalls('INSERT INTO events');
    const stored = new Date(insert.values[11] as string).getTime();
    expect(stored).toBeGreaterThanOrEqual(before);
    expect(stored).toBeLessThanOrEqual(Date.now());
  });

  it('keeps a small amount of forward skew and any past timestamp as sent', async () => {
    const { db, service } = eventsService();
    const slightlyAhead = new Date(Date.now() + 60 * 1000).toISOString();
    const past = '2026-11-01T08:00:00.000Z';
    await service.ingest({ ...base, eventName: 'a', timestamp: slightlyAhead });
    await service.ingest({ ...base, eventName: 'b', timestamp: past });

    const inserts = db.queryCalls('INSERT INTO events');
    expect(inserts[0].values[11]).toBe(slightlyAhead);
    expect(inserts[1].values[11]).toBe(past);
  });
});

describe('retention', () => {
  function analytics() {
    const db = mockDatabase(() => empty());
    const projects = { resolveActiveProject: vi.fn().mockResolvedValue({ id: 'proj_1' }) };
    return { db, service: new AnalyticsService(db as never, projects as never) };
  }

  it('counts identified users only by default and ignores passive events', async () => {
    const { db, service } = analytics();
    const result = await service.getRetention({ id: 'user1', email: 'a@b.c' }, {});

    expect(result.people).toBe('identified');
    const [query] = db.queryCalls('WITH base AS');
    expect(query.text).toMatch(/SELECT user_id::text AS actor/);
    expect(query.text).not.toContain('anonymous_id');
    expect(query.text).toContain("event_name NOT IN ('$api_request', '$web_vital', '$exception')");
  });

  it('includes anonymous visitors when asked for everyone', async () => {
    const { db, service } = analytics();
    const result = await service.getRetention({ id: 'user1', email: 'a@b.c' }, { people: 'all' });

    expect(result.people).toBe('all');
    const [query] = db.queryCalls('WITH base AS');
    expect(query.text).toContain('COALESCE(user_id::text, anonymous_id) AS actor');
    expect(query.text).toContain("event_name NOT IN ('$api_request', '$web_vital', '$exception')");
  });
});
