interface TrendPoint {
  bucket: string;
  total: number;
}

interface TrendSeries {
  key: string;
  points: TrendPoint[];
}

interface TrendChartProps {
  buckets: string[];
  series: TrendSeries[];
  interval: 'hour' | 'day' | 'week';
}

// Monochrome series styles: solid black/white first, then grays + dash patterns.
const SERIES_STYLES = [
  { stroke: 'stroke-neutral-900 dark:stroke-white', dash: '' },
  { stroke: 'stroke-neutral-400', dash: '6 4' },
  { stroke: 'stroke-neutral-600 dark:stroke-neutral-300', dash: '2 4' },
  { stroke: 'stroke-neutral-500', dash: '10 4' },
  { stroke: 'stroke-neutral-700 dark:stroke-neutral-400', dash: '1 5' },
  { stroke: 'stroke-neutral-300 dark:stroke-neutral-600', dash: '' }
];

const WIDTH = 760;
const HEIGHT = 260;
const PAD = { top: 16, right: 16, bottom: 28, left: 40 };

export function TrendChart({ buckets, series, interval }: TrendChartProps) {
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;

  const maxY = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.total)));
  const stepCount = Math.max(buckets.length - 1, 1);

  const xFor = (index: number) => PAD.left + (index / stepCount) * plotWidth;
  const yFor = (value: number) => PAD.top + plotHeight - (value / maxY) * plotHeight;

  const gridValues = [0, Math.round(maxY / 2), maxY];
  const labelIndexes = pickLabelIndexes(buckets.length);
  const total = series.reduce((sum, s) => sum + s.points.reduce((inner, p) => inner + p.total, 0), 0);

  if (total === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-neutral-300 bg-neutral-50 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/40">
        No events in this window yet.
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-64 w-full min-w-[560px]" role="img" aria-label="Event trend chart">
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
                {value}
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
              .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index)} ${yFor(point.total)}`)
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
        </svg>
      </div>

      {series.length > 1 ? (
        <ul className="mt-3 flex flex-wrap gap-4">
          {series.map((s, seriesIndex) => {
            const style = SERIES_STYLES[seriesIndex % SERIES_STYLES.length];
            return (
              <li key={s.key} className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
                <svg width="20" height="8" aria-hidden>
                  <line x1="0" y1="4" x2="20" y2="4" className={style.stroke} strokeWidth={2} strokeDasharray={style.dash || undefined} />
                </svg>
                {s.key}
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

function formatBucket(bucket: string, interval: 'hour' | 'day' | 'week'): string {
  const date = new Date(bucket);
  if (Number.isNaN(date.getTime())) {
    return bucket;
  }
  if (interval === 'hour') {
    return new Intl.DateTimeFormat('en', { hour: 'numeric', timeZone: 'UTC' }).format(date);
  }
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
}
