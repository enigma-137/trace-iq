'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export interface PageBannerAction {
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  icon?: React.ReactNode;
}

export interface PageBannerProps {
  badge?: string;
  title: string;
  description: React.ReactNode;
  illustrationSrc?: string;
  illustrationAlt?: string;
  primaryAction?: PageBannerAction;
  secondaryAction?: PageBannerAction;
  dismissId?: string;
  onDismiss?: () => void;
  className?: string;
  imagePosition?: 'right' | 'left';
  variant?: 'default' | 'accent' | 'subtle';
}

export function PageBanner({
  badge,
  title,
  description,
  illustrationSrc,
  illustrationAlt = 'Banner illustration',
  primaryAction,
  secondaryAction,
  dismissId,
  onDismiss,
  className = '',
  imagePosition = 'right',
  variant = 'default'
}: PageBannerProps) {
  const [isDismissed, setIsDismissed] = useState(true);

  useEffect(() => {
    if (!dismissId) {
      setIsDismissed(false);
      return;
    }
    const dismissed = localStorage.getItem(`traceiq_banner_dismissed_${dismissId}`);
    if (!dismissed) {
      setIsDismissed(false);
    }
  }, [dismissId]);

  function handleDismiss() {
    if (dismissId) {
      localStorage.setItem(`traceiq_banner_dismissed_${dismissId}`, 'true');
    }
    setIsDismissed(true);
    onDismiss?.();
  }

  if (isDismissed) return null;

  function renderAction(action: PageBannerAction, isPrimary = false) {
    const actVariant = action.variant || (isPrimary ? 'primary' : 'outline');

    const baseClass =
      'inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition active:scale-[0.98] shadow-sm';

    const variantClasses = {
      primary:
        'bg-blue-600 text-white hover:bg-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/50',
      secondary:
        'bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100',
      outline:
        'border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800',
      ghost:
        'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white shadow-none'
    }[actVariant];

    const content = (
      <>
        {action.icon}
        <span>{action.label}</span>
      </>
    );

    if (action.href) {
      return (
        <Link key={action.label} href={action.href} className={`${baseClass} ${variantClasses}`}>
          {content}
        </Link>
      );
    }

    return (
      <button
        key={action.label}
        type="button"
        onClick={action.onClick}
        className={`${baseClass} ${variantClasses}`}
      >
        {content}
      </button>
    );
  }

  const bgStyles = {
    default:
      'border-neutral-200/90 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900',
    accent:
      'border-blue-200/80 bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-white shadow-sm dark:border-blue-900/60 dark:from-blue-950/30 dark:via-neutral-900 dark:to-neutral-900',
    subtle:
      'border-neutral-200 bg-neutral-50/50 shadow-none dark:border-neutral-800 dark:bg-neutral-850/40'
  }[variant];

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border ${bgStyles} p-4 sm:p-5 transition ${className}`}
    >
      {/* Dismiss Button */}
      {dismissId && (
        <button
          type="button"
          onClick={handleDismiss}
          title="Dismiss banner"
          className="absolute right-3 top-3 z-20 rounded-md p-1 text-neutral-400 opacity-60 transition hover:bg-neutral-100 hover:text-neutral-700 hover:opacity-100 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      <div
        className={`flex flex-col items-center justify-between gap-4 md:flex-row ${
          imagePosition === 'left' ? 'md:flex-row-reverse' : ''
        }`}
      >
        {/* Content Column */}
        <div className="flex-1 space-y-2 text-left">
          {badge && (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-200/80 bg-blue-50/80 px-2.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:border-blue-900/80 dark:bg-blue-950/60 dark:text-blue-300">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
              {badge}
            </div>
          )}

          <h3 className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-white sm:text-base">
            {title}
          </h3>

          <div className="max-w-2xl text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
            {description}
          </div>

          {(primaryAction || secondaryAction) && (
            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              {primaryAction && renderAction(primaryAction, true)}
              {secondaryAction && renderAction(secondaryAction, false)}
            </div>
          )}
        </div>

        {/* Artwork Image Column */}
        {illustrationSrc && (
          <div className="relative shrink-0 flex items-center justify-center">
            {/* Soft ambient glow */}
            <div className="pointer-events-none absolute -inset-2 rounded-full bg-blue-500/10 opacity-70 blur-xl dark:bg-blue-500/15" />
            <Image
              src={illustrationSrc}
              alt={illustrationAlt}
              width={140}
              height={140}
              className="relative z-10 max-h-[110px] sm:max-h-[125px] w-auto object-contain drop-shadow-sm transition-transform duration-300 group-hover:scale-105"
            />
          </div>
        )}
      </div>
    </div>
  );
}
