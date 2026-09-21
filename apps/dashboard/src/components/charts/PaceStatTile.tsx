import React, { ReactNode } from 'react';

interface PaceStatTileProps {
  icon?: ReactNode;
  title: string;
  value: string | number;
  prefix?: string;
  suffix?: string;
  badge?: string;
  badgeTone?: 'green' | 'red' | 'blue' | 'amber' | 'neutral';
  badgeIcon?: 'up' | 'down' | 'neutral';
  description?: string;
  className?: string;
  children?: ReactNode;
}

export function PaceStatTile({
  icon,
  title,
  value,
  prefix,
  suffix,
  badge,
  badgeTone = 'green',
  badgeIcon,
  description,
  className = '',
  children
}: PaceStatTileProps) {
  const textColor = {
    green: 'text-emerald-500 dark:text-emerald-400',
    red: 'text-rose-500 dark:text-rose-400',
    blue: 'text-blue-500 dark:text-blue-400',
    amber: 'text-amber-500 dark:text-amber-400',
    neutral: 'text-neutral-500 dark:text-slate-400'
  }[badgeTone];

  return (
    <div
      className={`group relative flex flex-col justify-between overflow-hidden rounded-md border border-neutral-200 bg-white p-4.5 shadow-xs transition hover:border-neutral-300 dark:border-white/[0.08] dark:bg-[#09090b] dark:shadow-none dark:hover:border-white/20 sm:p-5 ${className}`}
    >
      {/* Top Header: Subtle Title with optional mini icon */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-neutral-500 dark:text-slate-400">
          {icon ? (
            <span className="text-neutral-400 dark:text-slate-500">
              {icon}
            </span>
          ) : null}
          <span className="truncate">{title}</span>
        </div>
      </div>

      {/* Main Stat Value */}
      <div className="mt-2.5 flex items-baseline text-2xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-3xl">
        {prefix && <span className="mr-0.5 text-lg font-medium text-neutral-400 dark:text-slate-500">{prefix}</span>}
        <span>{typeof value === 'number' ? value.toLocaleString() : value}</span>
        {suffix && <span className="ml-1 text-sm font-medium text-neutral-500 dark:text-slate-400">{suffix}</span>}
      </div>

      {/* Bottom Footer: Clean colored trend text without pills/borders */}
      {(badge || description) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {badge ? (
            <span className={`inline-flex items-center gap-1 font-semibold ${textColor}`}>
              {badgeIcon === 'up' && <span className="text-sm leading-none font-bold">↗</span>}
              {badgeIcon === 'down' && <span className="text-sm leading-none font-bold">↘</span>}
              {!badgeIcon && (badge.startsWith('+') ? <span className="text-sm leading-none font-bold">↗</span> : badge.startsWith('-') ? <span className="text-sm leading-none font-bold">↘</span> : null)}
              <span>{badge}</span>
            </span>
          ) : null}

          {description && (
            <span className="truncate text-neutral-400 dark:text-slate-500 text-[11px]">
              {description}
            </span>
          )}
        </div>
      )}

      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
