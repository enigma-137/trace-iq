import { describe, expect, it, beforeEach, vi } from 'vitest';
import { getGuideState, setGuideState } from '../src/components/ContextualGuideCard';

describe('ContextualGuideCard Onboarding System', () => {
  beforeEach(() => {
    // Mock localStorage
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => {
        store[key] = val;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k];
      }
    });
  });

  it('correctly reads null for new unviewed guides', () => {
    expect(getGuideState('dashboard-builder-onboarding')).toBeNull();
  });

  it('persists viewed, dismissed and completed states correctly', () => {
    setGuideState('dashboard-builder-onboarding', 'viewed');
    expect(getGuideState('dashboard-builder-onboarding')).toBe('viewed');

    setGuideState('dashboard-builder-onboarding', 'dismissed');
    expect(getGuideState('dashboard-builder-onboarding')).toBe('dismissed');

    setGuideState('dashboard-builder-onboarding', 'completed');
    expect(getGuideState('dashboard-builder-onboarding')).toBe('completed');
  });

  it('supports isolated state keys for different surfaces', () => {
    setGuideState('dashboard-builder-onboarding', 'completed');
    setGuideState('experiments-onboarding', 'viewed');

    expect(getGuideState('dashboard-builder-onboarding')).toBe('completed');
    expect(getGuideState('experiments-onboarding')).toBe('viewed');
    expect(getGuideState('surveys-onboarding')).toBeNull();
  });
});
