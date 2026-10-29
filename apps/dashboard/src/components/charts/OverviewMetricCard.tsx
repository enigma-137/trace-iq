'use client';

import React, { ReactNode } from 'react';
import { ComparisonHoverCard, type MetricComparison } from './ComparisonHoverCard';

export interface OverviewMetricCardProps {
  icon?: ReactNode;
  title: string;
  value: string | number;
  suffix?: string;
  delta?: string;
  deltaTone?: 'green' | 'red' | 'blue' | 'neutral';
  deltaDirection?: 'up' | 'down';
  deltaSubtext?: string;
  sparklineData?: number[];
  color?: 'blue' | 'emerald' | 'rose' | 'purple' | 'cyan';
  className?: string;
  /** Previous vs. current period, shown in a card on hover or focus. */
  comparison?: MetricComparison;
  /** Which edge the comparison card lines up with. */
  comparisonAlign?: 'left' | 'right';
}

const COLOR_MAP = {
  blue: {
    stroke: '#2563eb',
    fill: 'rgba(37, 99, 235, 0.08)',
    text: 'text-blue-600 dark:text-blue-400'
  },
  emerald: {
    stroke: '#10b981',
    fill: 'rgba(16, 185, 129, 0.08)',
    text: 'text-emerald-600 dark:text-emerald-400'
  },
  rose: {
    stroke: '#f43f5e',
    fill: 'rgba(244, 63, 94, 0.08)',
    text: 'text-rose-600 dark:text-rose-400'
  },
  purple: {
    stroke: '#8b5cf6',
    fill: 'rgba(139, 92, 246, 0.08)',
    text: 'text-purple-600 dark:text-purple-400'
  },
  cyan: {
    stroke: '#0ea5e9',
    fill: 'rgba(14, 165, 233, 0.08)',
    text: 'text-cyan-600 dark:text-cyan-400'
  }
};

export function OverviewMetricCard({
  icon,
  title,
  value,
  suffix,
  delta,
  deltaTone = 'green',
  deltaDirection = 'up',
  deltaSubtext,
  sparklineData = [],
  color = 'blue',
  className = '',
  comparison,
  comparisonAlign
}: OverviewMetricCardProps) {
  const card = (
    <MetricCardBody
      icon={icon}
      title={title}
      value={value}
      suffix={suffix}
      delta={delta}
      deltaTone={deltaTone}
      deltaDirection={deltaDirection}
      deltaSubtext={deltaSubtext}
      sparklineData={sparklineData}
      color={color}
      className={`${className} ${comparison ? 'h-full cursor-default group-focus-visible/compare:ring-2 group-focus-visible/compare:ring-blue-500' : ''}`}
    />
  );
  return comparison ? (
    <ComparisonHoverCard title={title} icon={icon} comparison={comparison} align={comparisonAlign}>
      {card}
    </ComparisonHoverCard>
  ) : (
    card
  );
}

function MetricCardBody({
  icon,
  title,
  value,
  suffix,
  delta,
  deltaTone = 'green',
  deltaDirection = 'up',
  deltaSubtext,
  sparklineData = [],
  color = 'blue',
  className = ''
}: Omit<OverviewMetricCardProps, 'comparison' | 'comparisonAlign'>) {
  const theme = COLOR_MAP[color];
  const deltaColor =
    deltaTone === 'green'
      ? 'text-emerald-600 dark:text-emerald-400'
      : deltaTone === 'red'
      ? 'text-rose-600 dark:text-rose-400'
      : deltaTone === 'blue'
      ? 'text-blue-600 dark:text-blue-400'
      : 'text-neutral-500 dark:text-slate-400';

  const { linePath, areaPath } = generateSparklinePath(sparklineData, 200, 38);

  return (
    <div
      className={`group relative flex flex-col justify-between overflow-hidden rounded-xl border border-neutral-200 bg-white p-4 shadow-xs transition hover:border-neutral-300 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700 sm:p-5 ${className}`}
    >
      <div>
        {/* Card Header: Clean Icon (no background fill) + Title */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {icon ? (
              <span className="text-neutral-400 dark:text-slate-500 transition-colors group-hover:text-neutral-600 dark:group-hover:text-slate-300">
                {icon}
              </span>
            ) : null}
            <span className="text-xs font-semibold text-neutral-600 dark:text-slate-400 truncate">
              {title}
            </span>
          </div>
        </div>

        {/* Primary Value */}
        <div className="mt-2.5 flex items-baseline gap-1 text-2xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-3xl">
          <span>{typeof value === 'number' ? value.toLocaleString() : value}</span>
          {suffix ? (
            <span className="text-xs font-normal text-neutral-400 dark:text-slate-500">{suffix}</span>
          ) : null}
        </div>

        {/* Delta change info */}
        {delta ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            <span className={`inline-flex items-center gap-0.5 font-bold ${deltaColor}`}>
              {deltaTone !== 'neutral' ? (
                <span className="text-xs leading-none">
                  {deltaDirection === 'down' ? '↘' : '↗'}
                </span>
              ) : null}
              <span>{delta}</span>
            </span>
            {deltaSubtext ? (
              <span className="text-[11px] text-neutral-400 dark:text-slate-500">
                {deltaSubtext}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Sparkline Chart */}
      <div className="mt-4 -mx-1 -mb-1 h-10 w-full overflow-hidden">
        <svg
          viewBox="0 0 200 38"
          preserveAspectRatio="none"
          className="h-full w-full overflow-visible"
        >
          <path d={areaPath} fill={theme.fill} />
          <path
            d={linePath}
            fill="none"
            stroke={theme.stroke}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}

function generateSparklinePath(values: number[], width: number = 200, height: number = 38) {
  const paddingY = 4;
  const bottomY = height - paddingY;

  if (!values || values.length < 2) {
    const flatY = bottomY;
    const linePath = `M 0,${flatY} L ${width},${flatY}`;
    const areaPath = `M 0,${flatY} L ${width},${flatY} L ${width},${height} L 0,${height} Z`;
    return { linePath, areaPath };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  if (range === 0) {
    const flatY = bottomY;
    const linePath = `M 0,${flatY} L ${width},${flatY}`;
    const areaPath = `M 0,${flatY} L ${width},${flatY} L ${width},${height} L 0,${height} Z`;
    return { linePath, areaPath };
  }

  const h = height - paddingY * 2;
  const pts = values.map((val, idx) => ({
    x: (idx / (values.length - 1)) * width,
    y: paddingY + h - ((val - min) / range) * h
  }));

  let linePath = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    linePath += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }

  const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;
  return { linePath, areaPath };
}
