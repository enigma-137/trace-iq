'use client';

import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import Layers01Icon from '@hugeicons/core-free-icons/Layers01Icon';

interface BreakdownItem {
  label: string;
  count: number;
  color: string;
}

interface VolumeDistributionTileProps {
  title?: string;
  totalLabel?: string;
  items: BreakdownItem[];
  emptyLabel?: string;
}

function formatCompact(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toLocaleString();
}

export function VolumeDistributionTile({
  title = 'Volume Breakdown',
  totalLabel = 'total events',
  items,
  emptyLabel = 'No distribution data'
}: VolumeDistributionTileProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const total = items.reduce((sum, item) => sum + item.count, 0);

  if (total <= 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-neutral-400 dark:text-slate-500">
        {emptyLabel}
      </div>
    );
  }

  const size = 130;
  const thickness = 18;
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const segments = items.map((item) => {
    const dash = (item.count / total) * circumference;
    const pct = Math.round((item.count / total) * 100);
    const seg = { ...item, dash, offset, pct };
    offset += dash;
    return seg;
  });

  const activeSegment = hoveredIndex !== null ? segments[hoveredIndex] : null;

  return (
    <div className="relative overflow-hidden rounded-md border border-neutral-200 bg-white p-5 shadow-sm transition-all hover:border-neutral-300 dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:hover:border-slate-700/80">
      {/* Title Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Layers01Icon} size={16} className="text-neutral-400 dark:text-slate-500" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
            {title}
          </p>
        </div>
        <span className="font-mono text-xs font-semibold text-neutral-500 dark:text-slate-400">
          {formatCompact(total)}
        </span>
      </div>

      {/* Main Grid: Circular Arc Gauge on left + Horizontal Progress Bars on right */}
      <div className="mt-4 flex flex-col sm:flex-row items-center gap-6">
        {/* Circular Donut Arc */}
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            role="img"
            aria-label="Volume distribution arc"
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgb(148 163 184 / 0.18)" strokeWidth={thickness} />
            {segments.map((segment, i) => {
              const isHovered = hoveredIndex === i;
              const opacity = hoveredIndex !== null && !isHovered ? 0.35 : 1;
              const strokeW = isHovered ? thickness + 4 : thickness;

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

          {/* Center Readout */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-2 text-center">
            {activeSegment ? (
              <>
                <span className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white tabular-nums">
                  {activeSegment.pct}%
                </span>
                <span className="max-w-[90px] truncate text-[10px] font-semibold text-neutral-500 dark:text-slate-400">
                  {activeSegment.label}
                </span>
              </>
            ) : (
              <>
                <span className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white tabular-nums">
                  {formatCompact(total)}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-neutral-400 dark:text-slate-500">
                  {totalLabel}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right Side Progress Bars Breakdown */}
        <div className="w-full min-w-0 flex-1 space-y-3">
          {segments.slice(0, 4).map((segment, i) => {
            const isHovered = hoveredIndex === i;
            return (
              <div
                key={i}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                className={`cursor-pointer rounded-md p-1.5 transition-colors ${
                  isHovered ? 'bg-neutral-100 dark:bg-slate-800/80' : 'hover:bg-neutral-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: segment.color }} />
                    <span className="truncate font-medium text-neutral-800 dark:text-slate-200">{segment.label}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
                    <span className="text-neutral-500 dark:text-slate-400">{formatCompact(segment.count)}</span>
                    <span className="font-semibold text-neutral-900 dark:text-white">{segment.pct}%</span>
                  </div>
                </div>

                <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${segment.pct}%`, backgroundColor: segment.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
