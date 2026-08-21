'use client';

import { useId, useRef, useState } from 'react';

interface BarChartItem {
  label: string;
  value: number;
}

interface BarChartProps {
  items: Array<{ label: string; value: number }>;
  height?: number;
  tone?: 'blue' | 'green' | 'amber' | 'red';
  showValues?: boolean;
  className?: string;
  emptyLabel?: string;
}

const toneColor = {
  blue: 'rgb(59 130 246)',
  green: 'rgb(52 211 153)',
  amber: 'rgb(251 191 36)',
  red: 'rgb(248 113 113)'
};

const toneHighlight = {
  blue: 'rgb(147 197 253)',
  green: 'rgb(167 243 208)',
  amber: 'rgb(253 230 138)',
  red: 'rgb(254 202 202)'
};

function formatCompact(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

export function BarChart({
  items,
  height = 200,
  tone = 'blue',
  showValues = false,
  className = 'w-full',
  emptyLabel = 'No data yet'
}: BarChartProps) {
  const uid = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (items.length === 0) {
    return <div className="flex h-44 items-center justify-center text-sm text-neutral-400 dark:text-neutral-600">{emptyLabel}</div>;
  }

  const width = 560;
  const padTop = showValues ? 24 : 14;
  const padBottom = 30;
  const chartH = height - padTop - padBottom;
  const maxValue = Math.max(1, ...items.map((item) => item.value));
  const slot = width / items.length;
  const barW = Math.min(slot * 0.65, 26);
  const color = toneColor[tone];
  const highlightColor = toneHighlight[tone];
  const gradId = `barchart-${uid}-${tone}`;
  const gradHoverId = `barchart-hover-${uid}-${tone}`;
  const labelEvery = items.length > 14 ? 2 : 1;

  function updateHover(clientX: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const xInSvg = ((clientX - rect.left) / rect.width) * width;
    let index = Math.floor(xInSvg / slot);
    index = Math.max(0, Math.min(items.length - 1, index));
    setHoveredIndex(index);
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
        className={`${className} touch-none select-none`}
        role="img"
        aria-label="Bar chart"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredIndex(null)}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => setHoveredIndex(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.9" />
            <stop offset="100%" stopColor={color} stopOpacity="0.45" />
          </linearGradient>
          <linearGradient id={gradHoverId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={highlightColor} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.8" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = padTop + chartH * f;
          return <line key={f} x1="0" x2={width} y1={y} y2={y} stroke="rgb(148 163 184 / 0.14)" strokeWidth="1" strokeDasharray="3 3" />;
        })}

        {/* Columns and bars */}
        {items.map((item, i) => {
          const isHovered = hoveredIndex === i;
          const barH = (item.value / maxValue) * chartH;
          const x = i * slot + (slot - barW) / 2;
          const y = padTop + chartH - barH;
          const opacity = hoveredIndex !== null && !isHovered ? 0.45 : 1;

          return (
            <g key={i} className="transition-opacity duration-150" style={{ opacity }}>
              {/* Column hover target highlight */}
              {isHovered ? (
                <rect
                  x={i * slot}
                  y={padTop}
                  width={slot}
                  height={chartH}
                  fill="rgb(148 163 184 / 0.08)"
                  rx={4}
                />
              ) : null}

              {/* Bar rectangle */}
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(barH, 2)}
                rx={4}
                fill={isHovered ? `url(#${gradHoverId})` : `url(#${gradId})`}
                stroke={isHovered ? color : 'transparent'}
                strokeWidth={isHovered ? 1.5 : 0}
                className="transition-all duration-150"
              />

              {/* Top value static text if enabled */}
              {showValues && !isHovered ? (
                <text x={x + barW / 2} y={y - 5} textAnchor="middle" fontSize="10" fontWeight="500" fill="rgb(148 163 184)">
                  {formatCompact(item.value)}
                </text>
              ) : null}

              {/* X-axis label */}
              {i % labelEvery === 0 ? (
                <text
                  x={x + barW / 2}
                  y={height - 8}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight={isHovered ? '600' : '400'}
                  fill={isHovered ? 'rgb(255 255 255)' : 'rgb(148 163 184)'}
                >
                  {item.label}
                </text>
              ) : null}
            </g>
          );
        })}

        {/* Dynamic Tooltip on Hover */}
        {hoveredIndex !== null && items[hoveredIndex] ? (() => {
          const hoveredItem = items[hoveredIndex];
          const xCenter = hoveredIndex * slot + slot / 2;
          const tipWidth = 110;
          const tipHeight = 42;
          let tipX = xCenter - tipWidth / 2;
          // Keep tooltip inside horizontal margins
          if (tipX < 10) tipX = 10;
          if (tipX + tipWidth > width - 10) tipX = width - 10 - tipWidth;

          const barH = (hoveredItem.value / maxValue) * chartH;
          const barTopY = padTop + chartH - barH;
          let tipY = barTopY - tipHeight - 8;
          if (tipY < 4) tipY = barTopY + 12; // Flip below if too high

          return (
            <g className="pointer-events-none transition-all duration-100">
              <rect
                x={tipX}
                y={tipY}
                width={tipWidth}
                height={tipHeight}
                rx={6}
                className="fill-slate-900/95 stroke-slate-700/80 shadow-xl dark:fill-slate-950/95 dark:stroke-slate-700"
                strokeWidth={1}
              />
              <text x={tipX + tipWidth / 2} y={tipY + 16} textAnchor="middle" fontSize="10" fill="rgb(148 163 184)" fontWeight="500">
                {hoveredItem.label}
              </text>
              <text x={tipX + tipWidth / 2} y={tipY + 32} textAnchor="middle" fontSize="12" fill="#ffffff" fontWeight="700">
                {hoveredItem.value.toLocaleString()}{' '}
                <tspan fontSize="9" fill="rgb(148 163 184)" fontWeight="400">
                  events
                </tspan>
              </text>
            </g>
          );
        })() : null}
      </svg>
    </div>
  );
}