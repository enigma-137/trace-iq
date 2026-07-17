interface SparklineProps {
  points: Array<{ total: number }>;
  width?: number;
  height?: number;
}

export function Sparkline({ points, width = 220, height = 44 }: SparklineProps) {
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

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-11 w-full" role="img" aria-label="Events over the last 14 days">
      <path
        d={path}
        fill="none"
        className="stroke-neutral-900 dark:stroke-white"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
