'use client';

import { useRef, useState } from 'react';

interface MiniBarsProps {
  values: number[];
  width?: number;
  height?: number;
  tone?: 'blue' | 'green' | 'red';
}

const barClasses = {
  blue: 'fill-blue-500/75 dark:fill-blue-400/70',
  green: 'fill-emerald-400/75',
  red: 'fill-red-400/75'
};

const hoverBarClasses = {
  blue: 'fill-blue-400 dark:fill-blue-300',
  green: 'fill-emerald-300',
  red: 'fill-red-300'
};

export function MiniBars({ values, width = 120, height = 28, tone = 'blue' }: MiniBarsProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (values.length === 0) {
    return <div style={{ width, height }} />;
  }

  const max = Math.max(1, ...values);
  const gap = 1;
  const barWidth = (width - gap * (values.length - 1)) / values.length;

  function updateHover(clientX: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const xInSvg = ((clientX - rect.left) / rect.width) * width;
    let index = Math.floor(xInSvg / (barWidth + gap));
    index = Math.max(0, Math.min(values.length - 1, index));
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
    <div className="relative inline-block" style={{ width, height }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        style={{ width, height }}
        className="touch-none select-none overflow-visible"
        role="img"
        aria-label="Volume over time"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => setHoverIndex(null)}
      >
        {values.map((value, index) => {
          const isHovered = hoverIndex === index;
          const h = Math.max((value / max) * height, value > 0 ? 1.5 : 0);
          const opacity = hoverIndex !== null && !isHovered ? 0.4 : 1;
          return (
            <rect
              key={index}
              x={index * (barWidth + gap)}
              y={height - h}
              width={barWidth}
              height={h}
              rx={0.5}
              opacity={opacity}
              className={`transition-colors duration-100 ${isHovered ? hoverBarClasses[tone] : barClasses[tone]}`}
            />
          );
        })}
      </svg>

      {hoverIndex !== null && values[hoverIndex] !== undefined ? (
        <div className="pointer-events-none absolute -top-6 left-1/2 z-10 -translate-x-1/2 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white shadow dark:bg-slate-800 dark:text-slate-100">
          {values[hoverIndex].toLocaleString()}
        </div>
      ) : null}
    </div>
  );
}
