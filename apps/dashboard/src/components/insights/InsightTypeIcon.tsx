'use client';

import React from 'react';
import type { InsightType } from '@/types/analytics';

interface InsightTypeIconProps {
  type: InsightType | string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const ICONS: Array<{ types: string[]; title: string; path: string }> = [
  { types: ['funnel'], title: 'Funnel', path: 'M3 4h18l-6.5 8.5v6.5l-5-2.5v-4L3 4z' },
  {
    types: ['retention'],
    title: 'Retention',
    path: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
  },
  {
    types: ['user_metric', 'users', 'cohort'],
    title: 'Users',
    path: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'
  },
  {
    types: ['api_performance', 'performance', 'latency'],
    title: 'API performance',
    path: 'M13 10V3L4 14h7v7l9-11h-7z'
  },
  {
    types: ['errors', 'error_metric', 'exception'],
    title: 'Errors',
    path: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
  },
  {
    types: ['revenue', 'billing'],
    title: 'Revenue',
    path: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 12v-2m0 0c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
  },
  {
    types: ['web_analytics', 'web_vitals'],
    title: 'Web analytics',
    path: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0zM3.6 9h16.8M3.6 15h16.8M12 3a14.2 14.2 0 0 1 3 9 14.2 14.2 0 0 1-3 9 14.2 14.2 0 0 1-3-9 14.2 14.2 0 0 1 3-9z'
  },
  { types: ['kpi'], title: 'KPI', path: 'M3 3h18v18H3V3zM7 15l3-3 3 2 4-5' },
  {
    types: ['event_breakdown', 'top_events', 'feature_adoption'],
    title: 'Event breakdown',
    path: 'M4 6h16M4 12h10M4 18h14'
  },
  { types: ['table'], title: 'Table', path: 'M3 4h18v16H3V4zM3 10h18M10 4v16M16 4v16' }
];

const TREND = { title: 'Trend', path: 'M3 17l6-6 4 4 8-8M14 7h7v7' };

const SIZES = { sm: 'h-3.5 w-3.5', md: 'h-4 w-4', lg: 'h-5 w-5' };

/** Plain line icon for an insight type: no background, and it inherits a neutral colour. */
export function InsightTypeIcon({ type, size = 'md', className = '' }: InsightTypeIconProps) {
  const normType = (type || 'trend').toLowerCase();
  const icon = ICONS.find((entry) => entry.types.includes(normType)) ?? TREND;

  return (
    <svg
      className={`shrink-0 text-neutral-400 dark:text-neutral-500 ${SIZES[size]} ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      role="img"
      aria-label={icon.title}
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={icon.path} />
    </svg>
  );
}
