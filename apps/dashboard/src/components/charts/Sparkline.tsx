interface SparklineProps {
  points: Array<{ total: number }>;
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
  if (points.length === 0) {
    return <div className="h-11 text-xs text-neutral-400 dark:text-neutral-600">No recent data</div>;
  }

  const maxY = Math.max(1, ...points.map((p) => p.total));
  const stepCount = Math.max(points.length - 1, 1);
  const xFor = (index: number) => (index / stepCount) * width;
  const yFor = (value: number) => height - (value / maxY) * (height - 4) - 2;

  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index).toFixed(1)} ${yFor(point.total).toFixed(1)}`)
    .join(' ');
  const areaPath = `${path} L ${width} ${height} L 0 ${height} Z`;
  const gradientId = `sparkline-${tone}-${width}-${height}`;
  const toneClass = toneClasses[tone];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} role="img" aria-label="Events over the last 14 days">
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
        className={`drop-shadow-[0_0_10px_rgba(59,130,246,0.45)] ${toneClass.stroke}`}
        strokeWidth={filled ? 2.4 : 2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

