import { describe, expect, it, vi } from 'vitest';
import { UsersService } from '../src/modules/users/users.service';
import { mockDatabase, rows } from './helpers/mock-db';

const user = { id: 'usr_owner' } as never;
const project = { id: 'proj_1', name: 'Game', organizationId: 'org_1', role: 'owner' };

function service() {
  const db = mockDatabase((text) => {
    if (text.includes('AS "totalUsers"')) return rows([{ totalUsers: 1203, activeUsers14d: 400, newUsers14d: 50, returningUsers: 300 }]);
    if (text.includes('count(*)::int AS count')) return rows([{ count: 3 }]);
    return rows([]);
  });
  const projects = { resolveActiveProject: vi.fn().mockResolvedValue(project) };
  return { db, users: new UsersService(db as never, projects as never) };
}

describe('UsersService.listPersons search', () => {
  it('searches the whole project in SQL and counts the matches for pagination', async () => {
    const { db, users } = service();
    const result = await users.listPersons(user, { search: 'ada', limit: '20', offset: '0' });

    const page = db.queryCalls('LIMIT $3 OFFSET $4')[0];
    expect(page.text).toContain("u.traits->>'email' ILIKE");
    expect(page.values).toEqual(['proj_1', 'ada', 20, 0]);
    const count = db.queryCalls('count(*)::int AS count')[0];
    expect(count.values).toEqual(['proj_1', 'ada']);
    expect(result.totalCount).toBe(3);
    // Stat cards stay project-wide.
    expect(result.stats?.totalUsers).toBe(1203);
  });

  it('treats % and _ in the query literally', async () => {
    const { db, users } = service();
    await users.listPersons(user, { search: '50%_off' });
    expect(db.queryCalls('LIMIT $3 OFFSET $4')[0].values[1]).toBe('50\\%\\_off');
  });

  it('filters tabs (new / returning / inactive) in SQL across all users', async () => {
    const { db, users } = service();
    const result = await users.listPersons(user, { segment: 'returning', search: 'ada' });
    const page = db.queryCalls('LIMIT $3 OFFSET $4')[0];
    expect(page.text).toContain("u.first_seen_at < now() - interval '14 days' AND u.last_seen_at >= now() - interval '14 days'");
    expect(page.values).toEqual(['proj_1', 'ada', 25, 0]);
    expect(db.queryCalls('count(*)::int AS count')[0].text).toContain("u.last_seen_at >= now() - interval '14 days'");
    expect(result.totalCount).toBe(3);

    await users.listPersons(user, { segment: 'inactive' });
    expect(db.queryCalls('LIMIT $3 OFFSET $4')[1].text).toContain("u.last_seen_at < now() - interval '30 days'");
  });

  it('ignores unknown segments, including inherited object keys', async () => {
    const { db, users } = service();
    for (const segment of ['bogus', 'constructor', "new' OR 1=1 --"]) {
      const result = await users.listPersons(user, { segment });
      expect(result.totalCount).toBe(1203);
    }
    for (const call of db.queryCalls('LIMIT $3 OFFSET $4')) {
      expect(call.text).not.toContain('first_seen_at >= now()');
      expect(call.text).not.toContain('OR 1=1');
    }
    expect(db.queryCalls('count(*)::int AS count')).toHaveLength(0);
  });

  it('skips the match count without a search', async () => {
    const { db, users } = service();
    const result = await users.listPersons(user, {});
    expect(db.queryCalls('count(*)::int AS count')).toHaveLength(0);
    expect(result.totalCount).toBe(1203);
    expect(db.queryCalls('LIMIT $3 OFFSET $4')[0].values[1]).toBeNull();
  });
});
