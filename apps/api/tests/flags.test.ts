import { describe, expect, it } from 'vitest';
import {
  bucketOf,
  evaluateFlag,
  matchesTargeting,
  type FlagTarget
} from '../src/modules/flags/flags.service';

const baseFlag = {
  enabled: true,
  rollout_percentage: 100,
  overrides: {},
  targeting: null,
  key: 'new-checkout'
};

describe('evaluateFlag', () => {
  it('returns false when the master switch is off, ignoring everything else', () => {
    const on = evaluateFlag({ ...baseFlag, enabled: false, rollout_percentage: 100 }, 'u1');
    expect(on).toBe(false);
  });

  it('lets a per-user override win over targeting and rollout', () => {
    const targeting: FlagTarget[] = [{ property: 'plan', operator: 'eq', value: 'pro' }];
    const flag = {
      ...baseFlag,
      rollout_percentage: 0,
      targeting,
      overrides: { u_forced: true, u_blocked: false }
    };
    expect(evaluateFlag(flag, 'u_forced', { plan: 'free' })).toBe(true);
    expect(evaluateFlag(flag, 'u_blocked', { plan: 'pro' })).toBe(false);
  });

  it('applies targeting before rollout so a non-matching user is off even at 100%', () => {
    const targeting: FlagTarget[] = [{ property: 'plan', operator: 'eq', value: 'pro' }];
    const flag = { ...baseFlag, targeting };
    expect(evaluateFlag(flag, 'u1', { plan: 'free' })).toBe(false);
    expect(evaluateFlag(flag, 'u1', { plan: 'pro' })).toBe(true);
  });

  it('rollout 100 always on and 0 always off when no override/targeting', () => {
    expect(evaluateFlag({ ...baseFlag, rollout_percentage: 100 }, 'u1')).toBe(true);
    expect(evaluateFlag({ ...baseFlag, rollout_percentage: 0 }, 'u1')).toBe(false);
  });

  it('partial rollout is deterministic for a fixed key + distinct id', () => {
    const partial = { ...baseFlag, rollout_percentage: 50 };
    const first = evaluateFlag(partial, 'u1');
    const second = evaluateFlag(partial, 'u1');
    expect(first).toBe(second);
  });
});

describe('matchesTargeting', () => {
  it('matches when every AND rule matches', () => {
    const rules: FlagTarget[] = [
      { property: 'plan', operator: 'eq', value: 'pro' },
      { property: 'seats', operator: 'gte', value: 5 }
    ];
    expect(matchesTargeting(rules, { plan: 'pro', seats: 6 })).toBe(true);
  });

  it('fails the whole set when one rule fails', () => {
    const rules: FlagTarget[] = [
      { property: 'plan', operator: 'eq', value: 'pro' },
      { property: 'seats', operator: 'gte', value: 5 }
    ];
    expect(matchesTargeting(rules, { plan: 'pro', seats: 4 })).toBe(false);
  });

  it('requires the property to actually be present', () => {
    const rules: FlagTarget[] = [{ property: 'plan', operator: 'eq', value: 'pro' }];
    expect(matchesTargeting(rules, {})).toBe(false);
  });

  it('eq/ne support strings, numbers and booleans', () => {
    expect(matchesTargeting([{ property: 'p', operator: 'eq', value: 'x' }], { p: 'x' })).toBe(true);
    expect(matchesTargeting([{ property: 'p', operator: 'ne', value: 'x' }], { p: 'y' })).toBe(true);
    expect(matchesTargeting([{ property: 'p', operator: 'eq', value: 42 }], { p: 42 })).toBe(true);
    expect(matchesTargeting([{ property: 'p', operator: 'eq', value: false }], { p: false })).toBe(true);
    expect(matchesTargeting([{ property: 'p', operator: 'ne', value: false }], { p: true })).toBe(true);
  });

  it('compares numeric rules numerically and never matches on junk values', () => {
    const gt: FlagTarget = { property: 'p', operator: 'gt', value: 5 };
    expect(matchesTargeting([gt], { p: 6 })).toBe(true);
    expect(matchesTargeting([gt], { p: 5 })).toBe(false);
    expect(matchesTargeting([gt], { p: 'seven' })).toBe(false);
  });

  it('is vacuously true for no rules', () => {
    expect(matchesTargeting([], {})).toBe(true);
  });
});

describe('bucketOf', () => {
  it('is deterministic and stays within 0..99', () => {
    for (const [key, id] of [
      ['new-checkout', 'u1'],
      ['new-checkout', 'u2'],
      ['billing-v2', 'u1']
    ]) {
      const bucket = bucketOf(key, id);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThan(100);
      expect(bucketOf(key, id)).toBe(bucket);
    }
  });

  it('spreads different users across buckets', () => {
    const buckets = new Set(Array.from({ length: 50 }, (_, i) => bucketOf('flag', `user-${i}`)));
    expect(buckets.size).toBeGreaterThan(5);
  });
});
