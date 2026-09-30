'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export interface GuideAction {
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
}

export interface ContextualGuideCardProps {
  guideId: string;
  title: string;
  description: React.ReactNode;
  imageSrc: string;
  imageAlt?: string;
  primaryAction: GuideAction;
  secondaryAction?: GuideAction;
  surface?: string;
  placement?: 'bottom-right' | 'bottom-left' | 'top-right' | 'inline';
  forceOpen?: boolean;
  onDismiss?: () => void;
  onPrimaryClick?: () => void;
  onSecondaryClick?: () => void;
  className?: string;
}

/**
 * Persists and reads guide state from localStorage with safe fallback.
 */
export function getGuideState(guideId: string): 'viewed' | 'dismissed' | 'completed' | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(`traceiq_guide_${guideId}`) as 'viewed' | 'dismissed' | 'completed' | null;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(`traceiq_guide_${guideId}`) as 'viewed' | 'dismissed' | 'completed' | null;
    }
  } catch {
    return null;
  }
  return null;
}

export function setGuideState(guideId: string, state: 'viewed' | 'dismissed' | 'completed') {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(`traceiq_guide_${guideId}`, state);
      return;
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`traceiq_guide_${guideId}`, state);
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Dispatch product analytics events for guide interactions.
 */
function trackGuideEvent(
  eventName: 'guide_viewed' | 'guide_dismissed' | 'guide_cta_clicked' | 'guide_completed',
  properties: Record<string, unknown>
) {
  if (typeof window === 'undefined') return;

  // 1. Dispatch custom DOM event
  window.dispatchEvent(
    new CustomEvent('traceiq:analytics', {
      detail: { event: eventName, properties }
    })
  );

  // 2. Direct TraceIQ SDK client if attached to window
  if ((window as any).traceiq?.track) {
    (window as any).traceiq.track(eventName, properties);
  }
}

export function ContextualGuideCard({
  guideId,
  title,
  description,
  imageSrc,
  imageAlt = 'Guide illustration',
  primaryAction,
  secondaryAction,
  surface = 'dashboard',
  placement = 'bottom-right',
  forceOpen = false,
  onDismiss,
  onPrimaryClick,
  onSecondaryClick,
  className = ''
}: ContextualGuideCardProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const existingState = getGuideState(guideId);

    if (forceOpen || !existingState) {
      // Small timeout for smooth entrance transition
      const timer = setTimeout(() => {
        setIsVisible(true);
        if (!existingState) {
          setGuideState(guideId, 'viewed');
          trackGuideEvent('guide_viewed', { guide_id: guideId, surface });
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [guideId, forceOpen, surface]);

  const handleDismiss = useCallback(() => {
    setIsAnimatingOut(true);
    setGuideState(guideId, 'dismissed');
    trackGuideEvent('guide_dismissed', { guide_id: guideId, surface });

    setTimeout(() => {
      setIsVisible(false);
      setIsAnimatingOut(false);
      onDismiss?.();
    }, 250);
  }, [guideId, surface, onDismiss]);

  const handlePrimaryClick = useCallback(() => {
    trackGuideEvent('guide_cta_clicked', {
      guide_id: guideId,
      surface,
      cta: primaryAction.label
    });
    setGuideState(guideId, 'completed');
    trackGuideEvent('guide_completed', { guide_id: guideId, surface });

    onPrimaryClick?.();
    primaryAction.onClick?.();
    handleDismiss();
  }, [guideId, surface, primaryAction, onPrimaryClick, handleDismiss]);

  const handleSecondaryClick = useCallback(() => {
    if (secondaryAction) {
      trackGuideEvent('guide_cta_clicked', {
        guide_id: guideId,
        surface,
        cta: secondaryAction.label
      });
      onSecondaryClick?.();
      secondaryAction.onClick?.();
    }
    handleDismiss();
  }, [guideId, surface, secondaryAction, onSecondaryClick, handleDismiss]);

  // Handle escape key
  useEffect(() => {
    if (!isVisible) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        handleDismiss();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, handleDismiss]);

  if (!isMounted || (!isVisible && !isAnimatingOut)) {
    return null;
  }

  // Positioning styles
  const positionClasses = {
    'bottom-right':
      'fixed inset-x-4 bottom-4 sm:inset-x-auto sm:right-6 sm:bottom-6 z-40',
    'bottom-left':
      'fixed inset-x-4 bottom-4 sm:inset-x-auto sm:left-6 sm:bottom-6 z-40',
    'top-right':
      'fixed inset-x-4 top-20 sm:inset-x-auto sm:right-6 sm:top-20 z-40',
    inline: 'relative w-full z-10'
  }[placement];

  const animationClasses = isAnimatingOut
    ? 'opacity-0 translate-y-3 scale-95 duration-200'
    : 'opacity-100 translate-y-0 scale-100 duration-300';

  return (
    <div
      role="region"
      aria-label={title}
      className={`${positionClasses} w-full max-w-[340px] sm:max-w-[350px] mx-auto transition-all ease-out motion-reduce:transition-none motion-reduce:transform-none ${animationClasses} ${className}`}
    >
      <div className="relative overflow-hidden rounded-2xl border border-neutral-200/90 bg-white p-4 shadow-xl shadow-neutral-950/10 ring-1 ring-black/5 transition-all dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-2xl dark:shadow-black/60 dark:ring-white/5">
        {/* Top Artwork Area */}
        <div className="group relative mb-3.5 h-36 w-full overflow-hidden rounded-xl bg-gradient-to-tr from-neutral-100 via-blue-50/30 to-indigo-50/20 dark:from-neutral-850 dark:via-blue-950/20 dark:to-neutral-850">
          <Image
            src={imageSrc}
            alt={imageAlt}
            fill
            sizes="(max-width: 640px) 100vw, 350px"
            className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
            priority
          />

          {/* Dismiss Close '×' Button overlay on top-right */}
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Close guide"
            title="Dismiss"
            className="absolute right-2.5 top-2.5 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md transition hover:bg-black/60 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <div className="space-y-1.5 px-0.5">
          <h3 className="text-sm sm:text-[15px] font-semibold tracking-tight text-neutral-900 dark:text-white">
            {title}
          </h3>
          <div className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
            {description}
          </div>
        </div>

        {/* Action Button Group */}
        <div className="mt-4 flex flex-col gap-2">
          {primaryAction.href ? (
            <Link
              href={primaryAction.href}
              onClick={handlePrimaryClick}
              className="flex w-full items-center justify-center rounded-xl bg-neutral-900 px-4 py-2.5 text-center text-xs sm:text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 active:scale-[0.98] dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
            >
              {primaryAction.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={handlePrimaryClick}
              className="flex w-full items-center justify-center rounded-xl bg-neutral-900 px-4 py-2.5 text-center text-xs sm:text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 active:scale-[0.98] dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
            >
              {primaryAction.label}
            </button>
          )}

          {secondaryAction && (
            secondaryAction.href ? (
              <Link
                href={secondaryAction.href}
                onClick={handleSecondaryClick}
                className="flex w-full items-center justify-center rounded-xl border border-neutral-200 bg-transparent px-4 py-2 text-center text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-850"
              >
                {secondaryAction.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={handleSecondaryClick}
                className="flex w-full items-center justify-center rounded-xl border border-neutral-200 bg-transparent px-4 py-2 text-center text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-850"
              >
                {secondaryAction.label}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
