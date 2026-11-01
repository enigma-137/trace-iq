import { describe, expect, it } from 'vitest';
import { AdminService } from '../src/modules/admin/admin.service';
import { ACTIVATION_WEEKS, ActivationOrgRow, buildActivation, weekStartMs } from '../src/modules/admin/activation.util';
import { mockDatabase } from './helpers/mock-db';

// Sunday 1 Nov 2026, noon UTC. Its week started on Monday 26 Oct.
const NOW = new Date('2026-11-01T12:00:00Z');
const ago = (days: number, hours = 0) => new Date(NOW.getTime() - (days * 24 + hours) * 3600_000).toISOString();

const org = (id: string, overrides: Partial<ActivationOrgRow> = {}): ActivationOrgRow => ({
  id,
  name: `Org ${id}`,
  createdAt: ago(1),
  projectCount: 0,
  firstEventAt: null,
  lastEventAt: null,
  ...overrides
});

describe('week buckets', () => {
  it('starts weeks on Monday, UTC', () => {
    expect(new Date(weekStartMs(new Date('2026-11-01T23:59:00Z').getTime())).toISOString().slice(0, 10)).toBe('2026-10-26'); // Sunday
    expect(new Date(weekStartMs(new Date('2026-11-02T00:00:00Z').getTime())).toISOString().slice(0, 10)).toBe('2026-11-02'); // Monday
    expect(new Date(weekStartMs(new Date('2026-10-28T08:00:00Z').getTime())).toISOString().slice(0, 10)).toBe('2026-10-26'); // Wednesday
  });

  it('always returns eight weeks ending with the current one, even when empty', () => {
    const { weeks, totals, medianHoursToFirstEvent } = buildActivation([], NOW);
    expect(weeks).toHaveLength(ACTIVATION_WEEKS);
    expect(weeks[ACTIVATION_WEEKS - 1].weekStart).toBe('2026-10-26');
    expect(weeks[0].weekStart).toBe('2026-09-07');
    expect(totals).toEqual({ signedUp: 0, createdProject: 0, sentEvent: 0, eligibleForReturn: 0, returned: 0 });
    expect(medianHoursToFirstEvent).toBeNull();
  });
});

describe('funnel counts', () => {
  it('counts each stage once per workspace in its signup week', () => {
    const rows = [
      org('a'), // signed up, nothing else
      org('b', { projectCount: 1 }), // made a project
      org('c', { projectCount: 1, firstEventAt: ago(0, 20), lastEventAt: ago(0, 2) }), // sent events
      org('old', { createdAt: ago(100) }) // outside the window
    ];
    const current = buildActivation(rows, NOW).weeks[ACTIVATION_WEEKS - 1];
    expect(current).toMatchObject({ signedUp: 3, createdProject: 2, sentEvent: 1 });
    expect(buildActivation(rows, NOW).totals.signedUp).toBe(3);
  });

  it('puts a workspace in the week it signed up, not the week it activated', () => {
    const weeks = buildActivation(
      [org('a', { createdAt: ago(15), projectCount: 1, firstEventAt: ago(1), lastEventAt: ago(1) })],
      NOW
    ).weeks;
    const signupWeek = weeks.find((week) => week.signedUp === 1)!;
    expect(signupWeek.weekStart).toBe('2026-10-12');
    expect(signupWeek.sentEvent).toBe(1);
  });
});

describe('coming back after a week', () => {
  const returnedRow = (first: number, last: number) =>
    org('x', { createdAt: ago(first + 1), projectCount: 1, firstEventAt: ago(first), lastEventAt: ago(last) });

  it('cannot judge a workspace whose first event is under a week old', () => {
    const totals = buildActivation([returnedRow(6, 0)], NOW).totals;
    expect(totals).toMatchObject({ sentEvent: 1, eligibleForReturn: 0, returned: 0 });
  });

  it('counts a workspace that sent events at least a week after its first', () => {
    expect(buildActivation([returnedRow(10, 2)], NOW).totals).toMatchObject({ eligibleForReturn: 1, returned: 1 });
  });

  it('counts a workspace that went quiet within its first week as eligible but not returned', () => {
    expect(buildActivation([returnedRow(10, 9.5)], NOW).totals).toMatchObject({ eligibleForReturn: 1, returned: 0 });
  });
});

describe('time to first event', () => {
  it('is the median of hours from signup to first event', () => {
    const at = (hours: number) => org(`h${hours}`, { createdAt: ago(1), projectCount: 1, firstEventAt: new Date(new Date(ago(1)).getTime() + hours * 3600_000).toISOString(), lastEventAt: ago(0) });
    expect(buildActivation([at(1), at(3), at(10)], NOW).medianHoursToFirstEvent).toBe(3);
    expect(buildActivation([at(1), at(3)], NOW).medianHoursToFirstEvent).toBe(2);
  });
});

describe('stalled workspaces', () => {
  it('lists who has no project or no events, newest first, skipping the very new', () => {
    const rows = [
      org('fresh', { createdAt: ago(0, 0.5) }), // 30 minutes old: give them time
      org('noProject', { createdAt: ago(2) }),
      org('noEvents', { createdAt: ago(1), projectCount: 2 }),
      org('active', { createdAt: ago(3), projectCount: 1, firstEventAt: ago(2), lastEventAt: ago(1) })
    ];
    const { stalled } = buildActivation(rows, NOW);
    expect(stalled.map((item) => [item.id, item.stage])).toEqual([
      ['noEvents', 'no_events'],
      ['noProject', 'no_project']
    ]);
  });

  it('keeps the list short', () => {
    const rows = Array.from({ length: 40 }, (_, index) => org(`s${index}`, { createdAt: ago(1, index) }));
    expect(buildActivation(rows, NOW).stalled).toHaveLength(15);
  });
});

describe('AdminService.activation', () => {
  it('asks for one more week than it shows, so the oldest week is complete', async () => {
    const db = mockDatabase(() => ({ rows: [org('a', { createdAt: new Date().toISOString() })], rowCount: 1 }));
    const result = await new AdminService(db as never).activation();
    expect(db.calls[0].values).toEqual([ACTIVATION_WEEKS + 1]);
    expect(result.totals.signedUp).toBe(1);
  });
});
