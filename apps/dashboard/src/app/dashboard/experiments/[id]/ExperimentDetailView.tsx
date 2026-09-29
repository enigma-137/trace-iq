'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import type { Experiment, ExperimentResults, ExperimentStatus } from '@traceiq/types';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface ExperimentDetailViewProps {
  experiment: Experiment;
  initialResults: ExperimentResults;
  projectId?: string | null;
  token?: string | null;
}

export function ExperimentDetailView({
  experiment: initialExp,
  initialResults,
  projectId,
  token: initialToken
}: ExperimentDetailViewProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [exp, setExp] = useState<Experiment>(initialExp);
  const [results, setResults] = useState<ExperimentResults>(initialResults);
  const [loading, setLoading] = useState(false);
  const [winnerModalOpen, setWinnerModalOpen] = useState(false);
  const [selectedWinner, setSelectedWinner] = useState<string>(results.recommendedWinner || exp.variants[1]?.key || 'control');

  async function getAuthToken(): Promise<string | null> {
    if (initialToken) return initialToken;
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  const handleStatusUpdate = async (newStatus: ExperimentStatus, winnerKey?: string) => {
    setLoading(true);
    const token = await getAuthToken();
    try {
      const url = `${apiBaseUrl}/v1/dashboard/experiments/${exp.id}/status${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          status: newStatus,
          winnerVariantKey: winnerKey,
          projectId
        })
      });

      if (res.ok) {
        const updated = await res.json();
        setExp(updated);
        // Refresh results
        const resResults = await fetch(`${apiBaseUrl}/v1/dashboard/experiments/${exp.id}/results${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (resResults.ok) {
          const resultsJson = await resResults.json();
          setResults(resultsJson);
        }
        router.refresh();
      }
    } catch (err) {
      console.error('Failed to update status', err);
    } finally {
      setLoading(false);
      setWinnerModalOpen(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this experiment? All exposure logs will be removed.')) return;
    setLoading(true);
    const token = await getAuthToken();
    try {
      const url = `${apiBaseUrl}/v1/dashboard/experiments/${exp.id}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`;
      await fetch(url, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      router.push(`/dashboard/experiments${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`);
    } catch (err) {
      console.error('Failed to delete experiment', err);
      setLoading(false);
    }
  };

  const controlMetric = results.variants.find((v) => v.isControl);
  const bestVariant = results.variants
    .filter((v) => !v.isControl)
    .sort((a, b) => (b.uplift ?? -999) - (a.uplift ?? -999))[0];

  const getStatusBadge = (status: ExperimentStatus) => {
    switch (status) {
      case 'running':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Running
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Paused
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            Completed
          </span>
        );
      case 'draft':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-600 dark:bg-slate-800 dark:text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
            Draft
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-slate-400">
        <Link
          href={`/dashboard/experiments${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`}
          className="hover:text-neutral-900 dark:hover:text-white"
        >
          Experiments
        </Link>
        <span>/</span>
        <span className="font-semibold text-neutral-900 dark:text-white">{exp.name}</span>
      </div>

      {/* Header Section */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              {getStatusBadge(exp.status)}
              <span className="rounded-md border border-neutral-200 px-2 py-0.5 font-mono text-xs text-neutral-600 dark:border-slate-700 dark:text-slate-300">
                {exp.key}
              </span>
              <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-slate-800 dark:text-slate-300 capitalize">
                {exp.environment}
              </span>
            </div>

            <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-2xl">
              {exp.name}
            </h1>

            {exp.description ? (
              <p className="max-w-3xl text-sm leading-relaxed text-neutral-600 dark:text-slate-400">
                <strong className="text-neutral-900 dark:text-white font-semibold">Hypothesis: </strong>
                {exp.description}
              </p>
            ) : null}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {exp.status === 'draft' && (
              <button
                type="button"
                disabled={loading}
                onClick={() => handleStatusUpdate('running')}
                className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-50"
              >
                Start Experiment
              </button>
            )}

            {exp.status === 'running' && (
              <>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleStatusUpdate('paused')}
                  className="rounded-lg border border-neutral-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Pause
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setWinnerModalOpen(true)}
                  className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-500 disabled:opacity-50"
                >
                  Complete & Declare Winner
                </button>
              </>
            )}

            {exp.status === 'paused' && (
              <>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleStatusUpdate('running')}
                  className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-50"
                >
                  Resume
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setWinnerModalOpen(true)}
                  className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-500 disabled:opacity-50"
                >
                  Complete
                </button>
              </>
            )}

            {exp.status === 'completed' && (
              <button
                type="button"
                disabled={loading}
                onClick={() => handleStatusUpdate('running')}
                className="rounded-lg border border-neutral-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Reopen Test
              </button>
            )}

            <button
              type="button"
              disabled={loading}
              onClick={handleDelete}
              className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-red-950/30"
              title="Delete experiment"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Winner Callout Card if Completed or Winner Chosen */}
      {exp.winnerVariantKey && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900 dark:bg-blue-950/30">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🏆</span>
            <div>
              <div className="text-xs font-semibold text-blue-900 dark:text-blue-200">
                Winner Declared: <span className="font-bold text-blue-700 dark:text-blue-300">{exp.variants.find((v) => v.key === exp.winnerVariantKey)?.name || exp.winnerVariantKey}</span>
              </div>
              <div className="text-xs text-blue-700 dark:text-blue-400">
                This experiment has concluded. You can roll out the winning variant to 100% in your feature flags or codebase.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Exposures */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-950">
          <div className="text-xs font-medium text-neutral-500 dark:text-slate-400">Total Exposures</div>
          <div className="mt-1 text-2xl font-bold text-neutral-900 dark:text-white">
            {results.totalExposures.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-neutral-500 dark:text-slate-400">
            Unique evaluated users across all variants
          </div>
        </div>

        {/* Primary Metric Conversions */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-950">
          <div className="text-xs font-medium text-neutral-500 dark:text-slate-400">
            Total Conversions ({results.primaryMetric})
          </div>
          <div className="mt-1 text-2xl font-bold text-neutral-900 dark:text-white">
            {results.totalConversions.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-neutral-500 dark:text-slate-400">
            Overall conversion rate: {(results.overallConversionRate * 100).toFixed(1)}%
          </div>
        </div>

        {/* Relative Uplift vs Control */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-950">
          <div className="text-xs font-medium text-neutral-500 dark:text-slate-400">Top Variant Uplift</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold ${
                (bestVariant?.uplift ?? 0) > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : (bestVariant?.uplift ?? 0) < 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-neutral-900 dark:text-white'
              }`}
            >
              {bestVariant?.uplift !== null && bestVariant?.uplift !== undefined
                ? `${bestVariant.uplift > 0 ? '+' : ''}${bestVariant.uplift}%`
                : '—'}
            </span>
            {bestVariant && (
              <span className="text-xs text-neutral-500 dark:text-slate-400">
                ({bestVariant.variantName})
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-neutral-500 dark:text-slate-400">
            Control baseline: {controlMetric ? `${(controlMetric.conversionRate * 100).toFixed(1)}%` : '0%'}
          </div>
        </div>

        {/* Statistical Significance */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-950">
          <div className="text-xs font-medium text-neutral-500 dark:text-slate-400">Statistical Significance</div>
          <div className="mt-2">
            {bestVariant?.isSignificant ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {bestVariant.confidence}% Confidence (p &lt; 0.05)
              </span>
            ) : results.totalExposures < 60 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600 dark:bg-slate-800 dark:text-slate-300">
                <span className="h-2 w-2 rounded-full bg-neutral-400" />
                Collecting Data (Need &ge; 30/var)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                No Significant Difference Yet
              </span>
            )}
          </div>
          <div className="mt-2 text-[11px] text-neutral-500 dark:text-slate-400">
            Calculated via two-proportion Z-test
          </div>
        </div>
      </div>

      {/* Variant Comparison Table */}
      <div className="rounded-xl border border-neutral-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-neutral-100 p-4 dark:border-slate-800">
          <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Variant Performance & Conversions</h3>
          <p className="text-xs text-neutral-500 dark:text-slate-400">
            Comparing conversion rate against control baseline ({results.primaryMetric}).
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-neutral-600 dark:text-slate-300">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Variant</th>
                <th className="px-4 py-3">Traffic Split</th>
                <th className="px-4 py-3">Exposures</th>
                <th className="px-4 py-3">Conversions</th>
                <th className="px-4 py-3">Conversion Rate</th>
                <th className="px-4 py-3">Relative Uplift</th>
                <th className="px-4 py-3">Confidence & P-Value</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-slate-800">
              {results.variants.map((v) => {
                const crPct = (v.conversionRate * 100).toFixed(1);
                return (
                  <tr key={v.variantKey} className="hover:bg-neutral-50/50 dark:hover:bg-slate-900/40">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-neutral-900 dark:text-white">
                          {v.variantName}
                        </span>
                        {v.isControl ? (
                          <span className="rounded-md border border-neutral-200 bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            Control
                          </span>
                        ) : (
                          <code className="text-[10px] font-mono text-neutral-400 dark:text-slate-500">
                            {v.variantKey}
                          </code>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <span className="font-medium text-neutral-700 dark:text-slate-300">{v.weight}%</span>
                    </td>

                    <td className="px-4 py-3.5 font-medium">
                      {v.exposures.toLocaleString()}
                    </td>

                    <td className="px-4 py-3.5 font-medium">
                      {v.conversions.toLocaleString()}
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="space-y-1">
                        <div className="font-semibold text-neutral-900 dark:text-white">{crPct}%</div>
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
                          <div
                            className={`h-full ${v.isControl ? 'bg-neutral-500' : 'bg-blue-600'}`}
                            style={{ width: `${Math.min(100, Math.max(2, v.conversionRate * 100))}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {v.isControl ? (
                        <span className="text-neutral-400 dark:text-slate-500">Baseline (0%)</span>
                      ) : v.uplift !== null ? (
                        <span
                          className={`font-semibold ${
                            v.uplift > 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : v.uplift < 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-neutral-500'
                          }`}
                        >
                          {v.uplift > 0 ? '+' : ''}{v.uplift}%
                        </span>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {v.isControl ? (
                        <span className="text-neutral-400">—</span>
                      ) : v.confidence !== null && v.pValue !== null ? (
                        <div className="space-y-0.5">
                          <div className="font-medium text-neutral-800 dark:text-slate-200">
                            {v.confidence}% confidence
                          </div>
                          <div className="text-[10px] font-mono text-neutral-400">
                            p = {v.pValue.toFixed(3)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-neutral-400">Need more data</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {v.isSignificant ? (
                        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                          Significant
                        </span>
                      ) : v.sampleStatus === 'insufficient_data' ? (
                        <span className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500 dark:bg-slate-800 dark:text-slate-400">
                          Low traffic
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600 dark:bg-slate-800 dark:text-slate-300">
                          Collecting
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Timeseries Daily Trend Section */}
      {results.timeseries && results.timeseries.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-950">
          <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Daily Conversion Activity</h3>
          <p className="text-xs text-neutral-500 dark:text-slate-400">
            Recorded exposures and conversions over the experiment lifecycle.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {results.timeseries.slice(-8).map((point, idx) => (
              <div
                key={`${point.date}-${point.variantKey}-${idx}`}
                className="rounded-lg border border-neutral-100 bg-neutral-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/40"
              >
                <div className="text-[11px] font-medium text-neutral-500 dark:text-slate-400">{point.date}</div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-neutral-800 dark:text-slate-200">
                    {point.variantKey}
                  </span>
                  <span className="text-xs font-bold text-neutral-900 dark:text-white">
                    {point.conversions} / {point.exposures}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Declare Winner Modal */}
      {winnerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-base font-bold text-neutral-900 dark:text-white">Declare Winning Variant</h3>
            <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
              Select which variant won the experiment before completing it.
            </p>

            <div className="mt-4 space-y-2">
              {exp.variants.map((v) => (
                <label
                  key={v.key}
                  className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 text-xs transition ${
                    selectedWinner === v.key
                      ? 'border-blue-500 bg-blue-50/50 dark:border-blue-600 dark:bg-blue-950/40'
                      : 'border-neutral-200 hover:bg-neutral-50 dark:border-slate-700 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="winner"
                      checked={selectedWinner === v.key}
                      onChange={() => setSelectedWinner(v.key)}
                      className="text-blue-600"
                    />
                    <span className="font-semibold text-neutral-900 dark:text-white">{v.name}</span>
                    {v.isControl && (
                      <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600 dark:bg-slate-800 dark:text-slate-300">
                        Control
                      </span>
                    )}
                  </div>
                  {results.recommendedWinner === v.key && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                      Top Performer
                    </span>
                  )}
                </label>
              ))}
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setWinnerModalOpen(false)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleStatusUpdate('completed', selectedWinner)}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                Confirm & Complete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
