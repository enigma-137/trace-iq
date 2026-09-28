'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';

export interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  icon?: React.ReactNode;
}

export interface EmptyStateProps {
  illustrationSrc?: string;
  illustrationAlt?: string;
  title: string;
  description?: React.ReactNode;
  primaryAction?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  tertiaryAction?: EmptyStateAction;
  className?: string;
  imageSize?: 'sm' | 'md' | 'lg';
  children?: React.ReactNode;
}

export function EmptyState({
  illustrationSrc,
  illustrationAlt = 'Empty state illustration',
  title,
  description,
  primaryAction,
  secondaryAction,
  tertiaryAction,
  className = '',
  imageSize = 'md',
  children
}: EmptyStateProps) {
  const sizeMap = {
    sm: { width: 140, height: 140, maxH: 'max-h-[140px]' },
    md: { width: 210, height: 210, maxH: 'max-h-[210px]' },
    lg: { width: 280, height: 280, maxH: 'max-h-[280px]' }
  };

  const currentSize = sizeMap[imageSize];

  function renderAction(action: EmptyStateAction, isPrimary = false) {
    const variant = action.variant || (isPrimary ? 'primary' : 'outline');

    const baseClass =
      'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition active:scale-[0.98] shadow-sm';

    const variantClasses = {
      primary:
        'bg-blue-600 text-white hover:bg-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/50',
      secondary:
        'bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100',
      outline:
        'border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-850',
      ghost:
        'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white shadow-none'
    }[variant];

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

  return (
    <div
      className={`flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}
    >
      {/* Illustration */}
      {illustrationSrc && (
        <div className="relative mb-5 flex items-center justify-center">
          {/* Subtle ambient blur behind illustration */}
          <div className="pointer-events-none absolute -inset-3 rounded-full bg-gradient-to-tr from-blue-500/10 via-indigo-500/10 to-teal-500/10 opacity-70 blur-2xl dark:from-blue-500/20 dark:via-indigo-500/15 dark:to-teal-500/15" />

          <Image
            src={illustrationSrc}
            alt={illustrationAlt}
            width={currentSize.width}
            height={currentSize.height}
            className={`relative z-10 w-auto object-contain drop-shadow-md transition-transform duration-300 hover:scale-105 ${currentSize.maxH}`}
            priority
          />
        </div>
      )}

      {/* Content */}
      <h3 className="text-base font-semibold tracking-tight text-neutral-900 dark:text-white sm:text-lg">
        {title}
      </h3>

      {description && (
        <div className="mt-2 max-w-md text-xs leading-relaxed text-neutral-500 dark:text-neutral-400 sm:text-sm">
          {description}
        </div>
      )}

      {/* Action Buttons */}
      {(primaryAction || secondaryAction || tertiaryAction) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          {primaryAction && renderAction(primaryAction, true)}
          {secondaryAction && renderAction(secondaryAction, false)}
          {tertiaryAction && renderAction(tertiaryAction, false)}
        </div>
      )}

      {children && <div className="mt-6 w-full max-w-lg">{children}</div>}
    </div>
  );
}
