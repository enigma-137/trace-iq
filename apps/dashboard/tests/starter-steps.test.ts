import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_ONBOARDING,
  buildStarterSteps,
  nextStarterStep,
  starterDismissKey,
  starterMode,
  starterProgress,
  type OnboardingSteps
} from '../src/lib/starter-steps';

const steps = (overrides: Partial<OnboardingSteps> = {}): OnboardingSteps => ({ ...EMPTY_ONBOARDING, ...overrides });
const build = (overrides: Partial<OnboardingSteps> = {}) => buildStarterSteps(steps(overrides), 'proj_b2b89a3b', 'Nuwell AI Web');

describe('buildStarterSteps', () => {
  it('lists the five steps in the order a new person should do them', () => {
    expect(build().map((step) => step.id)).toEqual(['project', 'firstEvent', 'identify', 'brief', 'alert']);
  });

  it('counts the project as done from the start, so the card never opens at zero', () => {
    const list = build();
    expect(list[0]).toMatchObject({ id: 'project', done: true, description: 'Nuwell AI Web is ready.' });
    expect(starterProgress(list)).toMatchObject({ done: 1, total: 5, percent: 20, complete: false });
  });

  it('marks each step from what the API reports', () => {
    const done = (overrides: Partial<OnboardingSteps>) => build(overrides).filter((step) => step.done).map((step) => step.id);
    expect(done({})).toEqual(['project']);
    expect(done({ firstEvent: true })).toEqual(['project', 'firstEvent']);
    expect(done({ firstEvent: true, identifiedUser: true, briefChannel: true, alert: true })).toEqual(['project', 'firstEvent', 'identify', 'brief', 'alert']);
    expect(done({ briefChannel: true })).toEqual(['project', 'brief']);
  });

  it('links each step to the place that does it, keeping the project', () => {
    const byId = Object.fromEntries(build().map((step) => [step.id, step]));
    expect(byId.firstEvent.href).toBe('/dashboard/setup?projectId=proj_b2b89a3b');
    expect(byId.firstEvent.cta).toBe('Install with AI');
    expect(byId.brief.href).toBe('/dashboard/alerts?tab=brief');
    expect(byId.alert.href).toBe('/dashboard/alerts');
    expect(byId.identify.href).toBe('/docs?page=methods');
  });

  it('encodes the project id in a link', () => {
    const [project] = buildStarterSteps(steps(), 'proj a&b', 'X');
    expect(project.href).toBe('/dashboard/settings?projectId=proj%20a%26b');
  });
});

describe('progress and the next step', () => {
  it('reports a percentage and whether everything is done', () => {
    expect(starterProgress(build({ firstEvent: true }))).toMatchObject({ done: 2, percent: 40, complete: false });
    expect(starterProgress(build({ firstEvent: true, identifiedUser: true, briefChannel: true, alert: true }))).toMatchObject({ done: 5, percent: 100, complete: true });
    expect(starterProgress([])).toEqual({ done: 0, total: 0, percent: 0, complete: true });
  });

  it('puts the main button on the first step still to do', () => {
    expect(nextStarterStep(build())?.id).toBe('firstEvent');
    expect(nextStarterStep(build({ firstEvent: true }))?.id).toBe('identify');
    expect(nextStarterStep(build({ firstEvent: true, identifiedUser: true }))?.id).toBe('brief');
    expect(nextStarterStep(build({ firstEvent: true, identifiedUser: true, briefChannel: true, alert: true }))).toBeNull();
  });

  it('keeps the dismissal per project', () => {
    expect(starterDismissKey('proj_1')).toBe('traceiq:starter-dismissed:proj_1');
    expect(starterDismissKey('proj_1')).not.toBe(starterDismissKey('proj_2'));
  });
});

describe('starterMode', () => {
  it('is the whole page until the first event arrives, whatever else is done', () => {
    expect(starterMode(steps())).toBe('hero');
    expect(starterMode(steps({ alert: true, briefChannel: true, identifiedUser: true }))).toBe('hero');
  });

  it('shrinks to a small card once events flow and steps remain', () => {
    expect(starterMode(steps({ firstEvent: true }))).toBe('compact');
    expect(starterMode(steps({ firstEvent: true, identifiedUser: true, briefChannel: true }))).toBe('compact');
  });

  it('goes away when everything is done', () => {
    expect(starterMode(steps({ firstEvent: true, identifiedUser: true, briefChannel: true, alert: true }))).toBe('none');
  });
});

describe('Overview page', () => {
  const page = readFileSync(new URL('../src/app/dashboard/page.tsx', import.meta.url), 'utf8');
  const card = readFileSync(new URL('../src/components/StarterChecklist.tsx', import.meta.url), 'utf8');

  it('replaces the old setup banner with the checklist', () => {
    expect(page).toContain('<StarterChecklist');
    expect(page).not.toContain('Setup Required');
    expect(page).not.toContain('Lightweight Onboarding Setup Reminder');
  });

  it('shows the full Overview only once there is an event to show', () => {
    expect(page).toContain('const isBrandNew = hasNoProject || (Boolean(overview?.project) && !overview?.lastEventAt);');
    expect(page).toContain('{!isBrandNew ? (');
    // The wrapped region starts at Today's story and ends before the closing of the container.
    expect(page.indexOf('{!isBrandNew ? (')).toBeLessThan(page.indexOf("Highlighted Insight Banner: Today's Story"));
    expect(page.indexOf("Highlighted Insight Banner: Today's Story")).toBeLessThan(page.indexOf('</DashboardShell>'));
  });

  it('still works if the status request fails, falling back to what the Overview knows', () => {
    expect(page).toContain('firstEvent: Boolean(overview.lastEventAt)');
    expect(page).toContain("'/v1/dashboard/onboarding'");
  });

  it('keeps a hidden compact card from flashing, and survives blocked storage', () => {
    expect(card).toContain('if (dismissed !== false) return null;');
    expect(card).toMatch(/catch \{\s*setDismissed\(false\)/);
  });
});
