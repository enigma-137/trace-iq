import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { FunnelsService } from '../src/modules/funnels/funnels.service';
import { affected, empty, mockDatabase, rows, type MockDb } from './helpers/mock-db';

const PROJECT = {
  id: 'proj_1',
  name: 'Web App',
  slug: 'web-app',
  organizationId: 'org_1',
  organizationName: 'Acme',
  role: 'owner'
};

const ONBOARDING_STEPS = [
  { order: 0, eventName: 'sign_up', label: null },
  { order: 1, eventName: 'sign_up_complete', label: 'Sign up complete' },
  { order: 2, eventName: 'onboarding_complete', label: null }
];

function makeService(opts: {
  counts?: Record<string, number>;
  users?: Record<string, unknown>[];
  stepStats?: { eventCount: number; actorCount: number; identifiedEventCount?: number; anonymousEventCount?: number };
  eventNames?: Array<{ eventName: string; eventCount: number }>;
} = {}) {
  const counts = opts.counts ?? { step0: 100, step1: 60, step2: 25 };
  const users = opts.users ?? [
    { actor: 'usr_1', userId: 'usr_1', externalId: 'u1', anonymousId: 'anon_1', identified: true, lastSeenAt: null, os: null, country: null }
  ];
  const stepStats = opts.stepStats ?? { eventCount: 100, actorCount: 80, identifiedEventCount: 80, anonymousEventCount: 20 };
  const eventNames = opts.eventNames ?? [
    { eventName: 'sign_up', eventCount: 100 },
    { eventName: 'sign_up_complete', eventCount: 60 },
    { eventName: 'onboarding_complete', eventCount: 25 }
  ];
  const db = mockDatabase((text) => {
    if (text.includes('actors AS')) {
      return rows(users);
    }
    if (text.includes('WITH base AS')) {
      return rows([counts]);
    }
    if (text.includes('count(DISTINCT COALESCE(user_id::text, anonymous_id))')) {
      return rows([stepStats]);
    }
    if (text.includes('ORDER BY received_at DESC')) {
      return rows([]);
    }
    if (text.includes('GROUP BY event_name')) {
      return rows(eventNames);
    }
    if (text.includes('count(fs.id)')) {
      return rows([{ id: 'fnl_1', name: 'Onboarding funnel', stepCount: 3, createdAt: '2026-01-01T00:00:00.000Z' }]);
    }
    if (text.includes('FROM funnels WHERE')) {
      return rows([{ id: 'fnl_1', name: 'Onboarding funnel', created_at: '2026-01-01T00:00:00.000Z' }]);
    }
    if (text.includes('FROM funnel_steps')) {
      return rows(ONBOARDING_STEPS);
    }
    return affected(1);
  });
  const projects = {
    requireActiveProject: vi.fn().mockResolvedValue(PROJECT),
    requireWritableProject: vi.fn().mockResolvedValue(PROJECT),
    resolveActiveProject: vi.fn().mockResolvedValue(PROJECT)
  };
  const service = new FunnelsService(db as never, projects as never);
  return { db, projects, service };
}

const user = { id: 'dash_user_1', authMethod: 'supabase' } as const;

describe('FunnelsService.getResults (onboarding funnel)', () => {
  it('computes counts and conversion metrics across the funnel', async () => {
    const { service } = makeService();

    const result = await service.getResults(user, 'fnl_1', '7');

    expect(result.funnel.name).toBe('Onboarding funnel');
    expect(result.days).toBe(7);
    expect(result.steps.map((s) => s.count)).toEqual([100, 60, 25]);
    expect(result.steps[0].conversionFromStart).toBe(1);
    expect(result.steps[1].count).toBe(60);
    expect(result.steps[1].conversionFromStart).toBeCloseTo(0.6);
    expect(result.steps[1].conversionFromPrevious).toBeCloseTo(0.6);
    expect(result.steps[1].droppedFromPrevious).toBe(40);
    expect(result.steps[2].conversionFromStart).toBeCloseTo(0.25);
    expect(result.steps[2].conversionFromPrevious).toBeCloseTo(25 / 60);
    expect(result.steps[2].droppedFromPrevious).toBe(35);
  });

  it('emits SQL that matches events by exact name, stitches actors, and enforces ordering', async () => {
    const { db, service } = makeService();
    await service.getResults(user, 'fnl_1');

    const sql = db.queryCalls(/WITH base AS/)[0]?.text ?? '';
    // Actors are keyed by user_id when present, falling back to anonymous_id.
    expect(sql).toContain('COALESCE(user_id::text, anonymous_id) AS actor');
    // Step names are matched exactly (case-sensitive) via the event_name column.
    expect(sql).toContain('event_name = ANY($4)');
    // Each later step only counts actors whose previous step happened first.
    expect(sql).toContain('occurred_at >= p.reached');
    // Events outside the requested window are excluded.
    expect(sql).toContain('occurred_at >= $2 AND occurred_at < $3');
    expect(sql).toContain('AND COALESCE(user_id::text, anonymous_id) IS NOT NULL');
  });

  it('binds the project, window, involved names and each step name as query params', async () => {
    const { db, service } = makeService();
    await service.getResults(user, 'fnl_1', '7');

    const call = db.queryCalls(/WITH base AS/)[0];
    expect(call).toBeDefined();
    expect(call.values[0]).toBe('proj_1');
    expect(typeof call.values[1]).toBe('string');
    expect(typeof call.values[2]).toBe('string');
    // ALL funnel step names are loaded into the base CTE's ANY($4) filter.
    expect(call.values[3]).toEqual(['sign_up', 'sign_up_complete', 'onboarding_complete']);
    // Then each step name is bound again for its per-step WHERE clause.
    expect(call.values.slice(4)).toEqual(['sign_up', 'sign_up_complete', 'onboarding_complete']);
  });

  it('throws for a funnel with no steps', async () => {
    const db = mockDatabase((text) => {
      if (text.includes('FROM funnels WHERE')) {
        return rows([{ id: 'fnl_1', name: 'Empty', created_at: '2026-01-01T00:00:00.000Z' }]);
      }
      if (text.includes('FROM funnel_steps WHERE')) {
        return rows([]);
      }
      return affected(1);
    });
    const projects = { requireActiveProject: vi.fn().mockResolvedValue(PROJECT), resolveActiveProject: vi.fn().mockResolvedValue(PROJECT) };
    const service = new FunnelsService(db as never, projects as never);

    await expect(service.getResults(user, 'fnl_1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when the funnel is not in the active project', async () => {
    const { projects, service } = makeService();
    projects.requireActiveProject.mockRejectedValueOnce(new NotFoundException('Funnel not found.'));
    await expect(service.getResults(user, 'fnl_missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('FunnelsService.getStepUsers', () => {
  it('returns the reached users of a step', async () => {
    const { service } = makeService({ counts: { step0: 100, step1: 60, step2: 25 } });
    const result = await service.getStepUsers(user, 'fnl_1', { step: '1', status: 'reached' });

    expect(result.status).toBe('reached');
    expect(result.total).toBe(60);
    expect(result.users).toHaveLength(1);
    expect(result.users[0]).toMatchObject({ actor: 'usr_1', userId: 'usr_1' });
  });

  it('returns users who dropped between the previous and current step', async () => {
    const { db, service } = makeService({ counts: { step0: 100, step1: 60, step2: 25 } });
    const result = await service.getStepUsers(user, 'fnl_1', { step: '2', status: 'dropped' });

    expect(result.status).toBe('dropped');
    // dropped = reached(step1) - reached(step2)
    expect(result.total).toBe(35);

    const sql = db.queryCalls(/actors AS/)[0]?.text ?? '';
    expect(sql).toContain('WHERE actor NOT IN (SELECT actor FROM s2)');
  });

  it('rejects a dropped status on the first step', async () => {
    const { service } = makeService();
    await expect(service.getStepUsers(user, 'fnl_1', { step: '0', status: 'dropped' })).rejects.toBeInstanceOf(
      BadRequestException
    );
  });
});

describe('FunnelsService.debugFunnel', () => {
  it('reports raw event + actor counts, funnel-qualified counts, and all observed event names', async () => {
    const { db, service } = makeService({
      stepStats: { eventCount: 120, actorCount: 40, identifiedEventCount: 80, anonymousEventCount: 20 },
      eventNames: [
        { eventName: 'sign_up', eventCount: 120 },
        { eventName: 'sign_up_complete', eventCount: 60 }
      ]
    });

    const result = await service.debugFunnel(user, 'fnl_1', '7');

    expect(result.days).toBe(7);
    expect(result.funnel.id).toBe('fnl_1');
    expect(result.projectId).toBe('proj_1');
    expect(result.steps).toHaveLength(3);
    expect(result.steps[0]).toMatchObject({
      eventName: 'sign_up',
      eventCount: 120,
      actorCount: 40,
      identifiedEventCount: 80,
      anonymousEventCount: 20,
      qualifiedCount: 100
    });
    expect(result.steps[2]).toMatchObject({ eventName: 'onboarding_complete', eventCount: 120, actorCount: 40, qualifiedCount: 25 });
    expect(result.eventNames.map((entry) => entry.eventName)).toEqual(['sign_up', 'sign_up_complete']);
    expect(db.queryCalls(/SELECT event_name AS "eventName"/)).toHaveLength(1);
    expect(db.queryCalls(/count\(DISTINCT COALESCE/)).toHaveLength(3);
    expect(db.queryCalls(/ORDER BY received_at DESC/)).toHaveLength(3);
  });

  it('is bounded by the requested window', async () => {
    const { db, service } = makeService();
    await service.debugFunnel(user, 'fnl_1', '90');

    const call = db.queryCalls(/count\(DISTINCT COALESCE/)[0];
    expect(call?.values[0]).toBe('proj_1');
    expect(typeof call.values[1]).toBe('string');
    expect(typeof call.values[2]).toBe('string');
    expect(call.values[3]).toBe('sign_up');
  });

  it('reports how many step events are identified vs anonymous for identity-split detection', async () => {
    const { service } = makeService({
      stepStats: { eventCount: 60, actorCount: 40, identifiedEventCount: 60, anonymousEventCount: 0 }
    });

    const result = await service.debugFunnel(user, 'fnl_1');

    expect(result.steps[1]).toMatchObject({ identifiedEventCount: 60, anonymousEventCount: 0 });
  });

  it('exposes a misnamed step as zero raw events while the project actually has other names', async () => {
    const steps = [
      { order: 0, eventName: 'sign_up', label: null },
      { order: 1, eventName: 'otp_verification_completed', label: null },
      { order: 2, eventName: 'log_food', label: null }
    ];

    const db = mockDatabase((text, values) => {
      if (text.includes('GROUP BY event_name')) {
        return rows([
          { eventName: 'sign_up', eventCount: 4 },
          { eventName: 'login_completed', eventCount: 2 },
          { eventName: 'log_food', eventCount: 2 }
        ]);
      }
      if (text.includes('count(DISTINCT COALESCE(user_id::text, anonymous_id))')) {
        if (values[3] === 'otp_verification_completed') {
          return rows([{ eventCount: 0, actorCount: 0 }]);
        }
        return rows([{ eventCount: 2, actorCount: 1 }]);
      }
      if (text.includes('ORDER BY received_at DESC')) {
        return rows([]);
      }
      if (text.includes('WITH base AS')) {
        return rows([{ step0: 2, step1: 0, step2: 0 }]);
      }
      if (text.includes('FROM funnels WHERE')) {
        return rows([{ id: 'fnl_1', name: 'Signup funnel', created_at: '2026-01-01T00:00:00.000Z' }]);
      }
      if (text.includes('FROM funnel_steps')) {
        return rows(steps);
      }
      return rows([]);
    });
    const projects = { requireActiveProject: vi.fn().mockResolvedValue(PROJECT), resolveActiveProject: vi.fn().mockResolvedValue(PROJECT) };
    const service = new FunnelsService(db as never, projects as never);

    const result = await service.debugFunnel(user, 'fnl_1');

    expect(result.steps[1]).toMatchObject({ eventName: 'otp_verification_completed', eventCount: 0, actorCount: 0, qualifiedCount: 0 });
    expect(result.steps[2]).toMatchObject({ eventName: 'log_food', eventCount: 2, actorCount: 1, qualifiedCount: 0 });
    expect(result.eventNames).toContainEqual({ eventName: 'login_completed', eventCount: 2 });
  });

  it('loads the funnel from the active project', async () => {
    const { projects, service } = makeService();
    projects.requireActiveProject.mockRejectedValueOnce(new NotFoundException('Funnel not found.'));
    await expect(service.debugFunnel(user, 'fnl_missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('FunnelsService.create', () => {
  it('persists the funnel and its steps', async () => {
    const { db, service } = makeService();
    const result = await service.create(user, {
      name: 'Onboarding funnel',
      steps: ['sign_up', { eventName: 'sign_up_complete', label: 'Completed sign up' }]
    });

    expect(result.stepCount).toBe(3);

    const funnelInsert = db.queryCalls(/INSERT INTO funnels/)[0];
    expect(funnelInsert).toBeDefined();
    const funnelId = funnelInsert.values[0];
    expect(funnelId).toMatch(/^fnl_/);
    expect(funnelInsert.values).toEqual([funnelId, 'proj_1', 'Onboarding funnel', 'dash_user_1']);

    const stepInserts = db.queryCalls(/INSERT INTO funnel_steps/);
    expect(stepInserts).toHaveLength(2);
    expect(stepInserts[0].values[3]).toBe('sign_up');
    expect(stepInserts[1].values).toEqual([
      expect.stringMatching(/^fst_/),
      funnelId,
      1,
      'sign_up_complete',
      'Completed sign up'
    ]);
  });

  it('requires a name', async () => {
    const { service } = makeService();
    await expect(service.create(user, { steps: ['a', 'b'] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires at least two steps', async () => {
    const { service } = makeService();
    await expect(service.create(user, { name: 'X', steps: ['sign_up'] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create(user, { name: 'X', steps: undefined })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects more than twelve steps', async () => {
    const { service } = makeService();
    const steps = Array.from({ length: 13 }, (_, i) => `step_${i}`);
    await expect(service.create(user, { name: 'X', steps })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('trims event names and labels', async () => {
    const { db, service } = makeService();
    await service.create(user, {
      name: 'X',
      steps: ['  sign_up  ', { eventName: ' sign_up_complete ', label: '   Completed   ' }]
    });

    const stepInserts = db.queryCalls(/INSERT INTO funnel_steps/);
    expect(stepInserts[0].values[3]).toBe('sign_up');
    expect(stepInserts[1].values[3]).toBe('sign_up_complete');
    expect(stepInserts[1].values[4]).toBe('Completed');
  });

  it('throws for an unknown project', async () => {
    const { projects, service } = makeService();
    projects.requireWritableProject.mockRejectedValueOnce(new NotFoundException('No project found for this account.'));
    await expect(service.create(user, { name: 'X', steps: ['a', 'b'] })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('FunnelsService.list', () => {
  it('lists funnels with step counts for the active project', async () => {
    const { service } = makeService();
    const result = await service.list(user, 'proj_1');
    expect(result.funnels).toHaveLength(1);
    expect(result.funnels[0]).toMatchObject({ id: 'fnl_1', name: 'Onboarding funnel', stepCount: 3 });
  });

  it('returns an empty list when the user has no project', async () => {
    const db = mockDatabase(() => empty());
    const projects = { requireActiveProject: vi.fn().mockResolvedValue(PROJECT), resolveActiveProject: vi.fn().mockResolvedValue(null) };
    const service = new FunnelsService(db as never, projects as never);
    const result = await service.list(user);
    expect(result.funnels).toEqual([]);
  });
});

describe('FunnelsService.update and remove', () => {
  it('replaces the steps on update', async () => {
    const { db, service } = makeService();
    await service.update(user, 'fnl_1', {
      name: 'Renamed',
      steps: ['sign_up', 'sign_up_complete', 'onboarding_complete', 'activated']
    });

    const deletes = db.queryCalls(/DELETE FROM funnel_steps/);
    expect(deletes).toHaveLength(1);
    expect(deletes[0].values).toEqual(['fnl_1']);
    expect(db.queryCalls(/INSERT INTO funnel_steps/)).toHaveLength(4);
  });

  it('deletes the funnel', async () => {
    const { db, service } = makeService();
    const result = await service.remove(user, 'fnl_1', 'proj_1');
    expect(result.deleted).toBe(true);
    const deletes = db.queryCalls(/DELETE FROM funnels/);
    expect(deletes).toHaveLength(1);
    expect(deletes[0].values).toEqual(['fnl_1', 'proj_1']);
  });
});

describe('FunnelsService.generateSyntheticDraft', () => {
  it('generates a synthetic journey draft preserving milestones and deterministic heuristics', async () => {
    const funnelSteps = [
      { order: 0, eventName: 'page_view', label: 'Landing Page' },
      { order: 1, eventName: 'sign_up_start', label: 'Signup Form' },
      { order: 2, eventName: 'pricing_view', label: '/pricing' },
      { order: 3, eventName: 'project_created', label: 'Create Project' }
    ];

    const db = mockDatabase((text) => {
      if (text.includes('FROM funnels WHERE')) {
        return rows([{ id: 'fnl_signup', name: 'User Signup Flow', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z' }]);
      }
      if (text.includes('FROM funnel_steps')) {
        return rows(funnelSteps);
      }
      return rows([]);
    });

    const projects = {
      requireActiveProject: vi.fn().mockResolvedValue(PROJECT),
      requireWritableProject: vi.fn().mockResolvedValue(PROJECT)
    };

    const service = new FunnelsService(db as never, projects as never);
    const draft = await service.generateSyntheticDraft(user, 'fnl_signup', 'proj_1');

    expect(draft.source.funnelId).toBe('fnl_signup');
    expect(draft.source.name).toBe('User Signup Flow');
    expect(draft.source.stepCount).toBe(4);
    expect(draft.monitor.name).toBe('User Signup Flow - Synthetic Journey');
    expect(draft.milestones).toHaveLength(4);

    // Step 0: page_view -> suggested navigate step
    expect(draft.milestones[0].eventName).toBe('page_view');
    expect(draft.milestones[0].suggestedSteps[0].type).toBe('navigate');
    expect(draft.milestones[0].needsConfiguration).toBe(false);

    // Step 1: sign_up -> template steps with secure variables
    expect(draft.milestones[1].eventName).toBe('sign_up_start');
    const step1Types = draft.milestones[1].suggestedSteps.map((s) => s.type);
    expect(step1Types).toContain('fill');
    expect(step1Types).toContain('click');
    expect(draft.milestones[1].suggestedSteps.some((s) => s.value === '{{SYNTHETIC_EMAIL}}')).toBe(true);

    // Step 2: pricing_view with /pricing label -> navigate to /pricing
    expect(draft.milestones[2].eventName).toBe('pricing_view');
    expect(draft.milestones[2].suggestedSteps[0].type).toBe('navigate');
    expect(draft.milestones[2].suggestedSteps[0].url).toBe('/pricing');

    // Step 3: custom event project_created -> marked as needsConfiguration
    expect(draft.milestones[3].eventName).toBe('project_created');
    expect(draft.milestones[3].needsConfiguration).toBe(true);
  });

  it('enforces project isolation and throws NotFoundException for missing funnel', async () => {
    const db = mockDatabase(() => empty());
    const projects = {
      requireActiveProject: vi.fn().mockResolvedValue(PROJECT),
      requireWritableProject: vi.fn().mockResolvedValue(PROJECT)
    };
    const service = new FunnelsService(db as never, projects as never);
    await expect(service.generateSyntheticDraft(user, 'fnl_nonexistent', 'proj_1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

