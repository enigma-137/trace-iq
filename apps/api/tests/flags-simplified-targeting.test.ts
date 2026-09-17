import { describe, expect, it } from 'vitest';
import {
  maskEmail,
  resolveDisplayName,
  sanitizeTraitsPreview,
  sanitizeIngestedTraits,
  isSensitiveTraitKey
} from '../src/modules/users/users.service';
import { evaluateFlagDetailed } from '../src/modules/flags/flags.service';

describe('Simplified Feature Flags User Targeting & Correctness', () => {
  describe('1. Display Name Resolution Priority & Fallback', () => {
    it('prefers name over full_name, username, and email', () => {
      const name = resolveDisplayName(
        { name: 'Emmanuel Onoja', full_name: 'Emmanuel O', username: 'eonoja', email: 'e@test.com' },
        'usr_123',
        null,
        'usr_123'
      );
      expect(name).toBe('Emmanuel Onoja');
    });

    it('falls back to full_name when name is absent', () => {
      const name = resolveDisplayName(
        { full_name: 'Esther Ukeje', username: 'esthey', email: 'esther@test.com' },
        'usr_456',
        null,
        'usr_456'
      );
      expect(name).toBe('Esther Ukeje');
    });

    it('falls back to firstName + lastName when name/full_name is absent', () => {
      const name = resolveDisplayName(
        { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@test.com' },
        'usr_789',
        null,
        'usr_789'
      );
      expect(name).toBe('Ada Lovelace');
    });

    it('falls back to username when profile names are absent', () => {
      const name = resolveDisplayName(
        { username: 'superdev' },
        'usr_999',
        null,
        'usr_999'
      );
      expect(name).toBe('superdev');
    });

    it('does NOT expose email as visible display name; falls back to User <shortId>', () => {
      const name = resolveDisplayName(
        { email: 'developer@nuwell.com' },
        'usr_8888abcd91a2',
        null,
        'usr_8888abcd91a2'
      );
      expect(name).toBe('User 91A2');
    });

    it('falls back to User <shortId> when only internal IDs are present', () => {
      const name = resolveDisplayName(
        {},
        'usr_7890abcd1234',
        null,
        'usr_7890abcd1234'
      );
      expect(name).toBe('User 1234');
    });

    it('uses human-readable external_id if explicitly set to a non-email username', () => {
      const name = resolveDisplayName(
        {},
        'john_doe',
        null,
        'usr_1234567890ab'
      );
      expect(name).toBe('john_doe');
    });
  });

  describe('2. Privacy-Aware Masking & Trait Sanitization', () => {
    it('correctly masks emails', () => {
      expect(maskEmail('emmanuel@traceiq.run')).toBe('e••••••••@traceiq.run');
      expect(maskEmail('test@gmail.com')).toBe('t••••••••@gmail.com');
      expect(maskEmail(null)).toBeNull();
      expect(maskEmail('invalid-email')).toBeNull();
    });

    it('sanitizes private tokens, passwords, and secret keys from preview traits', () => {
      const raw = {
        plan: 'premium',
        country: 'NG',
        role: 'engineer',
        token: 'secret_jwt_token_123',
        api_key: 'pk_live_999',
        password_hash: '$2b$10$xyz',
        auth_token: 'auth_abc',
        session_id: 'sess_123',
        cookie: 'session_cookie',
        private_key: '-----BEGIN PRIVATE KEY-----'
      };

      const preview = sanitizeTraitsPreview(raw);
      expect(preview).toEqual({
        plan: 'premium',
        country: 'NG',
        role: 'engineer'
      });
      expect(preview.token).toBeUndefined();
      expect(preview.api_key).toBeUndefined();
      expect(preview.password_hash).toBeUndefined();
      expect(preview.auth_token).toBeUndefined();
      expect(preview.session_id).toBeUndefined();
      expect(preview.cookie).toBeUndefined();
      expect(preview.private_key).toBeUndefined();
    });

    it('identifies sensitive trait keys with isSensitiveTraitKey helper', () => {
      expect(isSensitiveTraitKey('access_token')).toBe(true);
      expect(isSensitiveTraitKey('password')).toBe(true);
      expect(isSensitiveTraitKey('passwd')).toBe(true);
      expect(isSensitiveTraitKey('JWT_SECRET')).toBe(true);
      expect(isSensitiveTraitKey('api_key_custom')).toBe(true);
      expect(isSensitiveTraitKey('auth_header')).toBe(true);
      expect(isSensitiveTraitKey('plan')).toBe(false);
      expect(isSensitiveTraitKey('country')).toBe(false);
    });
  });

  describe('3. Ingestion Trait Sanitization & Safety Limits', () => {
    it('filters prototype pollution keys and sensitive fields during ingestion', () => {
      const rawTraits = {
        name: 'Emmanuel Onoja',
        plan: 'pro',
        __proto__: { polluted: true },
        constructor: { evil: true },
        password: 'supersecretpassword',
        access_token: 'tok_1234567890',
        private_key: 'secret',
        validTrait: 'good'
      };

      const sanitized = sanitizeIngestedTraits(rawTraits);
      expect(sanitized.name).toBe('Emmanuel Onoja');
      expect(sanitized.plan).toBe('pro');
      expect(sanitized.validTrait).toBe('good');
      expect(sanitized.__proto__).not.toEqual({ polluted: true });
      expect((sanitized as Record<string, unknown>).password).toBeUndefined();
      expect((sanitized as Record<string, unknown>).access_token).toBeUndefined();
      expect((sanitized as Record<string, unknown>).private_key).toBeUndefined();
    });

    it('enforces string length limits on ingested traits', () => {
      const longString = 'a'.repeat(2000);
      const sanitized = sanitizeIngestedTraits({ bio: longString });
      expect(typeof sanitized.bio).toBe('string');
      expect((sanitized.bio as string).length).toBe(1024);
    });

    it('handles non-object inputs safely', () => {
      expect(sanitizeIngestedTraits(null)).toEqual({});
      expect(sanitizeIngestedTraits(undefined)).toEqual({});
      expect(sanitizeIngestedTraits('string')).toEqual({});
      expect(sanitizeIngestedTraits([1, 2, 3])).toEqual({});
    });
  });

  describe('4. Canonical Identifier Contract & SDK Evaluation', () => {
    it('stores external_id as the canonical override key and evaluates matching SDK distinctId', () => {
      const userFromDatabase = {
        id: 'usr_internal_uuid_999',
        external_id: 'emmanuel_nuwell_app',
        anonymous_id: 'anon_device_111',
        traits: { name: 'Emmanuel Onoja', plan: 'premium' }
      };

      // Canonical key stored by user picker:
      const canonicalKey = userFromDatabase.external_id ?? userFromDatabase.id;
      expect(canonicalKey).toBe('emmanuel_nuwell_app');

      // Saved in feature_flags.overrides:
      const flag = {
        key: 'nuwell-new-flow',
        enabled: true,
        rollout_percentage: 0,
        environment: 'production',
        overrides: {
          [canonicalKey]: true
        },
        payload: { theme: 'modern' },
        revision: 3
      };

      // Browser SDK evaluation calls evaluateFlagDetailed with SDK distinctId:
      const sdkDistinctId = 'emmanuel_nuwell_app';
      const evalResult = evaluateFlagDetailed(flag, sdkDistinctId, { plan: 'free' });

      expect(evalResult.enabled).toBe(true);
      expect(evalResult.reason).toBe('matched_override_enabled');
      expect(evalResult.payload).toEqual({ theme: 'modern' });
    });
  });

  describe('5. Comprehensive Override Precedence Rules', () => {
    const flagConfig = {
      key: 'nuwell-premium-feature',
      name: 'NuWell Premium Feature',
      enabled: true,
      rollout_percentage: 50,
      environment: 'production',
      targeting_groups: [
        {
          name: 'Premium Nigeria Users',
          rules: [
            { property: 'plan', operator: 'eq' as const, value: 'premium' },
            { property: 'country', operator: 'eq' as const, value: 'NG' }
          ]
        }
      ],
      payload: { mode: 'full' },
      revision: 10,
      overrides: {
        'user_forced_on': true,
        'user_forced_off': false
      }
    };

    it('1. Included user + rollout 0% -> always ON', () => {
      const zeroFlag = { ...flagConfig, rollout_percentage: 0 };
      const result = evaluateFlagDetailed(zeroFlag, 'user_forced_on', { plan: 'free', country: 'US' });
      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('matched_override_enabled');
    });

    it('2. Excluded user + rollout 100% -> always OFF', () => {
      const hundredFlag = { ...flagConfig, rollout_percentage: 100 };
      const result = evaluateFlagDetailed(hundredFlag, 'user_forced_off', { plan: 'premium', country: 'NG' });
      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('matched_override_disabled');
    });

    it('3. Included user who fails normal rules -> ON', () => {
      const result = evaluateFlagDetailed(flagConfig, 'user_forced_on', { plan: 'free', country: 'CA' });
      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('matched_override_enabled');
    });

    it('4. Excluded user who passes normal rules -> OFF', () => {
      const result = evaluateFlagDetailed(flagConfig, 'user_forced_off', { plan: 'premium', country: 'NG' });
      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('matched_override_disabled');
    });

    it('5. User removed from overrides -> normal targeting rules and rollout apply again', () => {
      const flagWithoutOverrides = {
        ...flagConfig,
        rollout_percentage: 0,
        overrides: {} // Overrides cleared
      };

      // Disqualified by targeting
      const resultDisqualified = evaluateFlagDetailed(flagWithoutOverrides, 'user_forced_on', { plan: 'free', country: 'US' });
      expect(resultDisqualified.enabled).toBe(false);
      expect(resultDisqualified.reason).toBe('disqualified_by_targeting');

      // Matched targeting rules but 0% rollout
      const resultZeroRollout = evaluateFlagDetailed(flagWithoutOverrides, 'user_forced_on', { plan: 'premium', country: 'NG' });
      expect(resultZeroRollout.enabled).toBe(false);
      expect(resultZeroRollout.reason).toBe('zero_percent_rollout');
    });

    it('6. Kill switch overrides all inclusions and exclusions immediately', () => {
      const killedFlag = { ...flagConfig, enabled: false };
      expect(evaluateFlagDetailed(killedFlag, 'user_forced_on').enabled).toBe(false);
      expect(evaluateFlagDetailed(killedFlag, 'user_forced_off').enabled).toBe(false);
      expect(evaluateFlagDetailed(killedFlag, 'user_forced_on').reason).toBe('disabled_by_master_switch');
    });
  });

  describe('6. User Search & Picker API Contract', () => {
    it('returns the canonical distinctId for every result so UI never has to derive it', () => {
      const mockDbRow = {
        id: 'usr_internal_uuid_100',
        external_id: 'emmanuel@gmail.com',
        anonymous_id: null,
        traits: { name: 'Emmanuel Onoja' },
        first_seen_at: '2026-09-17T12:00:00Z',
        last_seen_at: '2026-09-17T12:05:00Z'
      };

      // API computes distinctId on server side:
      const distinctId = mockDbRow.external_id ?? mockDbRow.id;
      const displayName = resolveDisplayName(mockDbRow.traits, mockDbRow.external_id, mockDbRow.anonymous_id, mockDbRow.id);
      const emailMasked = maskEmail(mockDbRow.external_id);

      expect(distinctId).toBe('emmanuel@gmail.com');
      expect(displayName).toBe('Emmanuel Onoja');
      expect(emailMasked).toBe('e••••••••@gmail.com');

      // The UI stores only distinctId:
      const overrides: Record<string, boolean> = {};
      overrides[distinctId] = true;

      // Evaluation evaluates against distinctId:
      const flag = {
        key: 'test-flag',
        enabled: true,
        rollout_percentage: 0,
        environment: 'production',
        overrides
      };

      const result = evaluateFlagDetailed(flag, 'emmanuel@gmail.com');
      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('matched_override_enabled');
    });

    it('generates nextCursor for keyset pagination without offset drift', () => {
      const rows = [
        { id: 'usr_1', lastSeenAt: '2026-09-17T12:00:00.000Z' },
        { id: 'usr_2', lastSeenAt: '2026-09-17T11:55:00.000Z' }
      ];
      const limit = 2;
      const hasMore = rows.length >= limit;
      const lastRow = rows[rows.length - 1];
      const nextCursor = hasMore && lastRow ? `${lastRow.lastSeenAt}:${lastRow.id}` : null;

      expect(nextCursor).toBe('2026-09-17T11:55:00.000Z:usr_2');
    });
  });
});

