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
    sm: 'w-8 h-8 rounded-md p-1.5',
    md: 'w-11 h-11 rounded-lg p-2.5',
    lg: 'w-14 h-14 rounded-xl p-3.5'
  }[size];

  const svgSize = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-7 h-7'
  }[size];

  switch (normType) {
    // 1. Funnels & Conversion -> Orange
    case 'funnel':
      return (
        <div
          className={`flex items-center justify-center shrink-0 bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-500/20 ${sizeClasses} ${className}`}
          title="Funnel Insight"
        >
          <svg className={svgSize} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 4h18l-6.5 8.5v6.5l-5-2.5v-4L3 4z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} strokeOpacity={0.5} d="M7 8h10M9 12h6" />
          </svg>
        </div>
      );

    // 2. Retention & Cohorts -> Indigo
    case 'retention':
      return (
        <div
          className={`flex items-center justify-center shrink-0 bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 border border-indigo-500/20 ${sizeClasses} ${className}`}
          title="Retention Insight"
        >
          <svg className={svgSize} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            <circle cx="12" cy="12" r="2.5" strokeWidth={1.5} fill="currentColor" fillOpacity={0.2} />
          </svg>
        </div>
      );

    // 3. Users & Cohorts -> Violet
    case 'user_metric':
    case 'users':
    case 'cohort':
      return (
        <div
          className={`flex items-center justify-center shrink-0 bg-violet-500/10 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400 border border-violet-500/20 ${sizeClasses} ${className}`}
          title="User Insight"
        >
          <svg className={svgSize} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" strokeWidth={1.8} />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} strokeOpacity={0.6} d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>
      );

    // 4. Performance & API Latency -> Cyan
    case 'api_performance':
    case 'performance':
    case 'latency':
      return (
        <div
          className={`flex items-center justify-center shrink-0 bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-400 border border-cyan-500/20 ${sizeClasses} ${className}`}
          title="Performance Insight"
        >
          <svg className={svgSize} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
      );

    // 5. Errors & Exceptions -> Red
    case 'errors':
    case 'error_metric':
    case 'exception':
      return (
        <div
          className={`flex items-center justify-center shrink-0 bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400 border border-rose-500/20 ${sizeClasses} ${className}`}
          title="Error Insight"
        >
          <svg className={svgSize} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
      );

    // 6. Revenue & Monetization -> Green
    case 'revenue':
    case 'billing':
      return (
        <div
          className={`flex items-center justify-center shrink-0 bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border border-emerald-500/20 ${sizeClasses} ${className}`}
          title="Revenue Insight"
        >
          <svg className={svgSize} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 12v-2m0 0c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      );

    // 7. Web & Traffic -> Teal
    case 'web_analytics':
    case 'web_vitals':
      return (
        <div
          className={`flex items-center justify-center shrink-0 bg-teal-500/10 text-teal-600 dark:bg-teal-500/20 dark:text-teal-400 border border-teal-500/20 ${sizeClasses} ${className}`}
          title="Web Traffic Insight"
        >
          <svg className={svgSize} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="9" strokeWidth={1.8} />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.6 9h16.8M3.6 15h16.8" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3a14.2 14.2 0 0 1 3 9 14.2 14.2 0 0 1-3 9 14.2 14.2 0 0 1-3-9 14.2 14.2 0 0 1 3-9z" />
          </svg>
        </div>
      );

    // 8. KPI / Metric -> Sky
    case 'kpi':
      return (
        <div
          className={`flex items-center justify-center shrink-0 bg-sky-500/10 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400 border border-sky-500/20 ${sizeClasses} ${className}`}
          title="KPI Metric Insight"
        >
          <svg className={svgSize} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 3h18v18H3V3z" />
          </svg>
        </div>
      );

    // 9. Event Breakdown -> Amber
    case 'event_breakdown':
    case 'top_events':
      return (
        <div
          className={`flex items-center justify-center shrink-0 bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-500/20 ${sizeClasses} ${className}`}
          title="Event Breakdown Insight"
        >
          <svg className={svgSize} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 12h10M4 18h14" />
          </svg>
        </div>
      );

    // 10. Table -> Slate
    case 'table':
      return (
        <div
          className={`flex items-center justify-center shrink-0 bg-slate-500/10 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400 border border-slate-500/20 ${sizeClasses} ${className}`}
          title="Table Data Insight"
        >
          <svg className={svgSize} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 4h18v16H3V4zM3 10h18M10 4v16M16 4v16" />
          </svg>
        </div>
      );

    // Default / Trend -> Blue
    case 'trend':
    default:
      return (
        <div
          className={`flex items-center justify-center shrink-0 bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 border border-blue-500/20 ${sizeClasses} ${className}`}
          title="Trend Insight"
        >
          <svg className={svgSize} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 17l6-6 4 4 8-8" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M14 7h7v7" />
          </svg>
        </div>
      );
  }
}
