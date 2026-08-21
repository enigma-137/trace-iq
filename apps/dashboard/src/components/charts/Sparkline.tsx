'use client';

import { useId, useRef, useState } from 'react';

interface SparklineProps {
  points: Array<{ total: number; bucket?: string }>;
  width?: number;
  height?: number;
  tone?: 'blue' | 'green' | 'red';
  filled?: boolean;
  className?: string;
}

const toneClasses = {
  blue: {
    stroke: 'stroke-blue-500',
    fill: 'rgb(59 130 246)'
  },
  green: {
    stroke: 'stroke-emerald-400',
    fill: 'rgb(52 211 153)'
  },
  red: {
    stroke: 'stroke-red-400',
    fill: 'rgb(248 113 113)'
  }
};

export function Sparkline({
  points,
  width = 220,
  height = 44,
  tone = 'blue',
  filled = false,
  className = 'h-11 w-full'
}: SparklineProps) {
  const uid = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (points.length === 0) {
    return <div className="h-11 text-xs text-neutral-400 dark:text-neutral-600">No recent data</div>;
  }

  const maxY = Math.max(1, ...points.map((p) => p.total));
  const stepCount = Math.max(points.length - 1, 1);
  const xFor = (index: number) => (index / stepCount) * width;
  const yFor = (value: number) => height - (value / maxY) * (height - 8) - 4;

  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index).toFixed(1)} ${yFor(point.total).toFixed(1)}`)
    .join(' ');
  const areaPath = `${path} L ${width} ${height} L 0 ${height} Z`;
  const gradientId = `sparkline-${tone}-${uid}`;
  const toneClass = toneClasses[tone];

  function updateHover(clientX: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const xInSvg = ((clientX - rect.left) / rect.width) * width;
    let index = Math.round((xInSvg / width) * stepCount);
    index = Math.max(0, Math.min(points.length - 1, index));
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

  return (
    <div className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className={`${className} touch-none select-none overflow-visible`}
        role="img"
        aria-label="Events trend"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => setHoverIndex(null)}
      >
        {filled ? (
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={toneClass.fill} stopOpacity="0.38" />
              <stop offset="78%" stopColor={toneClass.fill} stopOpacity="0.04" />
              <stop offset="100%" stopColor={toneClass.fill} stopOpacity="0" />
            </linearGradient>
          </defs>
        ) : null}
        {filled ? <path d={areaPath} fill={`url(#${gradientId})`} /> : null}
        <path
          d={path}
          fill="none"
          className={toneClass.stroke}
          strokeWidth={filled ? 2.4 : 2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Hover Crosshair line and glowing dot */}
        {hoverIndex !== null && points[hoverIndex] ? (() => {
          const hovered = points[hoverIndex];
          const cx = xFor(hoverIndex);
          const cy = yFor(hovered.total);
          return (
            <g className="pointer-events-none">
              <line
                x1={cx}
                x2={cx}
                y1={0}
                y2={height}
                stroke="rgb(148 163 184 / 0.5)"
                strokeWidth={1}
                strokeDasharray="2 2"
              />
              <circle cx={cx} cy={cy} r={4.5} fill={toneClass.fill} stroke="#ffffff" strokeWidth={1.5} />
            </g>
          );
        })() : null}
      </svg>

      {/* Floating value pill when hovered */}
      {hoverIndex !== null && points[hoverIndex] ? (() => {
        const hovered = points[hoverIndex];
        return (
          <div className="pointer-events-none absolute -top-6 right-0 z-10 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white shadow dark:bg-slate-800 dark:text-slate-100">
            {hovered.total.toLocaleString()}
          </div>
        );
      })() : null}
    </div>
  );
}
