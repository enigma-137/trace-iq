'use client';

import { useState } from 'react';

interface DonutChartProps {
  items: Array<{ label: string; value: number; color?: string }>;
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
  emptyLabel?: string;
  className?: string;
}

const PALETTE = ['#3b82f6', '#6366f1', '#22d3ee', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#f87171', '#94a3b8'];

function formatCompact(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toLocaleString();
}

export function DonutChart({
  items,
  size = 168,
  thickness = 24,
  centerLabel,
  centerValue,
  emptyLabel = 'No data yet',
  className
}: DonutChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const points = items.filter((item) => item.value > 0);
  const total = points.reduce((sum, item) => sum + item.value, 0);

  if (total <= 0) {
    return (
      <div className="flex min-h-24 items-center justify-center text-sm text-neutral-400 dark:text-neutral-600">{emptyLabel}</div>
    );
  }

  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  const segments = points.map((item, i) => {
    const dash = (item.value / total) * circumference;
    const pct = Math.round((item.value / total) * 100);
    const segment = {
      label: item.label,
      value: item.value,
      dash,
      offset,
      pct,
      color: item.color ?? PALETTE[i % PALETTE.length]
    };
    offset += dash;
    return segment;
  });

  const activeSegment = hoveredIndex !== null ? segments[hoveredIndex] : null;

  return (
    <div className={`flex flex-col sm:flex-row items-center sm:items-center gap-4 sm:gap-6 ${className ?? ''}`}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label="Donut chart"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgb(148 163 184 / 0.18)" strokeWidth={thickness} />
          {segments.map((segment, i) => {
            const isHovered = hoveredIndex === i;
            const strokeW = isHovered ? thickness + 4 : thickness;
            const opacity = hoveredIndex !== null && !isHovered ? 0.35 : 1;

            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={segment.color}
                strokeWidth={strokeW}
                strokeDasharray={`${segment.dash} ${circumference - segment.dash}`}
                strokeDashoffset={-segment.offset}
                transform={`rotate(-90 ${cx} ${cy})`}
                opacity={opacity}
                className="cursor-pointer transition-all duration-200"
                onMouseEnter={() => setHoveredIndex(i)}
              />
            );
          })}
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-2 text-center">
          {activeSegment ? (
            <>
              <span className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
                {formatCompact(activeSegment.value)}
              </span>
              <span className="max-w-[120px] truncate text-[11px] font-semibold text-neutral-600 dark:text-slate-300" title={activeSegment.label}>
                {activeSegment.label} ({activeSegment.pct}%)
              </span>
            </>
          ) : centerValue !== undefined ? (
            <>
              <span className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">{centerValue}</span>
              {centerLabel ? (
                <span className="text-[10px] uppercase tracking-wide text-neutral-400 dark:text-slate-500">{centerLabel}</span>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <ul className="w-full min-w-0 flex-1 space-y-1.5">
        {segments.slice(0, 7).map((segment, i) => {
          const isHovered = hoveredIndex === i;
          return (
            <li
              key={i}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm transition-colors ${
                isHovered
                  ? 'bg-neutral-100 dark:bg-slate-800/90 font-medium'
                  : 'hover:bg-neutral-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <span
                className={`size-2.5 shrink-0 rounded-sm transition-transform ${isHovered ? 'scale-125' : ''}`}
                style={{ background: segment.color }}
              />
              <span
                className={`min-w-0 flex-1 truncate ${
                  isHovered ? 'text-neutral-900 dark:text-white font-semibold' : 'text-neutral-600 dark:text-slate-300'
                }`}
              >
                {segment.label}
              </span>
              <span className="font-mono text-xs text-neutral-400 dark:text-slate-400">
                {segment.pct}%
              </span>
            </li>
          );
        })}
        {segments.length > 7 ? (
          <li className="px-2 text-xs text-neutral-400 dark:text-slate-500">+{segments.length - 7} more</li>
        ) : null}
      </ul>
    </div>
  );
}