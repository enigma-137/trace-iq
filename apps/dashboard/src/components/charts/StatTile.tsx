import type { ReactNode } from 'react';

interface StatTileProps {
  label: string;
  value: string | number;
  hint?: string;
  children?: ReactNode;
}

export function StatTile({ label, value, hint, children }: StatTileProps) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-white">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {hint ? <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">{hint}</p> : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
