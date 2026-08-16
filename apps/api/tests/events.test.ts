import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { EventsService } from '../src/modules/events/events.service';
import { affected, empty, mockDatabase, rows, type MockDb } from './helpers/mock-db';

function makeService(onQuery: (text: string, values: unknown[]) => unknown) {
  const db = mockDatabase((text, values) => {
    const result = onQuery(text, values);
    if (result === undefined) return empty();
    return result;
  });
  const webhooks = { deliverForEvent: vi.fn().mockResolvedValue(undefined) };
  const achievements = { afterProjectIngest: vi.fn().mockResolvedValue(undefined) };
  const service = new EventsService(db as never, webhooks as never, achievements as never);
  return { db, webhooks, achievements, service };
}

// A DB that accepts a valid write key and lets every insert succeed.
function happyDb() {
  return makeService((text) => {
    if (text.includes('FROM project_write_keys pwk')) {
      return rows([{ project_id: 'proj_1', organization_id: 'org_1' }]);
    }
    if (text.includes('INSERT INTO users')) {
      return rows([{ id: 'usr_1' }]);
    }
    if (text.includes('INSERT INTO events')) {
      return affected(1);
    }
    return affected(1);
  });
}

const validRequest = {
  writeKey: 'key_abc',
  projectId: 'proj_1',
  eventName: 'signup',
  userId: 'user_123'
};

describe('EventsService.ingest', () => {
  it('requires writeKey', async () => {
    const { service } = happyDb();
    await expect(service.ingest({ projectId: 'proj_1', eventName: 'signup' })).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('requires projectId', async () => {
    const { service } = happyDb();
    await expect(service.ingest({ writeKey: 'key_abc', eventName: 'signup' })).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('rejects an unknown write key', async () => {
    const { service } = makeService((text) =>
      text.includes('FROM project_write_keys pwk') ? empty() : affected(1)
    );
    await expect(service.ingest({ ...validRequest })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a request without eventName', async () => {
    const { service } = happyDb();
    await expect(service.ingest({ writeKey: 'key_abc', projectId: 'proj_1' })).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('accepts a valid event, inserts it and forwards to webhooks', async () => {
    const { db, webhooks, service } = happyDb();
    const result = await service.ingest(validRequest, { ip: '1.2.3.4' });

    expect(result.accepted).toBe(true);
    expect(result.eventId).toMatch(/^evt_/);

    const eventInserts = db.queryCalls(/INSERT INTO events/);
    expect(eventInserts).toHaveLength(1);
    const values = eventInserts[0].values;
    expect(values).toContain('org_1');
    expect(values).toContain('proj_1');
    expect(values).toContain('usr_1');
    expect(values).toContain('signup');

    expect(webhooks.deliverForEvent).toHaveBeenCalledTimes(1);
    const [projectId, event] = webhooks.deliverForEvent.mock.calls[0];
    expect(projectId).toBe('proj_1');
    expect(event.eventName).toBe('signup');
    expect(event.userId).toBe('usr_1');
    expect(event.id).toBe(result.eventId);
  });
});

describe('EventsService.ingestBatch', () => {
  it('rejects an empty batch', async () => {
    const { service } = happyDb();
    await expect(service.ingestBatch('key_abc', 'proj_1', [])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a batch over the size limit', async () => {
    const { service } = happyDb();
    const batch = Array.from({ length: 501 }, () => ({ eventName: 'signup' }));
    await expect(service.ingestBatch('key_abc', 'proj_1', batch)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fails only the invalid events in a mixed batch', async () => {
    const { webhooks, service } = makeService((text) => {
      if (text.includes('FROM project_write_keys pwk')) {
        return rows([{ project_id: 'proj_1', organization_id: 'org_1' }]);
      }
      if (text.includes('INSERT INTO users')) {
        return rows([{ external_id: 'u1', id: 'usr_1' }]);
      }
      return affected(1);
    });

    const result = await service.ingestBatch('key_abc', 'proj_1', [
      { eventName: 'signup', userId: 'u1' },
      { properties: {} },
      { eventName: 'checkout' }
    ]);

    expect(result.accepted).toBe(true);
    expect(result.results).toHaveLength(3);
    expect(result.results[0]).toEqual({ accepted: true, eventId: expect.stringMatching(/^evt_/) });
    expect(result.results[1]).toEqual({ accepted: false, error: 'eventName is required.' });
    expect(result.results[2]).toEqual({ accepted: true, eventId: expect.stringMatching(/^evt_/) });

    expect(webhooks.deliverForEvent).toHaveBeenCalledTimes(2);
  });

  it('accepts a fully valid batch and forwards each event to webhooks', async () => {
    const { webhooks, service } = makeService((text) => {
      if (text.includes('FROM project_write_keys pwk')) {
        return rows([{ project_id: 'proj_1', organization_id: 'org_1' }]);
      }
      if (text.includes('INSERT INTO users')) {
        return rows([{ external_id: 'u1', id: 'usr_1' }]);
      }
      return affected(1);
    });

    const result = await service.ingestBatch('key_abc', 'proj_1', [
      { eventName: 'signup', userId: 'u1' },
      { eventName: 'checkout', userId: 'u1' }
    ]);

    expect(result.results.every((r) => r.accepted)).toBe(true);
    expect(webhooks.deliverForEvent).toHaveBeenCalledTimes(2);
    expect(webhooks.deliverForEvent.mock.calls.map(([, e]) => e.eventName)).toEqual(['signup', 'checkout']);
  });

  it('rebinds anonymous events to the session user once a session becomes identified', async () => {
    const { db, service } = happyDb();

    await service.ingestBatch('key_abc', 'proj_1', [
      { eventName: 'signup_started', sessionId: 'sess_1' },
      { eventName: 'login_completed', userId: 'u1', sessionId: 'sess_1' }
    ]);

    const backfills = db.queryCalls(/UPDATE events e/);
    expect(backfills.length).toBeGreaterThan(0);
    for (const call of backfills) {
      expect(call.values[0]).toBe('proj_1');
      expect(call.values[1]).toEqual(['sess_1']);
      // Only anonymous events in the now-identified session are rebound.
      expect(call.text).toContain('e.user_id IS NULL');
      expect(call.text).toContain('s.anonymous_id = e.anonymous_id');
      expect(call.text).toContain('s.user_id IS NOT NULL');
    }
  });

  it('runs the session backfill for single event ingests that identify a user', async () => {
    const { db, service } = happyDb();
    await service.ingest({ writeKey: 'key_abc', projectId: 'proj_1', eventName: 'login_completed', userId: 'u1', sessionId: 'sess_9' });

    const backfills = db.queryCalls(/UPDATE events e/);
    expect(backfills.length).toBeGreaterThan(0);
    expect(backfills[0].values[1]).toEqual(['sess_9']);
  });

  it('skips the session backfill when no session is involved', async () => {
    const { db, service } = happyDb();
    await service.ingest({ writeKey: 'key_abc', projectId: 'proj_1', eventName: 'signup' });

    expect(db.queryCalls(/UPDATE events e/)).toHaveLength(0);
  });
});
