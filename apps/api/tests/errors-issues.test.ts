import { describe, expect, it } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ErrorsService } from '../src/modules/errors/errors.service';
import { mockDatabase, rows } from './helpers/mock-db';

const project = { id: 'proj_1', name: 'App', slug: 'app', organizationId: 'org_1', organizationName: 'Acme', role: 'member' };
const user = { id: 'user_1', authMethod: 'supabase' } as const;

function makeService(onQuery: Parameters<typeof mockDatabase>[0]) {
  const db = mockDatabase(onQuery);
  const projects = {
    resolveActiveProject: async () => project,
    requireActiveProject: async () => project,
    requireWritableProject: async () => project
  };
  return { db, service: new ErrorsService(db as never, projects as never) };
}

describe('ErrorsService.listIssues', () => {
  it('groups by fingerprint with a type+message fallback and filters by status', async () => {
    const { db, service } = makeService((text) => {
      if (/GROUP BY status/.test(text)) {
        return rows([
          { status: 'open', total: 2 },
          { status: 'regressed', total: 1 },
          { status: 'resolved', total: 3 }
        ]);
      }
      if (/FROM issues/.test(text)) {
        return rows([{ id: 'fp_1', type: 'TypeError', message: 'x', occurrences: 4, sessions: 2, users: 1, firstSeen: '2026-10-01', lastSeen: '2026-10-17', status: 'regressed', assigneeUserId: null, resolvedAt: '2026-10-10' }]);
      }
      return rows([]);
    });

    const result = await service.listIssues(user, '14', undefined, 'open');

    const [list] = db.queryCalls(/FROM issues\s+WHERE/);
    expect(list.text).toContain(`NULLIF(e.properties->>'$fingerprint', '')`);
    expect(list.text).toContain('md5(');
    expect(list.text).toContain(`WHEN ei.status = 'resolved' AND agg."lastSeen" > ei.resolved_at THEN 'regressed'`);
    expect(list.values).toEqual(['proj_1', '$exception', 14, 'open']);
    expect(result.issues[0]).toMatchObject({ id: 'fp_1', status: 'regressed', sparkline: expect.any(Array) });
    // Open includes regressed issues; all counts every issue.
    expect(result.counts).toEqual({ all: 6, open: 3, regressed: 1, resolved: 3, ignored: 0 });
  });

  it('defaults to all statuses and rejects unknown ones', async () => {
    const { service } = makeService(() => rows([]));
    await expect(service.listIssues(user)).resolves.toMatchObject({ status: 'all' });
    await expect(service.listIssues(user, '7', undefined, 'closed')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ErrorsService.getIssue', () => {
  it('looks an issue up by id and reports a regression', async () => {
    const { db, service } = makeService((text) => {
      if (/FROM error_issues/.test(text)) return rows([{ status: 'resolved', assignee_user_id: 'user_2', resolved_at: '2026-10-10T00:00:00Z' }]);
      if (/ORDER BY e.occurred_at DESC LIMIT 1/.test(text)) return rows([{ id: 'fp_1', type: 'TypeError', message: 'boom' }]);
      if (/count\(\*\)::int AS occurrences/.test(text)) return rows([{ occurrences: 2, sessions: 1, users: 1, firstSeen: '2026-10-01T00:00:00Z', lastSeen: '2026-10-15T00:00:00Z' }]);
      return rows([]);
    });

    const result = await service.getIssue(user, { id: 'fp_1' });

    expect(result.issue).toEqual({
      id: 'fp_1',
      type: 'TypeError',
      message: 'boom',
      status: 'regressed',
      assigneeUserId: 'user_2',
      resolvedAt: '2026-10-10T00:00:00Z'
    });
    const [identity] = db.queryCalls(/ORDER BY e.occurred_at DESC LIMIT 1/);
    expect(identity.values).toEqual(['proj_1', '$exception', 'fp_1', 14]);
  });

  it('still accepts type + message for older links', async () => {
    const { db, service } = makeService((text) =>
      /ORDER BY e.occurred_at DESC LIMIT 1/.test(text) ? rows([{ id: 'fp_9', type: 'Error', message: 'm' }]) : rows([])
    );

    const result = await service.getIssue(user, { type: 'Error', message: 'm' });

    expect(result.issue).toMatchObject({ id: 'fp_9', status: 'open' });
    const [identity] = db.queryCalls(/ORDER BY e.occurred_at DESC LIMIT 1/);
    expect(identity.values).toEqual(['proj_1', '$exception', 'Error', 'm', 14]);
  });
});

describe('ErrorsService.updateIssue', () => {
  function updateService(state: Record<string, unknown> | null, { exists = true, member = true } = {}) {
    return makeService((text, values) => {
      if (/SELECT 1 FROM events/.test(text)) return rows(exists ? [{ '?column?': 1 }] : []);
      if (/FROM organization_members/.test(text)) return rows(member ? [{ '?column?': 1 }] : []);
      if (/SELECT status, assignee_user_id, resolved_at FROM error_issues/.test(text)) return rows(state ? [state] : []);
      if (/INSERT INTO error_issues/.test(text)) {
        return rows([{ status: values[2], assignee_user_id: values[3], resolved_at: values[4] }]);
      }
      return rows([]);
    });
  }

  it('resolving stamps resolved_at and records who did it', async () => {
    const { db, service } = updateService(null);

    const result = await service.updateIssue(user, 'fp_1', { status: 'resolved' });

    const [insert] = db.queryCalls(/INSERT INTO error_issues/);
    expect(insert.values.slice(0, 4)).toEqual(['proj_1', 'fp_1', 'resolved', null]);
    expect(insert.values[4]).toEqual(expect.any(String));
    expect(insert.values[5]).toBe('user_1');
    expect(result.issue.status).toBe('resolved');
  });

  it('reopening clears resolved_at and keeps the assignee', async () => {
    const { db, service } = updateService({ status: 'resolved', assignee_user_id: 'user_2', resolved_at: '2026-10-10T00:00:00Z' });

    await service.updateIssue(user, 'fp_1', { status: 'open' });

    const [insert] = db.queryCalls(/INSERT INTO error_issues/);
    expect(insert.values.slice(2, 5)).toEqual(['open', 'user_2', null]);
  });

  it('assigns to the caller with "me" and checks membership', async () => {
    const { db, service } = updateService(null);

    await service.updateIssue(user, 'fp_1', { assigneeUserId: 'me' });

    const [member] = db.queryCalls(/FROM organization_members/);
    expect(member.values).toEqual(['org_1', 'user_1']);
    const [insert] = db.queryCalls(/INSERT INTO error_issues/);
    expect(insert.values.slice(2, 4)).toEqual(['open', 'user_1']);
  });

  it('rejects non-members, unknown statuses, empty updates and unknown issues', async () => {
    await expect(updateService(null, { member: false }).service.updateIssue(user, 'fp_1', { assigneeUserId: 'stranger' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(updateService(null).service.updateIssue(user, 'fp_1', { status: 'closed' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(updateService(null).service.updateIssue(user, 'fp_1', {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(updateService(null, { exists: false }).service.updateIssue(user, 'fp_x', { status: 'ignored' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
