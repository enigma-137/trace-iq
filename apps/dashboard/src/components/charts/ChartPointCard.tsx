'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';

export interface PointCardRow {
  label: string;
  /** CSS color of the series swatch. */
  color: string;
  value: string;
  /** Percent change from the previous point; shown on the pinned card. */
  change?: number | null;
  /** True when a rising value is bad (errors, latency). */
  invert?: boolean;
}

export interface PointCardLink {
  label: string;
  href: string;
}

interface ChartPointCardProps {
  title: string;
  rows: PointCardRow[];
  /** Pinned cards take clicks and show changes, links and a close button. */
  pinned: boolean;
  onClose: () => void;
  links?: PointCardLink[];
  /** Horizontal anchor in px from the left of the positioned parent. */
  anchorX: number;
  /** Width of the positioned parent, to flip the card before it overflows. */
  containerWidth: number;
}

/** Floating card for one chart point: a tooltip on hover, a detail card once clicked. */
export function ChartPointCard({ title, rows, pinned, onClose, links = [], anchorX, containerWidth }: ChartPointCardProps) {
  const flip = anchorX > containerWidth * 0.55;
  const style = flip ? { right: Math.max(4, containerWidth - anchorX + 14) } : { left: Math.max(4, anchorX + 14) };

  return (
    <div
      role={pinned ? 'dialog' : 'tooltip'}
      aria-label={pinned ? `Details for ${title}` : undefined}
      className={`absolute top-2 z-20 w-56 max-w-[calc(100%-8px)] rounded-lg border border-neutral-200 bg-white/95 text-xs shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 ${
        pinned ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
      style={style}
    >
      <div className="flex items-center justify-between gap-2 border-b border-neutral-100 px-3 py-2 dark:border-slate-800">
        <p className="font-semibold text-neutral-900 dark:text-white">{title}</p>
        {pinned ? (
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 rounded px-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Close details"
          >
            ×
          </button>
        ) : null}
      </div>
      <ul className="space-y-1.5 px-3 py-2">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full" style={{ background: row.color }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-neutral-500 dark:text-slate-400">{row.label}</span>
            <span className="font-semibold tabular-nums text-neutral-900 dark:text-white">{row.value}</span>
            {pinned && row.change !== undefined ? <ChangeText change={row.change} invert={row.invert} /> : null}
          </li>
        ))}
      </ul>
      {pinned ? (
        <div className="border-t border-neutral-100 px-3 py-2 dark:border-slate-800">
          {rows.some((row) => row.change !== undefined) ? (
            <p className="text-[10px] text-neutral-400 dark:text-slate-500">Change is against the previous point.</p>
          ) : null}
          {links.length > 0 ? (
            <div className="mt-1.5 flex flex-col gap-1">
              {links.map((link) => (
                <Link key={link.href} href={link.href} className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                  {link.label} →
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="border-t border-neutral-100 px-3 py-1.5 text-[10px] text-neutral-400 dark:border-slate-800 dark:text-slate-500">Click to pin</p>
      )}
    </div>
  );
}

function ChangeText({ change, invert }: { change: number | null; invert?: boolean }) {
  if (change === null || !Number.isFinite(change)) {
    return <span className="w-11 text-right tabular-nums text-neutral-400 dark:text-slate-500">–</span>;
  }
  const rounded = Math.round(change);
  const good = rounded === 0 ? null : invert ? rounded < 0 : rounded > 0;
  const tone = good === null ? 'text-neutral-400 dark:text-slate-500' : good ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
  return (
    <span className={`w-11 text-right tabular-nums ${tone}`}>
      {rounded > 0 ? '+' : ''}
      {rounded}%
    </span>
  );
}

/** Percent change between two values; null when there is no base to compare with. */
export function pointChange(current: number, previous: number | undefined): number | null {
  if (previous === undefined || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * Hover, click-to-pin, keyboard and click-outside behavior shared by the charts.
 * `active` is the pinned point when there is one, else the hovered point.
 */
export function useChartPointer(count: number) {
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // A new data set (range change) invalidates indexes.
  useEffect(() => {
    setHover(null);
    setPinned(null);
  }, [count]);

  useEffect(() => {
    if (pinned === null) return;
    const onDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setPinned(null);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setPinned(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [pinned]);

  const togglePin = useCallback((index: number | null) => {
    if (index === null) return;
    setPinned((current) => (current === index ? null : index));
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (count === 0) return;
      const current = pinned ?? hover;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        const step = event.key === 'ArrowRight' ? 1 : -1;
        const next = current === null ? (step > 0 ? 0 : count - 1) : Math.max(0, Math.min(count - 1, current + step));
        if (pinned !== null) setPinned(next);
        else setHover(next);
      } else if ((event.key === 'Enter' || event.key === ' ') && current !== null) {
        event.preventDefault();
        togglePin(current);
      }
    },
    [count, hover, pinned, togglePin]
  );

  return {
    containerRef,
    hover,
    pinned,
    active: pinned ?? hover,
    setHover,
    togglePin,
    unpin: () => setPinned(null),
    onKeyDown,
    onBlur: () => setHover(null)
  };
}
