'use client';

import { useId, useRef, useState } from 'react';

export interface PerformanceSeries {
  key: string;
  color: string; // e.g. '#3b82f6'
  strokeClass: string;
  isDashed?: boolean;
  values: number[];
}

interface MultiSeriesPerformanceChartProps {
  buckets: string[];
  series: PerformanceSeries[];
  height?: number;
  className?: string;
  emptyLabel?: string;
}

const WIDTH = 680;

export function MultiSeriesPerformanceChart({
  buckets,
  series,
  height = 240,
  className = 'w-full',
  emptyLabel = 'No performance telemetry data'
}: MultiSeriesPerformanceChartProps) {
  const uid = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (buckets.length === 0 || series.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-neutral-400 dark:text-slate-500">
        {emptyLabel}
      </div>
    );
  }

  const padTop = 20;
  const padBottom = 28;
  const padLeft = 40;
  const padRight = 16;
  const plotWidth = WIDTH - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const allValues = series.flatMap((s) => s.values);
  const maxVal = Math.max(1, ...allValues);
  const stepCount = Math.max(buckets.length - 1, 1);

  const xFor = (index: number) => padLeft + (index / stepCount) * plotWidth;
  const yFor = (val: number) => padTop + plotHeight - (val / maxVal) * plotHeight;

  function updateHover(clientX: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const xInSvg = ((clientX - rect.left) / rect.width) * WIDTH;
    let index = Math.round(((xInSvg - padLeft) / plotWidth) * stepCount);
    index = Math.max(0, Math.min(buckets.length - 1, index));
    setHoverIndex(index);
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    updateHover(e.clientX);
  }

  function handleTouchMove(e: React.TouchEvent<SVGSVGElement>) {
    if (e.touches[0]) {
      updateHover(e.touches[0].clientX);
    }
  }

  const gridSteps = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="relative w-full">
      {/* Legend header */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
          Telemetry Velocity
        </p>
        <div className="flex items-center gap-4 text-xs font-medium">
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span
                className={`size-2 rounded-full ${s.isDashed ? 'border border-dashed' : ''}`}
                style={{ backgroundColor: s.color }}
              />
              <span className="text-neutral-600 dark:text-slate-300">{s.key}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${height}`}
          className={`${className} min-w-[500px] touch-none select-none`}
          role="img"
          aria-label="Multi-series performance chart"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIndex(null)}
          onTouchMove={handleTouchMove}
          onTouchEnd={() => setHoverIndex(null)}
        >
          <defs>
            {series.map((s, index) => (
              <linearGradient key={s.key} id={`perf-grad-${uid}-${index}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.25" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0.0" />
              </linearGradient>
            ))}
          </defs>

          {/* Grid lines & Y-axis labels (0%, 25%, 50%, 75%, 100%) */}
          {gridSteps.map((fraction) => {
            const y = padTop + plotHeight * (1 - fraction);
            const labelPct = `${Math.round(fraction * 100)}%`;
            return (
              <g key={fraction}>
                <line
                  x1={padLeft}
                  x2={WIDTH - padRight}
                  y1={y}
                  y2={y}
                  stroke="rgb(148 163 184 / 0.14)"
                  strokeWidth="1"
                  strokeDasharray={fraction === 0 ? undefined : '3 3'}
                />
                <text
                  x={padLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="9"
                  fill="rgb(148 163 184)"
                  className="font-mono"
                >
                  {labelPct}
                </text>
              </g>
            );
          })}

          {/* X-axis labels */}
          {buckets.map((b, i) => {
            if (i % Math.ceil(buckets.length / 6) !== 0 && i !== buckets.length - 1) return null;
            return (
              <text
                key={i}
                x={xFor(i)}
                y={height - 8}
                textAnchor="middle"
                fontSize="9"
                fill="rgb(148 163 184)"
              >
                {b}
              </text>
            );
          })}

          {/* Render Area & Lines */}
          {series.map((s, index) => {
            const points = s.values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(v).toFixed(1)}`).join(' ');
            const areaPath = `${points} L ${xFor(s.values.length - 1).toFixed(1)} ${padTop + plotHeight} L ${padLeft} ${padTop + plotHeight} Z`;

            return (
              <g key={s.key}>
                {index === 0 ? <path d={areaPath} fill={`url(#${`perf-grad-${uid}-${index}`})`} /> : null}
                <path
                  d={points}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeDasharray={s.isDashed ? '4 4' : undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          })}

          {/* Interactive Hover Crosshairs & Points */}
          {hoverIndex !== null ? (() => {
            const cx = xFor(hoverIndex);
            return (
              <g className="pointer-events-none">
                <line
                  x1={cx}
                  x2={cx}
                  y1={padTop}
                  y2={padTop + plotHeight}
                  stroke="rgb(148 163 184 / 0.5)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                {series.map((s) => {
                  const cy = yFor(s.values[hoverIndex] ?? 0);
                  return (
                    <circle
                      key={s.key}
                      cx={cx}
                      cy={cy}
                      r={4}
                      fill={s.color}
                      stroke="#ffffff"
                      strokeWidth={1.5}
                    />
                  );
                })}
              </g>
            );
          })() : null}
        </svg>
      </div>

      {/* Floating Multi-value Tooltip Box */}
      {hoverIndex !== null && buckets[hoverIndex] ? (() => {
        return (
          <div className="pointer-events-none absolute top-10 right-4 z-10 rounded-md border border-neutral-200 bg-slate-900/95 p-2.5 shadow-xl backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
            <p className="text-[10px] font-semibold text-slate-400">{buckets[hoverIndex]}</p>
            <div className="mt-1.5 space-y-1">
              {series.map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-slate-300">{s.key}:</span>
                  </div>
                  <span className="font-mono font-bold text-white tabular-nums">
                    {(s.values[hoverIndex] ?? 0).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })() : null}
    </div>
  );
}
