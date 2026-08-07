'use client';

interface DonutItem {
  label: string;
  value: number;
}

interface DonutChartProps {
  items: Array<{ label: string; value: number }>;
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
  emptyLabel?: string;
  className?: string;
}

const PALETTE = ['#3b82f6', '#6366f1', '#22d3ee', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#f87171', '#94a3b8'];

export function DonutChart({
  items,
  size = 168,
  thickness = 24,
  centerLabel,
  centerValue,
  emptyLabel = 'No data yet',
  className
}: DonutChartProps) {
  const points = items.filter((item) => item.value > 0);
  const total = points.reduce((sum, item) => sum + item.value, 0);

  if (total <= 0) {
    return (
      <div className="flex min-h-24 items-center justify-center text-sm text-neutral-400 dark:text-neutral-600">{emptyLabel}</div>
    );
  }

  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const segments = points.map((item, i) => {
    const dash = (item.value / total) * circumference;
    const segment = { label: item.label, value: item.value, dash, offset, color: PALETTE[i % PALETTE.length] };
    offset += dash;
    return segment;
  });

  return (
    <div className={`flex items-center gap-5 ${className ?? ''}`}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Donut chart">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgb(148 163 184 / 0.18)" strokeWidth={thickness} />
          {segments.map((segment, i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={segment.color}
              strokeWidth={thickness}
              strokeDasharray={`${segment.dash} ${circumference - segment.dash}`}
              strokeDashoffset={-segment.offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          ))}
        </svg>
        {centerValue !== undefined ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-semibold text-neutral-900 dark:text-white">{centerValue}</span>
            {centerLabel ? (
              <span className="text-[10px] uppercase tracking-wide text-neutral-400 dark:text-slate-500">{centerLabel}</span>
            ) : null}
          </div>
        ) : null}
      </div>

      <ul className="min-w-0 flex-1 space-y-1.5">
        {segments.slice(0, 7).map((segment, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: segment.color }} />
            <span className="min-w-0 flex-1 truncate text-neutral-600 dark:text-slate-300">{segment.label}</span>
            <span className="font-mono text-xs text-neutral-400 dark:text-slate-400">
              {Math.round((segment.dash / circumference) * 100)}%
            </span>
          </li>
        ))}
        {segments.length > 7 ? <li className="text-xs text-neutral-400 dark:text-slate-500">+{segments.length - 7} more</li> : null}
      </ul>
    </div>
  );
}