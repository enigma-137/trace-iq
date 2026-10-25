import { describe, expect, it } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GroupsService } from '../src/modules/groups/groups.service';
import { mockDatabase, rows } from './helpers/mock-db';

const project = { id: 'proj_1', name: 'App', slug: 'app', organizationId: 'org_1', organizationName: 'Acme', role: 'member' };
const user = { id: 'user_1', authMethod: 'supabase' } as const;
const projects = { resolveActiveProject: async () => project, requireActiveProject: async () => project };

function makeService(onQuery: Parameters<typeof mockDatabase>[0]) {
  const db = mockDatabase(onQuery);
  return { db, service: new GroupsService(db as never, projects as never) };
}

describe('GroupsService.listGroups', () => {
  it('derives groups from $group events and ranks them by member activity', async () => {
    const { db, service } = makeService(() =>
      rows([
        { key: 'acme', traits: { name: 'Acme Inc', plan: 'growth', nested: { a: 1 } }, members: 3, activeMembers: 2, events: 40, firstSeen: '2026-10-01', lastSeen: '2026-10-20', lastActiveAt: '2026-10-25', total: 2 },
        { key: 'org_2', traits: null, members: 1, activeMembers: null, events: null, firstSeen: '2026-10-02', lastSeen: '2026-10-02', lastActiveAt: null, total: 2 }
      ])
    );

    const result = await service.listGroups(user, { days: '14', search: ' acme ' });

    const [call] = db.calls;
    expect(call.text).toContain(`e.event_name = '$group'`);
    expect(call.text).toContain(`e.properties->>'organizationId'`);
    expect(call.text).toContain(`NOT IN ('$group', '$identify', '$alias')`);
    expect(call.values).toEqual(['proj_1', 14, 'acme']);
    expect(result.total).toBe(2);
    expect(result.groups[0]).toMatchObject({ key: 'acme', name: 'Acme Inc', traits: { name: 'Acme Inc', plan: 'growth' }, events: 40 });
    // A group without a name trait is shown by its id, and missing activity is zero.
    expect(result.groups[1]).toMatchObject({ key: 'org_2', name: 'org_2', events: 0, activeMembers: 0, lastActiveAt: null });
  });

  it('defaults to 30 days and no search', async () => {
    const { db, service } = makeService(() => rows([]));
    await expect(service.listGroups(user, { days: '5' })).resolves.toMatchObject({ days: 30, groups: [], total: 0 });
    expect(db.calls[0].values).toEqual(['proj_1', 30, null]);
  });
});

describe('GroupsService.getGroup', () => {
  it('returns traits, members, a daily timeline and top events for one group', async () => {
    const { db, service } = makeService((text) => {
      if (/CROSS JOIN activity/.test(text)) {
        return rows([{ key: 'acme', traits: { name: 'Acme Inc' }, members: 2, activeMembers: 1, events: 5, firstSeen: '2026-10-01', lastSeen: '2026-10-20', lastActiveAt: '2026-10-25' }]);
      }
      if (/FROM members m/.test(text)) {
        return rows([
          { actor: 'usr_a', userId: 'usr_a', externalId: 'alice', anonymousId: null, traits: { name: 'Alice', email: 'a@x.io' }, joinedAt: '2026-10-01', events: 5, lastActiveAt: '2026-10-25' },
          { actor: 'anon_9', userId: null, externalId: null, anonymousId: null, traits: null, joinedAt: '2026-10-03', events: null, lastActiveAt: null }
        ]);
      }
      if (/GROUP BY 1 ORDER BY 1/.test(text)) return rows([{ day: new Date().toISOString().slice(0, 10), events: 5, activeMembers: 1 }]);
      if (/LIMIT 10/.test(text)) return rows([{ name: 'checkout', total: 5 }]);
      return rows([]);
    });

    const result = await service.getGroup(user, 'acme', { days: '7' });

    for (const call of db.calls) {
      expect(call.text).toContain(`e.properties->>'organizationId' = $3`);
      expect(call.values.slice(0, 3)).toEqual(['proj_1', 7, 'acme']);
    }
    expect(result.group).toMatchObject({ key: 'acme', name: 'Acme Inc', events: 5, allTraits: { name: 'Acme Inc' } });
    expect(result.members[0]).toMatchObject({ id: 'usr_a', userId: 'usr_a', displayName: 'Alice', email: 'a@x.io', events: 5 });
    expect(result.members[1]).toMatchObject({ id: 'anon_9', userId: null, events: 0 });
    expect(result.timeline).toHaveLength(7);
    expect(result.timeline[6]).toMatchObject({ events: 5, activeMembers: 1 });
    expect(result.topEvents).toEqual([{ name: 'checkout', total: 5 }]);
  });

  it('rejects a missing id and 404s an unknown group', async () => {
    const { service } = makeService(() => rows([]));
    await expect(service.getGroup(user, ' ', {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.getGroup(user, 'nope', {})).rejects.toBeInstanceOf(NotFoundException);
  });
});
