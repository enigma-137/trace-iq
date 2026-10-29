'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { ChartPointCard, pointChange, useChartPointer } from './ChartPointCard';

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

const SERIES_STYLES = [
  { stroke: 'stroke-blue-400', fill: 'fill-blue-400', color: 'rgb(96 165 250)', dash: '' },
  { stroke: 'stroke-emerald-400', fill: 'fill-emerald-400', color: 'rgb(52 211 153)', dash: '' },
  { stroke: 'stroke-red-400', fill: 'fill-red-400', color: 'rgb(248 113 113)', dash: '' },
  { stroke: 'stroke-amber-400', fill: 'fill-amber-400', color: 'rgb(251 191 36)', dash: '' },
  { stroke: 'stroke-cyan-400', fill: 'fill-cyan-400', color: 'rgb(34 211 238)', dash: '' },
  { stroke: 'stroke-neutral-400', fill: 'fill-neutral-400', color: 'rgb(163 163 163)', dash: '4 4' }
];

const WIDTH = 760;
const HEIGHT = 260;
const PAD = { top: 16, right: 16, bottom: 28, left: 48 };

const compactFmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export function TrendChart({ buckets, series, interval, format = 'number', legendTotals = false }: TrendChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pointer = useChartPointer(buckets.length);
  const hover = pointer.active;
  const [anchor, setAnchor] = useState<{ x: number; width: number } | null>(null);

  const fmt = (value: number) =>
    format === 'compact' ? compactFmt.format(value) : Math.round(value).toLocaleString('en-US');

  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;

  const maxY = Math.max(1, ...series.flatMap((s) => s.points.map((p) => Number(p.value ?? p.total ?? 0))));
  const stepCount = Math.max(buckets.length - 1, 1);

  const xFor = (index: number) => PAD.left + (index / stepCount) * plotWidth;
  const yFor = (value: number) => PAD.top + plotHeight - (value / maxY) * plotHeight;

  // Where the active point sits on screen, relative to the chart wrapper. The SVG
  // keeps its aspect ratio (and may scroll), so map through its screen transform.
  useLayoutEffect(() => {
    const svg = svgRef.current;
    const wrapper = pointer.containerRef.current;
    const matrix = svg?.getScreenCTM();
    if (hover === null || !svg || !wrapper || !matrix) {
      setAnchor(null);
      return;
    }
    const point = new DOMPoint(PAD.left + (hover / Math.max(buckets.length - 1, 1)) * (WIDTH - PAD.left - PAD.right), PAD.top).matrixTransform(matrix);
    const rect = wrapper.getBoundingClientRect();
    setAnchor({ x: point.x - rect.left, width: rect.width });
  }, [hover, buckets.length, pointer.containerRef]);

  const gridValues = [0, maxY / 2, maxY];
  const labelIndexes = pickLabelIndexes(buckets.length);
  const total = series.reduce((sum, s) => sum + s.points.reduce((inner, p) => inner + Number(p.value ?? p.total ?? 0), 0), 0);

  if (total === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-neutral-300 bg-neutral-50 text-sm text-neutral-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-500">
        No data in this window yet.
      </div>
    );
  }

  function indexAt(event: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const xInSvg = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()).x;
    const index = Math.round(((xInSvg - PAD.left) / plotWidth) * stepCount);
    return Math.max(0, Math.min(buckets.length - 1, index));
  }

  const value = (point: TrendPoint | undefined) => Number(point?.value ?? point?.total ?? 0);

  return (
    <div
      ref={pointer.containerRef}
      className="relative w-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      tabIndex={0}
      role="group"
      aria-label="Trend chart. Use the arrow keys to move between points and Enter to pin one."
      onKeyDown={pointer.onKeyDown}
      onBlur={pointer.onBlur}
    >
      <div className="overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-64 w-full min-w-[560px] cursor-crosshair"
          role="img"
          aria-label="Event trend chart"
          onMouseMove={(event) => pointer.setHover(indexAt(event))}
          onMouseLeave={() => pointer.setHover(null)}
          onClick={(event) => pointer.togglePin(indexAt(event))}
        >
          <defs>
            {series.map((s, seriesIndex) => {
              const style = SERIES_STYLES[seriesIndex % SERIES_STYLES.length];
              return (
                <linearGradient key={s.key} id={`trend-fill-${seriesIndex}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={style.color} stopOpacity="0.34" />
                  <stop offset="74%" stopColor={style.color} stopOpacity="0.06" />
                  <stop offset="100%" stopColor={style.color} stopOpacity="0" />
                </linearGradient>
              );
            })}
          </defs>

          {gridValues.map((value) => (
            <g key={value}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={yFor(value)}
                y2={yFor(value)}
                className="stroke-neutral-200 dark:stroke-slate-800"
                strokeWidth={1}
              />
              <text x={PAD.left - 8} y={yFor(value) + 4} textAnchor="end" className="fill-neutral-400 text-[10px] dark:fill-slate-500">
                {fmt(value)}
              </text>
            </g>
          ))}

          {labelIndexes.map((index) => (
            <text key={index} x={xFor(index)} y={HEIGHT - 8} textAnchor="middle" className="fill-neutral-400 text-[10px] dark:fill-slate-500">
              {formatBucket(buckets[index], interval)}
            </text>
          ))}

          {series.map((s, seriesIndex) => {
            const style = SERIES_STYLES[seriesIndex % SERIES_STYLES.length];
            const path = s.points
              .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index)} ${yFor(Number(point.value ?? point.total ?? 0))}`)
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
                className="stroke-neutral-400 dark:stroke-slate-500"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              {series.map((s, seriesIndex) => {
                const style = SERIES_STYLES[seriesIndex % SERIES_STYLES.length];
                return (
                  <circle
                    key={s.key}
                    cx={xFor(hover)}
                    cy={yFor(Number(s.points[hover].value ?? s.points[hover].total ?? 0))}
                    r={3.5}
                    className={`${style.fill} stroke-white dark:stroke-slate-950`}
                    strokeWidth={1.5}
                  />
                );
              })}

            </g>
          ) : null}
        </svg>
      </div>

      {hover !== null && anchor ? (
        <ChartPointCard
          title={formatBucket(buckets[hover], interval, true)}
          rows={series.map((s, seriesIndex) => ({
            label: s.key,
            color: SERIES_STYLES[seriesIndex % SERIES_STYLES.length].color,
            value: fmt(value(s.points[hover])),
            change: pointChange(value(s.points[hover]), hover > 0 ? value(s.points[hover - 1]) : undefined)
          }))}
          pinned={pointer.pinned !== null}
          onClose={pointer.unpin}
          anchorX={anchor.x}
          containerWidth={anchor.width}
        />
      ) : null}

      {series.length > 1 || legendTotals ? (
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
          {series.map((s, seriesIndex) => {
            const style = SERIES_STYLES[seriesIndex % SERIES_STYLES.length];
            const seriesTotal = s.points.reduce((sum, p) => sum + Number(p.value ?? p.total ?? 0), 0);
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

