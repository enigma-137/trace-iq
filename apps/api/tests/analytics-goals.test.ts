import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { GoalsService } from '../src/modules/analytics/goals.service';
import { affected, mockDatabase, rows } from './helpers/mock-db';

const project = { id: 'proj_1', name: 'Site', slug: 'site', organizationId: 'org_1', organizationName: 'Org', role: 'owner' };
const user = { id: 'usr_1', authMethod: 'supabase' } as const;

function setup(rowCount = 1) {
  const db = mockDatabase((sql) => sql.includes('SELECT id, name')
    ? rows([{ id: 'gol_1', name: 'Purchase', type: 'event', target: 'purchase', createdAt: '2026-01-01' }])
    : affected(rowCount));
  const projects = { resolveActiveProject: vi.fn().mockResolvedValue(project), requireActiveProject: vi.fn().mockResolvedValue(project) };
  return { db, service: new GoalsService(db as never, projects as never) };
}

describe('GoalsService', () => {
  it('creates a project-scoped event goal', async () => {
    const { db, service } = setup();
    const goal = await service.create(user, { name: 'Purchase', type: 'event', target: 'purchase', projectId: project.id });
    expect(goal).toMatchObject({ name: 'Purchase', type: 'event', target: 'purchase' });
    expect(db.queryCalls('INSERT INTO analytics_goals')[0].values.slice(1, 5)).toEqual(['proj_1', 'Purchase', 'event', 'purchase']);
  });

  it('rejects invalid goal types', async () => {
    const { service } = setup();
    await expect(service.create(user, { name: 'Bad', type: 'regex' as never, target: 'x' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reports a missing goal on delete', async () => {
    const { service } = setup(0);
    await expect(service.remove(user, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
