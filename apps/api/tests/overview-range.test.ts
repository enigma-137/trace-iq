import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsService, parseOverviewRange } from '../src/modules/analytics/analytics.service';
import { mockDatabase, rows } from './helpers/mock-db';

const project = {
  id: 'proj_1', name: 'Site', slug: 'site',
  organizationId: 'org_1', organizationName: 'Org', role: 'owner'
};
const user = { id: 'usr_1', authMethod: 'supabase' } as const;

afterEach(() => vi.useRealTimers());

function setup(onQuery?: (sql: string) => ReturnType<typeof rows> | undefined) {
  const db = mockDatabase((sql) => onQuery?.(sql) ?? rows([]));
  const projects = { resolveActiveProject: vi.fn().mockResolvedValue(project) };
  return { db, projects, service: new AnalyticsService(db as never, projects as never) };
}

describe('parseOverviewRange', () => {
  it('accepts the three presets and falls back to 7d for anything else', () => {
    expect(parseOverviewRange('24h')).toBe('24h');
    expect(parseOverviewRange('30d')).toBe('30d');
    expect(parseOverviewRange(undefined)).toBe('7d');
    expect(parseOverviewRange('90d')).toBe('7d');
    expect(parseOverviewRange('toString')).toBe('7d');
  });
});

describe('overview time range', () => {
  it('bounds every event scan by the selected range instead of counting all time', async () => {
    const { db, service } = setup();
    const result = await service.getOverview(user, undefined, undefined, '30d');

    expect(result.range).toBe('30d');
    const eventScans = db.calls.filter((call) => call.text.includes('FROM events'));
    expect(eventScans.length).toBeGreaterThan(5);
    for (const call of eventScans) {
      // max(occurred_at) is an index lookup, the only unbounded read left.
      const unbounded = call.text.replace(/SELECT max\(occurred_at\) FROM events WHERE project_id = \$1/g, '');
      if (!unbounded.includes('FROM events')) continue;
      expect(unbounded).toMatch(/occurred_at >= now\(\) - interval '30 days'/);
    }
    expect(db.calls.map((call) => call.text).join('\n')).not.toMatch(/interval '(14|60) days'/);
    expect(db.queryCalls('WITH rev AS')[0].text).toContain("interval '30 days' * 2");
  });

  it('uses hourly buckets for the last 24 hours', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T12:30:00Z'));
    const { db, service } = setup((sql) =>
      sql.includes('AS api_calls')
        ? rows([{ bucket: '2026-09-03T11:00:00Z', total: 9, api_calls: 3, errors: 1 }])
        : undefined
    );

    const result = await service.getOverview(user, undefined, undefined, '24h');

    expect(db.queryCalls('AS api_calls')[0].text).toContain("date_trunc('hour'");
    expect(result.observabilitySeries).toHaveLength(25);
    expect(result.observabilitySeries.find((point) => point.bucket === '2026-09-03T11:00:00Z'))
      .toEqual({ bucket: '2026-09-03T11:00:00Z', events: 9, apiCalls: 3, errors: 1 });
  });

  it('defaults to the last 7 days with daily buckets', async () => {
    const { db, service } = setup();
    const result = await service.getOverview(user);

    expect(result.range).toBe('7d');
    expect(db.queryCalls('AS api_calls')[0].text).toContain("date_trunc('day'");
    expect(db.queryCalls('AS total_events')[0].text).toContain("interval '7 days'");
  });
});

describe('overview cache', () => {
  it('reuses one computation per project and range for a minute, and still checks access each time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T12:00:00Z'));
    const { db, projects, service } = setup();

    await service.getOverview(user, 'proj_1');
    const queriesPerOverview = db.calls.length;
    await Promise.all([service.getOverview(user, 'proj_1'), service.getOverview(user, 'proj_1')]);
    expect(db.calls.length).toBe(queriesPerOverview);
    expect(projects.resolveActiveProject).toHaveBeenCalledTimes(3);

    await service.getOverview(user, 'proj_1', undefined, '24h');
    expect(db.calls.length).toBe(queriesPerOverview * 2);

    vi.setSystemTime(new Date('2026-09-03T12:01:01Z'));
    await service.getOverview(user, 'proj_1');
    expect(db.calls.length).toBe(queriesPerOverview * 3);
  });

  it('does not cache a failed computation', async () => {
    let fail = true;
    const { db, service } = setup((sql) => {
      if (fail && sql.includes('AS total_events')) throw new Error('database unavailable');
      return undefined;
    });

    await expect(service.getOverview(user)).rejects.toThrow('database unavailable');
    fail = false;
    const before = db.calls.length;
    await expect(service.getOverview(user)).resolves.toMatchObject({ range: '7d' });
    expect(db.calls.length).toBeGreaterThan(before);
  });
});
