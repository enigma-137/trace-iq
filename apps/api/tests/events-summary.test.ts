import { describe, expect, it, vi } from 'vitest';
import { EventsService } from '../src/modules/events/events.service';
import { empty, mockDatabase, rows } from './helpers/mock-db';

function serviceWith(summaryRows: Record<string, unknown[]>) {
  const db = mockDatabase((text) => {
    if (text.includes('FROM organization_members')) return rows([{ id: 'proj_1', name: 'Web' }]);
    if (text.includes('count(DISTINCT e.event_name)')) return rows(summaryRows.totals);
    if (text.includes('GROUP BY 1 ORDER BY value DESC LIMIT 8')) return rows(summaryRows.topEvents);
    if (text.includes('extract(hour')) return rows(summaryRows.hours);
    if (text.includes("'deviceType'")) return rows(summaryRows.devices);
    if (text.includes('ORDER BY total DESC LIMIT 6')) return rows(summaryRows.topUsers);
    return empty();
  });
  return new EventsService(db as never, { deliverForEvent: vi.fn() } as never, { afterProjectIngest: vi.fn() } as never);
}

describe('dashboard events summary', () => {
  it('reports totals for the whole window, not just the loaded rows', async () => {
    const service = serviceWith({
      totals: [{ total: 4812, types: 13, users: 220, last24h: 640 }],
      topEvents: [{ label: '$page', value: 2000 }],
      hours: [{ hour: 14, value: 300 }],
      devices: [{ label: 'desktop', value: 4000 }],
      topUsers: [{ label: 'a@b.co', total: 90 }]
    });
    const result = await service.listDashboardRecentEvents({ id: 'u1' } as never, 50);
    expect(result.summary).toMatchObject({ windowDays: 7, total: 4812, eventTypes: 13, users: 220, last24h: 640 });
    expect(result.summary?.hourCounts).toHaveLength(24);
    expect(result.summary?.hourCounts[14]).toBe(300);
    expect(result.summary?.topUsers[0]).toEqual({ label: 'a@b.co', total: 90 });
  });

  it('returns zeros for a project with no events', async () => {
    const service = serviceWith({ totals: [], topEvents: [], hours: [], devices: [], topUsers: [] });
    const result = await service.listDashboardRecentEvents({ id: 'u1' } as never);
    expect(result.summary).toMatchObject({ total: 0, eventTypes: 0, users: 0, last24h: 0, topEvents: [] });
  });
});
