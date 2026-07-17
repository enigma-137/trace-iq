interface MiniBarsProps {
  values: number[];
  width?: number;
  height?: number;
}

export function MiniBars({ values, width = 120, height = 28 }: MiniBarsProps) {
  if (values.length === 0) {
    return <div style={{ width, height }} />;
  }

  const max = Math.max(1, ...values);
  const gap = 1;
  const barWidth = (width - gap * (values.length - 1)) / values.length;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width, height }} role="img" aria-label="Volume over time">
      {values.map((value, index) => {
        const h = Math.max((value / max) * height, value > 0 ? 1.5 : 0);
        return (
          <rect
            key={index}
            x={index * (barWidth + gap)}
            y={height - h}
            width={barWidth}
            height={h}
            rx={0.5}
            className="fill-neutral-400 dark:fill-neutral-500"
          />
        );
      })}
    </svg>
  );
}
