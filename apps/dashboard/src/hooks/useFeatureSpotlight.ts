'use client';

import { useState, useEffect, useCallback } from 'react';
import { FEATURE_SPOTLIGHTS, FeatureSpotlight } from '@/config/featureSpotlights';

const STORAGE_KEY = 'traceiq_feature_spotlights_state';

interface SpotlightStorageState {
  dismissed: string[];
  completed: string[];
  lastShownId?: string;
  updatedAt: number;
}

function getStoredState(): SpotlightStorageState {
  if (typeof window === 'undefined') {
    return { dismissed: [], completed: [], updatedAt: Date.now() };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { dismissed: [], completed: [], updatedAt: Date.now() };
    }
    return JSON.parse(raw) as SpotlightStorageState;
  } catch {
    return { dismissed: [], completed: [], updatedAt: Date.now() };
  }
}

function saveStoredState(state: SpotlightStorageState) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Dispatch product analytics events for spotlight interactions.
 */
export function trackSpotlightEvent(
  eventName:
    | 'feature_spotlight_viewed'
    | 'feature_spotlight_dismissed'
    | 'feature_spotlight_clicked'
    | 'feature_spotlight_completed',
  properties: Record<string, unknown>
) {
  if (typeof window === 'undefined') return;

  // 1. DOM custom event
  window.dispatchEvent(
    new CustomEvent('traceiq:analytics', {
      detail: { event: eventName, properties }
    })
  );

  // 2. TraceIQ SDK if attached
  if ((window as any).traceiq?.track) {
    (window as any).traceiq.track(eventName, properties);
  }
}

export function useFeatureSpotlight(options?: {
  enabled?: boolean;
  surface?: string;
  delayMs?: number;
}) {
  const { enabled = true, surface = 'home', delayMs = 400 } = options || {};
  const [currentSpotlight, setCurrentSpotlight] = useState<FeatureSpotlight | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const timer = setTimeout(() => {
      const state = getStoredState();
      const inactiveIds = new Set([...state.dismissed, ...state.completed]);

      // Pick the next available spotlight by priority order
      const nextEligible = FEATURE_SPOTLIGHTS.find((s) => !inactiveIds.has(s.id));

      if (nextEligible) {
        setCurrentSpotlight(nextEligible);
        trackSpotlightEvent('feature_spotlight_viewed', {
          spotlight_id: nextEligible.id,
          feature: nextEligible.featureKey,
          surface
        });
      } else {
        setCurrentSpotlight(null);
      }
      setIsLoaded(true);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [enabled, surface, delayMs]);

  const dismiss = useCallback(
    (spotlightId: string) => {
      const state = getStoredState();
      if (!state.dismissed.includes(spotlightId)) {
        state.dismissed.push(spotlightId);
      }
      state.lastShownId = spotlightId;
      state.updatedAt = Date.now();
      saveStoredState(state);

      trackSpotlightEvent('feature_spotlight_dismissed', {
        spotlight_id: spotlightId,
        surface
      });

      setCurrentSpotlight(null);
    },
    [surface]
  );

  const complete = useCallback(
    (spotlightId: string, ctaLabel: string) => {
      const state = getStoredState();
      if (!state.completed.includes(spotlightId)) {
        state.completed.push(spotlightId);
      }
      state.lastShownId = spotlightId;
      state.updatedAt = Date.now();
      saveStoredState(state);

      trackSpotlightEvent('feature_spotlight_clicked', {
        spotlight_id: spotlightId,
        cta_label: ctaLabel,
        surface
      });
      trackSpotlightEvent('feature_spotlight_completed', {
        spotlight_id: spotlightId,
        surface
      });

      setCurrentSpotlight(null);
    },
    [surface]
  );

  const resetAll = useCallback(() => {
    saveStoredState({ dismissed: [], completed: [], updatedAt: Date.now() });
    setCurrentSpotlight(FEATURE_SPOTLIGHTS[0] || null);
  }, []);

  return {
    spotlight: currentSpotlight,
    isLoaded,
    dismiss,
    complete,
    resetAll
  };
}
