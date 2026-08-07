'use client';

import { useId } from 'react';

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

  if (items.length === 0) {
    return <div className="text-sm text-neutral-400 dark:text-neutral-600">{emptyLabel}</div>;
  }

  const width = 560;
  const padTop = showValues ? 24 : 10;
  const padBottom = 30;
  const chartH = height - padTop - padBottom;
  const maxValue = Math.max(1, ...items.map((item) => item.value));
  const slot = width / items.length;
  const barW = Math.min(slot * 0.62, 26);
  const color = toneColor[tone];
  const gradId = `barchart-${uid}-${tone}`;
  const labelEvery = items.length > 12 ? 2 : 1;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} role="img" aria-label="Bar chart">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.95" />
          <stop offset="100%" stopColor={color} stopOpacity="0.5" />
        </linearGradient>
      </defs>

      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const y = padTop + chartH * f;
        return <line key={f} x1="0" x2={width} y1={y} y2={y} stroke="rgb(148 163 184 / 0.14)" strokeWidth="1" />;
      })}

      {items.map((item, i) => {
        const barH = (item.value / maxValue) * chartH;
        const x = i * slot + (slot - barW) / 2;
        const y = padTop + chartH - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={Math.max(barH, 1)} rx={3} fill={`url(#${gradId})`} />
            {showValues ? (
              <text x={x + barW / 2} y={y - 5} textAnchor="middle" fontSize="10" fill="rgb(148 163 184)">
                {formatCompact(item.value)}
              </text>
            ) : null}
            {i % labelEvery === 0 ? (
              <text x={x + barW / 2} y={height - 8} textAnchor="middle" fontSize="9" fill="rgb(148 163 184)">
                {item.label}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}