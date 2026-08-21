import type { ReactNode } from 'react';

interface StatTileProps {
  label: string;
  value: string | number;
  hint?: string;
  delta?: string;
  tone?: 'blue' | 'green' | 'red';
  children?: ReactNode;
}

const toneClasses = {
  blue: 'border-blue-500/10 bg-blue-500/5 text-blue-700 dark:text-blue-300',
  green: 'border-emerald-400/15 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300',
  red: 'border-red-400/15 bg-red-400/10 text-red-300'
};

export function StatTile({ label, value, hint, delta, tone = 'blue', children }: StatTileProps) {
  return (
    <div className="relative overflow-hidden rounded-md border border-neutral-200 bg-white p-4 shadow-sm transition-all duration-200 hover:border-neutral-300 dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:hover:border-slate-700/80 hover:shadow-md">
      <div className="relative">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">{label}</p>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <p className="text-2xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-white">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {delta ? (
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums ${toneClasses[tone]}`}>
              {delta}
            </span>
          ) : null}
        </div>
        {hint ? <p className="mt-1 text-xs text-neutral-500 dark:text-slate-500">{hint}</p> : null}
        {children ? <div className="mt-3">{children}</div> : null}
      </div>
    </div>
  );
}
