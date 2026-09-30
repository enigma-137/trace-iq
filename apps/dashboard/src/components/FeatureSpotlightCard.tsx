'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useFeatureSpotlight } from '@/hooks/useFeatureSpotlight';
import { withProjectId } from '@/app/dashboard/nav';

export interface FeatureSpotlightCardProps {
  projectId?: string;
  surface?: string;
  delayMs?: number;
  placement?: 'bottom-right' | 'bottom-left' | 'top-right' | 'inline';
  className?: string;
}

export function FeatureSpotlightCard({
  projectId,
  surface = 'dashboard-home',
  delayMs = 400,
  placement = 'bottom-right',
  className = ''
}: FeatureSpotlightCardProps) {
  const { spotlight, isLoaded, dismiss, complete } = useFeatureSpotlight({
    surface,
    delayMs
  });

  const [isClosing, setIsClosing] = useState(false);

  const handleDismiss = useCallback(() => {
    if (!spotlight) return;
    setIsClosing(true);
    setTimeout(() => {
      dismiss(spotlight.id);
      setIsClosing(false);
    }, 200);
  }, [spotlight, dismiss]);

  const handlePrimaryClick = useCallback(() => {
    if (!spotlight) return;
    complete(spotlight.id, spotlight.ctaLabel);
  }, [spotlight, complete]);

  // Handle escape key
  useEffect(() => {
    if (!spotlight) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        handleDismiss();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [spotlight, handleDismiss]);

  if (!isLoaded || !spotlight) {
    return null;
  }

  const destinationHref = withProjectId(spotlight.href, projectId);

  const positionClasses = {
    'bottom-right':
      'fixed inset-x-4 bottom-4 sm:inset-x-auto sm:right-6 sm:bottom-6 z-40',
    'bottom-left':
      'fixed inset-x-4 bottom-4 sm:inset-x-auto sm:left-6 sm:bottom-6 z-40',
    'top-right':
      'fixed inset-x-4 top-20 sm:inset-x-auto sm:right-6 sm:top-20 z-40',
    inline: 'relative w-full z-10'
  }[placement];

  const animationClasses = isClosing
    ? 'opacity-0 translate-y-3 scale-95 duration-200'
    : 'opacity-100 translate-y-0 scale-100 duration-300';

  return (
    <div
      role="region"
      aria-label={spotlight.title}
      className={`${positionClasses} w-full max-w-[340px] sm:max-w-[350px] mx-auto transition-all ease-out motion-reduce:transition-none motion-reduce:transform-none ${animationClasses} ${className}`}
    >
      <div className="relative overflow-hidden rounded-2xl border border-neutral-200/90 bg-white p-4 shadow-xl shadow-neutral-950/10 ring-1 ring-black/5 transition-all dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-2xl dark:shadow-black/60 dark:ring-white/5">
        {/* Top Image Banner Area */}
        <div className="group relative mb-3.5 h-36 w-full overflow-hidden rounded-xl bg-gradient-to-tr from-neutral-100 via-blue-50/30 to-indigo-50/20 dark:from-neutral-850 dark:via-blue-950/20 dark:to-neutral-850">
          <Image
            src={spotlight.imageSrc}
            alt={spotlight.imageAlt}
            fill
            sizes="(max-width: 640px) 100vw, 350px"
            className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
            priority
          />

          {/* Tagline Badge */}
          {spotlight.tagline && (
            <div className="absolute left-2.5 top-2.5 z-20 flex items-center gap-1.5 rounded-full border border-white/20 bg-neutral-950/60 px-2.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-md">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
              {spotlight.tagline}
            </div>
          )}

          {/* Close '×' Button overlay on top-right */}
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Close spotlight"
            title="Dismiss spotlight"
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
            {spotlight.title}
          </h3>
          <div className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
            {spotlight.description}
          </div>
        </div>

        {/* Action Button Group */}
        <div className="mt-4 flex flex-col gap-2">
          <Link
            href={destinationHref}
            onClick={handlePrimaryClick}
            className="flex w-full items-center justify-center rounded-xl bg-neutral-900 px-4 py-2.5 text-center text-xs sm:text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 active:scale-[0.98] dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
          >
            {spotlight.ctaLabel}
          </Link>

          <button
            type="button"
            onClick={handleDismiss}
            className="flex w-full items-center justify-center rounded-xl border border-transparent py-1 text-center text-[11px] font-medium text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 transition"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
