import { describe, expect, it, vi } from 'vitest';
import { StatusService, buildPublicStatus, type StatusDayRow, type StatusLatestRow } from '../src/modules/status/status.service';

const now = new Date('2026-10-22T12:00:30Z');
const minutesSoFarToday = 12 * 60;

function day(component: StatusDayRow['component'], date: string, operational: number, degraded = 0, down = 0): StatusDayRow {
  return { component, day: date, operational: String(operational), degraded: String(degraded), down: String(down) };
}

function latest(minute = '2026-10-22T12:00:00Z'): StatusLatestRow[] {
  return (['api', 'database', 'ingestion'] as const).map((component) => ({ component, minute, status: 'operational' }));
}

describe('public status summary', () => {
  it('reports full uptime when every elapsed minute was recorded and ignores the unchecked current minute', () => {
    const status = buildPublicStatus({
      dayRows: [day('api', '2026-10-21', 1_440), day('api', '2026-10-22', minutesSoFarToday)],
      latestRows: latest(),
      monitoringStart: new Date('2026-10-21T00:00:00Z'),
      now,
      days: 3
    });
    const api = status.components.find((component) => component.key === 'api')!;
    expect(api.history).toEqual([
      { date: '2026-10-20', level: 'none', uptimePercent: null },
      { date: '2026-10-21', level: 'operational', uptimePercent: 100 },
      { date: '2026-10-22', level: 'operational', uptimePercent: 100 }
    ]);
    expect(api.status).toBe('operational');
    expect(api.uptimePercent).toBe(100);
  });

  it('counts unrecorded minutes as API and ingestion downtime but not database downtime', () => {
    const status = buildPublicStatus({
      dayRows: [day('api', '2026-10-21', 1_380), day('ingestion', '2026-10-21', 1_380), day('database', '2026-10-21', 1_380)],
      latestRows: latest(),
      monitoringStart: new Date('2026-10-21T00:00:00Z'),
      now,
      days: 2
    });
    const [api, ingestion, database] = status.components;
    expect(api.history[0]).toEqual({ date: '2026-10-21', level: 'down', uptimePercent: 95.83 });
    expect(ingestion.history[0].level).toBe('down');
    expect(database.history[0]).toEqual({ date: '2026-10-21', level: 'operational', uptimePercent: 100 });
  });

  it('marks short or degraded days amber and never rounds downtime up to 100%', () => {
    const status = buildPublicStatus({
      dayRows: [day('api', '2026-10-21', 1_438), day('database', '2026-10-21', 1_300, 140)],
      latestRows: latest(),
      monitoringStart: new Date('2026-10-21T00:00:00Z'),
      now,
      days: 2
    });
    const api = status.components.find((component) => component.key === 'api')!;
    const database = status.components.find((component) => component.key === 'database')!;
    expect(api.history[0]).toEqual({ date: '2026-10-21', level: 'degraded', uptimePercent: 99.86 });
    expect(database.history[0].level).toBe('degraded');
    expect(database.history[0].uptimePercent).toBe(100);
  });

  it('reports the API down when checks stop arriving', () => {
    const status = buildPublicStatus({
      dayRows: [], latestRows: latest('2026-10-22T11:50:00Z'),
      monitoringStart: new Date('2026-10-22T00:00:00Z'), now, days: 1
    });
    expect(status.status).toBe('down');
    expect(status.components.map((component) => component.status)).toEqual(['down', 'down', 'unknown']);
  });

  it('exposes only the public fields', () => {
    const status = buildPublicStatus({ dayRows: [], latestRows: [], monitoringStart: null, now, days: 1 });
    expect(Object.keys(status).sort()).toEqual(['components', 'days', 'generatedAt', 'status']);
    expect(Object.keys(status.components[0]).sort()).toEqual(['description', 'history', 'key', 'name', 'status', 'uptimePercent']);
    expect(status.status).toBe('degraded');
  });
});

describe('status monitor', () => {
  it('records one row per component for the current minute, keeping the worst status', async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 1 }));
    const service = new StatusService({ query } as never);
    await service.recordChecks(new Date('2026-10-22T12:00:45Z'));
    const insert = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO status_checks')) as unknown as [string, unknown[]];
    expect(insert[0]).toContain('ON CONFLICT (component, minute)');
    expect(insert[1]).toEqual([
      'api', '2026-10-22T12:00:00.000Z', 'operational', null,
      'database', '2026-10-22T12:00:00.000Z', 'operational', expect.any(Number),
      'ingestion', '2026-10-22T12:00:00.000Z', 'operational', null
    ]);
  });

  it('buffers checks while the database is down and writes them once it recovers', async () => {
    let available = false;
    const query = vi.fn(async () => {
      if (!available) throw new Error('connection refused to db.internal:5432');
      return { rows: [], rowCount: 1 };
    });
    const service = new StatusService({ query } as never);
    await service.recordChecks(new Date('2026-10-22T12:00:00Z'));
    available = true;
    await service.recordChecks(new Date('2026-10-22T12:01:00Z'));
    const inserts = query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO status_checks')) as unknown as [string, unknown[]][];
    const values = inserts.at(-1)![1];
    expect(values).toEqual(expect.arrayContaining(['database', '2026-10-22T12:00:00.000Z', 'down']));
    expect(values).toEqual(expect.arrayContaining(['ingestion', '2026-10-22T12:00:00.000Z', 'down']));
    expect(values).toEqual(expect.arrayContaining(['api', '2026-10-22T12:01:00.000Z', 'operational']));
  });
});
