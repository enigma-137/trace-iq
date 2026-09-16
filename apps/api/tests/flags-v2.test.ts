import { describe, expect, it } from 'vitest';
import {
  bucketOf,
  evaluateFlag,
  evaluateFlagDetailed,
  evaluateRule,
  matchesTargeting,
  type FlagRow,
  type FlagTarget,
  type FlagTargetGroup
} from '../src/modules/flags/flags.service';

const baseFlag: FlagRow = {
  id: 'flg_test_1',
  project_id: 'prj_test',
  key: 'nuwell-new-add-meal',
  name: 'New Add Meal Flow',
  description: 'AI-assisted meal logging',
  enabled: true,
  rollout_percentage: 100,
  environment: 'production',
  flag_type: 'boolean',
  overrides: {},
  targeting: null,
  targeting_groups: null,
  payload: null,
  revision: 1,
  archived_at: null,
  created_by_user_id: 'usr_admin',
  updated_by_user_id: 'usr_admin',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

describe('Feature Flags v2 - Deterministic Rollout & Bucketing', () => {
  it('returns stable 0..99 bucket for same key, user, project and environment', () => {
    const b1 = bucketOf('nuwell-new-add-meal', 'user_123', 'prj_nuwell', 'production');
    const b2 = bucketOf('nuwell-new-add-meal', 'user_123', 'prj_nuwell', 'production');
    expect(b1).toBe(b2);
    expect(b1).toBeGreaterThanOrEqual(0);
    expect(b1).toBeLessThan(100);
  });

  it('scopes bucketing by project and environment so environments do not correlate', () => {
    // Collect buckets across environments for the same user & flag
    const prodBuckets = [];
    const stagingBuckets = [];
    for (let i = 0; i < 50; i++) {
      prodBuckets.push(bucketOf('nuwell-new-add-meal', `user_${i}`, 'prj_nuwell', 'production'));
      stagingBuckets.push(bucketOf('nuwell-new-add-meal', `user_${i}`, 'prj_nuwell', 'staging'));
    }
    // They should not be identically identical across all users
    expect(prodBuckets).not.toEqual(stagingBuckets);
  });

  it('changing rollout 25% -> 50% only adds users and never kicks out existing users', () => {
    const flag25 = { ...baseFlag, rollout_percentage: 25 };
    const flag50 = { ...baseFlag, rollout_percentage: 50 };

    let in25Count = 0;
    let in50Count = 0;

    for (let i = 0; i < 500; i++) {
      const distinctId = `user_${i}`;
      const in25 = evaluateFlag(flag25, distinctId);
      const in50 = evaluateFlag(flag50, distinctId);

      if (in25) {
        in25Count++;
        // If in 25%, must strictly also be in 50%
        expect(in50).toBe(true);
      }
      if (in50) {
        in50Count++;
      }
    }

    expect(in25Count).toBeGreaterThan(80);
    expect(in50Count).toBeGreaterThan(in25Count);
  });

  it('0% rollout is always off for all non-overridden users', () => {
    const flag0 = { ...baseFlag, rollout_percentage: 0 };
    for (let i = 0; i < 50; i++) {
      expect(evaluateFlag(flag0, `user_${i}`)).toBe(false);
    }
  });

  it('100% rollout is always on for all non-overridden users', () => {
    const flag100 = { ...baseFlag, rollout_percentage: 100 };
    for (let i = 0; i < 50; i++) {
      expect(evaluateFlag(flag100, `user_${i}`)).toBe(true);
    }
  });
});

describe('Feature Flags v2 - Master Switch & Kill Switch', () => {
  it('instantly disables flag when enabled is false, regardless of rollout or overrides', () => {
    const killedFlag = {
      ...baseFlag,
      enabled: false,
      rollout_percentage: 100,
      overrides: { user_forced: true }
    };
    expect(evaluateFlag(killedFlag, 'user_forced')).toBe(false);
    expect(evaluateFlag(killedFlag, 'regular_user')).toBe(false);

    const detailed = evaluateFlagDetailed(killedFlag, 'user_forced');
    expect(detailed.enabled).toBe(false);
    expect(detailed.reason).toBe('disabled_by_master_switch');
  });

  it('per-user override takes precedence over targeting and percentage rollout', () => {
    const flagWithOverride = {
      ...baseFlag,
      rollout_percentage: 0,
      overrides: { user_forced_on: true, user_forced_off: false }
    };

    expect(evaluateFlag(flagWithOverride, 'user_forced_on')).toBe(true);
    expect(evaluateFlag(flagWithOverride, 'user_forced_off')).toBe(false);

    const detailedOn = evaluateFlagDetailed(flagWithOverride, 'user_forced_on');
    expect(detailedOn.enabled).toBe(true);
    expect(detailedOn.reason).toBe('matched_override_enabled');
  });
});

describe('Feature Flags v2 - Targeting Operators', () => {
  it('evaluates string and number equals / not-equals correctly', () => {
    expect(evaluateRule('premium', 'eq', 'premium', true)).toBe(true);
    expect(evaluateRule('free', 'eq', 'premium', true)).toBe(false);
    expect(evaluateRule('free', 'ne', 'premium', true)).toBe(true);
    expect(evaluateRule(10, 'eq', 10, true)).toBe(true);
    expect(evaluateRule(10, 'ne', 20, true)).toBe(true);
  });

  it('evaluates contains and not_contains substring matches', () => {
    expect(evaluateRule('emmanuel@traceiq.run', 'contains', '@traceiq.run', true)).toBe(true);
    expect(evaluateRule('user@gmail.com', 'contains', '@traceiq.run', true)).toBe(false);
    expect(evaluateRule('user@gmail.com', 'not_contains', '@traceiq.run', true)).toBe(true);
  });

  it('evaluates numeric comparisons gt, gte, lt, lte correctly', () => {
    expect(evaluateRule(5, 'gt', 3, true)).toBe(true);
    expect(evaluateRule(3, 'gt', 5, true)).toBe(false);
    expect(evaluateRule(5, 'gte', 5, true)).toBe(true);
    expect(evaluateRule(4, 'lt', 10, true)).toBe(true);
    expect(evaluateRule(10, 'lte', 10, true)).toBe(true);
    // Non-numeric junk should never match
    expect(evaluateRule('junk', 'gt', 0, true)).toBe(false);
  });

  it('evaluates exists and not_exists correctly', () => {
    expect(evaluateRule('NG', 'exists', true, true)).toBe(true);
    expect(evaluateRule(undefined, 'exists', true, false)).toBe(false);
    expect(evaluateRule(undefined, 'not_exists', true, false)).toBe(true);
    expect(evaluateRule('', 'not_exists', true, true)).toBe(true);
  });

  it('evaluates is-one-of (in) with array and comma-separated values', () => {
    expect(evaluateRule('pro', 'in', ['pro', 'enterprise'], true)).toBe(true);
    expect(evaluateRule('free', 'in', ['pro', 'enterprise'], true)).toBe(false);
    expect(evaluateRule('pro', 'in', 'pro, enterprise, beta', true)).toBe(true);
    expect(evaluateRule('starter', 'in', 'pro, enterprise, beta', true)).toBe(false);
  });
});

describe('Feature Flags v2 - Multi-Group OR / AND Targeting', () => {
  it('matches when any group qualifies (Group A OR Group B)', () => {
    const targetingGroups: FlagTargetGroup[] = [
      {
        name: 'Internal team',
        rules: [{ property: 'email', operator: 'contains', value: '@traceiq.run' }]
      },
      {
        name: 'Premium Web Users',
        rules: [
          { property: 'plan', operator: 'eq', value: 'premium' },
          { property: 'platform', operator: 'eq', value: 'web' }
        ]
      }
    ];

    const flag = { ...baseFlag, targeting_groups: targetingGroups };

    // Matches Group A
    expect(evaluateFlag(flag, 'u1', { email: 'dev@traceiq.run', plan: 'free', platform: 'mobile' })).toBe(true);

    // Matches Group B
    expect(evaluateFlag(flag, 'u2', { email: 'customer@gmail.com', plan: 'premium', platform: 'web' })).toBe(true);

    // Fails both groups
    expect(evaluateFlag(flag, 'u3', { email: 'customer@gmail.com', plan: 'free', platform: 'web' })).toBe(false);
  });

  it('requires all rules in a group to match (AND)', () => {
    const targetingGroups: FlagTargetGroup[] = [
      {
        name: 'Premium Web Users',
        rules: [
          { property: 'plan', operator: 'eq', value: 'premium' },
          { property: 'platform', operator: 'eq', value: 'web' }
        ]
      }
    ];

    const flag = { ...baseFlag, targeting_groups: targetingGroups };

    // Only plan matches, platform fails
    expect(evaluateFlag(flag, 'u1', { plan: 'premium', platform: 'ios' })).toBe(false);
    // Both match
    expect(evaluateFlag(flag, 'u2', { plan: 'premium', platform: 'web' })).toBe(true);
  });
});

describe('Feature Flags v2 - Evaluation Tester & Debug Explainability', () => {
  it('returns comprehensive debug details when evaluated', () => {
    const payload = { dailyScanLimit: 10, showVoiceInput: true };
    const targetingGroups: FlagTargetGroup[] = [
      {
        name: 'Nigeria Pro Users',
        rules: [
          { property: 'country', operator: 'eq', value: 'NG' },
          { property: 'plan', operator: 'eq', value: 'pro' }
        ]
      }
    ];

    const flag: FlagRow = {
      ...baseFlag,
      rollout_percentage: 100,
      targeting_groups: targetingGroups,
      payload,
      revision: 4,
      environment: 'production'
    };

    const qualifyingResult = evaluateFlagDetailed(flag, 'user_emmanuel', { country: 'NG', plan: 'pro' });
    expect(qualifyingResult.enabled).toBe(true);
    expect(qualifyingResult.matchedGroupIndex).toBe(0);
    expect(qualifyingResult.payload).toEqual(payload);
    expect(qualifyingResult.revision).toBe(4);
    expect(qualifyingResult.groupDetails[0].passed).toBe(true);

    const disqualifiedResult = evaluateFlagDetailed(flag, 'user_other', { country: 'US', plan: 'free' });
    expect(disqualifiedResult.enabled).toBe(false);
    expect(disqualifiedResult.reason).toBe('disqualified_by_targeting');
    expect(disqualifiedResult.payload).toBeNull();
    expect(disqualifiedResult.groupDetails[0].passed).toBe(false);
  });
});
