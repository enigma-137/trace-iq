import { describe, expect, it, vi } from 'vitest';
import { OnboardingService } from '../src/modules/onboarding/onboarding.service';
import { mockDatabase, rows } from './helpers/mock-db';

const user = { id: 'usr_1', email: 'a@b.co', authMethod: 'session' };

function service(row: Record<string, unknown> | undefined) {
  const db = mockDatabase(() => rows(row ? [row] : []));
  const projects = { requireActiveProject: vi.fn().mockResolvedValue({ id: 'proj_1', name: 'Nuwell AI Web' }) };
  return { db, projects, service: new OnboardingService(db as never, projects as never) };
}

describe('OnboardingService', () => {
  it('reports which getting-started steps are done', async () => {
    const { service: onboarding } = service({ firstEvent: true, identifiedUser: false, briefChannel: true, alert: false });
    expect(await onboarding.getStatus(user as never, 'proj_1')).toEqual({
      project: { id: 'proj_1', name: 'Nuwell AI Web' },
      steps: { firstEvent: true, identifiedUser: false, briefChannel: true, alert: false }
    });
  });

  it('treats a brand-new project as having done nothing', async () => {
    const { service: onboarding } = service({ firstEvent: false, identifiedUser: false, briefChannel: false, alert: false });
    expect((await onboarding.getStatus(user as never)).steps).toEqual({ firstEvent: false, identifiedUser: false, briefChannel: false, alert: false });
  });

  it('does not invent progress when the query returns nothing', async () => {
    const { service: onboarding } = service(undefined);
    expect((await onboarding.getStatus(user as never)).steps).toEqual({ firstEvent: false, identifiedUser: false, briefChannel: false, alert: false });
  });

  it('only counts this project, through the project the user can open', async () => {
    const { db, projects, service: onboarding } = service({ firstEvent: true, identifiedUser: true, briefChannel: true, alert: true });
    await onboarding.getStatus(user as never, 'proj_other');
    expect(projects.requireActiveProject).toHaveBeenCalledWith(user, 'proj_other');
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0].values).toEqual(['proj_1']); // the resolved project, not the requested id
  });

  it('counts only a connected, switched-on chat and an identified user', async () => {
    const { db, service: onboarding } = service({ firstEvent: true, identifiedUser: true, briefChannel: true, alert: true });
    await onboarding.getStatus(user as never);
    const sql = db.calls[0].text;
    expect(sql).toContain('FROM brief_channels WHERE project_id = $1 AND enabled');
    expect(sql).toContain('external_id IS NOT NULL');
    // Existence checks only: nothing is counted or scanned.
    expect(sql).not.toMatch(/count\(/i);
  });

  it('propagates a project the user cannot open', async () => {
    const db = mockDatabase(() => rows([]));
    const projects = { requireActiveProject: vi.fn().mockRejectedValue(new Error('No project found')) };
    await expect(new OnboardingService(db as never, projects as never).getStatus(user as never, 'proj_x')).rejects.toThrow('No project found');
    expect(db.calls).toHaveLength(0);
  });
});
