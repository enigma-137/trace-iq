'use client';

import { useRef, useState } from 'react';

interface TrendPoint {
  bucket: string;
  total: number;
  value: number;
}

interface TrendSeries {
  key: string;
  points: TrendPoint[];
}

interface TrendChartProps {
  buckets: string[];
  series: TrendSeries[];
  interval: 'hour' | 'day' | 'week';
  // Serializable formatting hint (this is a client component, so we can't pass a function prop).
  format?: 'number' | 'compact';
  // When true, the legend shows each series' summed total (valid only for count/sum measures).
  legendTotals?: boolean;
}

// Monochrome series styles: solid black/white first, then grays + dash patterns.
const SERIES_STYLES = [
  { stroke: 'stroke-blue-600 dark:stroke-blue-400', fill: 'fill-blue-600 dark:fill-blue-400', dash: '' },
  { stroke: 'stroke-indigo-500 dark:stroke-indigo-400', fill: 'fill-indigo-500 dark:fill-indigo-400', dash: '' },
  { stroke: 'stroke-sky-500 dark:stroke-sky-400', fill: 'fill-sky-500 dark:fill-sky-400', dash: '' },
  { stroke: 'stroke-teal-500 dark:stroke-teal-400', fill: 'fill-teal-500 dark:fill-teal-400', dash: '' },
  { stroke: 'stroke-violet-500 dark:stroke-violet-400', fill: 'fill-violet-500 dark:fill-violet-400', dash: '' },
  { stroke: 'stroke-slate-400 dark:stroke-slate-500', fill: 'fill-slate-400 dark:fill-slate-500', dash: '4 4' }
];

const WIDTH = 760;
const HEIGHT = 260;
const PAD = { top: 16, right: 16, bottom: 28, left: 48 };

const compactFmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export function TrendChart({ buckets, series, interval, format = 'number', legendTotals = false }: TrendChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const fmt = (value: number) =>
    format === 'compact' ? compactFmt.format(value) : Math.round(value).toLocaleString('en-US');

  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;

  const maxY = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.value)));
  const stepCount = Math.max(buckets.length - 1, 1);

  const xFor = (index: number) => PAD.left + (index / stepCount) * plotWidth;
  const yFor = (value: number) => PAD.top + plotHeight - (value / maxY) * plotHeight;

  const gridValues = [0, maxY / 2, maxY];
  const labelIndexes = pickLabelIndexes(buckets.length);
  const total = series.reduce((sum, s) => sum + s.points.reduce((inner, p) => inner + p.value, 0), 0);

  if (total === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-neutral-300 bg-neutral-50 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/40">
        No data in this window yet.
      </div>
    );
  }

  function handleMove(event: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const xInSvg = ((event.clientX - rect.left) / rect.width) * WIDTH;
    let index = Math.round(((xInSvg - PAD.left) / plotWidth) * stepCount);
    index = Math.max(0, Math.min(buckets.length - 1, index));
    setHover(index);
  }

  // Tooltip geometry (kept inside the plot bounds).
  const tipWidth = 148;
  const tipHeight = 22 + series.length * 16;

  return (
    <div className="w-full">
      <div className="overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-64 w-full min-w-[560px]"
          role="img"
          aria-label="Event trend chart"
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
        >
          {gridValues.map((value) => (
            <g key={value}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={yFor(value)}
                y2={yFor(value)}
                className="stroke-neutral-200 dark:stroke-neutral-800"
                strokeWidth={1}
              />
              <text x={PAD.left - 8} y={yFor(value) + 4} textAnchor="end" className="fill-neutral-400 text-[10px] dark:fill-neutral-500">
                {fmt(value)}
              </text>
            </g>
          ))}

          {labelIndexes.map((index) => (
            <text key={index} x={xFor(index)} y={HEIGHT - 8} textAnchor="middle" className="fill-neutral-400 text-[10px] dark:fill-neutral-500">
              {formatBucket(buckets[index], interval)}
            </text>
          ))}

          {series.map((s, seriesIndex) => {
            const style = SERIES_STYLES[seriesIndex % SERIES_STYLES.length];
            const path = s.points
              .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index)} ${yFor(point.value)}`)
              .join(' ');
            return (
              <path
                key={s.key}
                d={path}
                fill="none"
                className={style.stroke}
                strokeWidth={2}
                strokeDasharray={style.dash || undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            );
          })}

          {hover !== null ? (
            <g>
              <line
                x1={xFor(hover)}
                x2={xFor(hover)}
                y1={PAD.top}
                y2={PAD.top + plotHeight}
                className="stroke-neutral-400 dark:stroke-neutral-500"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              {series.map((s, seriesIndex) => {
                const style = SERIES_STYLES[seriesIndex % SERIES_STYLES.length];
                return (
                  <circle
                    key={s.key}
                    cx={xFor(hover)}
                    cy={yFor(s.points[hover].value)}
                    r={3.5}
                    className={`${style.fill} stroke-white dark:stroke-neutral-950`}
                    strokeWidth={1.5}
                  />
                );
              })}

              {(() => {
                const anchorX = xFor(hover);
                const boxX = Math.min(Math.max(anchorX + 10, PAD.left), WIDTH - PAD.right - tipWidth);
                const boxY = PAD.top;
                return (
                  <g>
                    <rect
                      x={boxX}
                      y={boxY}
                      width={tipWidth}
                      height={tipHeight}
                      rx={6}
                      className="fill-white stroke-neutral-200 dark:fill-neutral-900 dark:stroke-neutral-700"
                      strokeWidth={1}
                    />
                    <text x={boxX + 10} y={boxY + 15} className="fill-neutral-500 text-[10px] dark:fill-neutral-400">
                      {formatBucket(buckets[hover], interval, true)}
                    </text>
                    {series.map((s, seriesIndex) => (
                      <text
                        key={s.key}
                        x={boxX + 10}
                        y={boxY + 32 + seriesIndex * 16}
                        className="fill-neutral-900 text-[11px] dark:fill-white"
                      >
                        <tspan className="fill-neutral-500 dark:fill-neutral-400">{truncate(s.key)}: </tspan>
                        {fmt(s.points[hover].value)}
                      </text>
                    ))}
                  </g>
                );
              })()}
            </g>
          ) : null}
        </svg>
      </div>

      {series.length > 1 || legendTotals ? (
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
          {series.map((s, seriesIndex) => {
            const style = SERIES_STYLES[seriesIndex % SERIES_STYLES.length];
            const seriesTotal = s.points.reduce((sum, p) => sum + p.value, 0);
            return (
              <li key={s.key} className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
                <svg width="20" height="8" aria-hidden>
                  <line x1="0" y1="4" x2="20" y2="4" className={style.stroke} strokeWidth={2} strokeDasharray={style.dash || undefined} />
                </svg>
                <span className="font-medium text-neutral-800 dark:text-neutral-200">{s.key}</span>
                {legendTotals ? <span className="text-neutral-400 dark:text-neutral-500">{fmt(seriesTotal)}</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function truncate(value: string, max = 16): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function pickLabelIndexes(count: number): number[] {
  if (count <= 1) return [0];
  const desired = Math.min(count, 6);
  const step = (count - 1) / (desired - 1);
  const indexes = new Set<number>();
  for (let i = 0; i < desired; i += 1) {
    indexes.add(Math.round(i * step));
  }
  return [...indexes];
}

function formatBucket(bucket: string, interval: 'hour' | 'day' | 'week', detailed = false): string {
  const date = new Date(bucket);
  if (Number.isNaN(date.getTime())) {
    return bucket;
  }
  if (interval === 'hour') {
    // Axis stays compact ("3 PM"); tooltip adds the day ("Jul 18, 3 PM").
    return new Intl.DateTimeFormat('en', {
      month: detailed ? 'short' : undefined,
      day: detailed ? 'numeric' : undefined,
      hour: 'numeric',
      timeZone: 'UTC'
    }).format(date);
  }
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: detailed ? 'numeric' : undefined,
    timeZone: 'UTC'
  }).format(date);
}
