import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { mockDatabase, rows, affected } from './helpers/mock-db';

type ProjectRow = {
  id: string;
  name: string;
  slug: string;
  organizationId: string;
  organizationName: string;
  role: string;
};

function makeProject(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: 'proj_1',
    name: 'Web App',
    slug: 'web-app',
    organizationId: 'org_1',
    organizationName: 'Acme',
    role: 'owner',
    ...overrides
  };
}

const user = { id: 'user_1', authMethod: 'supabase' } as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProjectsService.renameProject', () => {
  it('renames project successfully for owner', async () => {
    const auditRecord = vi.fn().mockResolvedValue(undefined);
    const db = mockDatabase((text) => {
      if (/FROM organization_members om/.test(text)) {
        return rows([makeProject()]);
      }
      if (/UPDATE projects/.test(text)) {
        return affected(1);
      }
      return rows([]);
    });

    const service = new ProjectsService(db as never, undefined as never, { record: auditRecord } as never);

    const result = await service.renameProject(user, 'proj_1', 'Production App');

    expect(result.project).toMatchObject({
      id: 'proj_1',
      name: 'Production App',
      slug: 'web-app',
      organizationId: 'org_1'
    });

    const updateCalls = db.queryCalls(/UPDATE projects/);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].values).toEqual(['proj_1', 'Production App']);

    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_1',
        actorUserId: 'user_1',
        action: 'project.renamed',
        metadata: {
          projectId: 'proj_1',
          oldName: 'Web App',
          newName: 'Production App'
        }
      })
    );
  });

  it('allows admin to rename project', async () => {
    const db = mockDatabase((text) => {
      if (/FROM organization_members om/.test(text)) {
        return rows([makeProject({ role: 'admin' })]);
      }
      if (/UPDATE projects/.test(text)) {
        return affected(1);
      }
      return rows([]);
    });

    const service = new ProjectsService(db as never);
    const result = await service.renameProject(user, 'proj_1', 'Admin Renamed');
    expect(result.project.name).toBe('Admin Renamed');
  });

  it('rejects members from renaming project', async () => {
    const db = mockDatabase((text) => {
      if (/FROM organization_members om/.test(text)) {
        return rows([makeProject({ role: 'member' })]);
      }
      return rows([]);
    });

    const service = new ProjectsService(db as never);
    await expect(service.renameProject(user, 'proj_1', 'Hacked Name')).rejects.toThrow(ForbiddenException);
  });

  it('rejects empty or whitespace project names', async () => {
    const db = mockDatabase((text) => {
      if (/FROM organization_members om/.test(text)) {
        return rows([makeProject()]);
      }
      return rows([]);
    });

    const service = new ProjectsService(db as never);
    await expect(service.renameProject(user, 'proj_1', '')).rejects.toThrow(BadRequestException);
    await expect(service.renameProject(user, 'proj_1', '   ')).rejects.toThrow(BadRequestException);
  });

  it('rejects names exceeding 80 characters', async () => {
    const db = mockDatabase((text) => {
      if (/FROM organization_members om/.test(text)) {
        return rows([makeProject()]);
      }
      return rows([]);
    });

    const service = new ProjectsService(db as never);
    const longName = 'a'.repeat(81);
    await expect(service.renameProject(user, 'proj_1', longName)).rejects.toThrow(BadRequestException);
  });
});

describe('ProjectsService.deleteProject', () => {
  it('deletes project and cleans up session replays in atomic transaction for owner', async () => {
    const auditRecord = vi.fn().mockResolvedValue(undefined);
    const db = mockDatabase((text) => {
      if (/FROM organization_members om/.test(text)) {
        return rows([makeProject()]);
      }
      if (/DELETE FROM replay_chunks/.test(text)) {
        return affected(5);
      }
      if (/DELETE FROM session_replay_funnels/.test(text)) {
        return affected(1);
      }
      if (/DELETE FROM replay_setting_funnels/.test(text)) {
        return affected(1);
      }
      if (/DELETE FROM session_replays/.test(text)) {
        return affected(2);
      }
      if (/DELETE FROM replay_settings/.test(text)) {
        return affected(1);
      }
      if (/DELETE FROM projects/.test(text)) {
        return affected(1);
      }
      if (/id,\s*name,\s*slug/i.test(text)) {
        return rows([{ id: 'proj_2', name: 'Mobile App', slug: 'mobile-app' }]);
      }
      return rows([]);
    });

    const service = new ProjectsService(db as never, undefined as never, { record: auditRecord } as never);

    const result = await service.deleteProject(user, 'proj_1');

    expect(result.deleted).toBe(true);
    expect(result.projectId).toBe('proj_1');
    expect(result.remainingProjects).toEqual([
      { id: 'proj_2', name: 'Mobile App', slug: 'mobile-app' }
    ]);

    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_1',
        actorUserId: 'user_1',
        action: 'project.deleted',
        metadata: {
          projectId: 'proj_1',
          projectName: 'Web App'
        }
      })
    );

    // Verify cascading deletion queries were dispatched
    expect(db.queryCalls(/DELETE FROM replay_chunks/)).toHaveLength(1);
    expect(db.queryCalls(/DELETE FROM session_replays/)).toHaveLength(1);
    expect(db.queryCalls(/DELETE FROM projects/)).toHaveLength(1);
  });

  it('rejects members from deleting project', async () => {
    const db = mockDatabase((text) => {
      if (/FROM organization_members om/.test(text)) {
        return rows([makeProject({ role: 'member' })]);
      }
      return rows([]);
    });

    const service = new ProjectsService(db as never);
    await expect(service.deleteProject(user, 'proj_1')).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException when project is not found or not accessible', async () => {
    const db = mockDatabase(() => rows([]));
    const service = new ProjectsService(db as never);
    await expect(service.deleteProject(user, 'proj_nonexistent')).rejects.toThrow(NotFoundException);
  });
});
