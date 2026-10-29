'use client';

import { useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import ArrowRight01Icon from '@hugeicons/core-free-icons/ArrowRight01Icon';
import { FunnelChart } from '@/components/charts/FunnelChart';
import { Sparkline } from '@/components/charts/Sparkline';
import { compactNumber } from '@/lib/metrics';
import {
  DEMO_FUNNEL_SOURCES,
  DEMO_RANGES,
  buildFunnel,
  demoFunnels,
  type DemoFunnelResult,
  type DemoFunnelSource
} from '@/lib/demo-data';
import { useDemo, useDemoCompany } from './DemoContext';

export function DemoFunnels() {
  const company = useDemoCompany();
  const { range, now } = useDemo();
  const funnels = useMemo(() => demoFunnels(company), [company]);
  const [openId, setOpenId] = useState<string | null>(funnels[0]?.id ?? null);
  const info = DEMO_RANGES.find((option) => option.value === range)!;

  // Conversion for every funnel, shown in the collapsed rows.
  const summaries = useMemo(
    () => new Map(funnels.map((funnel) => [funnel.id, buildFunnel(company, funnel.id, range, 'All sources', now)])),
    [company, funnels, range, now]
  );

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <div className="mb-4">
        <p className="max-w-2xl text-sm text-neutral-500 dark:text-slate-400">
          Conversion funnels for {company.name} over the last {info.long}. Open one to see where people drop off, compare traffic
          sources, and switch between the step list and the bar view.
        </p>
      </div>

      <section className="overflow-hidden rounded-xl border border-neutral-200 dark:border-slate-800">
        {funnels.map((funnel) => {
          const open = funnel.id === openId;
          const summary = summaries.get(funnel.id);
          return (
            <div key={funnel.id} className="border-b border-neutral-200 last:border-b-0 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : funnel.id)}
                aria-expanded={open}
                className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition ${
                  open ? 'bg-neutral-50 dark:bg-slate-900/70' : 'hover:bg-neutral-50 dark:hover:bg-slate-900/40'
                }`}
              >
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 transition-transform dark:border-slate-700 dark:text-slate-400 ${open ? 'rotate-90' : ''}`}
                  aria-hidden="true"
                >
                  <HugeiconsIcon icon={ArrowRight01Icon} size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-neutral-900 dark:text-white">{funnel.name}</span>
                  <span className="block truncate text-xs text-neutral-500 dark:text-slate-400">{funnel.description}</span>
                </span>
                <span className="hidden text-xs text-neutral-400 dark:text-slate-500 sm:block">{funnel.stepCount} steps</span>
                <span className="w-16 text-right text-sm font-semibold tabular-nums text-neutral-900 dark:text-white">
                  {summary ? pct(summary.conversion) : '—'}
                </span>
              </button>
              {open ? <FunnelDetail funnelId={funnel.id} /> : null}
            </div>
          );
        })}
      </section>
    </div>
  );
}

function FunnelDetail({ funnelId }: { funnelId: string }) {
  const company = useDemoCompany();
  const { range, now } = useDemo();
  const [source, setSource] = useState<DemoFunnelSource>('All sources');
  const [view, setView] = useState<'steps' | 'bars'>('steps');

  const bySource = useMemo(
    () => DEMO_FUNNEL_SOURCES.map((name) => ({ name, result: buildFunnel(company, funnelId, range, name, now) })),
    [company, funnelId, range, now]
  );
  const result = bySource.find((entry) => entry.name === source)?.result;
  if (!result) return null;

  const entered = result.steps[0]?.count ?? 0;
  const completed = result.steps[result.steps.length - 1]?.count ?? 0;

  return (
    <div className="border-t border-neutral-200 bg-white px-4 py-5 dark:border-slate-800 dark:bg-slate-950 sm:px-5">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Traffic source">
        {bySource.map(({ name, result: sourceResult }) => {
          const selected = name === source;
          return (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setSource(name)}
              className={`min-w-[120px] shrink-0 rounded-lg border px-3 py-2 text-left transition ${
                selected
                  ? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-500/10'
                  : 'border-neutral-200 hover:border-neutral-300 dark:border-slate-800 dark:hover:border-slate-700'
              }`}
            >
              <span className={`block text-xs font-semibold ${selected ? 'text-blue-700 dark:text-blue-300' : 'text-neutral-800 dark:text-slate-200'}`}>
                {name}
              </span>
              <span className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-neutral-500 dark:text-slate-400">
                <span className="tabular-nums">{compactNumber(sourceResult?.steps[0]?.count ?? 0)}</span>
                <span className="tabular-nums text-emerald-600 dark:text-emerald-400">{sourceResult ? pct(sourceResult.conversion) : '—'}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Users entered" value={compactNumber(entered)} points={result.entrySeries} tone="blue" />
        <StatTile label="Conversion" value={pct(result.conversion)} points={result.conversionSeries} tone="green" />
        <StatTile label="Drop-off" value={pct(1 - result.conversion)} points={result.conversionSeries.map((v) => 100 - v)} tone="red" />
        <StatTile label="Median time to convert" value={formatSeconds(result.medianSeconds)} hint={`${completed.toLocaleString()} completed`} />
      </div>

      <div className="mt-5 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">Steps</p>
        <div className="inline-flex rounded-md border border-neutral-200 p-0.5 dark:border-slate-800" role="group" aria-label="Funnel view">
          {(['steps', 'bars'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setView(option)}
              aria-pressed={view === option}
              className={`rounded px-2.5 py-1 text-xs font-medium capitalize ${
                view === option
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-slate-950'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">{view === 'steps' ? <StepList result={result} /> : <FunnelChart steps={result.steps} />}</div>
    </div>
  );
}

function StepList({ result }: { result: DemoFunnelResult }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const entered = result.steps[0]?.count ?? 0;
  const last = result.steps[result.steps.length - 1];

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-slate-800">
      {result.steps.map((step, index) => {
        const isLast = index === result.steps.length - 1;
        const width = Math.max(step.count > 0 ? 1 : 0, step.conversionFromStart * 100);
        return (
          <div key={step.order}>
            {index > 0 ? (
              <div className="flex items-center justify-center gap-1.5 border-y border-neutral-100 bg-neutral-50 py-1.5 text-[11px] text-neutral-500 dark:border-slate-800/80 dark:bg-slate-900/50 dark:text-slate-400">
                <span aria-hidden="true">▾</span>
                <span className="tabular-nums">{step.droppedFromPrevious.toLocaleString()} left</span>
                <span className="font-medium tabular-nums text-red-600 dark:text-red-400">−{pct(1 - step.conversionFromPrevious, 0)}</span>
              </div>
            ) : null}
            <div
              className={`flex items-center gap-3 px-4 py-3.5 transition ${hovered === index ? 'bg-neutral-50 dark:bg-slate-900/40' : ''}`}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
            >
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                  isLast
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'border-neutral-200 text-neutral-600 dark:border-slate-700 dark:text-slate-300'
                }`}
              >
                {isLast ? '✓' : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-neutral-900 dark:text-white">{step.label ?? step.eventName}</span>
                  <span className="shrink-0 font-mono text-[11px] text-neutral-500 dark:text-slate-400">{step.count.toLocaleString()} users</span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${isLast ? 'bg-emerald-500' : 'bg-blue-600 dark:bg-blue-500'}`}
                    style={{ width: `${Math.min(100, width)}%` }}
                  />
                </div>
                {hovered === index ? (
                  <p className="mt-1 font-mono text-[11px] text-neutral-400 dark:text-slate-500">
                    {step.eventName}
                    {index > 0 ? ` · ${pct(step.conversionFromPrevious)} of previous step` : ''}
                  </p>
                ) : null}
              </div>
              <span
                className={`w-14 shrink-0 text-right text-base font-semibold tabular-nums ${
                  isLast ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-900 dark:text-white'
                }`}
              >
                {pct(step.conversionFromStart, 0)}
              </span>
            </div>
          </div>
        );
      })}
      <div className="flex items-center justify-between border-t border-neutral-200 bg-neutral-50 px-4 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-900/50">
        <span className="text-neutral-500 dark:text-slate-400">Overall conversion</span>
        <span>
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">{pct(result.conversion)}</span>
          <span className="text-neutral-500 dark:text-slate-400">
            {' '}
            ({(last?.count ?? 0).toLocaleString()} of {entered.toLocaleString()})
          </span>
        </span>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  points,
  tone = 'blue',
  hint
}: {
  label: string;
  value: string;
  points?: number[];
  tone?: 'blue' | 'green' | 'red';
  hint?: string;
}) {
  return (
    <div className="flex flex-col justify-between rounded-lg border border-neutral-200 p-3 dark:border-slate-800">
      {points ? (
        <Sparkline points={points.map((total) => ({ total }))} tone={tone} filled className="h-10 w-full" />
      ) : (
        <p className="h-10 text-[11px] text-neutral-400 dark:text-slate-500">{hint}</p>
      )}
      <p className="mt-2 text-lg font-semibold tabular-nums text-neutral-900 dark:text-white">{value}</p>
      <p className="text-[11px] text-neutral-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

function pct(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
