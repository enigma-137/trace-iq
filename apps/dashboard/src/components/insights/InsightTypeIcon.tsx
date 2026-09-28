'use client';

import React from 'react';
import type { InsightType } from '@/types/analytics';

interface InsightTypeIconProps {
  type: InsightType | string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function InsightTypeIcon({ type, size = 'md', className = '' }: InsightTypeIconProps) {
  const normType = (type || 'trend').toLowerCase();

  // Size styling classes
  const sizeClasses = {
    sm: 'w-7 h-7 rounded-lg p-1.5',
    md: 'w-9 h-9 rounded-xl p-2',
    lg: 'w-12 h-12 rounded-2xl p-2.5'
  }[size];

  const svgSize = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-7 h-7'
  }[size];

  switch (normType) {
    // 1. Funnels & Conversion -> Vibrant Coral/Amber
    case 'funnel':
      return (
        <div
          className={`flex items-center justify-center shrink-0 bg-gradient-to-br from-amber-500/15 to-orange-500/10 text-amber-600 dark:from-amber-500/25 dark:to-orange-500/20 dark:text-amber-400 border border-amber-500/25 shadow-xs ${sizeClasses} ${className}`}
          title="Funnel Analysis"
        >
          <svg className={svgSize} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18l-6.5 8.5v6.5l-5-2.5v-4L3 4z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} strokeOpacity={0.6} d="M7 8h10M9 12h6" />
          </svg>
        </div>
      );

    // 2. Retention & Cohorts -> Deep Indigo/Purple
    case 'retention':
      return (
        <div
          className={`flex items-center justify-center shrink-0 bg-gradient-to-br from-indigo-500/15 to-purple-500/10 text-indigo-600 dark:from-indigo-500/25 dark:to-purple-500/20 dark:text-indigo-400 border border-indigo-500/25 shadow-xs ${sizeClasses} ${className}`}
          title="User Retention"
        >
          <svg className={svgSize} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            <circle cx="12" cy="12" r="2.5" fill="currentColor" fillOpacity={0.25} />
          </svg>
        </div>
      );

    // 3. Users & Cohorts -> Violet
    case 'user_metric':
    case 'users':
    case 'cohort':
      return (
        <div
          className={`flex items-center justify-center shrink-0 bg-gradient-to-br from-violet-500/15 to-fuchsia-500/10 text-violet-600 dark:from-violet-500/25 dark:to-fuchsia-500/20 dark:text-violet-400 border border-violet-500/25 shadow-xs ${sizeClasses} ${className}`}
          title="User Analytics"
        >
          <svg className={svgSize} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" strokeWidth={2} />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} strokeOpacity={0.6} d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>
      );

    // 4. Performance & API Latency -> Bright Cyan
    case 'api_performance':
    case 'performance':
    case 'latency':
      return (
        <div
          className={`flex items-center justify-center shrink-0 bg-gradient-to-br from-cyan-500/15 to-blue-500/10 text-cyan-600 dark:from-cyan-500/25 dark:to-blue-500/20 dark:text-cyan-400 border border-cyan-500/25 shadow-xs ${sizeClasses} ${className}`}
          title="API Performance"
        >
          <svg className={svgSize} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
      );

    // 5. Errors & Exceptions -> Crimson / Rose
    case 'errors':
    case 'error_metric':
    case 'exception':
      return (
        <div
          className={`flex items-center justify-center shrink-0 bg-gradient-to-br from-rose-500/15 to-red-500/10 text-rose-600 dark:from-rose-500/25 dark:to-red-500/20 dark:text-rose-400 border border-rose-500/25 shadow-xs ${sizeClasses} ${className}`}
          title="Error Telemetry"
        >
          <svg className={svgSize} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
      );

    // 6. Revenue & Monetization -> Emerald
    case 'revenue':
    case 'billing':
      return (
        <div
          className={`flex items-center justify-center shrink-0 bg-gradient-to-br from-emerald-500/15 to-teal-500/10 text-emerald-600 dark:from-emerald-500/25 dark:to-teal-500/20 dark:text-emerald-400 border border-emerald-500/25 shadow-xs ${sizeClasses} ${className}`}
          title="Revenue & Conversion"
        >
          <svg className={svgSize} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 12v-2m0 0c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      );

    // 7. Web Traffic & Vitals -> Teal
    case 'web_analytics':
    case 'web_vitals':
      return (
        <div
          className={`flex items-center justify-center shrink-0 bg-gradient-to-br from-teal-500/15 to-emerald-500/10 text-teal-600 dark:from-teal-500/25 dark:to-emerald-500/20 dark:text-teal-400 border border-teal-500/25 shadow-xs ${sizeClasses} ${className}`}
          title="Web Analytics"
        >
          <svg className={svgSize} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="9" strokeWidth={2} />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.6 9h16.8M3.6 15h16.8" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3a14.2 14.2 0 0 1 3 9 14.2 14.2 0 0 1-3 9 14.2 14.2 0 0 1-3-9 14.2 14.2 0 0 1 3-9z" />
          </svg>
        </div>
      );

    // 8. KPI / Metric -> Sky Blue
    case 'kpi':
      return (
        <div
          className={`flex items-center justify-center shrink-0 bg-gradient-to-br from-sky-500/15 to-blue-500/10 text-sky-600 dark:from-sky-500/25 dark:to-blue-500/20 dark:text-sky-400 border border-sky-500/25 shadow-xs ${sizeClasses} ${className}`}
          title="KPI Metric"
        >
          <svg className={svgSize} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 3h18v18H3V3z" />
          </svg>
        </div>
      );

    // 9. Event Breakdown -> Amber / Gold
    case 'event_breakdown':
    case 'top_events':
    case 'feature_adoption':
      return (
        <div
          className={`flex items-center justify-center shrink-0 bg-gradient-to-br from-amber-500/15 to-yellow-500/10 text-amber-600 dark:from-amber-500/25 dark:to-yellow-500/20 dark:text-amber-400 border border-amber-500/25 shadow-xs ${sizeClasses} ${className}`}
          title="Event Breakdown"
        >
          <svg className={svgSize} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h14" />
          </svg>
        </div>
      );

    // 10. Table -> Slate / Neutral
    case 'table':
      return (
        <div
          className={`flex items-center justify-center shrink-0 bg-gradient-to-br from-slate-500/15 to-neutral-500/10 text-slate-600 dark:from-slate-500/25 dark:to-neutral-500/20 dark:text-slate-300 border border-slate-500/25 shadow-xs ${sizeClasses} ${className}`}
          title="Table Matrix"
        >
          <svg className={svgSize} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18v16H3V4zM3 10h18M10 4v16M16 4v16" />
          </svg>
        </div>
      );

    // Default / Trend -> Clean PostHog/Cloudflare Blue
    case 'trend':
    default:
      return (
        <div
          className={`flex items-center justify-center shrink-0 bg-gradient-to-br from-blue-500/15 to-indigo-500/10 text-blue-600 dark:from-blue-500/25 dark:to-indigo-500/20 dark:text-blue-400 border border-blue-500/25 shadow-xs ${sizeClasses} ${className}`}
          title="Trend Analysis"
        >
          <svg className={svgSize} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 17l6-6 4 4 8-8" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 7h7v7" />
          </svg>
        </div>
      );
  }
}
