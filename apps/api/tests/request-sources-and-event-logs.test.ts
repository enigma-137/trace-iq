import { describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from '../src/modules/analytics/analytics.service';
import { EventsService } from '../src/modules/events/events.service';
import { ObservabilityService, eventToLog } from '../src/modules/observability/observability.service';
import { RequestsService } from '../src/modules/requests/requests.service';
import { mockDatabase, rows } from './helpers/mock-db';

const user = { id: 'usr_1', authMethod: 'supabase' } as never;
const project = { id: 'proj_1', name: 'FUNAAB Life', role: 'owner', organizationId: 'org_1' };
const projects = { resolveActiveProject: vi.fn(async () => project) };

describe('API performance timing source', () => {
  function serviceWith(counts: { server: number; client: number }) {
    const db = mockDatabase((text) => {
      if (text.includes('AS client')) return rows([counts]);
      if (text.includes('AS p50')) return rows([{ total: 10, errors: 0, avg: 5.2, p50: 4, p95: 9 }]);
      return rows([]);
    });
    return { db, service: new AnalyticsService(db as never, projects as never) };
  }

  it('reports server timings by default when the backend is instrumented', async () => {
    const { db, service } = serviceWith({ server: 10, client: 40 });
    const result = await service.getApiPerformance(user, '7');
    expect(result.source).toBe('server');
    expect(result.sources).toEqual({ server: 10, client: 40 });
    expect(result.summary.p50).toBe(4);
    const summary = db.queryCalls(/AS p50/)[0];
    expect(summary.text).toContain("AND NOT (properties->>'instrumentation' IN ('browser')");
  });

  it('falls back to every request when only the browser reports timings', async () => {
    const { db, service } = serviceWith({ server: 0, client: 40 });
    const result = await service.getApiPerformance(user, '7');
    expect(result.source).toBe('all');
    expect(db.queryCalls(/AS p50/)[0].text).not.toContain("IN ('browser')");
  });

  it('honours an explicit client source', async () => {
    const { db, service } = serviceWith({ server: 10, client: 40 });
    const result = await service.getApiPerformance(user, '7', undefined, 'client');
    expect(result.source).toBe('client');
    expect(db.queryCalls(/AS p50/)[0].text).toMatch(/AND \(properties->>'instrumentation' IN \('browser'\)/);
  });
});

describe('Requests explorer source filter', () => {
  it('filters by where the request was timed and rejects unknown sources', async () => {
    const db = mockDatabase(() => rows([]));
    const service = new RequestsService(db as never, projects as never);
    await service.list(user, { source: 'server' });
    const call = db.queryCalls(/FROM api_requests/)[0];
    expect(call.text).toContain("NOT (instrumentation IN ('browser') OR (instrumentation IS NULL AND session_id IS NOT NULL))");
    expect(call.text).toContain('"timedBy"');
    await expect(service.list(user, { source: 'edge' })).rejects.toThrow('Unsupported source filter');
  });
});

describe('tracked events in Logs', () => {
  it('turns app events into readable log lines and skips telemetry events', () => {
    const occurredAt = new Date('2026-10-19T12:00:00.000Z');
    const log = eventToLog({
      eventId: 'evt_1',
      eventName: 'challenge_sent',
      occurredAt,
      properties: { opponent: 'ada', mode: 'ranked', meta: { nested: true }, requestId: 'req-9' },
      sessionId: 'sess_1',
      distinctId: 'user_42',
      route: '/play'
    });
    expect(log).toMatchObject({
      level: 'info',
      source: 'event',
      message: 'challenge_sent · opponent=ada mode=ranked requestId=req-9',
      sessionId: 'sess_1',
      distinctId: 'user_42',
      requestId: 'req-9',
      route: '/play',
      timestamp: occurredAt.toISOString()
    });
    expect(eventToLog({ eventId: 'e', eventName: '$page', occurredAt })).toBeNull();
    expect(eventToLog({ eventId: 'e', eventName: '$api_request', occurredAt })).toBeNull();
    expect(
      eventToLog({ eventId: 'e', eventName: '$exception', occurredAt, properties: { type: 'TypeError', message: 'x is undefined' } })
    ).toMatchObject({ level: 'error', status: 'error', message: 'TypeError: x is undefined' });
  });

  it('mirrors ingested events into observability_logs without blocking ingest', async () => {
    const db = mockDatabase((text) => {
      if (text.includes('FROM project_write_keys pwk')) return rows([{ project_id: 'proj_1', organization_id: 'org_1' }]);
      return { rows: [], rowCount: 1 };
    });
    const service = new EventsService(
      db as never,
      { deliverForEvent: vi.fn().mockResolvedValue(undefined) } as never,
      { afterProjectIngest: vi.fn().mockResolvedValue(undefined) } as never,
      { consumeProjectEvents: vi.fn().mockResolvedValue({}) } as never,
      undefined,
      undefined,
      new ObservabilityService(db as never, projects as never)
    );

    await service.ingestBatch('key', 'proj_1', [
      { eventName: 'multiplayer_connected', userId: 'user_42' },
      { eventName: 'challenge_sent', userId: 'user_42', properties: { opponent: 'ada' } },
      { eventName: '$page' }
    ]);
    await new Promise((resolve) => setImmediate(resolve));

    const inserts = db.queryCalls(/INSERT INTO observability_logs/);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values).toContain('multiplayer_connected');
    expect(inserts[0].values).toContain('challenge_sent · opponent=ada');
    expect(inserts[0].values).toContain('user_42');
    expect(inserts[0].values.filter((value) => value === 'event')).toHaveLength(2);
  });

  it('keeps ingest successful when the log mirror fails', async () => {
    const db = mockDatabase((text) => {
      if (text.includes('FROM project_write_keys pwk')) return rows([{ project_id: 'proj_1', organization_id: 'org_1' }]);
      if (text.includes('INSERT INTO observability_logs')) throw new Error('boom');
      return { rows: [], rowCount: 1 };
    });
    const service = new EventsService(
      db as never,
      { deliverForEvent: vi.fn().mockResolvedValue(undefined) } as never,
      { afterProjectIngest: vi.fn().mockResolvedValue(undefined) } as never,
      { consumeProjectEvents: vi.fn().mockResolvedValue({}) } as never,
      undefined,
      undefined,
      new ObservabilityService(db as never, projects as never)
    );
    const result = await service.ingest({ writeKey: 'key', projectId: 'proj_1', eventName: 'challenge_sent' });
    expect(result.accepted).toBe(true);
  });
});
