'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DashboardDialog } from '../DashboardDialog';
import { FunnelForm } from './FunnelForm';
import type { FunnelItem, FunnelResultsData, FunnelResultStep } from './page';

interface FunnelsClientViewProps {
  funnels: FunnelItem[];
  resultsMap: Record<string, FunnelResultsData | null>;
  eventNames: Array<{ eventName: string; total: number; actors?: number }>;
}

type SortOption = 'recent' | 'highest_conversion' | 'lowest_conversion' | 'most_steps' | 'name';

function formatPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function formatDate(iso: string): string {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date);
  } catch {
    return iso;
  }
}

function findBiggestDrop(steps: FunnelResultStep[]): {
  index: number;
  step: FunnelResultStep;
  dropRatePct: number;
  dropCount: number;
} | null {
  if (!steps || steps.length < 2) return null;
  let worst: { index: number; step: FunnelResultStep; dropRatePct: number; dropCount: number } | null = null;

  for (let i = 1; i < steps.length; i += 1) {
    const dropCount = steps[i].droppedFromPrevious;
    const dropRate = 1 - steps[i].conversionFromPrevious;
    if (dropCount > 0 && (!worst || dropCount > worst.dropCount)) {
      worst = {
        index: i,
        step: steps[i],
        dropRatePct: Math.round(dropRate * 100),
        dropCount
      };
    }
  }
  return worst;
}

const STARTER_PRESETS = [
  {
    name: 'User Onboarding Flow',
    description: 'Track visitor conversion from landing page to active user.',
    steps: ['page_view', 'signup_started', 'signup_completed', 'dashboard_view']
  },
  {
    name: 'Product Checkout Journey',
    description: 'Measure drop-offs during product discovery and purchasing.',
    steps: ['product_view', 'add_to_cart', 'checkout_started', 'purchase_completed']
  },
  {
    name: 'Feature Activation',
    description: 'Analyze adoption from feature discovery to first usage.',
    steps: ['feature_discovered', 'feature_configured', 'feature_used']
  }
];

interface BestFunnelInfo {
  id: string;
  name: string;
  conversionRate: number;
}

interface CriticalDropInfo {
  funnelName: string;
  stepName: string;
  dropRatePct: number;
  dropCount: number;
}

export function FunnelsClientView({ funnels, resultsMap, eventNames }: FunnelsClientViewProps) {
  const router = useRouter();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<{ name: string; steps: string[] } | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('recent');

  // Compute aggregate metrics across all funnels
  const { totalFunnels, avgConversion, bestFunnel, criticalDrop, totalStepsMeasured } = useMemo(() => {
    const total = funnels.length;
    let totalSteps = 0;
    let sumConversion = 0;
    let conversionCount = 0;
    let topFunnel: BestFunnelInfo | null = null;
    let maxDropOverall: CriticalDropInfo | null = null;

    funnels.forEach((f) => {
      totalSteps += f.stepCount;
      const res = resultsMap[f.id];
      if (res && res.steps && res.steps.length > 0) {
        const lastStep = res.steps[res.steps.length - 1];
        const overallConv = lastStep.conversionFromStart;
        const startCount = res.steps[0]?.count ?? 0;

        if (startCount > 0) {
          sumConversion += overallConv;
          conversionCount += 1;

          if (!topFunnel || overallConv > topFunnel.conversionRate) {
            topFunnel = { name: f.name, conversionRate: overallConv, id: f.id };
          }
        }

        const drop = findBiggestDrop(res.steps);
        if (drop && (!maxDropOverall || drop.dropCount > maxDropOverall.dropCount)) {
          maxDropOverall = {
            funnelName: f.name,
            stepName: drop.step.label ?? drop.step.eventName,
            dropRatePct: drop.dropRatePct,
            dropCount: drop.dropCount
          };
        }
      }
    });

    return {
      totalFunnels: total,
      totalStepsMeasured: totalSteps,
      avgConversion: conversionCount > 0 ? sumConversion / conversionCount : 0,
      bestFunnel: topFunnel as BestFunnelInfo | null,
      criticalDrop: maxDropOverall as CriticalDropInfo | null
    };
  }, [funnels, resultsMap]);

  // Filter & sort funnels list
  const filteredAndSortedFunnels = useMemo(() => {
    let list = [...funnels];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((f) => {
        if (f.name.toLowerCase().includes(q)) return true;
        if (f.steps?.some((s) => s.eventName.toLowerCase().includes(q) || (s.label && s.label.toLowerCase().includes(q)))) {
          return true;
        }
        return false;
      });
    }

    list.sort((a, b) => {
      const resA = resultsMap[a.id];
      const resB = resultsMap[b.id];
      const convA = resA?.steps?.length ? resA.steps[resA.steps.length - 1].conversionFromStart : 0;
      const convB = resB?.steps?.length ? resB.steps[resB.steps.length - 1].conversionFromStart : 0;

      switch (sortBy) {
        case 'highest_conversion':
          return convB - convA;
        case 'lowest_conversion':
          return convA - convB;
        case 'most_steps':
          return b.stepCount - a.stepCount;
        case 'name':
          return a.name.localeCompare(b.name);
        case 'recent':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return list;
  }, [funnels, resultsMap, searchQuery, sortBy]);

  function handleOpenCreateWithTemplate(template?: { name: string; steps: string[] }) {
    setSelectedTemplate(template);
    setIsCreateOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* Top Explanatory Header */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-950">
        <div className="max-w-3xl space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
              Conversion Analytics
            </span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-2xl">
            Understand Drop-Offs & Optimize User Sequences
          </h2>
          <p className="text-sm leading-relaxed text-neutral-600 dark:text-slate-400">
            Funnels reveal where users abandon important journeys so you can focus on the steps with the largest losses.
            Track completion rates across onboarding, checkout, feature activation, and custom event milestones in sequential order.
          </p>
        </div>
      </section>

      {/* Top 4 Summary Metric Cards (Featuring Solid Blue Cards) */}
      <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {/* Solid Blue Card 1: Average Conversion */}
        <div className="relative overflow-hidden rounded-xl border border-blue-500 bg-blue-600 p-5 text-white shadow-sm dark:border-blue-600 dark:bg-blue-600">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-100">
              Avg Conversion Rate
            </span>
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white">
              30d Window
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-white tabular-nums">
              {totalFunnels > 0 ? formatPct(avgConversion) : '—'}
            </span>
            <span className="text-xs text-blue-100 font-medium">overall</span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-blue-50/90">
            {totalFunnels > 0
              ? `Mean completion across ${totalFunnels} active funnel ${totalFunnels === 1 ? 'journey' : 'journeys'}.`
              : 'Create funnels to measure average journey completion.'}
          </p>
        </div>

        {/* Solid Blue Card 2: Critical Drop-Off */}
        <div className="relative overflow-hidden rounded-xl border border-blue-500 bg-blue-600 p-5 text-white shadow-sm dark:border-blue-600 dark:bg-blue-600">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-100">
              Largest Drop-Off
            </span>
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white">
              Bottleneck
            </span>
          </div>
          <div className="mt-3">
            {criticalDrop ? (
              <>
                <p className="text-xl font-bold text-white truncate">{criticalDrop.stepName}</p>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-blue-100">
                  <span className="font-semibold text-white">-{criticalDrop.dropRatePct}% drop</span>
                  <span>· {criticalDrop.dropCount.toLocaleString()} users</span>
                </div>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-white">None detected</p>
                <p className="text-xs text-blue-100 mt-0.5">All active steps healthy</p>
              </>
            )}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-blue-50/90 truncate">
            {criticalDrop ? `Primary friction point in "${criticalDrop.funnelName}".` : 'No severe drop-offs detected.'}
          </p>
        </div>

        {/* Neutral Card 3: Best Performing Funnel */}
        <div className="flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-950">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
                Top Performing Flow
              </span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                Leader
              </span>
            </div>
            <div className="mt-3">
              {bestFunnel ? (
                <>
                  <p className="truncate text-lg font-bold text-neutral-900 dark:text-white">{bestFunnel.name}</p>
                  <p className="mt-0.5 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatPct(bestFunnel.conversionRate)}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xl font-bold text-neutral-900 dark:text-white">—</p>
                  <p className="text-xs text-neutral-500 dark:text-slate-400 mt-1">No conversion data yet</p>
                </>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-neutral-500 dark:text-slate-400">
            {bestFunnel ? 'Highest converting sequence in the last 30 days.' : 'Traffic data will establish the top performer.'}
          </p>
        </div>

        {/* Neutral Card 4: Active Library */}
        <div className="flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-950">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
                Funnels Library
              </span>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600 dark:bg-slate-900 dark:text-slate-300">
                Active
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-neutral-900 tabular-nums dark:text-white">
                {totalFunnels}
              </span>
              <span className="text-xs text-neutral-500 dark:text-slate-400 font-medium">
                {totalFunnels === 1 ? 'saved funnel' : 'saved funnels'}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-neutral-500 dark:text-slate-400">
              {totalStepsMeasured} total milestone steps measured in real-time.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-slate-800/80">
            <button
              type="button"
              onClick={() => handleOpenCreateWithTemplate()}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-slate-200"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Create New Funnel</span>
            </button>
          </div>
        </div>
      </section>

      {/* Main Saved Funnels Section */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-950">
        {/* Controls & Search Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-5 border-b border-neutral-200/80 dark:border-slate-800/80">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">
              Saved Conversion Funnels
            </h3>
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">
              Manage custom user sequences and track drop-offs between critical product events.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative min-w-[220px]">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search funnels or events…"
                className="h-9 w-full rounded-lg border border-neutral-200 bg-neutral-50/50 pl-8 pr-3 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-900/50 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-white"
              />
              <svg
                className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-neutral-400 dark:text-slate-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-slate-200"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              aria-label="Sort funnels"
              className="h-9 rounded-lg border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-700 shadow-xs outline-none transition focus:border-neutral-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:focus:border-white"
            >
              <option value="recent">Recently created</option>
              <option value="highest_conversion">Highest conversion</option>
              <option value="lowest_conversion">Lowest conversion</option>
              <option value="most_steps">Most steps</option>
              <option value="name">Name (A-Z)</option>
            </select>

            {/* Primary Action Button */}
            <button
              type="button"
              onClick={() => handleOpenCreateWithTemplate()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 text-xs font-bold text-white shadow-xs transition hover:bg-neutral-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Create Funnel</span>
            </button>
          </div>
        </div>

        {/* Funnels Grid or Rich Empty State */}
        <div className="mt-6">
          {filteredAndSortedFunnels.length === 0 ? (
            searchQuery ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-neutral-50/50 p-12 text-center dark:border-slate-800 dark:bg-slate-900/20">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-200/80 text-neutral-600 dark:bg-slate-800 dark:text-slate-300">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <h4 className="text-sm font-bold text-neutral-900 dark:text-white">No matching funnels</h4>
                <p className="mt-1 max-w-sm text-xs text-neutral-500 dark:text-slate-400">
                  No funnels matched your query <span className="font-semibold text-neutral-700 dark:text-slate-300">&quot;{searchQuery}&quot;</span>.
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="mt-4 rounded-lg border border-neutral-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-neutral-700 shadow-xs hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
                >
                  Clear search
                </button>
              </div>
            ) : (
              /* Rich Onboarding Empty State */
              <div className="space-y-6">
                <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50/60 p-8 text-center dark:border-slate-800 dark:bg-slate-900/30">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                  <h3 className="mt-3 text-base font-bold text-neutral-900 dark:text-white">
                    Track your first user conversion funnel
                  </h3>
                  <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-neutral-500 dark:text-slate-400">
                    Funnels help you visualize user drop-offs step-by-step. Discover which pages or actions are causing friction, optimize conversion, and watch user retention grow.
                  </p>
                  <div className="mt-5">
                    <button
                      type="button"
                      onClick={() => handleOpenCreateWithTemplate()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-neutral-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      <span>Create Your First Funnel</span>
                    </button>
                  </div>
                </div>

                {/* Pre-built Starter Flow Cards */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-slate-500">
                    Or Start with a Recommended Template
                  </h4>
                  <div className="mt-3 grid gap-4 sm:grid-cols-3">
                    {STARTER_PRESETS.map((tpl) => (
                      <div
                        key={tpl.name}
                        className="flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-4 shadow-xs transition hover:border-blue-500 hover:shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:hover:border-blue-600"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <h5 className="text-sm font-bold text-neutral-900 dark:text-white">{tpl.name}</h5>
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                              {tpl.steps.length} steps
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">{tpl.description}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-1 font-mono text-[10px] text-neutral-600 dark:text-slate-400">
                            {tpl.steps.map((step, idx) => (
                              <span key={idx} className="inline-flex items-center gap-1">
                                <span className="rounded bg-neutral-100 px-1.5 py-0.5 border border-neutral-200/60 dark:bg-slate-900 dark:border-slate-800">
                                  {step}
                                </span>
                                {idx < tpl.steps.length - 1 && <span className="text-neutral-400">→</span>}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-slate-900">
                          <button
                            type="button"
                            onClick={() => handleOpenCreateWithTemplate(tpl)}
                            className="inline-flex w-full items-center justify-center gap-1 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                          >
                            <span>Use this template</span>
                            <span>→</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          ) : (
            /* Funnels Card Grid */
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredAndSortedFunnels.map((funnel) => {
                const results = resultsMap[funnel.id];
                const steps = results?.steps ?? [];
                const startCount = steps[0]?.count ?? 0;
                const endCount = steps.length > 0 ? steps[steps.length - 1].count : 0;
                const overallConversion = steps.length > 0 ? steps[steps.length - 1].conversionFromStart : 0;
                const worstDrop = findBiggestDrop(steps);

                // Steps list to display (either from results or funnel definition)
                const displaySteps =
                  steps.length > 0
                    ? steps.map((s) => ({ name: s.label ?? s.eventName, conversion: s.conversionFromStart }))
                    : (funnel.steps ?? []).map((s) => ({ name: s.label ?? s.eventName, conversion: 0 }));

                return (
                  <div
                    key={funnel.id}
                    onClick={() => router.push(`/dashboard/funnels/${funnel.id}`)}
                    className="group relative flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-5 shadow-xs transition-all hover:border-neutral-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700 cursor-pointer"
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h4 className="truncate text-base font-bold text-neutral-900 transition group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
                            {funnel.name}
                          </h4>
                          <p className="mt-0.5 text-[11px] font-mono text-neutral-400 dark:text-slate-500">
                            Created {formatDate(funnel.createdAt)}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-neutral-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                          {funnel.stepCount} {funnel.stepCount === 1 ? 'step' : 'steps'}
                        </span>
                      </div>

                      {/* Actual Event Steps Sequence Line */}
                      <div className="mt-3.5">
                        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-slate-500">
                          Journey Sequence
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1 font-mono text-[11px]">
                          {displaySteps.map((step, idx) => {
                            const isFirst = idx === 0;
                            const isLast = idx === displaySteps.length - 1;
                            return (
                              <span key={idx} className="inline-flex items-center gap-1">
                                <span
                                  className={`rounded px-1.5 py-0.5 border text-[11px] font-medium transition ${
                                    isLast
                                      ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-300'
                                      : isFirst
                                      ? 'bg-neutral-100 border-neutral-200 text-neutral-800 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-200'
                                      : 'bg-neutral-50 border-neutral-200/80 text-neutral-600 dark:bg-slate-900/60 dark:border-slate-800 dark:text-slate-400'
                                  }`}
                                >
                                  {step.name}
                                </span>
                                {idx < displaySteps.length - 1 && (
                                  <span className="text-neutral-400 font-bold">→</span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      {/* Subtle Horizontal Progression Mini-Funnel Bar */}
                      {steps.length > 1 && (
                        <div className="mt-4 space-y-1">
                          <div className="flex h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-900">
                            {steps.map((s, idx) => {
                              const stepPct = Math.max(s.conversionFromStart * 100, 2);
                              return (
                                <div
                                  key={idx}
                                  style={{ width: `${100 / steps.length}%` }}
                                  className="h-full border-r border-white dark:border-slate-950 relative"
                                >
                                  <div
                                    style={{ width: `${stepPct}%` }}
                                    className={`h-full transition-all ${
                                      idx === steps.length - 1
                                        ? 'bg-blue-600 dark:bg-blue-500'
                                        : 'bg-blue-400/70 dark:bg-blue-500/50'
                                    }`}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Key Performance Stats Row */}
                      <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-neutral-100 bg-neutral-50/70 p-3 dark:border-slate-900 dark:bg-slate-900/30">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-slate-500">
                            Conversion
                          </span>
                          <p className="mt-0.5 text-lg font-bold tabular-nums text-neutral-900 dark:text-white">
                            {steps.length > 0 && startCount > 0 ? formatPct(overallConversion) : '—'}
                          </p>
                          <p className="text-[11px] text-neutral-500 dark:text-slate-400">
                            {startCount > 0 ? `${endCount.toLocaleString()} completed` : '0 visitors (30d)'}
                          </p>
                        </div>

                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-slate-500">
                            Largest Drop
                          </span>
                          {worstDrop ? (
                            <>
                              <p className="mt-0.5 truncate text-xs font-bold text-red-600 dark:text-red-400">
                                -{worstDrop.dropRatePct}% loss
                              </p>
                              <p className="truncate text-[11px] text-neutral-500 dark:text-slate-400">
                                at {worstDrop.step.label ?? worstDrop.step.eventName}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="mt-0.5 text-xs font-semibold text-neutral-600 dark:text-slate-400">
                                No drop-off
                              </p>
                              <p className="text-[11px] text-neutral-400 dark:text-slate-500">Healthy steps</p>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="mt-5 flex items-center justify-between border-t border-neutral-100 pt-3.5 dark:border-slate-900">
                      <Link
                        href={`/dashboard/funnels/${funnel.id}/edit`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs font-medium text-neutral-500 hover:text-neutral-900 hover:underline dark:text-slate-400 dark:hover:text-white"
                      >
                        Edit
                      </Link>

                      <div className="inline-flex items-center gap-1 text-xs font-bold text-neutral-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
                        <span>View Analytics</span>
                        <span className="transition-transform group-hover:translate-x-1">→</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Creation Modal */}
      <DashboardDialog
        open={isCreateOpen}
        title="Create New Conversion Funnel"
        description="Specify ordered event steps to measure step-by-step conversion and user drop-offs."
        onClose={() => {
          setIsCreateOpen(false);
          setSelectedTemplate(undefined);
        }}
      >
        <FunnelForm
          eventNames={eventNames}
          initialTemplate={selectedTemplate}
          onSuccess={() => {
            setIsCreateOpen(false);
            setSelectedTemplate(undefined);
          }}
          onCancel={() => {
            setIsCreateOpen(false);
            setSelectedTemplate(undefined);
          }}
        />
      </DashboardDialog>
    </div>
  );
}
