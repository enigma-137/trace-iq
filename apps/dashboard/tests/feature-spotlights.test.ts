import { describe, expect, it, beforeEach, vi } from 'vitest';
import { FEATURE_SPOTLIGHTS } from '../src/config/featureSpotlights';

describe('Feature Spotlight Discovery System', () => {
  const STORAGE_KEY = 'traceiq_feature_spotlights_state';
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => {
        store[key] = val;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      }
    });
  });

  it('contains valid and complete metadata for all product spotlights', () => {
    expect(FEATURE_SPOTLIGHTS.length).toBeGreaterThanOrEqual(6);

    const ids = new Set<string>();
    for (const spotlight of FEATURE_SPOTLIGHTS) {
      expect(spotlight.id).toBeDefined();
      expect(ids.has(spotlight.id)).toBe(false);
      ids.add(spotlight.id);

      expect(spotlight.title.length).toBeGreaterThan(5);
      expect(spotlight.description.length).toBeGreaterThan(10);
      expect(spotlight.ctaLabel.length).toBeGreaterThan(3);
      expect(spotlight.href.startsWith('/dashboard')).toBe(true);
      expect(spotlight.imageSrc.startsWith('/dashboards/')).toBe(true);
    }
  });

  it('correctly sequences through spotlights as user dismisses cards', () => {
    function getNextSpotlight() {
      const raw = store[STORAGE_KEY];
      const state = raw ? JSON.parse(raw) : { dismissed: [], completed: [] };
      const inactive = new Set([...state.dismissed, ...state.completed]);
      return FEATURE_SPOTLIGHTS.find((s) => !inactive.has(s.id)) || null;
    }

    function dismissSpotlight(id: string) {
      const raw = store[STORAGE_KEY];
      const state = raw ? JSON.parse(raw) : { dismissed: [], completed: [] };
      if (!state.dismissed.includes(id)) state.dismissed.push(id);
      store[STORAGE_KEY] = JSON.stringify(state);
    }

    // Initial visit -> First spotlight is Analytics
    const s1 = getNextSpotlight();
    expect(s1?.id).toBe('spotlight-analytics');
    expect(s1?.title).toBe('See what users actually do');
    expect(s1?.ctaLabel).toBe('Explore Analytics');

    // Dismiss visit 1 -> Next visit shows Funnels
    dismissSpotlight(s1!.id);
    const s2 = getNextSpotlight();
    expect(s2?.id).toBe('spotlight-funnels');
    expect(s2?.title).toBe('Find where users drop off');
    expect(s2?.ctaLabel).toBe('Open Funnels');

    // Dismiss visit 2 -> Next visit shows Insights
    dismissSpotlight(s2!.id);
    const s3 = getNextSpotlight();
    expect(s3?.id).toBe('spotlight-insights');
    expect(s3?.title).toBe('Turn data into answers');
    expect(s3?.ctaLabel).toBe('View Insights');

    // Dismiss visit 3 -> Next visit shows Session Replay
    dismissSpotlight(s3!.id);
    const s4 = getNextSpotlight();
    expect(s4?.id).toBe('spotlight-replay');
    expect(s4?.title).toBe('Watch the journey unfold');
    expect(s4?.ctaLabel).toBe('Open Session Replay');

    // Dismiss visit 4 -> Next visit shows Dashboards
    dismissSpotlight(s4!.id);
    const s5 = getNextSpotlight();
    expect(s5?.id).toBe('spotlight-dashboards');
    expect(s5?.title).toBe('Build a view that matters');
    expect(s5?.ctaLabel).toBe('Open Dashboards');
  });

  it('exhausts queue gracefully when all spotlights have been viewed/dismissed', () => {
    const allIds = FEATURE_SPOTLIGHTS.map((s) => s.id);
    store[STORAGE_KEY] = JSON.stringify({ dismissed: allIds, completed: [] });

    const raw = store[STORAGE_KEY];
    const state = JSON.parse(raw);
    const inactive = new Set([...state.dismissed, ...state.completed]);
    const next = FEATURE_SPOTLIGHTS.find((s) => !inactive.has(s.id)) || null;

    expect(next).toBeNull();
  });
});
